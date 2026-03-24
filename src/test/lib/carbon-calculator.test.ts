import { describe, it, expect } from "vitest";
import {
  calculateFeatureCarbon,
  calculateSelectionStats,
  calculateFinancialValue,
} from "@/lib/carbon/calculator";

/**
 * Helper to build a minimal GeoJSON feature with given properties.
 * Uses a 1-hectare polygon (100m x 100m) for predictable area calculations.
 */
function makeFeature(
  props: Record<string, unknown> = {}
): GeoJSON.Feature {
  // ~100m x 100m square near Vancouver = approximately 1 hectare
  // (at lat 49, 0.001 deg lng ~ 73m, 0.001 deg lat ~ 111m)
  // Using a larger square for closer to 1ha
  return {
    type: "Feature",
    properties: props,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-123.0, 49.0],
          [-123.0, 49.009],    // ~1000m north
          [-123.0135, 49.009], // ~1000m west at lat 49
          [-123.0135, 49.0],
          [-123.0, 49.0],
        ],
      ],
    },
  };
}

describe("calculateFeatureCarbon", () => {
  it("returns zero carbon for a feature with age 0", () => {
    const feature = makeFeature({ PROJ_AGE_1: 0 });
    const result = calculateFeatureCarbon(feature);
    expect(result.carbonTonnes).toBe(0);
    expect(result.co2eTonnes).toBe(0);
  });

  it("returns positive area for a valid polygon", () => {
    const feature = makeFeature({ PROJ_AGE_1: 100 });
    const result = calculateFeatureCarbon(feature);
    expect(result.areaHa).toBeGreaterThan(0);
  });

  it("classifies old-growth at age 250+", () => {
    const feature = makeFeature({ PROJ_AGE_1: 300 });
    const result = calculateFeatureCarbon(feature);
    expect(result.ageClass).toBe("old-growth");
  });

  it("classifies mature at age 80-249", () => {
    const feature = makeFeature({ PROJ_AGE_1: 150 });
    const result = calculateFeatureCarbon(feature);
    expect(result.ageClass).toBe("mature");
  });

  it("classifies young at age 1-79", () => {
    const feature = makeFeature({ PROJ_AGE_1: 30 });
    const result = calculateFeatureCarbon(feature);
    expect(result.ageClass).toBe("young");
  });

  it("classifies harvested when age is null and HARVEST_DATE present", () => {
    const feature = makeFeature({
      PROJ_AGE_1: null,
      HARVEST_DATE: "2020-01-01",
    });
    const result = calculateFeatureCarbon(feature);
    expect(result.ageClass).toBe("harvested");
  });

  it("classifies unknown when age is null and no HARVEST_DATE", () => {
    const feature = makeFeature({ PROJ_AGE_1: null });
    const result = calculateFeatureCarbon(feature);
    expect(result.ageClass).toBe("unknown");
  });

  it("uses species-specific carbon density when SPECIES_CD_1 is provided", () => {
    const cwFeature = makeFeature({ PROJ_AGE_1: 200, SPECIES_CD_1: "CW" });
    const plFeature = makeFeature({ PROJ_AGE_1: 200, SPECIES_CD_1: "PL" });
    const cwResult = calculateFeatureCarbon(cwFeature);
    const plResult = calculateFeatureCarbon(plFeature);
    // CW (Western Red Cedar) has higher max carbon than PL (Lodgepole Pine)
    expect(cwResult.carbonTonnes).toBeGreaterThan(plResult.carbonTonnes);
  });

  it("falls back to DEFAULT species when unknown code given", () => {
    const feature = makeFeature({ PROJ_AGE_1: 100, SPECIES_CD_1: "ZZ" });
    const result = calculateFeatureCarbon(feature);
    expect(result.species).toBe("ZZ");
    // Should still compute carbon (using DEFAULT density)
    expect(result.carbonTonnes).toBeGreaterThan(0);
  });

  it("uses pre-classified class property when available", () => {
    const feature = makeFeature({
      PROJ_AGE_1: 50,
      class: "old-growth", // pre-classified overrides age-based
    });
    const result = calculateFeatureCarbon(feature);
    expect(result.ageClass).toBe("old-growth");
  });

  it("CO2e is exactly 3.67x carbon", () => {
    const feature = makeFeature({ PROJ_AGE_1: 100 });
    const result = calculateFeatureCarbon(feature);
    expect(result.co2eTonnes).toBeCloseTo(result.carbonTonnes * 3.67, 5);
  });
});

describe("calculateSelectionStats", () => {
  it("returns zeros for empty feature array", () => {
    const stats = calculateSelectionStats([]);
    expect(stats.totalCarbonTonnes).toBe(0);
    expect(stats.totalCo2eTonnes).toBe(0);
    expect(stats.totalAreaHa).toBe(0);
    expect(stats.featureCount).toBe(0);
  });

  it("aggregates multiple features", () => {
    const features = [
      makeFeature({ PROJ_AGE_1: 300 }),
      makeFeature({ PROJ_AGE_1: 100 }),
      makeFeature({ PROJ_AGE_1: 30 }),
    ];
    const stats = calculateSelectionStats(features);
    expect(stats.featureCount).toBe(3);
    expect(stats.totalAreaHa).toBeGreaterThan(0);
    expect(stats.totalCarbonTonnes).toBeGreaterThan(0);
    expect(stats.oldGrowthHa).toBeGreaterThan(0);
    expect(stats.matureHa).toBeGreaterThan(0);
    expect(stats.youngHa).toBeGreaterThan(0);
  });

  it("computes equivalences from total CO2e", () => {
    const features = [makeFeature({ PROJ_AGE_1: 200 })];
    const stats = calculateSelectionStats(features);
    // Verify equivalences are derived from totalCo2eTonnes
    expect(stats.equivalences.cars).toBeGreaterThan(0);
    expect(stats.equivalences.homes).toBeGreaterThan(0);
    expect(stats.equivalences.flights).toBeGreaterThan(0);
  });

  it("tracks species breakdown by hectares", () => {
    const features = [
      makeFeature({ PROJ_AGE_1: 100, SPECIES_CD_1: "CW" }),
      makeFeature({ PROJ_AGE_1: 100, SPECIES_CD_1: "CW" }),
      makeFeature({ PROJ_AGE_1: 100, SPECIES_CD_1: "FD" }),
    ];
    const stats = calculateSelectionStats(features);
    expect(stats.speciesBreakdown["CW"]).toBeGreaterThan(0);
    expect(stats.speciesBreakdown["FD"]).toBeGreaterThan(0);
    // Two CW features should be roughly double the FD area
    expect(stats.speciesBreakdown["CW"]).toBeCloseTo(
      stats.speciesBreakdown["FD"] * 2,
      1
    );
  });
});

describe("calculateFinancialValue", () => {
  it("returns carbon values for each market", () => {
    const stats = calculateSelectionStats([
      makeFeature({ PROJ_AGE_1: 200 }),
    ]);
    const financials = calculateFinancialValue(stats);
    expect(financials.carbonValues.length).toBe(3);
    for (const cv of financials.carbonValues) {
      expect(cv.value).toBeGreaterThan(0);
      expect(cv.market).toBeTruthy();
    }
  });

  it("calculates stumpage revenue based on age class hectares", () => {
    const stats = calculateSelectionStats([
      makeFeature({ PROJ_AGE_1: 300 }), // old-growth
    ]);
    const financials = calculateFinancialValue(stats);
    // Old-growth: area_ha * 800 m3/ha * $24/m3
    expect(financials.stumpageRevenue).toBeGreaterThan(0);
  });

  it("calculates ecosystem services for forested area only", () => {
    const features = [
      makeFeature({ PROJ_AGE_1: 100 }),
      makeFeature({ PROJ_AGE_1: null, HARVEST_DATE: "2020-01-01" }),
    ];
    const stats = calculateSelectionStats(features);
    const financials = calculateFinancialValue(stats);
    // Ecosystem services should be based on (totalAreaHa - harvestedHa)
    const expectedForested = stats.totalAreaHa - stats.harvestedHa;
    expect(financials.ecosystemServicesAnnual).toBeCloseTo(
      expectedForested * 2300,
      0
    );
  });

  it("returns zero stumpage for all-harvested selection", () => {
    const features = [
      makeFeature({ PROJ_AGE_1: null, HARVEST_DATE: "2020-01-01" }),
    ];
    const stats = calculateSelectionStats(features);
    const financials = calculateFinancialValue(stats);
    // Harvested has 0 timber volume, so stumpage should be 0
    expect(financials.stumpageRevenue).toBe(0);
  });
});
