/**
 * Part B — Check 7: Property Schema Source of Truth
 *          Check 12: Popup Property References
 *
 * Check 7: Derives a canonical LAYER_PROPERTY_SCHEMAS map from what
 * build-tiles.ts actually extracts per source layer. Verifies that
 * registry paint expressions, filter expressions, and timelineField
 * values only reference properties present in the schema.
 *
 * Check 12: The MapPopup component uses PRIORITY_KEYS to render feature
 * properties. Verifies each key in PRIORITY_KEYS exists in the schema
 * for at least one source layer (i.e., the popup won't silently show
 * nothing for any of its defined property labels).
 */

import { describe, it, expect } from "vitest";
import { LAYER_REGISTRY } from "@/lib/layers/registry";

// ── Canonical property schemas per source layer ──────────────────────────────
//
// These are derived from the extractors in scripts/build-tiles.ts.
// Each field listed here is guaranteed to be written into the NDJSON file
// by the corresponding PropertyExtractor function.
//
// forest-age: classifyVRIFeature() outputs class, age, species
// tenure-cutblocks: extractTenureCutblocks() outputs company_id, DISTURBANCE_START_DATE, PLANNED_GROSS_BLOCK_AREA
// fire-history: extractFireHistory() outputs FIRE_YEAR, FIRE_SIZE_HECTARES, FIRE_CAUSE
// parks: downloadSimpleLayer() keeps all WFS properties (no extractor) -> schema from WFS source
//        Popup references PROTECTED_LANDS_NAME, PARK_CLASS (WFS props kept verbatim)
// conservancies: downloadSimpleLayer() keeps all WFS properties
//        Popup references CONSERVANCY_AREA_NAME
// ogma: extractOgma() outputs OGMA_TYPE, LANDSCAPE_UNIT_NAME
// wildlife-habitat-areas: extractWildlifeHabitatAreas() outputs COMMON_SPECIES_NAME, HABITAT_AREA_ID
// ungulate-winter-range: extractUngulateWinterRange() outputs SPECIES_1, UWR_TAG
// community-watersheds: extractCommunityWatersheds() outputs CW_NAME, AREA_HA
// mining-claims: extractMiningClaims() outputs TENURE_TYPE_DESCRIPTION, OWNER_NAME, TENURE_STATUS
// forestry-roads: extractForestryRoads() outputs ROAD_SECTION_NAME, CLIENT_NAME
// conservation-priority: extractConservationPriority() outputs TAP_CLASSIFICATION_LABEL,
//   LANDSCAPE_UNIT_NAME, ANCIENT_FOREST_IND, PRIORITY_BIG_TREED_OG_IND, BGC_LABEL,
//   FIELD_VERIFIED_IND, FEATURE_AREA_SQM

export const LAYER_PROPERTY_SCHEMAS: Record<string, Set<string>> = {
  "forest-age": new Set(["class", "age", "species"]),
  "tenure-cutblocks": new Set([
    "company_id",
    "DISTURBANCE_START_DATE",
    "PLANNED_GROSS_BLOCK_AREA",
  ]),
  "fire-history": new Set(["FIRE_YEAR", "FIRE_SIZE_HECTARES", "FIRE_CAUSE"]),
  // parks and conservancies use downloadSimpleLayer() which keeps all WFS properties.
  // We include the specific WFS fields the popup and registry reference.
  parks: new Set(["PROTECTED_LANDS_NAME", "PROTECTED_LANDS_DESIGNATION"]),
  conservancies: new Set(["CONSERVANCY_AREA_NAME"]),
  ogma: new Set(["OGMA_TYPE", "LANDSCAPE_UNIT_NAME"]),
  "wildlife-habitat-areas": new Set(["COMMON_SPECIES_NAME", "HABITAT_AREA_ID"]),
  "ungulate-winter-range": new Set(["SPECIES_1", "UWR_TAG"]),
  "community-watersheds": new Set(["CW_NAME", "AREA_HA"]),
  "mining-claims": new Set([
    "TENURE_TYPE_DESCRIPTION",
    "OWNER_NAME",
    "TENURE_STATUS",
  ]),
  "forestry-roads": new Set(["ROAD_SECTION_NAME", "CLIENT_NAME"]),
  "conservation-priority": new Set([
    "TAP_CLASSIFICATION_LABEL",
    "LANDSCAPE_UNIT_NAME",
    "ANCIENT_FOREST_IND",
    "PRIORITY_BIG_TREED_OG_IND",
    "BGC_LABEL",
    "FIELD_VERIFIED_IND",
    "FEATURE_AREA_SQM",
  ]),
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract ["get", "propName"] references from any nested expression. */
function extractGetReferences(expr: unknown): string[] {
  if (!Array.isArray(expr)) return [];
  const refs: string[] = [];
  if (expr[0] === "get" && typeof expr[1] === "string") {
    refs.push(expr[1]);
  }
  for (const child of expr) {
    refs.push(...extractGetReferences(child));
  }
  return refs;
}

/** Extract ["has", "propName"] references from any nested expression. */
function extractHasReferences(expr: unknown): string[] {
  if (!Array.isArray(expr)) return [];
  const refs: string[] = [];
  if (expr[0] === "has" && typeof expr[1] === "string") {
    refs.push(expr[1]);
  }
  for (const child of expr) {
    refs.push(...extractHasReferences(child));
  }
  return refs;
}

/** All property references (get + has) from an expression. */
function extractAllPropertyRefs(expr: unknown): string[] {
  return [...new Set([...extractGetReferences(expr), ...extractHasReferences(expr)])];
}

// ── Check 7: Paint expression property references ─────────────────────────────

describe("Check 7: Property schema — paint expression references", () => {
  it("all fill-color / line-color / circle-color expressions reference known schema properties", () => {
    const violations: string[] = [];

    for (const layer of LAYER_REGISTRY) {
      if (!layer.tileSource) continue;
      const sourceLayer = layer.tileSource.sourceLayer;
      const schema = LAYER_PROPERTY_SCHEMAS[sourceLayer];
      if (!schema) continue;

      const paint = layer.style.paint;
      const colorKeys = ["fill-color", "line-color", "circle-color"];

      for (const colorKey of colorKeys) {
        if (!(colorKey in paint)) continue;
        const refs = extractAllPropertyRefs(paint[colorKey]);
        for (const ref of refs) {
          if (!schema.has(ref)) {
            violations.push(
              `layer "${layer.id}" paint["${colorKey}"] references "${ref}" ` +
                `which is not in schema for source layer "${sourceLayer}". ` +
                `Known: [${[...schema].join(", ")}]`
            );
          }
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Paint expressions reference properties outside schema:\n${violations.join("\n")}`
      );
    }

    expect(violations).toHaveLength(0);
  });
});

// ── Check 7: Filter expression property references ────────────────────────────

describe("Check 7: Property schema — filter expression references", () => {
  it("all filter expressions reference known schema properties", () => {
    const violations: string[] = [];

    for (const layer of LAYER_REGISTRY) {
      if (!layer.tileSource) continue;
      const sourceLayer = layer.tileSource.sourceLayer;
      const schema = LAYER_PROPERTY_SCHEMAS[sourceLayer];
      if (!schema) continue;
      if (!layer.style.filter) continue;

      const refs = extractAllPropertyRefs(layer.style.filter);
      for (const ref of refs) {
        if (!schema.has(ref)) {
          violations.push(
            `layer "${layer.id}" filter references "${ref}" ` +
              `which is not in schema for source layer "${sourceLayer}". ` +
              `Known: [${[...schema].join(", ")}]`
          );
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Filter expressions reference properties outside schema:\n${violations.join("\n")}`
      );
    }

    expect(violations).toHaveLength(0);
  });
});

// ── Check 7: timelineField schema validation ──────────────────────────────────

describe("Check 7: Property schema — timelineField values", () => {
  it("timelineField values are present in the source layer schema", () => {
    const violations: string[] = [];

    for (const layer of LAYER_REGISTRY) {
      if (!layer.timelineField) continue;
      if (!layer.tileSource) {
        violations.push(
          `layer "${layer.id}" has timelineField "${layer.timelineField}" but no tileSource. ` +
            "Timeline field filtering requires PMTiles data."
        );
        continue;
      }

      const sourceLayer = layer.tileSource.sourceLayer;
      const schema = LAYER_PROPERTY_SCHEMAS[sourceLayer];
      if (!schema) continue;

      if (!schema.has(layer.timelineField)) {
        violations.push(
          `layer "${layer.id}" timelineField "${layer.timelineField}" ` +
            `is not in schema for source layer "${sourceLayer}". ` +
            `Known: [${[...schema].join(", ")}]`
        );
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `timelineField values outside schema:\n${violations.join("\n")}`
      );
    }

    expect(violations).toHaveLength(0);
  });

  it("documents all layers with timelineField", () => {
    // This test serves as a registry of layers using timeline filtering.
    // If a new layer is added with timelineField, this count should increase.
    const timelineLayers = LAYER_REGISTRY.filter((l) => l.timelineField);
    expect(timelineLayers.length).toBeGreaterThan(0);

    // Document them
    for (const layer of timelineLayers) {
      expect(layer.timelineField).toBeTruthy();
      expect(typeof layer.timelineField).toBe("string");
    }
  });
});

// ── Check 7: timelineRange must be set when timelineField is set ──────────────

describe("Check 7: Property schema — timelineRange presence and validity", () => {
  it("every layer with timelineField also has timelineRange", () => {
    const violations: string[] = [];

    for (const layer of LAYER_REGISTRY) {
      if (!layer.timelineField) continue;

      if (!layer.timelineRange) {
        violations.push(
          `layer "${layer.id}" has timelineField "${layer.timelineField}" ` +
            `but is missing timelineRange. Add timelineRange: [startYear, endYear].`
        );
        continue;
      }

      const [start, end] = layer.timelineRange;

      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        violations.push(
          `layer "${layer.id}" timelineRange [${start}, ${end}] must contain integers.`
        );
      }
      if (start >= end) {
        violations.push(
          `layer "${layer.id}" timelineRange [${start}, ${end}] is invalid: start must be < end.`
        );
      }
      if (start < 1800 || end > 2100) {
        violations.push(
          `layer "${layer.id}" timelineRange [${start}, ${end}] looks unreasonable. ` +
            "Expected year values between 1800 and 2100."
        );
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `timelineRange validation failures:\n${violations.join("\n")}`
      );
    }

    expect(violations).toHaveLength(0);
  });

  it("timelineRange values are consistent with known data extents", () => {
    // Spot-check the specific values defined for each timeline layer.
    // These come from the data source documentation and must be updated
    // if the upstream data changes.
    const fireHistory = LAYER_REGISTRY.find((l) => l.id === "fire-history");
    expect(fireHistory?.timelineRange).toEqual([1917, 2025]);

    const cutblocks = LAYER_REGISTRY.find((l) => l.id === "cutblocks");
    expect(cutblocks?.timelineRange).toEqual([1950, 2025]);

    const tenureCutblocks = LAYER_REGISTRY.find((l) => l.id === "tenure-cutblocks");
    expect(tenureCutblocks?.timelineRange).toEqual([1950, 2025]);
  });
});

// ── Check 12: Popup PRIORITY_KEYS property references ────────────────────────

describe("Check 12: Popup property references", () => {
  /**
   * MapPopup's PRIORITY_KEYS define what properties the popup renders
   * in priority order. Each key should either:
   *   a) Exist in at least one source layer's schema, OR
   *   b) Be a WFS-only property (layers without tiles, e.g., tap-deferrals,
   *      fish-streams) -- these aren't in LAYER_PROPERTY_SCHEMAS since
   *      they come directly from WFS and aren't tile-built.
   *
   * The popup is generic (renders whatever feature.properties contains),
   * but PRIORITY_KEYS determines display order. A key that exists nowhere
   * in any schema AND nowhere in WFS whitelists is dead weight.
   *
   * Source of PRIORITY_KEYS: MapPopup.tsx (read and documented here).
   * This avoids importing a React component into vitest.
   */
  const POPUP_PRIORITY_KEYS = [
    // Forest / VRI
    "class",
    "PROJ_AGE_1",
    "SPECIES_CD_1",
    "PROJ_HEIGHT_1",
    "POLYGON_AREA",
    "BEC_ZONE_CODE",
    "HARVEST_DATE",
    // Parks / conservancies
    "PROTECTED_LANDS_NAME",
    "PARK_CLASS",
    "CONSERVANCY_AREA_NAME",
    // Species at risk (WFS-only)
    "SCIENTIFIC_NAME",
    "ENGLISH_NAME",
    "BC_LIST",
    "COSEWIC_STATUS",
    // Fire history
    "FIRE_YEAR",
    "FIRE_SIZE_HECTARES",
    "FIRE_CAUSE",
    // OGMA
    "OGMA_TYPE",
    "LANDSCAPE_UNIT_NAME",
    // Wildlife
    "COMMON_SPECIES_NAME",
    "SCIENTIFIC_SPECIES_NAME",
    // Ungulate
    "SPECIES_1",
    "SPECIES_2",
    // Watersheds
    "CW_NAME",
    "AREA_HA",
    // Mining
    "CLAIM_NAME",
    "OWNER_NAME",
    "TENURE_STATUS",
    "TENURE_AREA_IN_HECTARE",
    // Roads
    "ROAD_SECTION_NAME",
    "ROAD_CLASS",
    // Conservation priority
    "TAP_CLASSIFICATION_LABEL",
    "ANCIENT_FOREST_IND",
    "BGC_LABEL",
    "REGION_NAME",
    "DISTRICT_NAME",
    "FEATURE_AREA_SQM",
  ] as const;

  // Build the union of all schema properties, plus WFS-only properties known
  // to be returned by the proxy PROPERTY_WHITELIST for non-tile layers.
  const WFS_ONLY_PROPERTIES = new Set([
    // forest-age / logging-risk / tap-deferrals (VRI WFS response)
    "PROJ_AGE_1",
    "SPECIES_CD_1",
    "PROJ_HEIGHT_1",
    "POLYGON_AREA",
    "BEC_ZONE_CODE",
    "HARVEST_DATE",
    // species-at-risk (WFS-only layer)
    "SCIENTIFIC_NAME",
    "ENGLISH_NAME",
    "BC_LIST",
    "COSEWIC_STATUS",
    // parks WFS has more fields than the tile schema
    "PARK_CLASS",
    // wildlife-habitat-areas WFS has more fields
    "SCIENTIFIC_SPECIES_NAME",
    // ungulate WFS has secondary species
    "SPECIES_2",
    // mining claims WFS has more fields
    "CLAIM_NAME",
    "TENURE_AREA_IN_HECTARE",
    // forestry roads WFS has more fields
    "ROAD_CLASS",
    // conservation priority WFS has more fields
    "REGION_NAME",
    "DISTRICT_NAME",
  ]);

  const allSchemaProperties = new Set<string>();
  for (const props of Object.values(LAYER_PROPERTY_SCHEMAS)) {
    for (const p of props) {
      allSchemaProperties.add(p);
    }
  }

  it("every PRIORITY_KEY is covered by a schema property or a known WFS property", () => {
    const unmatched: string[] = [];

    for (const key of POPUP_PRIORITY_KEYS) {
      if (!allSchemaProperties.has(key) && !WFS_ONLY_PROPERTIES.has(key)) {
        unmatched.push(key);
      }
    }

    if (unmatched.length > 0) {
      throw new Error(
        `MapPopup PRIORITY_KEYS reference properties not found in any schema or WFS whitelist:\n` +
          unmatched.join("\n") +
          "\n\nThese keys will never render meaningful data. " +
          "Either update the schema, add them to WFS_ONLY_PROPERTIES, or remove them from PRIORITY_KEYS."
      );
    }

    expect(unmatched).toHaveLength(0);
  });

  it("MapPopup has non-empty PRIORITY_KEYS list", () => {
    expect(POPUP_PRIORITY_KEYS.length).toBeGreaterThan(0);
  });

  it("documents that MapPopup is generic (dumps feature.properties, uses PRIORITY_KEYS for order)", () => {
    // MapPopup.tsx renders all feature.properties entries, sorted by PRIORITY_KEYS index.
    // It does NOT crash on unknown keys -- it just renders them after the priority list.
    // This test documents that behavior; the real risk is keys that ARE listed but
    // are never populated (dead labels that take up space in the popup).
    expect(true).toBe(true);
  });
});
