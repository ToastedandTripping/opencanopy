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
 * Correction (2026-07): story-hillshade/terrain-rgb were ALSO deleted in that
 * same pass, but that was a mis-classification -- unlike the PMTiles/hatch/
 * forest-age-raster items above, hillshade is gated on TERRAIN_SOURCE.enabled
 * (mapConfig.ts) and production HAS a MapTiler key configured, so it DOES
 * render live (a static relief-shading layer under the forest overlay). It's
 * been restored in setup-layers.ts, still gated on key presence. The PMTiles/
 * hatch/forest-age-raster entries are genuinely dead and stay deleted.
 *
 * What's left, updated to prove the new reality rather than just deleting
 * the old assertions:
 *   - setup-layers.ts registers NO PMTiles vector source-layer references
 *     at all (a regression guard against re-introducing the dead layers)
 *   - Chapter layer IDs (still just "forest-age") exist in the registry
 *   - STORY_LAYER_IDS / STORY_SOURCE_IDS are exported, non-empty, still do NOT
 *     include the permanently-deleted PMTiles/forest-age-raster entries, and
 *     DO include story-hillshade/terrain-rgb when a MapTiler key is configured
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { LAYER_REGISTRY } from "@/lib/layers/registry";
import { STORY_LAYER_IDS, STORY_SOURCE_IDS, YEAR_OVERLAY_RANGE, FIRE_OVERLAY_RANGE } from "@/lib/story/setup-layers";
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

    it("STORY_LAYER_IDS / STORY_SOURCE_IDS do not include the permanently-deleted PMTiles/hatch/forest-age-raster entries", () => {
      const layerIds: string[] = [...STORY_LAYER_IDS];
      const sourceIds: string[] = [...STORY_SOURCE_IDS];

      // story-hillshade/terrain-rgb are deliberately NOT in this list -- they
      // were mis-classified as dead and have been restored (gated on
      // TERRAIN_SOURCE.enabled). See the "terrain hillshade" describe block
      // below for the key-gated restoration checks.
      const deletedLayerIds = [
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

      const deletedSourceIds = ["story-forest-age-raster", "opencanopy"];
      for (const id of deletedSourceIds) {
        expect(sourceIds).not.toContain(id);
      }
    });

    it("STORY_LAYER_IDS === STORY_SOURCE_IDS for the same-ID overlay layers (each owns exactly one 1:1 source)", () => {
      // Phase 1 removed everything that broke the 1:1 same-ID layer<->source
      // mapping (PMTiles was one source shared by many vector layers;
      // forest-age-raster had no matching entry on the other list). What's
      // left -- forest-base, year-overlay, fire-overlay, binary-reveal -- is
      // 1:1 by the same ID.
      //
      // story-hillshade/terrain-rgb (restored 2026-07, gated on MapTiler key)
      // are the one deliberate exception: the DEM source is conventionally
      // named "terrain-rgb", not "story-hillshade", so they're excluded from
      // this same-ID check (and covered separately below).
      const sameIdLayerIds = [...STORY_LAYER_IDS].filter((id) => id !== "story-hillshade");
      const sameIdSourceIds = [...STORY_SOURCE_IDS].filter((id) => id !== "terrain-rgb");
      expect(sameIdLayerIds.sort()).toEqual(sameIdSourceIds.sort());
    });
  });

  describe("terrain hillshade (Phase 1 correction: restored, gated on MapTiler key presence)", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.resetModules();
    });

    it("STORY_LAYER_IDS includes story-hillshade and STORY_SOURCE_IDS includes terrain-rgb when a MapTiler key is configured", async () => {
      vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "test-key");
      vi.resetModules();
      const { STORY_LAYER_IDS: freshLayerIds, STORY_SOURCE_IDS: freshSourceIds } = await import(
        "@/lib/story/setup-layers"
      );
      expect(freshLayerIds).toContain("story-hillshade");
      expect(freshSourceIds).toContain("terrain-rgb");
    });

    it("STORY_LAYER_IDS / STORY_SOURCE_IDS omit story-hillshade/terrain-rgb when no MapTiler key is configured", async () => {
      vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "");
      vi.resetModules();
      const { STORY_LAYER_IDS: freshLayerIds, STORY_SOURCE_IDS: freshSourceIds } = await import(
        "@/lib/story/setup-layers"
      );
      expect(freshLayerIds).not.toContain("story-hillshade");
      expect(freshSourceIds).not.toContain("terrain-rgb");
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

  describe("story overlay ranges match registry timeline ranges", () => {
    const cutblocks = LAYER_REGISTRY.find((l) => l.id === "cutblocks");
    const fireHistory = LAYER_REGISTRY.find((l) => l.id === "fire-history");

    it("YEAR_OVERLAY_RANGE matches cutblocks.timelineRange", () => {
      expect(cutblocks?.timelineRange).toBeDefined();
      expect(YEAR_OVERLAY_RANGE.start).toBe(cutblocks!.timelineRange![0]);
      expect(YEAR_OVERLAY_RANGE.end).toBe(cutblocks!.timelineRange![1]);
    });

    it("FIRE_OVERLAY_RANGE matches fire-history.timelineRange", () => {
      expect(fireHistory?.timelineRange).toBeDefined();
      expect(FIRE_OVERLAY_RANGE.start).toBe(fireHistory!.timelineRange![0]);
      expect(FIRE_OVERLAY_RANGE.end).toBe(fireHistory!.timelineRange![1]);
    });
  });
});

// ── Chapter roster pin ────────────────────────────────────────────────────────
// Moved here from NarrativePanel.test.tsx (2026-09-01), where it sat under an
// a11y title it did not guard. This is a data pin: the story has exactly five
// chapters since the ending dolly (`remains`) was docked on 2026-08-21
// (tag dock/dolly-live-scrub, ruling in .claude/DECISIONS.md). Change it on
// purpose, with the ruling, not by accident.

describe("chapter roster (pinned)", () => {
  it("exactly five chapters, each with a non-empty heading", () => {
    expect(CHAPTERS.map((c) => c.id)).toHaveLength(5);
    for (const chapter of CHAPTERS) {
      expect(chapter.heading.trim().length, `chapter "${chapter.id}" has no heading`).toBeGreaterThan(0);
    }
  });
});
