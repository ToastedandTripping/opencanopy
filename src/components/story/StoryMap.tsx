"use client";

import { useEffect, useRef, useCallback } from "react";
import Map, { type MapRef, AttributionControl } from "react-map-gl/maplibre";
import type { FilterSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_STYLES, TERRAIN_SOURCE } from "@/lib/mapConfig";
import { initPMTiles } from "@/lib/layers/pmtiles-source";
import type { ChapterCamera, ChapterTerrain, ChapterFog, ChapterLayer } from "@/data/chapters";
import { createHatchPattern } from "./HatchPattern";

initPMTiles();

/** Raster overview tiles for forest-age at province zoom (z4-z10).
 *  Using raster avoids 400K+ vector features per tile at z5 which crashes Chrome. */
const RASTER_OVERVIEW_URL =
  "https://pub-b5568be386ef4e638b4e49af41395600.r2.dev/raster/forest-age/{z}/{x}/{y}.png";

/** PMTiles vector source for detail zoom (z11+). */
const PMTILES_URL =
  "pmtiles://https://pub-b5568be386ef4e638b4e49af41395600.r2.dev/opencanopy-v5.pmtiles";

interface StoryMapProps {
  camera: ChapterCamera;
  terrain: ChapterTerrain;
  fog?: ChapterFog;
  layers: ChapterLayer[];
  yearFilter: number | null;
  hatchEnabled: boolean;
  supports3D: boolean;
}

/** Check if user prefers reduced motion. */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Lightweight map component for the scrollytelling story.
 * Non-interactive (scroll-driven only). Uses raster overview tiles
 * for province-level views and vector PMTiles for valley-level detail.
 *
 * CRITICAL: All layers are added imperatively via map.addSource() /
 * map.addLayer(). Never use react-map-gl declarative <Source>/<Layer>.
 */
export function StoryMap({
  camera,
  terrain,
  fog,
  layers,
  yearFilter,
  hatchEnabled,
  supports3D,
}: StoryMapProps) {
  const mapRef = useRef<MapRef>(null);
  const hatchAddedRef = useRef(false);
  const terrainExaggerationRef = useRef(0);
  const terrainAnimRef = useRef<number | null>(null);
  const mapReadyRef = useRef(false);

  // Apply camera on every update
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !map.isStyleLoaded()) return;

    map.easeTo({
      center: camera.center,
      zoom: camera.zoom,
      pitch: supports3D ? camera.pitch : 0,
      bearing: camera.bearing,
      duration: 0,
    });
  }, [camera, supports3D]);

  // Apply terrain
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !map.isStyleLoaded()) return;
    if (!TERRAIN_SOURCE.enabled) return;

    const targetExaggeration =
      terrain.enabled && supports3D ? terrain.exaggeration : 0;

    // Cancel any in-progress animation
    if (terrainAnimRef.current) {
      cancelAnimationFrame(terrainAnimRef.current);
    }

    // Skip animation if reduced motion -- set exaggeration instantly
    if (prefersReducedMotion()) {
      terrainExaggerationRef.current = targetExaggeration;
      if (targetExaggeration > 0) {
        map.setTerrain({ source: "terrain-rgb", exaggeration: targetExaggeration });
      } else {
        map.setTerrain(null as unknown as { source: string; exaggeration: number });
      }
      return;
    }

    // Animate exaggeration to prevent pop
    const startExaggeration = terrainExaggerationRef.current;
    const startTime = performance.now();
    const duration = 500;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = t * (2 - t); // ease-out quad
      const current = startExaggeration + (targetExaggeration - startExaggeration) * eased;

      terrainExaggerationRef.current = current;

      if (current > 0) {
        map.setTerrain({ source: "terrain-rgb", exaggeration: current });
      } else {
        map.setTerrain(null as unknown as { source: string; exaggeration: number });
      }

      if (t < 1) {
        terrainAnimRef.current = requestAnimationFrame(animate);
      }
    };

    terrainAnimRef.current = requestAnimationFrame(animate);

    return () => {
      if (terrainAnimRef.current) {
        cancelAnimationFrame(terrainAnimRef.current);
      }
    };
  }, [terrain, supports3D]);

  // Apply fog via MapLibre's sky API
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !map.isStyleLoaded()) return;

    if (fog?.enabled && supports3D) {
      map.setSky({
        "sky-color": fog.color,
        "fog-color": fog.color,
        "fog-ground-blend": fog.horizonBlend,
        "horizon-fog-blend": fog.range[0],
        "sky-horizon-blend": fog.range[1] / 16,
        "atmosphere-blend": 0.5,
      });
    } else {
      // Use explicit dark values to avoid MapLibre's default light-blue sky
      map.setSky({
        "sky-color": "#0a0a0c",
        "fog-color": "#0a0a0c",
        "fog-ground-blend": 0,
        "horizon-fog-blend": 0,
        "sky-horizon-blend": 0,
        "atmosphere-blend": 0,
      });
    }
  }, [fog, supports3D]);

  // Apply layer visibility and opacity
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !map.isStyleLoaded()) return;

    // All story layers managed in this component
    const layerIds = ["forest-age", "cutblocks", "fire-history", "parks"];

    // Build a set of active layer IDs for quick lookup
    const activeLayers = Object.fromEntries(layers.map((l) => [l.id, l])) as Record<string, (typeof layers)[number]>;

    // Raster overview: visible when forest-age is active and zoom <= 10
    const forestAgeActive = activeLayers["forest-age"];
    const rasterLayerId = "story-forest-age-raster";
    if (map.getLayer(rasterLayerId)) {
      map.setPaintProperty(
        rasterLayerId,
        "raster-opacity",
        forestAgeActive ? Math.min(forestAgeActive.opacity, 0.85) : 0
      );
    }

    // For each possible layer, set opacity via imperative paint properties
    for (const layerId of layerIds) {
      const storyLayer = activeLayers[layerId];
      const opacity = storyLayer?.opacity ?? 0;

      const fillId = `story-${layerId}-fill`;
      const outlineId = `story-${layerId}-outline`;

      // Build class filter expression if specified (e.g. show only old-growth + mature)
      let classFilterExpr: FilterSpecification | null = null;
      if (storyLayer?.classFilter && storyLayer.classFilter.length > 0) {
        classFilterExpr = [
          "any",
          ...storyLayer.classFilter.map(
            (cls) => ["==", ["get", "class"], cls] as FilterSpecification
          ),
        ] as FilterSpecification;
      }

      // Cutblocks filters are managed exclusively by the yearFilter effect
      // to avoid two useEffects competing over setFilter on the same layer.
      const isCutblocks = layerId === "cutblocks";

      if (map.getLayer(fillId)) {
        // Skip opacity override on cutblocks when timeline is active --
        // the timeline effect manages age-graded fill-opacity per-feature.
        const isTimelineControlled = isCutblocks && yearFilter != null;
        if (!isTimelineControlled) {
          map.setPaintProperty(fillId, "fill-opacity", opacity);
        }
        if (!isCutblocks) {
          map.setFilter(fillId, classFilterExpr);
        }
      }
      if (map.getLayer(outlineId)) {
        map.setPaintProperty(outlineId, "line-opacity", opacity > 0 ? 0.4 : 0);
        if (!isCutblocks) {
          map.setFilter(outlineId, classFilterExpr);
        }
      }
    }

    // Hatch layer
    const hatchFillId = "story-harvested-hatch";
    if (map.getLayer(hatchFillId)) {
      map.setPaintProperty(
        hatchFillId,
        "fill-opacity",
        hatchEnabled ? 0.6 : 0
      );
    }
  }, [layers, hatchEnabled, yearFilter]);

  // Apply timeline year filter + age-grading to cutblocks tiles.
  // The PMTiles tenure-cutblocks layer stores DISTURBANCE_START_DATE as a
  // date string (e.g. "2004-01-15"). We extract the first 4 chars as year
  // using a MapLibre expression: ["to-number", ["slice", ["get", "DISTURBANCE_START_DATE"], 0, 4]]
  //
  // Age-grading: recent cuts bright (0.8), old cuts faint (0.15).
  // Implemented as a data-driven fill-opacity expression.
  //
  // This effect is the SINGLE AUTHORITY for cutblock filters. It composes
  // classFilter (from chapter layers) + yearFilter into one expression to
  // avoid two useEffects racing on map.setFilter for the same layer.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !map.isStyleLoaded()) return;

    const fillId = "story-cutblocks-fill";
    const outlineId = "story-cutblocks-outline";
    if (!map.getLayer(fillId)) return;

    // Build class filter from current chapter config (if any)
    const cutblocksLayer = layers.find((l) => l.id === "cutblocks");
    let classFilterExpr: FilterSpecification | null = null;
    if (cutblocksLayer?.classFilter && cutblocksLayer.classFilter.length > 0) {
      classFilterExpr = [
        "any",
        ...cutblocksLayer.classFilter.map(
          (cls) => ["==", ["get", "class"], cls] as FilterSpecification
        ),
      ] as FilterSpecification;
    }

    // Expression to extract year from DISTURBANCE_START_DATE string
    const yearExpr = ["to-number", ["slice", ["get", "DISTURBANCE_START_DATE"], 0, 4]];

    if (yearFilter != null) {
      // Year filter: only show cutblocks logged on or before the current year
      const yearFilterExpr = ["<=", yearExpr, yearFilter] as unknown as FilterSpecification;

      // Compose class + year filters into a single expression
      const composedFilter = classFilterExpr
        ? (["all", classFilterExpr, yearFilterExpr] as unknown as FilterSpecification)
        : yearFilterExpr;

      map.setFilter(fillId, composedFilter);
      if (map.getLayer(outlineId)) map.setFilter(outlineId, composedFilter);

      // Age-graded opacity: newer cuts are brighter, older cuts fade
      // Distance = yearFilter - feature year. Interpolate opacity.
      map.setPaintProperty(fillId, "fill-opacity", [
        "interpolate", ["linear"],
        ["-", yearFilter, yearExpr],
        0, 0.8,    // just logged: bright
        20, 0.4,   // 20 years ago: medium
        50, 0.15,  // 50+ years ago: faint
      ]);
    } else {
      // Timeline inactive: apply only the class filter (or clear entirely)
      map.setFilter(fillId, classFilterExpr);
      if (map.getLayer(outlineId)) map.setFilter(outlineId, classFilterExpr);

      // Reset fill-opacity back to the chapter's scalar value so the stale
      // data-driven expression from the timeline doesn't linger.
      const scalarOpacity = cutblocksLayer?.opacity ?? 0;
      map.setPaintProperty(fillId, "fill-opacity", scalarOpacity);
    }
  }, [yearFilter, layers]);

  // On map load: add sources, layers, terrain, hatch pattern
  const onLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    // Find the first symbol layer in the basemap to insert data layers below it.
    // This keeps basemap labels (roads, places) visible above our data fills.
    const firstSymbolId = map.getStyle().layers.find(
      (l) => l.type === "symbol"
    )?.id;

    // ── Terrain DEM source ──────────────────────────────────────────
    if (TERRAIN_SOURCE.enabled && !map.getSource("terrain-rgb")) {
      map.addSource("terrain-rgb", {
        type: "raster-dem",
        url: TERRAIN_SOURCE.url,
        tileSize: TERRAIN_SOURCE.tileSize,
      });
    }

    // Hillshade layer from DEM
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

    // ── Raster overview source (forest-age, z4-z10) ─────────────────
    // Pre-rendered PNG tiles avoid 400K+ vector features per tile at z5.
    if (!map.getSource("story-forest-age-raster")) {
      map.addSource("story-forest-age-raster", {
        type: "raster",
        tiles: [RASTER_OVERVIEW_URL],
        tileSize: 256,
        minzoom: 4,
        maxzoom: 11,
      });
    }

    if (!map.getLayer("story-forest-age-raster")) {
      map.addLayer(
        {
          id: "story-forest-age-raster",
          type: "raster",
          source: "story-forest-age-raster",
          maxzoom: 11,
          paint: {
            "raster-opacity": 0,
            "raster-opacity-transition": { duration: 400 },
          },
        },
        firstSymbolId,
      );
    }

    // ── PMTiles vector source (detail layers) ───────────────────────
    if (!map.getSource("story-pmtiles")) {
      map.addSource("story-pmtiles", {
        type: "vector",
        url: PMTILES_URL,
      });
    }

    // ── Forest-age vector fill layer (detail zoom z11+) ─────────────
    if (!map.getLayer("story-forest-age-fill")) {
      map.addLayer(
        {
          id: "story-forest-age-fill",
          type: "fill",
          source: "story-pmtiles",
          "source-layer": "forest-age",
          minzoom: 11,
          paint: {
            "fill-color": [
              "match",
              ["get", "class"],
              "old-growth",
              "#15803d",
              "mature",
              "#4ade80",
              "young",
              "#f97316",
              "harvested",
              "#ef4444",
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
          source: "story-pmtiles",
          "source-layer": "forest-age",
          minzoom: 11,
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

    // ── Cutblocks fill layer (tenure-cutblocks source-layer) ────────
    // The PMTiles archive stores cutblock data in the "tenure-cutblocks"
    // source-layer with DISTURBANCE_START_DATE for timeline filtering.
    // Rendered as fill (not line) so age-grading opacity works per-feature.
    if (!map.getLayer("story-cutblocks-fill")) {
      map.addLayer(
        {
          id: "story-cutblocks-fill",
          type: "fill",
          source: "story-pmtiles",
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

    // Cutblocks outline for definition at higher zoom
    if (!map.getLayer("story-cutblocks-outline")) {
      map.addLayer(
        {
          id: "story-cutblocks-outline",
          type: "line",
          source: "story-pmtiles",
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
          source: "story-pmtiles",
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

    // ── Parks fill layer ────────────────────────────────────────────
    if (!map.getLayer("story-parks-fill")) {
      map.addLayer(
        {
          id: "story-parks-fill",
          type: "fill",
          source: "story-pmtiles",
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
          source: "story-pmtiles",
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
    if (!hatchAddedRef.current) {
      const imageData = createHatchPattern();
      map.addImage("hatch-pattern", imageData, { sdf: false });
      hatchAddedRef.current = true;
    }

    // Harvested-hatch fill pattern layer (above fill, below outline)
    if (!map.getLayer("story-harvested-hatch")) {
      map.addLayer(
        {
          id: "story-harvested-hatch",
          type: "fill",
          source: "story-pmtiles",
          "source-layer": "forest-age",
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

    // ── Terrain tile prefetch for Fairy Creek ───────────────────────
    // Pre-request DEM tiles at Fairy Creek so the valley dive is smooth.
    // We use a hidden <img> approach to warm the CDN/browser tile cache
    // without moving the visible map camera.
    if (TERRAIN_SOURCE.enabled && typeof Image !== "undefined") {
      const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;
      if (MAPTILER_KEY) {
        // Request z12 DEM tiles covering Fairy Creek area (-124.55, 48.64)
        // Tile coordinates: z12/x649/y1448, z12/x650/y1448
        const tilesToPrefetch = [
          [12, 649, 1448],
          [12, 650, 1448],
          [12, 649, 1449],
          [12, 650, 1449],
        ];
        for (const [z, x, y] of tilesToPrefetch) {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.src = `https://api.maptiler.com/tiles/terrain-rgb-v2/${z}/${x}/${y}.webp?key=${MAPTILER_KEY}`;
        }
      }
    }

    // Signal that map is loaded for the initial camera effect
    mapReadyRef.current = true;
  }, []);

  return (
    <div style={{ width: "100%", height: "100%" }}>
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: camera.center[0],
          latitude: camera.center[1],
          zoom: camera.zoom,
          pitch: supports3D ? camera.pitch : 0,
          bearing: camera.bearing,
        }}
        mapStyle={MAP_STYLES.dark}
        interactive={false}
        onLoad={onLoad}
        style={{ width: "100%", height: "100%" }}
        attributionControl={false}
      >
        <AttributionControl compact position="bottom-right" />
      </Map>

      {/* Year counter overlay for timeline chapters -- bottom-right position */}
      {yearFilter != null && (
        <div
          className="absolute bottom-6 right-4 md:bottom-8 md:right-8 pointer-events-none"
          role="status"
          aria-live="polite"
          aria-label={`Showing data through ${yearFilter}`}
        >
          <span className="story-year-counter text-5xl md:text-8xl font-light text-white/30 select-none" aria-hidden="true">
            {yearFilter}
          </span>
        </div>
      )}
    </div>
  );
}
