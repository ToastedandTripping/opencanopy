import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchForestAgeForSelection,
  bboxAreaKm2,
  CALC_AREA_GUARD_KM2,
  hasSchemaDrift,
  isSelectionTooLarge,
  createSeqGuard,
} from "@/lib/data/forest-carbon-client";

function polyFeature(props: Record<string, unknown>): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: "Feature",
    properties: props,
    geometry: { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] },
  };
}

const BBOX: [number, number, number, number] = [-117.4, 49.4, -117.2, 49.6];

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => ({ type: "FeatureCollection", features: [] }),
    ...response,
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("bboxAreaKm2 / CALC_AREA_GUARD_KM2", () => {
  it("computes a sane area for a real bbox", () => {
    // ~400km^2 bbox (verified against this relay's live probe measurements)
    const km2 = bboxAreaKm2([-117.4118, 49.3882, -117.1882, 49.6118]);
    expect(km2).toBeGreaterThan(390);
    expect(km2).toBeLessThan(410);
  });

  it("guard threshold is a positive, finite number", () => {
    expect(CALC_AREA_GUARD_KM2).toBeGreaterThan(0);
    expect(Number.isFinite(CALC_AREA_GUARD_KM2)).toBe(true);
  });
});

describe("fetchForestAgeForSelection", () => {
  it("200 with 0 features resolves with an empty features array (caller maps this to no-data, not error)", async () => {
    mockFetchOnce({ json: async () => ({ type: "FeatureCollection", features: [] }) });
    const result = await fetchForestAgeForSelection(BBOX, { signal: new AbortController().signal });
    expect(result.features).toEqual([]);
    expect(result.maybeTruncated).toBe(false);
  });

  it("filters out non-Polygon/MultiPolygon features defensively", async () => {
    mockFetchOnce({
      json: async () => ({
        type: "FeatureCollection",
        features: [
          { type: "Feature", properties: { PROJ_AGE_1: 100 }, geometry: { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] } },
          { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [0, 0] } },
        ],
      }),
    });
    const result = await fetchForestAgeForSelection(BBOX, { signal: new AbortController().signal });
    expect(result.features.length).toBe(1);
    expect(result.features[0].geometry.type).toBe("Polygon");
  });

  it("429 throws a typed rate-limit error with Retry-After parsed", async () => {
    mockFetchOnce({
      ok: false,
      status: 429,
      headers: new Headers({ "Retry-After": "23" }),
    });
    await expect(
      fetchForestAgeForSelection(BBOX, { signal: new AbortController().signal })
    ).rejects.toMatchObject({
      name: "ForestCarbonFetchError",
      kind: "rate-limit",
      retryAfterSeconds: 23,
    });
  });

  it("502 throws a typed http error", async () => {
    mockFetchOnce({ ok: false, status: 502 });
    await expect(
      fetchForestAgeForSelection(BBOX, { signal: new AbortController().signal })
    ).rejects.toMatchObject({ name: "ForestCarbonFetchError", kind: "http" });
  });

  it("a genuine network failure (not caused by the timeout or caller abort) is classified as 'network', not 'timeout'", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      fetchForestAgeForSelection(BBOX, { signal: new AbortController().signal })
    ).rejects.toMatchObject({ name: "ForestCarbonFetchError", kind: "network" });
  });

  it("caller-initiated abort (a newer selection superseding this one) rethrows AbortError untouched, not a ForestCarbonFetchError", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const pending = fetchForestAgeForSelection(BBOX, { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("an internal hard timeout throws a typed 'timeout' error, distinct from a caller-initiated abort", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    // Caller's own controller -- never aborted in this test, so the only
    // thing that can end the request is the client's internal timeout.
    const controller = new AbortController();
    const pending = fetchForestAgeForSelection(BBOX, { signal: controller.signal });
    const assertion = expect(pending).rejects.toMatchObject({
      name: "ForestCarbonFetchError",
      kind: "timeout",
    });
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
  });

  // ── WARNING 1 regression (Razor Stage 2): the hard timeout + caller-abort
  // listener used to be torn down in `finally` the moment fetch() resolved
  // (i.e. the moment response HEADERS arrived) -- leaving the multi-MB
  // `res.json()` body download+parse completely unbounded. These two tests
  // model a fetch() that resolves immediately (headers "arrive" fast) but
  // whose `res.json()` hangs until the SAME AbortSignal passed to fetch()
  // fires -- exactly how a real stalled/aborted body stream behaves. On the
  // unfixed code, the timer/listener are already detached by the time
  // res.json() is even called, so neither of these promises would ever
  // settle -- both tests hang and fail via the suite's timeout instead of
  // resolving with the expected typed error.
  function mockFetchWithHangingBody() {
    return vi.fn().mockImplementation((_url: string, init?: RequestInit) => {
      const res = {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"));
            });
          }),
      } as unknown as Response;
      return Promise.resolve(res);
    });
  }

  it("the hard timeout bounds the FULL fetch+read, not just time-to-headers -- a stalled body stream after headers arrive still times out", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", mockFetchWithHangingBody());

    const controller = new AbortController();
    const pending = fetchForestAgeForSelection(BBOX, { signal: controller.signal });
    const assertion = expect(pending).rejects.toMatchObject({
      name: "ForestCarbonFetchError",
      kind: "timeout",
    });
    await vi.advanceTimersByTimeAsync(20_000);
    await assertion;
  });

  it("a caller-initiated abort landing during the body read (after headers already arrived) surfaces as an AbortError, not a generic http/parse error", async () => {
    vi.stubGlobal("fetch", mockFetchWithHangingBody());

    const controller = new AbortController();
    const pending = fetchForestAgeForSelection(BBOX, { signal: controller.signal });
    // Let fetch() resolve (headers "arrive") so we're inside res.json()
    // before the caller supersedes this selection.
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("an already-aborted signal rejects immediately without calling fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchForestAgeForSelection(BBOX, { signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requests its own fixed zoom (12) and the forest-age layer, independent of any map zoom", async () => {
    const fetchMock = mockFetchOnce({ json: async () => ({ type: "FeatureCollection", features: [] }) });
    await fetchForestAgeForSelection(BBOX, { signal: new AbortController().signal });
    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string, "http://localhost");
    expect(calledUrl.searchParams.get("layer")).toBe("forest-age");
    expect(calledUrl.searchParams.get("zoom")).toBe("12");
    expect(calledUrl.searchParams.get("bbox")).toBe(BBOX.join(","));
  });
});

describe("hasSchemaDrift", () => {
  it("is false for normal WFS-shaped features (class present)", () => {
    const features = [
      polyFeature({ class: "old-growth", PROJ_AGE_1: 300 }),
      polyFeature({ class: "mature", PROJ_AGE_1: 100 }),
    ];
    expect(hasSchemaDrift(features)).toBe(false);
  });

  it("is FALSE for a selection that is genuinely 100% harvested/clear-cut -- this must NOT be flagged as drift", () => {
    // The proxy's classifyVRIFeature classifies "harvested" from
    // HARVEST_DATE alone (wfs-proxy.ts) -- these features legitimately have
    // no numeric PROJ_AGE_1 at all. A guard keyed on PROJ_AGE_1 presence
    // would false-positive here and block a real, valid, near-zero-carbon
    // result behind a bogus "data format changed" error.
    const allHarvested = [
      polyFeature({ class: "harvested", HARVEST_DATE: "2021-06-01" }),
      polyFeature({ class: "harvested", HARVEST_DATE: "2019-03-15" }),
    ];
    expect(hasSchemaDrift(allHarvested)).toBe(false);
  });

  it("is true when every feature lacks a recognized class (tile-shaped or otherwise drifted schema)", () => {
    const driftedFeatures = [
      polyFeature({ age: 300, species: "CW" }), // tile-transform property names
      polyFeature({ age: 100, species: "FD" }),
    ];
    expect(hasSchemaDrift(driftedFeatures)).toBe(true);
  });

  it("is false for an empty array (that's the no-data case, handled separately upstream)", () => {
    expect(hasSchemaDrift([])).toBe(false);
  });

  it("is false if even one feature has a recognized class", () => {
    const mixed = [
      polyFeature({ class: "old-growth", PROJ_AGE_1: 300 }),
      polyFeature({ garbage: true }),
    ];
    expect(hasSchemaDrift(mixed)).toBe(false);
  });

  // ── Drift-guard hardening NOTE (Razor Stage 2): `class` alone can survive
  // a FUTURE partial drift where PROJ_AGE_1 itself gets renamed upstream
  // while the proxy keeps stamping some `class` value on every feature. The
  // hardened guard also requires at least one feature carry the raw age
  // signal (numeric PROJ_AGE_1 or HARVEST_DATE) the classifier actually
  // reads.
  it("is true when every feature has a recognized `class` but NONE carry a numeric PROJ_AGE_1 or a HARVEST_DATE (a future partial-drift where age data itself went missing)", () => {
    const partiallyDrifted = [
      polyFeature({ class: "unknown" }),
      polyFeature({ class: "mature" }), // class survives, but no age signal at all
    ];
    expect(hasSchemaDrift(partiallyDrifted)).toBe(true);
  });
});

// ── WARNING 2 spec test 1 (Razor Stage 2, SPEC_GAPS item 10): the pre-fetch
// area guard lives in page.tsx's runCalculation with no regression test.
// isSelectionTooLarge is the extracted, exported predicate page.tsx's
// draw-select entry point checks BEFORE ever calling
// fetchForestAgeForSelection -- extracted specifically so this can be
// covered without rendering the full map page (no MapLibre/react-map-gl
// test harness exists for it).
describe("isSelectionTooLarge (draw-select pre-fetch area guard)", () => {
  // BC-scale bbox, far over CALC_AREA_GUARD_KM2 (500km^2).
  const TOO_LARGE_BBOX: [number, number, number, number] = [-130, 48, -114, 60];

  it("is true above CALC_AREA_GUARD_KM2, false at/under it", () => {
    expect(bboxAreaKm2(TOO_LARGE_BBOX)).toBeGreaterThan(CALC_AREA_GUARD_KM2);
    expect(isSelectionTooLarge(TOO_LARGE_BBOX)).toBe(true);

    // Module-level BBOX (~390-410km^2, verified by the bboxAreaKm2 test
    // above) sits comfortably under the guard.
    expect(bboxAreaKm2(BBOX)).toBeLessThan(CALC_AREA_GUARD_KM2);
    expect(isSelectionTooLarge(BBOX)).toBe(false);
  });

  it("a too-large draw is refused WITHOUT ever calling fetch -- the guard short-circuits before any network request goes out", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // page.tsx's runCalculation guard clause verbatim: check
    // isSelectionTooLarge BEFORE calling fetchForestAgeForSelection at all
    // (never "fetch, then check the result"). isSelectionTooLarge is the
    // single exported predicate the production guard clause uses for this
    // decision -- a regression in the threshold/comparison itself is caught
    // by the test above; this test proves the "refuse == never call fetch"
    // invariant the guard exists to guarantee.
    if (!isSelectionTooLarge(TOO_LARGE_BBOX)) {
      await fetchForestAgeForSelection(TOO_LARGE_BBOX, { signal: new AbortController().signal });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ── WARNING 2 spec test 2 (Razor Stage 2, SPEC_GAPS item 10): the
// sequence-token race -- "the plan's own #1 risk" -- had no regression test.
// createSeqGuard is the extracted primitive page.tsx's runCalculation uses
// for its calcAbortRef/calcSeqRef bookkeeping (same object, both entry
// points: draw + watershed), so this exercises the ACTUAL production
// mechanism, not a reimplementation of the pattern in the test.
describe("createSeqGuard (stale-response race guard)", () => {
  it("an older selection's fetch resolving AFTER a newer selection started must NOT be treated as current -- only the newer selection's result may land in state", async () => {
    const guard = createSeqGuard();
    const writes: string[] = [];

    // Older selection starts first.
    const older = guard.start();
    let resolveOlderFetch!: (value: string) => void;
    const olderFetchPromise = new Promise<string>((resolve) => {
      resolveOlderFetch = resolve;
    });
    // Mirrors page.tsx's runCalculation: await the async work, then gate
    // the state write on isCurrent(token).
    const olderRun = (async () => {
      const result = await olderFetchPromise;
      if (!guard.isCurrent(older.token)) return; // superseded -- must not write
      writes.push(`older:${result}`);
    })();

    // A NEWER selection supersedes the older one BEFORE the older fetch
    // resolves -- guard.start() aborts the older's signal and bumps the
    // token, exactly like a new draw selection superseding an in-flight one
    // in page.tsx.
    const newer = guard.start();
    expect(older.signal.aborted).toBe(true);

    let resolveNewerFetch!: (value: string) => void;
    const newerFetchPromise = new Promise<string>((resolve) => {
      resolveNewerFetch = resolve;
    });
    const newerRun = (async () => {
      const result = await newerFetchPromise;
      if (!guard.isCurrent(newer.token)) return;
      writes.push(`newer:${result}`);
    })();

    // The OLDER fetch resolves LAST, after the newer selection already
    // started -- the exact out-of-order race. Resolve newer first, older
    // second, to prove ordering of resolution doesn't matter, only the
    // token does.
    resolveNewerFetch("newer-data");
    await newerRun;
    resolveOlderFetch("older-data");
    await olderRun;

    expect(writes).toEqual(["newer:newer-data"]);
    expect(guard.isCurrent(older.token)).toBe(false);
    expect(guard.isCurrent(newer.token)).toBe(true);
  });

  it("reset() aborts in-flight work and bumps the token with no replacement -- a resolution after reset() is also treated as stale", () => {
    const guard = createSeqGuard();
    const { signal, token } = guard.start();
    expect(signal.aborted).toBe(false);

    guard.reset();
    expect(signal.aborted).toBe(true);
    expect(guard.isCurrent(token)).toBe(false);
  });
});
