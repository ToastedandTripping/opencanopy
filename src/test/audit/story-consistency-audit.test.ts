/**
 * Part B — Check 9: Story Page ↔ Registry Consistency
 *
 * The scrollytelling story page uses its own layer setup (setup-layers.ts)
 * with hardcoded source-layer names, URLs, and layer IDs. These must stay in
 * sync with the main layer registry or the story will silently render wrong data.
 *
 * Verifies:
 *   - Every source-layer name in setup-layers.ts exists in the known PMTiles layer list
 *   - Layer IDs referenced in chapters.ts exist in the registry
 *   - Source-layer names in setup-layers.ts match the registry's tileSource.sourceLayer
 *   - The raster overview URL in setup-layers.ts matches the registry's rasterOverview.urlTemplate
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { LAYER_REGISTRY } from "@/lib/layers/registry";
import {
  STORY_LAYER_IDS,
  STORY_SOURCE_IDS,
} from "@/lib/story/setup-layers";
import { CHAPTERS } from "@/data/chapters";

// ── Known PMTiles source layers (mirrors KNOWN_SOURCE_LAYERS in registry-audit) ─

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

// ── Read setup-layers.ts source to extract hardcoded values ───────────────────
//
// We read setup-layers.ts as text to extract "source-layer" string values.
// This avoids the need to mock the MapLibre map object.

const SETUP_LAYERS_PATH = resolve(
  __dirname,
  "../../lib/story/setup-layers.ts"
);

const setupLayersSource = readFileSync(SETUP_LAYERS_PATH, "utf-8");

/** Extract all "source-layer": "value" strings from the setup-layers source. */
function extractSourceLayerNames(source: string): string[] {
  const pattern = /"source-layer":\s*"([^"]+)"/g;
  const names: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    names.push(match[1]);
  }
  return names;
}

/** Extract the raster tiles URL from the setup-layers source. */
function extractRasterOverviewUrl(source: string): string | null {
  // Matches: "https://.../{z}/{x}/{y}.png"
  const pattern = /const RASTER_OVERVIEW_URL\s*=\s*\n?\s*"([^"]+)"/;
  const match = source.match(pattern);
  return match ? match[1] : null;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Check 9: Story page ↔ Registry consistency", () => {
  const sourceLayerNames = extractSourceLayerNames(setupLayersSource);
  const rasterOverviewUrl = extractRasterOverviewUrl(setupLayersSource);

  it("STORY_LAYER_IDS is exported and non-empty", () => {
    expect(STORY_LAYER_IDS).toBeDefined();
    expect(STORY_LAYER_IDS.length).toBeGreaterThan(0);
  });

  it("STORY_SOURCE_IDS is exported and non-empty", () => {
    expect(STORY_SOURCE_IDS).toBeDefined();
    expect(STORY_SOURCE_IDS.length).toBeGreaterThan(0);
  });

  describe("source-layer names in setup-layers.ts exist in PMTiles", () => {
    it("all hardcoded source-layer values reference known PMTiles source layers", () => {
      expect(
        sourceLayerNames.length,
        "Could not extract any source-layer names from setup-layers.ts. " +
          'Has the format changed from `"source-layer": "name"`?'
      ).toBeGreaterThan(0);

      const unknown: string[] = [];
      for (const name of sourceLayerNames) {
        if (!KNOWN_SOURCE_LAYERS.has(name)) {
          unknown.push(name);
        }
      }

      if (unknown.length > 0) {
        throw new Error(
          `setup-layers.ts references unknown source layers:\n${unknown.join("\n")}\n` +
            `Known: ${[...KNOWN_SOURCE_LAYERS].join(", ")}`
        );
      }

      expect(unknown).toHaveLength(0);
    });
  });

  describe("story source-layers match registry tileSource.sourceLayer", () => {
    // Known story layer ID -> expected registry layer ID mapping
    // (story uses different layer IDs than registry, but same underlying source)
    const STORY_TO_REGISTRY: Record<string, string> = {
      "story-forest-age-fill": "forest-age",
      "story-forest-age-outline": "forest-age",
      "story-cutblocks-fill": "cutblocks",
      "story-cutblocks-outline": "cutblocks",
      "story-fire-history-fill": "fire-history",
      "story-parks-fill": "parks",
      "story-parks-outline": "parks",
      "story-harvested-hatch": "forest-age",
    };

    for (const [storyLayerId, registryLayerId] of Object.entries(
      STORY_TO_REGISTRY
    )) {
      it(`story layer "${storyLayerId}" uses same source layer as registry "${registryLayerId}"`, () => {
        // Check that the registry layer ID exists
        const registryLayer = LAYER_REGISTRY.find(
          (l) => l.id === registryLayerId
        );
        expect(
          registryLayer,
          `Registry layer "${registryLayerId}" (referenced by story layer "${storyLayerId}") not found`
        ).toBeDefined();

        if (!registryLayer?.tileSource) {
          // This story layer may use a WFS-only registry layer -- acceptable
          // (the story may be using a different data source)
          return;
        }

        const registrySourceLayer = registryLayer.tileSource.sourceLayer;

        // Verify this source layer name appears in setup-layers.ts
        expect(
          sourceLayerNames,
          `Registry layer "${registryLayerId}" uses source layer "${registrySourceLayer}", ` +
            `but that name is not found in setup-layers.ts. ` +
            `The story and registry are out of sync.`
        ).toContain(registrySourceLayer);
      });
    }
  });

  describe("chapter layer IDs reference known registry layers", () => {
    // Collect all unique layer IDs used across all chapters
    const chapterLayerIds = new Set<string>();
    for (const chapter of CHAPTERS) {
      for (const layer of chapter.layers) {
        chapterLayerIds.add(layer.id);
      }
    }

    const registryIds = new Set(LAYER_REGISTRY.map((l) => l.id));

    it("all chapter layer IDs exist in the registry", () => {
      const missing: string[] = [];
      for (const id of chapterLayerIds) {
        if (!registryIds.has(id)) {
          missing.push(id);
        }
      }

      if (missing.length > 0) {
        throw new Error(
          `chapters.ts references layer IDs not in registry:\n${missing.join("\n")}\n` +
            `These chapters will render no data. Update chapters.ts or add the layers to the registry.`
        );
      }

      expect(missing).toHaveLength(0);
    });

    it("has at least 2 chapters with layers defined", () => {
      const chaptersWithLayers = CHAPTERS.filter((c) => c.layers.length > 0);
      expect(chaptersWithLayers.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("raster overview URL matches registry", () => {
    it("setup-layers.ts RASTER_OVERVIEW_URL is extractable", () => {
      expect(
        rasterOverviewUrl,
        "Could not extract RASTER_OVERVIEW_URL from setup-layers.ts. " +
          "Has the constant name or format changed?"
      ).not.toBeNull();
    });

    it("setup-layers.ts RASTER_OVERVIEW_URL matches forest-age registry rasterOverview", () => {
      if (!rasterOverviewUrl) return; // Covered by previous test

      const forestAge = LAYER_REGISTRY.find((l) => l.id === "forest-age");
      expect(forestAge, "forest-age layer not found in registry").toBeDefined();
      expect(
        forestAge?.rasterOverview,
        "forest-age registry entry has no rasterOverview"
      ).toBeDefined();

      expect(
        rasterOverviewUrl,
        `setup-layers.ts RASTER_OVERVIEW_URL "${rasterOverviewUrl}" ` +
          `does not match registry rasterOverview.urlTemplate ` +
          `"${forestAge?.rasterOverview?.urlTemplate}". ` +
          "The story will render different raster tiles than the main map."
      ).toBe(forestAge?.rasterOverview?.urlTemplate);
    });
  });

  it("STORY_SOURCE_IDS includes expected sources", () => {
    // Document what sources the story registers
    const sourceIds = [...STORY_SOURCE_IDS];
    expect(sourceIds).toContain("story-pmtiles");
    expect(sourceIds).toContain("story-forest-age-raster");
  });
});
