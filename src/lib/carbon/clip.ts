import intersect from "@turf/intersect";
import { featureCollection } from "@turf/helpers";
import bboxFn from "@turf/bbox";

/**
 * Clips WFS forest-age features to the actual drawn/selected polygon, so the
 * carbon calc measures the shape the user selected rather than whatever
 * bbox-rectangle happened to be fetched. Per-feature area is recomputed
 * downstream by the existing `calculateFeatureCarbon` (`@turf/area` already
 * runs on whatever geometry it's handed) -- this module does not duplicate
 * that math.
 *
 * turf v7 API: `intersect(featureCollection([a, b]))`, NOT the v6
 * `intersect(a, b)` two-argument form.
 */

export interface ClipResult {
  /** Features that overlap the selection: precisely clipped where
   *  `intersect` succeeded, or kept at full (unclipped) area in the rare
   *  case where `intersect` threw but the feature's rough centroid falls
   *  inside the selection (see the catch block below). */
  features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[];
  /** Count of features that hit the catch path (self-intersecting/degenerate
   *  VRI rings) -- whether ultimately kept via the centroid fallback or
   *  dropped. These were NOT precisely clipped even when kept, so this
   *  number feeds the panel's "some polygons couldn't be precisely
   *  measured" caveat when skipped/total is material (>~5%). */
  skipped: number;
  total: number;
}

/** Measured live (this relay): @turf/intersect (v7.3.4, polyclip-ts backend)
 *  costs ~1.6ms/call on real VRI polygon complexity. At a few thousand
 *  candidate features that's multiple seconds of synchronous work -- a real
 *  main-thread freeze, not a minor jank (confirmed by direct measurement,
 *  not estimated). Rather than move this to a Web Worker (bigger surface:
 *  worker bundling under Next static export, message-passing/structured-
 *  clone cost for multi-MB GeoJSON, cancellation across the worker boundary
 *  -- a scope increase beyond this batch's 2-new-files footprint), this
 *  yields to the event loop every CHUNK_BUDGET_MS so the tab stays
 *  responsive (spinner animates, input still works) through the wait. This
 *  does NOT reduce total wall-clock time -- see the relay report for the
 *  full finding and the Web Worker follow-up recommendation. */
const CHUNK_BUDGET_MS = 12;

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

// ── Centroid-in-selection fallback (no new turf deps) ──────────────────
//
// Only used when `intersect` throws (self-intersecting/degenerate VRI
// rings). A vertex-average "centroid" and a ray-casting point-in-ring test
// are both ~15 lines of well-understood math -- not worth a new dependency
// for a rare error-recovery path. Holes in the SELECTION polygon are
// ignored here (tested against the outer ring only); acceptable for this
// fallback since v1's only clip caller is the rectangular draw selection
// (watershed carbon is descoped, never reaches this module).

function ringCentroid(ring: number[][]): [number, number] {
  let x = 0;
  let y = 0;
  for (const [px, py] of ring) {
    x += px;
    y += py;
  }
  const n = ring.length || 1;
  return [x / n, y / n];
}

function pointInRing(point: [number, number], ring: number[][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function roughCentroid(
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon
): [number, number] | null {
  if (geometry.type === "Polygon") {
    const ring = geometry.coordinates[0];
    return ring && ring.length > 0 ? ringCentroid(ring) : null;
  }
  // MultiPolygon: use the outer ring with the most vertices as a rough
  // proxy for "the dominant part" of the shape.
  let best: number[][] | null = null;
  for (const poly of geometry.coordinates) {
    const ring = poly[0];
    if (ring && (!best || ring.length > best.length)) best = ring;
  }
  return best ? ringCentroid(best) : null;
}

function centroidInsideSelection(
  feature: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  selection: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>
): boolean {
  const c = roughCentroid(feature.geometry);
  if (!c) return false;
  const geom = selection.geometry;
  if (geom.type === "Polygon") {
    const ring = geom.coordinates[0];
    return !!ring && pointInRing(c, ring);
  }
  return geom.coordinates.some((poly) => {
    const ring = poly[0];
    return !!ring && pointInRing(c, ring);
  });
}

export async function clipFeaturesToSelection(
  features: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[],
  selection: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>,
  options: { signal?: AbortSignal } = {}
): Promise<ClipResult> {
  const { signal } = options;
  const selBbox = bboxFn(selection);
  const [sw, ss, se, sn] = selBbox;

  const kept: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>[] = [];
  let skipped = 0;
  let chunkStart = now();

  for (const feature of features) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }

    // Cheap bbox pre-filter before the expensive intersect call. Measured
    // live: ~13ms for 2465 features (negligible) vs ~1.6ms PER intersect
    // call -- this alone drops a real fraction of candidates for free.
    const fb = bboxFn(feature);
    if (fb[2] < sw || fb[0] > se || fb[3] < ss || fb[1] > sn) continue;

    try {
      const clipped = intersect(featureCollection([feature, selection]), {
        properties: feature.properties ?? {},
      });
      // intersect returns null for a confirmed, precise non-overlap --
      // that's a correct exclusion, not a "skipped" (couldn't-measure) case.
      if (clipped) kept.push(clipped);
    } catch {
      // VRI self-intersecting/degenerate rings throw (verified live: NaN
      // coordinates, empty rings, null geometry all throw from this turf
      // version). We can't confidently clip this feature's precise overlap,
      // so fall back to a coarse centroid test: keep the feature's FULL
      // (unclipped) area if its rough centroid falls inside the selection
      // (better than silently losing real forest data), otherwise drop it.
      // Either way it counts toward `skipped` -- it was not precisely
      // clipped even when kept.
      skipped++;
      try {
        if (centroidInsideSelection(feature, selection)) {
          kept.push(feature);
        }
      } catch {
        // The fallback itself can throw on genuinely malformed geometry
        // (e.g. a null geometry despite the type contract) -- drop this one
        // feature rather than let it abort the whole clip loop.
      }
    }

    if (now() - chunkStart > CHUNK_BUDGET_MS) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      chunkStart = now();
    }
  }

  return { features: kept, skipped, total: features.length };
}
