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

/** Raster overview tiles for forest-age at province zoom (z4-z8). */
const RASTER_OVERVIEW_URL =
  "https://pub-b5568be386ef4e638b4e49af41395600.r2.dev/raster/forest-age/{z}/{x}/{y}.png";

/** All story layer IDs created by setupStoryLayers. */
export const STORY_LAYER_IDS = [
  "story-hillshade",
  "story-forest-age-raster",
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
  "story-forest-age-raster",
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
