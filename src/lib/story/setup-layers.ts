/**
 * Story map layer registration.
 *
 * Extracted from StoryMap.onLoad for testability.
 * Registers all sources and layers needed by the scrollytelling story.
 *
 * All layers start at opacity 0 and are activated by the visibility
 * lifecycle effects in StoryMap.
 */

import { pipelineLog } from "@/lib/debug/pipeline-logger";
import { BINARY_TILE_URL } from "@/lib/story/tile-manifest";
import { TERRAIN_SOURCE } from "@/lib/mapConfig";
import { getFirstSymbolId } from "@/lib/map/layer-utils";

/** Overlay image bounds: [west, south, east, north] matching build-year-overlays.py BC_BOUNDS */
export const OVERLAY_BOUNDS: [number, number, number, number] = [-139.5, 48.0, -114.0, 60.5];

/** URL pattern for pre-rendered cutblock year overlays (same-origin, deployed via public/). */
export const YEAR_OVERLAY_URL_PATTERN = "/raster/cutblocks-by-year/{year}.png";

/** URL pattern for pre-rendered wildfire year overlays (same-origin, deployed via public/). */
export const FIRE_OVERLAY_URL_PATTERN = "/raster/fire-by-year/{year}.png";

/** Static green forest base overlay (sampled from forest-age data). */
export const FOREST_BASE_URL = "/raster/cutblocks-by-year/forest-base.png";

export const YEAR_OVERLAY_RANGE = { start: 1950, end: 2025 } as const;

/** Full recorded wildfire span (build-year-overlays.py --dataset fire). */
export const FIRE_OVERLAY_RANGE = { start: 1917, end: 2025 } as const;

/**
 * Single source of truth mapping a ChapterOverlay `source` to its image
 * source/layer, URL pattern, and valid year range. Written once here so
 * useScrollytelling (resolution) and StoryMap (paint) never drift.
 *
 * NOTE: The binary end-reveal layer (story-binary-reveal) is a tiled raster
 * source, NOT an image source. It cannot use updateImage() — that API only
 * exists on image sources. Binary opacity is therefore controlled via
 * visibility.ts (applyLayerVisibility, revealBinary flag), NOT through this
 * OVERLAY_SOURCES table. This is intentional, not an oversight.
 */
export const OVERLAY_SOURCES = {
  cutblocks: {
    layerId: "story-year-overlay",
    sourceId: "story-year-overlay",
    urlPattern: YEAR_OVERLAY_URL_PATTERN,
    range: YEAR_OVERLAY_RANGE,
  },
  fire: {
    layerId: "story-fire-overlay",
    sourceId: "story-fire-overlay",
    urlPattern: FIRE_OVERLAY_URL_PATTERN,
    range: FIRE_OVERLAY_RANGE,
  },
} as const;

/**
 * All story layer IDs created by setupStoryLayers.
 *
 * Phase 1 (2026-07): removed story-forest-age-raster (pinned to opacity 0
 * forever -- only /map's interactive registry uses forest-age),
 * story-harvested-hatch, and the 8 PMTiles vector detail layers (minzoom 9 --
 * the story never zooms past z8, so they never rendered). The story's PMTiles
 * source registration went with them (no remaining consumer in this file).
 *
 * Correction (2026-07): story-hillshade was ALSO deleted in that same pass,
 * but that was a mis-classification. Unlike the items above, it's gated on
 * TERRAIN_SOURCE.enabled (see mapConfig.ts) -- and production HAS a MapTiler
 * key configured, so it DOES render live (a static relief-shading layer under
 * the forest overlay). Restored here, still gated on key presence, so
 * STORY_LAYER_IDS/STORY_SOURCE_IDS only list it when a key is configured.
 * The terrain ANIMATION plumbing that used to sit on top of this (per-chapter
 * TerrainConfig, the `terrain` prop threaded through
 * ScrollytellingContainer -> StoryMap, NO_TERRAIN) stays deleted -- no
 * chapter ever animated terrain. Only the static source+layer come back.
 */
export const STORY_LAYER_IDS: readonly string[] = TERRAIN_SOURCE.enabled
  ? [
      "story-hillshade",
      "story-forest-base",
      "story-year-overlay",
      "story-fire-overlay",
      "story-binary-reveal",
    ]
  : ["story-forest-base", "story-year-overlay", "story-fire-overlay", "story-binary-reveal"];

/** All source IDs registered by setupStoryLayers. */
export const STORY_SOURCE_IDS: readonly string[] = TERRAIN_SOURCE.enabled
  ? [
      "terrain-rgb",
      "story-forest-base",
      "story-year-overlay",
      "story-fire-overlay",
      "story-binary-reveal",
    ]
  : ["story-forest-base", "story-year-overlay", "story-fire-overlay", "story-binary-reveal"];

export interface MapLike {
  getSource(id: string): unknown;
  getLayer(id: string): unknown;
  getStyle(): { layers: Array<{ id: string; type: string }> };
  // Use `any` for config params to stay compatible with both MapLibre's strict
  // AddLayerObject type and our mock's looser Record<string, unknown>.
  addSource(id: string, config: any): void;       // eslint-disable-line @typescript-eslint/no-explicit-any
  addLayer(config: any, beforeId?: string): void;  // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * Register all story sources and layers on the map.
 *
 * Idempotent: checks for existing sources/layers before adding.
 * All layers start at opacity 0 so the visibility lifecycle can control them.
 */
export function setupStoryLayers(map: MapLike): void {
  const firstSymbolId = getFirstSymbolId(map.getStyle().layers);

  pipelineLog("onLoad", "registering sources", {
    firstSymbolId,
    terrainEnabled: TERRAIN_SOURCE.enabled,
  });

  // ── Terrain DEM + static hillshade relief (gated on MapTiler key) ──
  // Restored 2026-07: Phase 1 cleanup mis-classified this as dead. Unlike the
  // vector/hatch/forest-age-raster layers removed in the same pass, this one
  // is gated on TERRAIN_SOURCE.enabled (mapConfig.ts) and production HAS a
  // MapTiler key configured, so it renders live -- a static relief-shading
  // layer under the forest overlay. Only the static source+layer are
  // restored; the per-chapter terrain ANIMATION plumbing that used to sit on
  // top of this (TerrainConfig, the `terrain` prop threaded through
  // ScrollytellingContainer -> StoryMap, NO_TERRAIN) stays deleted -- no
  // chapter ever animated terrain.
  if (TERRAIN_SOURCE.enabled && !map.getSource("terrain-rgb")) {
    map.addSource("terrain-rgb", {
      type: "raster-dem",
      url: TERRAIN_SOURCE.url,
      tileSize: TERRAIN_SOURCE.tileSize,
    });
  }

  if (TERRAIN_SOURCE.enabled && !map.getLayer("story-hillshade")) {
    map.addLayer(
      {
        id: "story-hillshade",
        type: "hillshade",
        source: "terrain-rgb",
        paint: {
          "hillshade-illumination-direction": 315,
          "hillshade-shadow-color": "#000000",
          "hillshade-highlight-color": "#1a1a2e",
          "hillshade-exaggeration": 0.3,
          "hillshade-illumination-anchor": "viewport",
        },
      },
      firstSymbolId,
    );
  }

  // ── Forest base image overlay (green silhouette of BC forests) ──
  if (!map.getSource("story-forest-base")) {
    const [west, south, east, north] = OVERLAY_BOUNDS;
    map.addSource("story-forest-base", {
      type: "image",
      url: FOREST_BASE_URL,
      coordinates: [
        [west, north],
        [east, north],
        [east, south],
        [west, south],
      ],
    });
  }

  if (!map.getLayer("story-forest-base")) {
    map.addLayer(
      {
        id: "story-forest-base",
        type: "raster",
        source: "story-forest-base",
        paint: {
          "raster-opacity": 0,
          "raster-opacity-transition": { duration: 600 },
          "raster-fade-duration": 0,
        },
      },
      firstSymbolId,
    );
  }

  // ── Year overlay image source (cutblocks by year, province zoom) ─
  if (!map.getSource("story-year-overlay")) {
    const [west, south, east, north] = OVERLAY_BOUNDS;
    map.addSource("story-year-overlay", {
      type: "image",
      url: YEAR_OVERLAY_URL_PATTERN.replace("{year}", String(YEAR_OVERLAY_RANGE.start)),
      coordinates: [
        [west, north],  // top-left
        [east, north],  // top-right
        [east, south],  // bottom-right
        [west, south],  // bottom-left
      ],
    });
  }

  if (!map.getLayer("story-year-overlay")) {
    map.addLayer(
      {
        id: "story-year-overlay",
        type: "raster",
        source: "story-year-overlay",
        paint: {
          "raster-opacity": 0,
          // Short transition: the scroll-coupled fade updates per frame, so a
          // long transition would lag the scroll. ~100ms just antialiases.
          "raster-opacity-transition": { duration: 100 },
          "raster-fade-duration": 0,
        },
      },
      firstSymbolId,
    );
  }

  // ── Fire overlay image source (wildfire by year, province zoom) ──
  // Added AFTER the cutblock overlay so amber paints OVER the red scars.
  if (!map.getSource("story-fire-overlay")) {
    const [west, south, east, north] = OVERLAY_BOUNDS;
    map.addSource("story-fire-overlay", {
      type: "image",
      url: FIRE_OVERLAY_URL_PATTERN.replace("{year}", String(FIRE_OVERLAY_RANGE.start)),
      coordinates: [
        [west, north],
        [east, north],
        [east, south],
        [west, south],
      ],
    });
  }

  if (!map.getLayer("story-fire-overlay")) {
    map.addLayer(
      {
        id: "story-fire-overlay",
        type: "raster",
        source: "story-fire-overlay",
        paint: {
          "raster-opacity": 0,
          "raster-opacity-transition": { duration: 100 },
          "raster-fade-duration": 0,
        },
      },
      firstSymbolId,
    );
  }

  // ── Binary end-reveal raster source (z4-z9) ─────────────────────
  // Old-growth = #0d5c2a (dark green); mature/young/harvested = #ef4444 (red).
  // Opacity is controlled by applyLayerVisibility via the revealBinary flag —
  // NOT via OVERLAY_SOURCES, because tiled raster sources have no updateImage().
  // Built by: python3 scripts/build-raster-tiles.py --theme binary
  //
  // `bounds` clips requests to BC's overlay bbox (stops off-province tile
  // requests outright). `tiles` uses the `ocbin://` custom protocol (see
  // tile-manifest.ts) instead of the raw R2 URL: a fail-open wrapper that can
  // additionally suppress requests for tiles it can PROVE are missing
  // (ocean/off-coast gaps within the bbox that `bounds` can't catch), using a
  // small generated manifest. With no manifest present (the common case until
  // one is generated/deployed), every request passes straight through to the
  // real R2 URL -- identical to today's direct-https source.
  if (!map.getSource("story-binary-reveal")) {
    map.addSource("story-binary-reveal", {
      type: "raster",
      tiles: [BINARY_TILE_URL],
      tileSize: 256,
      minzoom: 4,
      maxzoom: 9,
      bounds: OVERLAY_BOUNDS,
    });
  }

  if (!map.getLayer("story-binary-reveal")) {
    map.addLayer(
      {
        id: "story-binary-reveal",
        type: "raster",
        source: "story-binary-reveal",
        maxzoom: 9,
        paint: {
          "raster-opacity": 0,
          // Short transition: the scroll-coupled JS fade (computeBinaryRevealOpacity,
          // ending revealBinaryFadeIn) updates raster-opacity per frame, so a long
          // transition would lag the scroll. 100ms antialiases tile-load flicker only.
          // (Matches story-year-overlay / story-fire-overlay.)
          "raster-opacity-transition": { duration: 100 },
        },
      },
      firstSymbolId,
    );
  }

  pipelineLog("onLoad", "all sources and layers registered", {
    layerIds: STORY_LAYER_IDS,
    sourceIds: STORY_SOURCE_IDS,
  });
}
