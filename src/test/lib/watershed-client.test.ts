/**
 * D3 (honest failure states) -- watershed-client.ts must distinguish a
 * genuine no-watershed result (e.g. an ocean click, which resolves with 0
 * features) from a real server/network failure. Previously both collapsed
 * to the same `null` return, making a 502 indistinguishable from an ocean
 * click to every caller.
 *
 * Same fetch-mocking pattern as forest-carbon-client.test.ts
 * (vi.stubGlobal("fetch", ...) / vi.unstubAllGlobals in afterEach).
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWatershedAtPoint } from "@/lib/data/watershed-client";
import { DataFetchError } from "@/lib/data/fetch-errors";

function mockFetchOnce(response: Partial<Response> & { json?: () => Promise<unknown> }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ type: "FeatureCollection", features: [] }),
    ...response,
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchWatershedAtPoint", () => {
  it("resolves null (NOT an error) for a genuine empty result -- e.g. an ocean click", async () => {
    mockFetchOnce({ json: async () => ({ type: "FeatureCollection", features: [] }) });
    const result = await fetchWatershedAtPoint(-125.0, 49.0);
    expect(result).toBeNull();
  });

  it("resolves the watershed info for a real feature", async () => {
    mockFetchOnce({
      json: async () => ({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {
              WATERSHED_GROUP_NAME: "Fraser River",
              WATERSHED_GROUP_CODE: "FRAS",
              AREA_HA: 12345,
            },
            geometry: { type: "Polygon", coordinates: [] },
          },
        ],
      }),
    });
    const result = await fetchWatershedAtPoint(-121.5, 49.3);
    expect(result).toEqual(
      expect.objectContaining({ name: "Fraser River", code: "FRAS", areaHa: 12345 })
    );
  });

  it("falls back to FEATURE_AREA_SQM / 10000 when AREA_HA is absent", async () => {
    mockFetchOnce({
      json: async () => ({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { FEATURE_AREA_SQM: 50_000_000 },
            geometry: { type: "Polygon", coordinates: [] },
          },
        ],
      }),
    });
    const result = await fetchWatershedAtPoint(-121.5, 49.3);
    expect(result?.areaHa).toBe(5000);
  });

  it("THROWS DataFetchError on a 502 -- distinct from the empty-result (ocean) case", async () => {
    mockFetchOnce({ ok: false, status: 502 });
    await expect(fetchWatershedAtPoint(-121.5, 49.3)).rejects.toMatchObject({
      name: "DataFetchError",
      kind: "http",
    });
  });

  it("THROWS DataFetchError on a genuine network failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(fetchWatershedAtPoint(-121.5, 49.3)).rejects.toBeInstanceOf(DataFetchError);
    await expect(fetchWatershedAtPoint(-121.5, 49.3)).rejects.toMatchObject({ kind: "network" });
  });

  it("THROWS DataFetchError when the response body isn't valid JSON", async () => {
    mockFetchOnce({
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    });
    await expect(fetchWatershedAtPoint(-121.5, 49.3)).rejects.toBeInstanceOf(DataFetchError);
    await expect(fetchWatershedAtPoint(-121.5, 49.3)).rejects.toMatchObject({ kind: "http" });
  });
});
