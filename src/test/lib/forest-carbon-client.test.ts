import { describe, it, expect, vi, afterEach } from "vitest";
import {
  fetchForestAgeForSelection,
  bboxAreaKm2,
  CALC_AREA_GUARD_KM2,
  hasSchemaDrift,
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
});
