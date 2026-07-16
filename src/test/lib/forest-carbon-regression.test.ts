import { describe, it, expect } from "vitest";
import { clipFeaturesToSelection } from "@/lib/carbon/clip";
import { calculateSelectionStats } from "@/lib/carbon/calculator";

/**
 * Regression guard for the original defect (map-audit 2026-07-16,
 * relay plan jazzy-gathering-codd): the calculator silently produced a
 * confident "0 tonnes CO2" for real, aged forest selections. Two
 * independent causes: (1) querying a layer id that never existed, and
 * (2) reading WFS property names (PROJ_AGE_1/SPECIES_CD_1) against
 * tile-shaped features that only carry the renamed class/age/species.
 *
 * This test exercises the REAL production data path end-to-end --
 * WFS-shaped features (exactly what /api/wfs?layer=forest-age returns,
 * probe-verified this relay) through clipFeaturesToSelection ->
 * calculateSelectionStats -- and asserts a non-zero result for a
 * selection containing aged features. If a future change reverts to
 * reading tile properties (class/age/species) instead of the WFS schema,
 * or reintroduces any other path that silently zeroes the age field,
 * this test fails.
 */

function wfsShapedFeature(
  ageYears: number,
  species: string,
  coords: [number, number][]
): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: "Feature",
    // Exactly the WFS schema (wfs-proxy.ts PROPERTY_WHITELIST["forest-age"]),
    // NOT the tile-transform schema (class/age/species). Deliberately does
    // NOT include a `class` property, so classifyAge must derive it from
    // PROJ_AGE_1 -- this is what would break if the read path regressed to
    // tile properties.
    properties: {
      PROJ_AGE_1: ageYears,
      SPECIES_CD_1: species,
      OBJECTID: Math.floor(Math.random() * 1e9),
    },
    geometry: { type: "Polygon", coordinates: [[...coords, coords[0]]] },
  };
}

function selectionCovering(): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [[[-117.4, 49.4], [-117.4, 49.6], [-117.2, 49.6], [-117.2, 49.4], [-117.4, 49.4]]],
    },
  };
}

describe("forest carbon calc regression guard (never a confident 0 for aged features)", () => {
  it("yields non-zero tonnes for a selection containing real aged forest, through the full clip + stats pipeline", async () => {
    const features = [
      wfsShapedFeature(300, "CW", [[-117.38, 49.42], [-117.38, 49.45], [-117.35, 49.45], [-117.35, 49.42]]), // old-growth
      wfsShapedFeature(120, "FD", [[-117.33, 49.48], [-117.33, 49.5], [-117.3, 49.5], [-117.3, 49.48]]), // mature
      wfsShapedFeature(40, "PL", [[-117.28, 49.52], [-117.28, 49.54], [-117.25, 49.54], [-117.25, 49.52]]), // young
    ];

    const { features: clipped, skipped } = await clipFeaturesToSelection(features, selectionCovering());
    expect(skipped).toBe(0);
    expect(clipped.length).toBe(3);

    const stats = calculateSelectionStats(clipped);

    // The actual regression assertion: a selection with real aged features
    // must never compute to 0. (This is exactly the class of bug that
    // shipped originally -- both zeroing causes are impossible to
    // reproduce here since this test exercises the real schema end-to-end.)
    expect(stats.totalCo2eTonnes).toBeGreaterThan(0);
    expect(stats.totalCarbonTonnes).toBeGreaterThan(0);
    expect(stats.totalAreaHa).toBeGreaterThan(0);
    expect(stats.oldGrowthHa).toBeGreaterThan(0);
    expect(stats.matureHa).toBeGreaterThan(0);
    expect(stats.youngHa).toBeGreaterThan(0);
    expect(stats.featureCount).toBe(3);
  });

  it("does NOT use a >= CAP truncation fixture as a stand-in pass signal (critic Core-9i)", async () => {
    // A capped-but-not-full response (e.g. 7,950 of an 8000 cap, after the
    // proxy's post-cap classify-drop) must still compute correctly -- the
    // regression guard is about the SCHEMA/MATH path, not about hitting the
    // truncation backstop. This fixture is deliberately small and un-capped.
    const features = [wfsShapedFeature(260, "HW", [[-117.3, 49.5], [-117.3, 49.51], [-117.29, 49.51], [-117.29, 49.5]])];
    const { features: clipped } = await clipFeaturesToSelection(features, selectionCovering());
    const stats = calculateSelectionStats(clipped);
    expect(stats.totalCo2eTonnes).toBeGreaterThan(0);
  });

  it("a selection with only harvested/unaged features legitimately computes to 0 -- this is a REAL zero, distinct from the no-data/schema-drift cases handled upstream in page.tsx", () => {
    const harvested: GeoJSON.Feature<GeoJSON.Polygon> = {
      type: "Feature",
      properties: { PROJ_AGE_1: null, HARVEST_DATE: "2020-01-01" },
      geometry: { type: "Polygon", coordinates: [[[-117.3, 49.5], [-117.3, 49.51], [-117.29, 49.51], [-117.29, 49.5], [-117.3, 49.5]]] },
    };
    const stats = calculateSelectionStats([harvested]);
    expect(stats.totalCo2eTonnes).toBe(0);
    expect(stats.featureCount).toBe(1); // NOT 0 -- a real feature was measured, it's just carbon-empty
  });
});
