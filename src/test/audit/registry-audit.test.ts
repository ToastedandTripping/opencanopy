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
import { LAYER_CONFIG } from "../../../scripts/lib/extractors";
import { derivePropertySchemas } from "./schema-helpers";

// ── Known PMTiles source layers ──────────────────────────────────────────────
// Derived from the pipeline's LAYER_CONFIG (non-VRI layers) plus "forest-age".

const KNOWN_SOURCE_LAYERS = new Set([
  "forest-age",
  ...LAYER_CONFIG.map((c) => c.name),
]);

// ── Known NDJSON property schemas ────────────────────────────────────────────
// Derived programmatically from extractors so the test stays in sync with the
// pipeline automatically. See schema-helpers.ts for the derivation logic.

const KNOWN_PROPERTIES = derivePropertySchemas();

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

// ── Check 5: Province-scale crash guard ──────────────────────────────────────
//
// The "forest-age" PMTiles source layer holds ~6.2M polygons. Vector-rendering
// it at province zoom crashes low-end browsers, which is why the primary
// forest-age layer ships a rasterOverview (PNG tiles for z4-z9). Any OTHER fill
// layer sharing that source layer must avoid the same crash: either it provides
// its own rasterOverview, or it gates the PMTiles vector tiles to z>=9 via
// tileSource.minZoom. (logging-risk takes the minZoom path.)

describe("Check 5: Province-scale crash guard (forest-age source)", () => {
  const DENSE_SOURCE = "forest-age";
  const MIN_SAFE_ZOOM = 9;

  const forestAgeFillLayers = LAYER_REGISTRY.filter(
    (l) =>
      l.tileSource?.sourceLayer === DENSE_SOURCE && l.style.type === "fill"
  );

  it("has at least the two known forest-age fill layers", () => {
    const ids = forestAgeFillLayers.map((l) => l.id).sort();
    expect(ids).toContain("forest-age");
    expect(ids).toContain("logging-risk");
  });

  it("every forest-age fill layer has a rasterOverview OR tileSource.minZoom >= 9", () => {
    const offenders: string[] = [];
    for (const layer of forestAgeFillLayers) {
      const hasRaster = !!layer.rasterOverview;
      const gated = (layer.tileSource?.minZoom ?? 0) >= MIN_SAFE_ZOOM;
      if (!hasRaster && !gated) {
        offenders.push(layer.id);
      }
    }
    expect(
      offenders,
      `These forest-age fill layers render ~6.2M polygons at province zoom ` +
        `with no rasterOverview and no minZoom guard (Chrome crash risk): ` +
        `${offenders.join(", ")}. Add a rasterOverview or set tileSource.minZoom >= ${MIN_SAFE_ZOOM}.`
    ).toHaveLength(0);
  });
});
