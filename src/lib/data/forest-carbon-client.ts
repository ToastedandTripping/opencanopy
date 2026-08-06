import bboxPolygon from "@turf/bbox-polygon";
import area from "@turf/area";
import type { BBox } from "@/types/layers";

/**
 * Client for fetching real BC VRI forest polygons for the CO2 calculator.
 *
 * This is the render-independent replacement for the old
 * `map.queryRenderedFeatures` path (see relay plan jazzy-gathering-codd).
 * It always requests its OWN fixed zoom tier (CALC_ZOOM), independent of
 * whatever zoom the map is currently at, so the same selection returns the
 * same tonnes whether the user is at z6 or z14 on screen -- accuracy becomes
 * a property of the data, not the view.
 */

/** Own zoom param for the calc fetch -- finest simplification tier (tolerance
 *  0.0002 deg, wfs-proxy.ts:278), highest feature cap (8000, wfs-proxy.ts:701),
 *  and skips the small-polygon/hole drop (gated to zoom<=8, wfs-proxy.ts:767,783).
 *  Empirically verified (this relay, live probe): z12 geometry area is within
 *  ~0.4% mean / ~2% p95 of the VRI source's own POLYGON_AREA property across
 *  15k+ sampled features -- well inside the carbon model's own admitted
 *  10-20% uncertainty band, so no `mode=calc` edge fallback is needed for v1. */
const CALC_ZOOM = 12;

/** Mirrors the proxy's z12+ maxFeatures cap (wfs-proxy.ts:701). This is a
 *  DEFENSIVE BACKSTOP only -- the real defense against truncation is the
 *  pre-fetch area guard below, which keeps v1 (draw-select only) out of the
 *  regime where the cap is reachable. The proxy also drops unclassifiable
 *  features AFTER GeoServer's cap (classifyVRIFeature -> null -> continue,
 *  wfs-proxy.ts:722-725) and returns no truncation signal, so a capped
 *  response can arrive with fewer than CAP features -- this backstop can
 *  under-fire. It's kept anyway because it's free and better than nothing;
 *  the guard is what actually keeps v1 safe. */
const CAP = 8000;
const CAP_MARGIN = 200;

/**
 * Pre-fetch bbox-area guard threshold (km^2), refuse before fetching.
 *
 * EMPIRICALLY CALIBRATED against the live production endpoint
 * (opencanopy.ca/api/wfs) this relay, 3-4+ intermediate bbox sizes over a BC
 * interior forest region (Nelson/Kootenays -- denser VRI fragmentation than
 * the plan's own probe region, i.e. a conservative/worse-case density):
 *
 *   area(km^2)  features   fetch latency (observed)
 *   100         570        1.65s
 *   250         1421       1.85s
 *   300         1779       8.82s   <- high-load outlier
 *   400         2465       2.64s / 6.29s (rerun -- ~2.4x variance)
 *   500         3255       6.08s
 *   600         4063       4.25s
 *   1000        7223       14.23s <- clearly over budget, near the 8000 cap
 *   2000        7599       12.47s <- cap-bound plateau
 *
 * Latency does not scale cleanly with area -- upstream GeoServer load varies
 * independently (300km^2 was slower than 400-600km^2 in these samples).
 * These are point-in-time samples (n=1-2 per bucket), not a statistically
 * rigorous p95 -- treat this as an informed empirical estimate, not an SLA.
 *
 * 500 km^2 is chosen as the guard: comfortably clear of the >=1000km^2
 * regime where latency reliably blows past budget (14-22s) and feature
 * counts approach the truncation cap, while still usable for real
 * conservation-analysis selections. See the relay report for the full
 * reasoning (including the separate turf-clip cost finding, which adds
 * further wall-clock time on top of this fetch latency).
 */
export const CALC_AREA_GUARD_KM2 = 500;

/** Hard client-side timeout for the calc fetch. Calibrated to the observed
 *  in-guard worst case (~9s at 300km^2) plus margin for the edge fn's own
 *  retry/backoff (up to ~7s across 3 attempts, wfs-proxy.ts MAX_RETRIES=3,
 *  RETRY_BASE_DELAY=1000 -> 1s+2s+4s) and slower client networks -- a naive
 *  12-15s timeout risks misreporting a live-but-slow fetch as `error`. */
const FETCH_TIMEOUT_MS = 20_000;

export type ForestCarbonErrorKind = "network" | "http" | "rate-limit" | "timeout";

export class ForestCarbonFetchError extends Error {
  kind: ForestCarbonErrorKind;
  /** Parsed from the proxy's Retry-After header on a 429 -- lets the UI show
   *  an accurate countdown instead of a guessed "brief" disable window. */
  retryAfterSeconds?: number;

  constructor(kind: ForestCarbonErrorKind, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "ForestCarbonFetchError";
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export interface ForestCarbonFetchResult {
  features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[];
  /** Defensive backstop only -- see CAP comment above. */
  maybeTruncated: boolean;
}

import { FOREST_AGE_CLASSES } from "@/lib/taxonomy/forest-age";

/** Recognized class values: the 4 canonical classes plus "unknown" (calculator fallback). */
const KNOWN_AGE_CLASSES = new Set([...FOREST_AGE_CLASSES, "unknown"]);

/**
 * Schema-drift guard: true when NONE of the given features carry a
 * recognized `class` value -- the signal that the upstream WFS schema
 * changed shape (this is the class of bug that silently zeroed the original
 * calculator: tile features carry age/species under different property
 * names entirely).
 *
 * Deliberately keyed on `class`, NOT `PROJ_AGE_1`, as the PRIMARY check: the
 * proxy's own classifyVRIFeature (wfs-proxy.ts) classifies "harvested" from
 * HARVEST_DATE alone, so a selection that's genuinely 100%
 * harvested/clear-cut can legitimately have NO feature with a numeric
 * PROJ_AGE_1 -- that's real data (a true near-zero carbon result), not
 * drift, and must still compute normally. `class` is unconditionally set by
 * the proxy on every surviving forest-age feature (wfs-proxy.ts:722-727),
 * so its total absence across a whole batch is the reliable drift signal.
 * An empty `features` array is NOT schema drift (that's the no-data case,
 * handled separately) -- returns false.
 *
 * SECOND-ORDER check: `class` alone can survive a *partial* future drift --
 * e.g. if PROJ_AGE_1 itself gets renamed upstream while the proxy keeps
 * unconditionally stamping some `class` value on every feature. To catch
 * that, also require at least one feature carry the raw signal the
 * classifier actually reads: a numeric PROJ_AGE_1 or a HARVEST_DATE. This
 * still can't false-positive on a legit all-harvested selection (those
 * features always carry HARVEST_DATE), so it only fires when age data is
 * missing from the ENTIRE batch even though `class` looks fine.
 */
export function hasSchemaDrift(
  features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[]
): boolean {
  if (features.length === 0) return false;

  const noRecognizedClass = features.every(
    (f) => !KNOWN_AGE_CLASSES.has(f.properties?.class as string)
  );
  if (noRecognizedClass) return true;

  const noAgeSignal = features.every(
    (f) => typeof f.properties?.PROJ_AGE_1 !== "number" && f.properties?.HARVEST_DATE == null
  );
  return noAgeSignal;
}

/** Bounding-box area in km^2 -- used for the pre-fetch guard. Draw selections
 *  are literal rectangles (DrawTool.tsx bboxPolygon), so this IS the
 *  selection's true area for that entry point. */
export function bboxAreaKm2(bbox: BBox): number {
  return area(bboxPolygon(bbox)) / 1_000_000;
}

/**
 * Pure pre-fetch guard predicate -- true when `bbox` exceeds
 * CALC_AREA_GUARD_KM2 and must be refused before any network request goes
 * out. Extracted out of page.tsx's runCalculation (which used to inline
 * `bboxAreaKm2(bbox) > CALC_AREA_GUARD_KM2` directly) so the "guard refuses
 * without ever calling fetch" invariant is unit-testable without rendering
 * the full map page (no MapLibre/react-map-gl test harness exists for it).
 * page.tsx's draw-select entry point checks this BEFORE calling
 * fetchForestAgeForSelection at all -- it is the single source of truth for
 * that decision.
 */
export function isSelectionTooLarge(bbox: BBox): boolean {
  return bboxAreaKm2(bbox) > CALC_AREA_GUARD_KM2;
}

/**
 * Sequence-token guard against out-of-order async resolution ("stale
 * response" races): `start()` aborts whatever was previously in-flight and
 * returns a fresh `{ signal, token }` pair; `isCurrent(token)` reports
 * whether that token is still the most recently issued one. This is what
 * keeps a slow, superseded fetch/clip from overwriting a newer selection's
 * result -- ranked the #1 risk in the calc redesign plan
 * (jazzy-gathering-codd). Extracted out of page.tsx's own
 * `calcAbortRef`/`calcSeqRef` bookkeeping (same semantics, single object)
 * so the race is unit-testable without rendering the full map page.
 */
export interface SeqGuard {
  /** Aborts whatever was previously in-flight and returns a fresh
   *  `{ signal, token }` pair for the operation about to start. */
  start(): { signal: AbortSignal; token: number };
  /** True if `token` is still the most recently issued one -- i.e. this
   *  operation has not been superseded by a newer `start()` call. */
  isCurrent(token: number): boolean;
  /** Aborts in-flight work and bumps the token with no replacement
   *  starting (a hard reset, e.g. the selection was cleared). */
  reset(): void;
}

export function createSeqGuard(): SeqGuard {
  let seq = 0;
  let controller: AbortController | null = null;
  return {
    start() {
      controller?.abort();
      controller = new AbortController();
      seq += 1;
      return { signal: controller.signal, token: seq };
    },
    isCurrent(token: number) {
      return token === seq;
    },
    reset() {
      controller?.abort();
      controller = null;
      seq += 1;
    },
  };
}

/**
 * Fetch real VRI forest-age polygons covering `bbox` via the existing
 * `/api/wfs` edge function, at the calculator's own fixed zoom tier.
 *
 * Composes the caller's AbortSignal (aborted when a newer selection
 * supersedes this one -- see the shared sequence-token wiring in page.tsx)
 * with an internal hard timeout, so both "superseded" and "genuinely stuck"
 * can be distinguished by the caller: a caller-initiated abort rethrows the
 * original AbortError untouched; an internal timeout throws a typed
 * ForestCarbonFetchError("timeout", ...) instead.
 */
export async function fetchForestAgeForSelection(
  bbox: BBox,
  { signal }: { signal: AbortSignal }
): Promise<ForestCarbonFetchResult> {
  if (signal.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  const params = new URLSearchParams({
    layer: "forest-age",
    bbox: bbox.join(","),
    zoom: String(CALC_ZOOM),
  });

  const timeoutController = new AbortController();
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    timeoutController.abort();
  }, FETCH_TIMEOUT_MS);
  const onCallerAbort = () => timeoutController.abort();
  signal.addEventListener("abort", onCallerAbort);

  // The timer + caller-abort listener must stay alive through the FULL
  // fetch-and-read, not just until response headers arrive: FETCH_TIMEOUT_MS
  // was calibrated against observed full-transfer latency (see the const's
  // comment above), so tearing this down right after `fetch()` resolves
  // leaves the multi-MB `res.json()` body download+parse completely
  // unbounded -- a stalled body stream would hang "Calculating..." forever
  // with no error, and a caller abort landing mid-body would surface as a
  // generic http error instead of a real abort. Single cleanup in the
  // `finally` below, after the body has actually been read.
  try {
    let res: Response;
    try {
      res = await fetch(`/api/wfs?${params}`, { signal: timeoutController.signal });
    } catch (err) {
      if (signal.aborted) {
        // Caller (a new selection) superseded this fetch -- not a failure.
        throw err;
      }
      // Distinguish "our own timer fired" from "fetch failed for some other
      // reason" (DNS failure, connection refused, offline, etc.) -- these
      // are NOT the same class of error and get different UI copy
      // downstream.
      if (timedOut) {
        throw new ForestCarbonFetchError("timeout", "Request timed out");
      }
      throw new ForestCarbonFetchError("network", "Network error");
    }

    if (res.status === 429) {
      const retryAfterHeader = res.headers.get("Retry-After");
      const retryAfterSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : undefined;
      throw new ForestCarbonFetchError(
        "rate-limit",
        "Rate limited",
        Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : undefined
      );
    }
    if (!res.ok) {
      throw new ForestCarbonFetchError("http", `HTTP ${res.status}`);
    }

    let data: GeoJSON.FeatureCollection;
    try {
      data = (await res.json()) as GeoJSON.FeatureCollection;
    } catch (err) {
      // The timer/caller-abort listener are still live here (cleanup is
      // deferred to the outer `finally`), so a stalled body stream aborted
      // mid-read rejects `res.json()` and lands in this catch -- it must be
      // reclassified as an abort/timeout, not a generic parse failure, or
      // it surfaces as ForestCarbonFetchError("http") with only the
      // upstream seq-token guard masking it.
      if (signal.aborted) {
        // Caller (a new selection) superseded this fetch mid-body-read --
        // same treatment as the headers-phase case above: rethrow
        // untouched, not a ForestCarbonFetchError.
        throw err;
      }
      if (timedOut) {
        throw new ForestCarbonFetchError("timeout", "Request timed out");
      }
      throw new ForestCarbonFetchError("http", "Invalid response from data source");
    }

    const rawFeatures = data.features ?? [];
    // Defensive: only Polygon/MultiPolygon flow into the clip step (probe-
    // confirmed the forest-age WFS layer is always one of these two, but a
    // malformed upstream response shouldn't crash downstream turf calls).
    const features = rawFeatures.filter(
      (f): f is GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> =>
        f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon"
    );

    return {
      features,
      maybeTruncated: features.length >= CAP - CAP_MARGIN,
    };
  } finally {
    clearTimeout(timeoutId);
    signal.removeEventListener("abort", onCallerAbort);
  }
}
