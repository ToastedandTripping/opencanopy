/**
 * Part B — Check 9: Story Page ↔ Registry Consistency
 *
 * Phase 1 (2026-07): the story's PMTiles vector detail layers (forest-age,
 * cutblocks, fire-history, parks fills+outlines + the harvested hatch) were
 * deleted from setup-layers.ts -- they were minzoom:9 layers the story never
 * zoomed past z8 to reach, so they never rendered. The forest-age raster
 * overview (story-forest-age-raster, pinned to opacity 0 forever) went too.
 * This retired most of what this file used to check (source-layer name
 * sync, raster URL sync) -- those checks are now moot because there is
 * nothing left in setup-layers.ts to drift out of sync.
 *
 * What's left, updated to prove the new reality rather than just deleting
 * the old assertions:
 *   - setup-layers.ts registers NO PMTiles vector source-layer references
 *     at all (a regression guard against re-introducing the dead layers)
 *   - Chapter layer IDs (still just "forest-age") exist in the registry
 *   - STORY_LAYER_IDS / STORY_SOURCE_IDS are exported, non-empty, and do NOT
 *     include the deleted PMTiles/terrain/forest-age-raster entries
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { LAYER_REGISTRY } from "@/lib/layers/registry";
import { STORY_LAYER_IDS, STORY_SOURCE_IDS } from "@/lib/story/setup-layers";
import { CHAPTERS } from "@/data/chapters";

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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Check 9: Story page ↔ Registry consistency", () => {
  it("STORY_LAYER_IDS is exported and non-empty", () => {
    expect(STORY_LAYER_IDS).toBeDefined();
    expect(STORY_LAYER_IDS.length).toBeGreaterThan(0);
  });

  it("STORY_SOURCE_IDS is exported and non-empty", () => {
    expect(STORY_SOURCE_IDS).toBeDefined();
    expect(STORY_SOURCE_IDS.length).toBeGreaterThan(0);
  });

  describe("Phase 1: the story's PMTiles vector detail layers stay deleted", () => {
    it("setup-layers.ts registers no source-layer references (all vector detail layers removed)", () => {
      const sourceLayerNames = extractSourceLayerNames(setupLayersSource);
      expect(
        sourceLayerNames,
        "setup-layers.ts should register zero PMTiles vector layers -- if this " +
          "fails, a source-layer reference was re-added. The story renders " +
          "top-down at z4-z9 and never reaches the minzoom:9 vector detail " +
          "layers that used to live here; re-adding them reintroduces dead code."
      ).toHaveLength(0);
    });

    it("STORY_LAYER_IDS / STORY_SOURCE_IDS do not include the deleted PMTiles, terrain, or forest-age-raster entries", () => {
      const layerIds: string[] = [...STORY_LAYER_IDS];
      const sourceIds: string[] = [...STORY_SOURCE_IDS];

      const deletedLayerIds = [
        "story-hillshade",
        "story-forest-age-raster",
        "story-harvested-hatch",
        "story-forest-age-fill",
        "story-forest-age-outline",
        "story-cutblocks-fill",
        "story-cutblocks-outline",
        "story-fire-history-fill",
        "story-fire-history-outline",
        "story-parks-fill",
        "story-parks-outline",
      ];
      for (const id of deletedLayerIds) {
        expect(layerIds).not.toContain(id);
      }

      const deletedSourceIds = ["terrain-rgb", "story-forest-age-raster", "opencanopy"];
      for (const id of deletedSourceIds) {
        expect(sourceIds).not.toContain(id);
      }
    });

    it("STORY_LAYER_IDS === STORY_SOURCE_IDS (each remaining story layer owns exactly one 1:1 source)", () => {
      // Phase 1 removed everything that broke the 1:1 layer<->source mapping
      // (PMTiles was one source shared by many vector layers; forest-age-raster
      // and hillshade had no matching entry on the other list). What's left --
      // forest-base, year-overlay, fire-overlay, binary-reveal -- is 1:1.
      expect([...STORY_LAYER_IDS].sort()).toEqual([...STORY_SOURCE_IDS].sort());
    });
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
});
