/**
 * Part B — Rendering Code Validation
 *
 * Check 1: Source-layer name matching
 * Check 2: Layer definition completeness
 * Check 3: Preset validation
 * Check 4: Filter expression validation
 */

import { describe, it, expect } from "vitest";
import { LAYER_REGISTRY } from "@/lib/layers/registry";
import { LAYER_PRESETS } from "@/lib/layers/presets";

// ── Known PMTiles source layers ──────────────────────────────────────────────

const KNOWN_SOURCE_LAYERS = new Set([
  "forest-age",
  "tenure-cutblocks",
  "fire-history",
  "parks",
  "conservancies",
  "ogma",
  "wildlife-habitat-areas",
  "ungulate-winter-range",
  "community-watersheds",
  "mining-claims",
  "forestry-roads",
  "conservation-priority",
]);

// ── Known NDJSON property schemas ────────────────────────────────────────────

const KNOWN_PROPERTIES: Record<string, Set<string>> = {
  "forest-age": new Set(["class", "age", "species"]),
  "tenure-cutblocks": new Set([
    "company_id",
    "DISTURBANCE_START_DATE",
    "PLANNED_GROSS_BLOCK_AREA",
  ]),
  "fire-history": new Set(["FIRE_YEAR", "FIRE_SIZE_HECTARES", "FIRE_CAUSE"]),
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
  ]),
};

// ── Helper: extract ["get", "propName"] references from a filter expression ──

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

// ── Check 1: Source-layer name matching ──────────────────────────────────────

describe("Check 1: Source-layer name matching", () => {
  const layersWithTileSource = LAYER_REGISTRY.filter((l) => l.tileSource);

  it("all layers with tileSource reference a known PMTiles source layer", () => {
    const unknownLayers: string[] = [];

    for (const layer of layersWithTileSource) {
      const sourceLayer = layer.tileSource!.sourceLayer;
      if (!KNOWN_SOURCE_LAYERS.has(sourceLayer)) {
        unknownLayers.push(`${layer.id} -> "${sourceLayer}"`);
      }
    }

    if (unknownLayers.length > 0) {
      throw new Error(
        `Unknown source layers found:\n${unknownLayers.join("\n")}\n` +
          `Known: ${[...KNOWN_SOURCE_LAYERS].join(", ")}`
      );
    }

    expect(unknownLayers).toHaveLength(0);
  });

  it("has at least one layer using each core source layer", () => {
    const usedSourceLayers = new Set(
      layersWithTileSource.map((l) => l.tileSource!.sourceLayer)
    );
    // forest-age, tenure-cutblocks, fire-history, parks are the core data layers
    const coreRequired = ["forest-age", "tenure-cutblocks", "fire-history", "parks"];
    for (const required of coreRequired) {
      expect(
        usedSourceLayers.has(required),
        `No layer uses source layer "${required}"`
      ).toBe(true);
    }
  });
});

// ── Check 2: Layer definition completeness ───────────────────────────────────

describe("Check 2: Layer definition completeness", () => {
  for (const layer of LAYER_REGISTRY) {
    describe(`layer: ${layer.id}`, () => {
      it("has a non-empty id", () => {
        expect(layer.id).toBeTruthy();
        expect(typeof layer.id).toBe("string");
        expect(layer.id.trim().length).toBeGreaterThan(0);
      });

      it("has a non-empty label", () => {
        expect(layer.label).toBeTruthy();
        expect(layer.label.trim().length).toBeGreaterThan(0);
      });

      it("has a non-empty description", () => {
        expect(layer.description).toBeTruthy();
        expect(layer.description.trim().length).toBeGreaterThan(0);
      });

      it("has at least one legend item", () => {
        expect(layer.legendItems).toBeDefined();
        expect(layer.legendItems.length).toBeGreaterThan(0);
      });

      it("has a valid zoomRange where [0] < [1]", () => {
        expect(Array.isArray(layer.zoomRange)).toBe(true);
        expect(layer.zoomRange).toHaveLength(2);
        expect(layer.zoomRange[0]).toBeLessThan(layer.zoomRange[1]);
      });

      it("has paint properties appropriate for its style type", () => {
        // satellite uses type "fill" as a placeholder for its raster source --
        // it intentionally has an empty paint object. Skip the paint check for it.
        if (layer.id === "satellite") return;

        const type = layer.style.type;
        const paint = layer.style.paint;
        expect(paint).toBeDefined();

        if (type === "fill") {
          expect(
            paint["fill-color"] !== undefined || paint["fill-pattern"] !== undefined,
            `fill layer "${layer.id}" missing fill-color or fill-pattern`
          ).toBe(true);
        } else if (type === "line") {
          expect(
            paint["line-color"] !== undefined,
            `line layer "${layer.id}" missing line-color`
          ).toBe(true);
        } else if (type === "circle") {
          expect(
            paint["circle-color"] !== undefined,
            `circle layer "${layer.id}" missing circle-color`
          ).toBe(true);
        }
      });
    });
  }
});

// ── Check 3: Preset validation ───────────────────────────────────────────────

describe("Check 3: Preset validation", () => {
  const registryIds = new Set(LAYER_REGISTRY.map((l) => l.id));

  it("every layer ID in every preset exists in the registry", () => {
    const missingIds: string[] = [];

    for (const preset of LAYER_PRESETS) {
      for (const layerId of preset.layers) {
        if (!registryIds.has(layerId)) {
          missingIds.push(`preset "${preset.id}" references unknown layer "${layerId}"`);
        }
      }
    }

    if (missingIds.length > 0) {
      throw new Error(`Missing layer IDs in presets:\n${missingIds.join("\n")}`);
    }

    expect(missingIds).toHaveLength(0);
  });

  it("no preset contains duplicate layer IDs", () => {
    for (const preset of LAYER_PRESETS) {
      const seen = new Set<string>();
      const dupes: string[] = [];
      for (const id of preset.layers) {
        if (seen.has(id)) dupes.push(id);
        seen.add(id);
      }
      expect(
        dupes,
        `Preset "${preset.id}" has duplicate layer IDs: ${dupes.join(", ")}`
      ).toHaveLength(0);
    }
  });

  it("every preset has a non-empty id, label, and description", () => {
    for (const preset of LAYER_PRESETS) {
      expect(preset.id.trim().length, `preset id empty`).toBeGreaterThan(0);
      expect(preset.label.trim().length, `preset "${preset.id}" label empty`).toBeGreaterThan(0);
      expect(
        preset.description.trim().length,
        `preset "${preset.id}" description empty`
      ).toBeGreaterThan(0);
    }
  });
});

// ── Check 4: Filter expression validation ────────────────────────────────────

describe("Check 4: Filter expression validation", () => {
  const layersWithFilters = LAYER_REGISTRY.filter(
    (l) => l.style.filter !== undefined
  );

  it("all filter expressions are arrays", () => {
    for (const layer of layersWithFilters) {
      expect(
        Array.isArray(layer.style.filter),
        `layer "${layer.id}" filter is not an array`
      ).toBe(true);
    }
  });

  it("filter expressions reference properties that exist in known schemas", () => {
    const unknownRefs: string[] = [];

    for (const layer of layersWithFilters) {
      // Only check layers that have a tileSource (and therefore a known schema)
      if (!layer.tileSource) continue;
      const sourceLayer = layer.tileSource.sourceLayer;
      const knownProps = KNOWN_PROPERTIES[sourceLayer];
      if (!knownProps) continue;

      const refs = extractGetReferences(layer.style.filter);
      for (const ref of refs) {
        if (!knownProps.has(ref)) {
          unknownRefs.push(
            `layer "${layer.id}" filter references unknown property "${ref}" (source layer: "${sourceLayer}")`
          );
        }
      }
    }

    if (unknownRefs.length > 0) {
      throw new Error(
        `Filter references to unknown properties:\n${unknownRefs.join("\n")}`
      );
    }

    expect(unknownRefs).toHaveLength(0);
  });

  it("documents filter intent for layers that use them", () => {
    // This is a documentation check -- verifies filters are deliberate
    for (const layer of layersWithFilters) {
      expect(
        layer.description.trim().length,
        `layer "${layer.id}" has a filter but no description explaining intent`
      ).toBeGreaterThan(0);
    }
  });
});
