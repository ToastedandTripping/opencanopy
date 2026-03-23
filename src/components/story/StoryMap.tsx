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
 * Non-interactive (scroll-driven only). Renders PMTiles layers
 * for forest-age, cutblocks, fire-history, and parks.
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

    // Layer ID to tile source-layer mapping
    const layerIds = ["forest-age", "cutblocks", "fire-history", "parks"];

    // Build a set of active layer IDs for quick lookup
    const activeLayers = Object.fromEntries(layers.map((l) => [l.id, l])) as Record<string, (typeof layers)[number]>;

    // For each possible layer, set opacity
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

      if (map.getLayer(fillId)) {
        map.setPaintProperty(fillId, "fill-opacity", opacity);
        map.setFilter(fillId, classFilterExpr);
      }
      if (map.getLayer(outlineId)) {
        map.setPaintProperty(outlineId, "line-opacity", opacity > 0 ? 0.4 : 0);
        map.setFilter(outlineId, classFilterExpr);
      }

      // Handle cutblocks as line layer
      const lineId = `story-${layerId}-line`;
      if (map.getLayer(lineId)) {
        map.setPaintProperty(lineId, "line-opacity", opacity);
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
  }, [layers, hatchEnabled]);

  // Apply timeline year filter to cutblocks tiles
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !map.isStyleLoaded()) return;

    const lineId = "story-cutblocks-line";
    if (!map.getLayer(lineId)) return;

    if (yearFilter != null) {
      map.setFilter(lineId, [
        "<=",
        ["get", "year"],
        yearFilter,
      ]);
    } else {
      map.setFilter(lineId, null);
    }
  }, [yearFilter]);

  // On map load: add sources, layers, terrain, hatch pattern (no camera dependency)
  const onLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    // Terrain DEM source
    if (TERRAIN_SOURCE.enabled && !map.getSource("terrain-rgb")) {
      map.addSource("terrain-rgb", {
        type: "raster-dem",
        url: TERRAIN_SOURCE.url,
        tileSize: TERRAIN_SOURCE.tileSize,
      });
    }

    // Hillshade layer from DEM
    if (TERRAIN_SOURCE.enabled && !map.getLayer("story-hillshade")) {
      map.addLayer({
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
      });
    }

    // PMTiles source for the opencanopy archive
    if (!map.getSource("story-pmtiles")) {
      map.addSource("story-pmtiles", {
        type: "vector",
        url: "pmtiles://https://pub-b5568be386ef4e638b4e49af41395600.r2.dev/opencanopy-v5.pmtiles",
      });
    }

    // Forest-age fill layer
    if (!map.getLayer("story-forest-age-fill")) {
      map.addLayer({
        id: "story-forest-age-fill",
        type: "fill",
        source: "story-pmtiles",
        "source-layer": "forest-age",
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
      });
    }

    // Forest-age outline
    if (!map.getLayer("story-forest-age-outline")) {
      map.addLayer({
        id: "story-forest-age-outline",
        type: "line",
        source: "story-pmtiles",
        "source-layer": "forest-age",
        paint: {
          "line-color": "rgba(255,255,255,0.15)",
          "line-width": 0.5,
          "line-opacity": 0,
          "line-opacity-transition": { duration: 400 },
        },
      });
    }

    // Cutblocks line layer (RESULTS layer uses lines in the registry)
    if (!map.getLayer("story-cutblocks-line")) {
      map.addLayer({
        id: "story-cutblocks-line",
        type: "line",
        source: "story-pmtiles",
        "source-layer": "cutblocks",
        paint: {
          "line-color": "#dc2626",
          "line-width": 1.5,
          "line-opacity": 0,
          "line-opacity-transition": { duration: 400 },
        },
      });
    }

    // Fire-history fill layer
    if (!map.getLayer("story-fire-history-fill")) {
      map.addLayer({
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
      });
    }

    // Parks fill layer
    if (!map.getLayer("story-parks-fill")) {
      map.addLayer({
        id: "story-parks-fill",
        type: "fill",
        source: "story-pmtiles",
        "source-layer": "parks",
        paint: {
          "fill-color": "rgba(255,255,255,0.1)",
          "fill-opacity": 0,
          "fill-opacity-transition": { duration: 400 },
        },
      });
    }

    // Parks outline
    if (!map.getLayer("story-parks-outline")) {
      map.addLayer({
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
      });
    }

    // Hatch pattern
    if (!hatchAddedRef.current) {
      const imageData = createHatchPattern();
      map.addImage("hatch-pattern", imageData, { sdf: false });
      hatchAddedRef.current = true;
    }

    // Harvested-hatch fill pattern layer
    if (!map.getLayer("story-harvested-hatch")) {
      map.addLayer({
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
      });
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

      {/* Year counter overlay for timeline chapters */}
      {yearFilter != null && (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          role="status"
          aria-live="polite"
          aria-label={`Showing data through ${yearFilter}`}
        >
          <span className="story-year-counter text-[8rem] md:text-[12rem] font-bold text-white/10 select-none" aria-hidden="true">
            {yearFilter}
          </span>
        </div>
      )}
    </div>
  );
}
