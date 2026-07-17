import { describe, it, expect } from "vitest";
import area from "@turf/area";
import { clipFeaturesToSelection } from "@/lib/carbon/clip";

/** 0,0 to 2,2 rectangular selection (matches how DrawTool builds a
 *  selection polygon -- a plain bbox rectangle). */
function selectionSquare(): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [[[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]],
    },
  };
}

describe("clipFeaturesToSelection", () => {
  it("clips an edge-straddling polygon to only its overlapping area (not the full polygon)", async () => {
    // Feature spans 1,1 to 3,3 -- half inside the 0..2 selection, half outside.
    const straddler: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: "Feature",
      properties: { PROJ_AGE_1: 300 },
      geometry: {
        type: "Polygon",
        coordinates: [[[1, 1], [1, 3], [3, 3], [3, 1], [1, 1]]],
      },
    };
    const fullArea = area(straddler);

    const result = await clipFeaturesToSelection([straddler], selectionSquare());

    expect(result.features.length).toBe(1);
    const clippedArea = area(result.features[0]);
    // The straddler's true overlap with 0..2,0..2 is the 1x1 square [1,1]-[2,2]
    // -- exactly 1/9 of its own full 2x2 area.
    expect(clippedArea).toBeLessThan(fullArea);
    expect(clippedArea).toBeGreaterThan(0);
    expect(result.skipped).toBe(0);
  });

  it("carries the source feature's properties onto the clipped geometry", async () => {
    const straddler: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: "Feature",
      properties: { PROJ_AGE_1: 250, SPECIES_CD_1: "CW" },
      geometry: {
        type: "Polygon",
        coordinates: [[[1, 1], [1, 3], [3, 3], [3, 1], [1, 1]]],
      },
    };
    const result = await clipFeaturesToSelection([straddler], selectionSquare());
    expect(result.features[0].properties).toEqual({ PROJ_AGE_1: 250, SPECIES_CD_1: "CW" });
  });

  it("handles MultiPolygon features (one part overlapping, one fully outside)", async () => {
    const multi: GeoJSON.Feature<GeoJSON.MultiPolygon> = {
      type: "Feature",
      properties: { PROJ_AGE_1: 100 },
      geometry: {
        type: "MultiPolygon",
        coordinates: [
          [[[0.5, 0.5], [0.5, 1.5], [1.5, 1.5], [1.5, 0.5], [0.5, 0.5]]], // inside selection
          [[[10, 10], [10, 11], [11, 11], [11, 10], [10, 10]]], // fully outside
        ],
      },
    };
    const result = await clipFeaturesToSelection([multi], selectionSquare());
    expect(result.features.length).toBe(1);
    expect(area(result.features[0])).toBeGreaterThan(0);
    expect(result.skipped).toBe(0);
  });

  it("MultiPolygon selection is accepted (watershed-shaped selections)", async () => {
    const multiSelection: GeoJSON.Feature<GeoJSON.MultiPolygon> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "MultiPolygon",
        coordinates: [[[[0, 0], [0, 2], [2, 2], [2, 0], [0, 0]]]],
      },
    };
    const feature: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: "Feature",
      properties: { PROJ_AGE_1: 50 },
      geometry: {
        type: "Polygon",
        coordinates: [[[0.5, 0.5], [0.5, 1.5], [1.5, 1.5], [1.5, 0.5], [0.5, 0.5]]],
      },
    };
    const result = await clipFeaturesToSelection([feature], multiSelection);
    expect(result.features.length).toBe(1);
  });

  it("excludes a feature with no overlap as a correct exclusion, not a 'skipped' case", async () => {
    const outside: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: "Feature",
      properties: { PROJ_AGE_1: 50 },
      geometry: {
        type: "Polygon",
        coordinates: [[[10, 10], [10, 11], [11, 11], [11, 10], [10, 10]]],
      },
    };
    const result = await clipFeaturesToSelection([outside], selectionSquare());
    expect(result.features.length).toBe(0);
    // A confirmed, precise non-overlap is NOT the same as "couldn't be
    // measured" -- skipped must stay 0 here (Core-9/critic: the caveat
    // fires on measurement failures, not on legitimate exclusions).
    expect(result.skipped).toBe(0);
  });

  it("catches a self-intersecting/degenerate ring (verified live: NaN coordinate throws from @turf/intersect v7.3.4) and tallies it as skipped", async () => {
    const malformed: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: "Feature",
      properties: { PROJ_AGE_1: 200 },
      geometry: {
        type: "Polygon",
        coordinates: [[[0.5, 0.5], [0.5, NaN], [1.5, 1.5], [1.5, 0.5], [0.5, 0.5]]],
      },
    };
    const result = await clipFeaturesToSelection([malformed], selectionSquare());
    expect(result.skipped).toBe(1);
    expect(result.total).toBe(1);
  });

  it("a feature with null geometry (real-world WFS data can be malformed in ways the TS types don't capture) is dropped harmlessly, without crashing the rest of the batch", async () => {
    // Verified (this relay): @turf/bbox on a null geometry returns a
    // degenerate [Infinity, Infinity, -Infinity, -Infinity] bbox rather
    // than throwing, so the cheap bbox pre-filter correctly (if
    // incidentally) excludes it as "outside the selection" before ever
    // reaching intersect/the centroid fallback. It's still worth a test:
    // the earlier `intersect`-throw path (NaN coordinates, above) DOES
    // reach the fallback and is defensively wrapped in its own try/catch
    // (a genuinely null geometry would throw there too) -- this case
    // exercises the OTHER, prefilter-level line of defense, and confirms
    // neither path crashes the batch or drops the good feature after it.
    const nullGeom = {
      type: "Feature",
      properties: { PROJ_AGE_1: 200 },
      geometry: null,
    } as unknown as GeoJSON.Feature<GeoJSON.Polygon>;
    const good: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: "Feature",
      properties: { PROJ_AGE_1: 300 },
      geometry: {
        type: "Polygon",
        coordinates: [[[0.5, 0.5], [0.5, 1.5], [1.5, 1.5], [1.5, 0.5], [0.5, 0.5]]],
      },
    };
    const result = await clipFeaturesToSelection([nullGeom, good], selectionSquare());
    expect(result.total).toBe(2);
    // The good feature after the bad one still gets processed.
    expect(result.features.length).toBe(1);
    expect(result.features[0].properties?.PROJ_AGE_1).toBe(300);
  });

  it("aborts mid-clip when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const feature: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: "Feature",
      properties: {},
      geometry: {
        type: "Polygon",
        coordinates: [[[0.5, 0.5], [0.5, 1.5], [1.5, 1.5], [1.5, 0.5], [0.5, 0.5]]],
      },
    };
    await expect(
      clipFeaturesToSelection([feature], selectionSquare(), { signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});
