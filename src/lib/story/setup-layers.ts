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
import { PMTILES_URL, PMTILES_SOURCE_ID, PMTILES_MAX_ZOOM } from "@/lib/layers/registry";
import { FOREST_AGE_RASTER_URL, BINARY_RASTER_URL } from "@/lib/r2-config";

/** Raster overview tiles for forest-age at province zoom (z4-z8).
 *  Re-exported from the shared r2-config so the story map and the interactive
 *  registry are guaranteed to request the same tiles (asserted in
 *  story-consistency-audit). */
export const RASTER_OVERVIEW_URL = FOREST_AGE_RASTER_URL;

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

/** All story layer IDs created by setupStoryLayers. */
export const STORY_LAYER_IDS = [
  "story-hillshade",
  "story-forest-base",
  "story-forest-age-raster",
  "story-year-overlay",
  "story-fire-overlay",
  "story-binary-reveal",
  "story-forest-age-fill",
  "story-forest-age-outline",
  "story-cutblocks-fill",
  "story-cutblocks-outline",
  "story-fire-history-fill",
  "story-fire-history-outline",
  "story-parks-fill",
  "story-parks-outline",
  "story-harvested-hatch",
] as const;

/** All source IDs registered by setupStoryLayers. */
export const STORY_SOURCE_IDS = [
  "terrain-rgb",
  "story-forest-base",
  "story-forest-age-raster",
  "story-year-overlay",
  "story-fire-overlay",
  "story-binary-reveal",
  PMTILES_SOURCE_ID,
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface MapLike {
  getSource(id: string): unknown;
  getLayer(id: string): unknown;
  getStyle(): { layers: Array<{ id: string; type: string }> };
  // Use `any` for config params to stay compatible with both MapLibre's strict
  // AddLayerObject type and our mock's looser Record<string, unknown>.
  addSource(id: string, config: any): void;       // eslint-disable-line @typescript-eslint/no-explicit-any
  addLayer(config: any, beforeId?: string): void;  // eslint-disable-line @typescript-eslint/no-explicit-any
  addImage(name: string, data: unknown, options?: Record<string, unknown>): void;
  hasImage(name: string): boolean;
}

interface TerrainConfig {
  enabled: boolean;
  url: string;
  tileSize: number;
}

interface SetupOptions {
  terrain: TerrainConfig;
  /** Pre-generated hatch pattern ImageData. Pass null to skip. */
  hatchPattern: unknown | null;
}

/**
 * Register all story sources and layers on the map.
 *
 * Idempotent: checks for existing sources/layers before adding.
 * All layers start at opacity 0 so the visibility lifecycle can control them.
 */
export function setupStoryLayers(
  map: MapLike,
  options: SetupOptions
): void {
  const { terrain, hatchPattern } = options;

  // Find the first symbol layer to insert data layers below it
  const firstSymbolId = map.getStyle().layers.find(
    (l) => l.type === "symbol"
  )?.id;

  pipelineLog("onLoad", "registering sources", { firstSymbolId, terrainEnabled: terrain.enabled });

  // ── Terrain DEM source ──────────────────────────────────────────
  if (terrain.enabled && !map.getSource("terrain-rgb")) {
    map.addSource("terrain-rgb", {
      type: "raster-dem",
      url: terrain.url,
      tileSize: terrain.tileSize,
    });
  }

  // Hillshade layer from DEM
  if (terrain.enabled && !map.getLayer("story-hillshade")) {
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

  // ── Raster overview source (forest-age, z4-z8) ──────────────────
  if (!map.getSource("story-forest-age-raster")) {
    map.addSource("story-forest-age-raster", {
      type: "raster",
      tiles: [RASTER_OVERVIEW_URL],
      tileSize: 256,
      minzoom: 4,
      maxzoom: 9,
    });
  }

  if (!map.getLayer("story-forest-age-raster")) {
    map.addLayer(
      {
        id: "story-forest-age-raster",
        type: "raster",
        source: "story-forest-age-raster",
        maxzoom: 9,
        paint: {
          "raster-opacity": 0,
          "raster-opacity-transition": { duration: 400 },
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
  // Mirrors story-forest-age-raster exactly (same zoom range, tile size).
  // Opacity is controlled by applyLayerVisibility via the revealBinary flag —
  // NOT via OVERLAY_SOURCES, because tiled raster sources have no updateImage().
  // Built by: python3 scripts/build-raster-tiles.py --theme binary
  if (!map.getSource("story-binary-reveal")) {
    map.addSource("story-binary-reveal", {
      type: "raster",
      tiles: [BINARY_RASTER_URL],
      tileSize: 256,
      minzoom: 4,
      maxzoom: 9,
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

  // ── PMTiles vector source (detail layers) ───────────────────────
  if (!map.getSource(PMTILES_SOURCE_ID)) {
    map.addSource(PMTILES_SOURCE_ID, {
      type: "vector",
      url: PMTILES_URL,
      maxzoom: PMTILES_MAX_ZOOM,
    });
  }

  // ── Forest-age vector fill layer (detail zoom z9+) ──────────────
  if (!map.getLayer("story-forest-age-fill")) {
    map.addLayer(
      {
        id: "story-forest-age-fill",
        type: "fill",
        source: PMTILES_SOURCE_ID,
        "source-layer": "forest-age",
        minzoom: 9,
        paint: {
          "fill-color": [
            "match",
            ["get", "class"],
            "old-growth", "#0d5c2a",
            "mature", "#4ade80",
            "young", "#f97316",
            "harvested", "#ef4444",
            "#6b7280",
          ],
          "fill-opacity": 0,
          "fill-opacity-transition": { duration: 400 },
          "fill-antialias": false,
        },
      },
      firstSymbolId,
    );
  }

  // Forest-age outline
  if (!map.getLayer("story-forest-age-outline")) {
    map.addLayer(
      {
        id: "story-forest-age-outline",
        type: "line",
        source: PMTILES_SOURCE_ID,
        "source-layer": "forest-age",
        minzoom: 9,
        paint: {
          "line-color": "rgba(255,255,255,0.15)",
          "line-width": 0.5,
          "line-opacity": 0,
          "line-opacity-transition": { duration: 400 },
        },
      },
      firstSymbolId,
    );
  }

  // ── Cutblocks fill layer ────────────────────────────────────────
  if (!map.getLayer("story-cutblocks-fill")) {
    map.addLayer(
      {
        id: "story-cutblocks-fill",
        type: "fill",
        source: PMTILES_SOURCE_ID,
        "source-layer": "tenure-cutblocks",
        minzoom: 9,
        paint: {
          "fill-color": "#dc2626",
          "fill-opacity": 0,
          "fill-opacity-transition": { duration: 400 },
          "fill-antialias": false,
        },
      },
      firstSymbolId,
    );
  }

  // Cutblocks outline
  if (!map.getLayer("story-cutblocks-outline")) {
    map.addLayer(
      {
        id: "story-cutblocks-outline",
        type: "line",
        source: PMTILES_SOURCE_ID,
        "source-layer": "tenure-cutblocks",
        minzoom: 9,
        paint: {
          "line-color": "#dc2626",
          "line-width": 0.5,
          "line-opacity": 0,
          "line-opacity-transition": { duration: 400 },
        },
      },
      firstSymbolId,
    );
  }

  // ── Fire-history fill layer ─────────────────────────────────────
  if (!map.getLayer("story-fire-history-fill")) {
    map.addLayer(
      {
        id: "story-fire-history-fill",
        type: "fill",
        source: PMTILES_SOURCE_ID,
        "source-layer": "fire-history",
        minzoom: 9,
        paint: {
          "fill-color": "#f59e0b",
          "fill-opacity": 0,
          "fill-opacity-transition": { duration: 400 },
          "fill-antialias": false,
        },
      },
      firstSymbolId,
    );
  }

  // Fire-history outline
  if (!map.getLayer("story-fire-history-outline")) {
    map.addLayer(
      {
        id: "story-fire-history-outline",
        type: "line",
        source: PMTILES_SOURCE_ID,
        "source-layer": "fire-history",
        minzoom: 9,
        paint: {
          "line-color": "#f59e0b",
          "line-width": 1,
          "line-opacity": 0,
          "line-opacity-transition": { duration: 400 },
        },
      },
      firstSymbolId,
    );
  }

  // ── Parks fill layer ────────────────────────────────────────────
  if (!map.getLayer("story-parks-fill")) {
    map.addLayer(
      {
        id: "story-parks-fill",
        type: "fill",
        source: PMTILES_SOURCE_ID,
        "source-layer": "parks",
        minzoom: 9,
        paint: {
          "fill-color": "rgba(255,255,255,0.1)",
          "fill-opacity": 0,
          "fill-opacity-transition": { duration: 400 },
        },
      },
      firstSymbolId,
    );
  }

  // Parks outline
  if (!map.getLayer("story-parks-outline")) {
    map.addLayer(
      {
        id: "story-parks-outline",
        type: "line",
        source: PMTILES_SOURCE_ID,
        "source-layer": "parks",
        minzoom: 9,
        paint: {
          "line-color": "#ffffff",
          "line-width": 1,
          "line-opacity": 0,
          "line-opacity-transition": { duration: 400 },
        },
      },
      firstSymbolId,
    );
  }

  // ── Hatch pattern ───────────────────────────────────────────────
  if (hatchPattern && !map.hasImage("hatch-pattern")) {
    map.addImage("hatch-pattern", hatchPattern, { sdf: false });
  }

  // Harvested-hatch fill pattern layer
  if (!map.getLayer("story-harvested-hatch")) {
    map.addLayer(
      {
        id: "story-harvested-hatch",
        type: "fill",
        source: PMTILES_SOURCE_ID,
        "source-layer": "forest-age",
        minzoom: 9,
        filter: ["==", ["get", "class"], "harvested"],
        paint: {
          "fill-pattern": "hatch-pattern",
          "fill-opacity": 0,
          "fill-opacity-transition": { duration: 400 },
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
