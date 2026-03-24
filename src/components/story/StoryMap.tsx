"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import Map, { type MapRef, AttributionControl } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_STYLES, TERRAIN_SOURCE } from "@/lib/mapConfig";
import { initPMTiles } from "@/lib/layers/pmtiles-source";
import type { ChapterCamera, ChapterTerrain, ChapterFog, ChapterLayer } from "@/data/chapters";
import { createHatchPattern } from "./HatchPattern";
import { setupStoryLayers } from "@/lib/story/setup-layers";
import { applyLayerVisibility, applyTimelineFilter } from "@/lib/story/visibility";
import { pipelineLog } from "@/lib/debug/pipeline-logger";

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
  const [mapLoaded, setMapLoaded] = useState(false);

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
    if (!map) return;
    pipelineLog("visibility-effect", "entry", {
      isStyleLoaded: map.isStyleLoaded(),
      layerCount: layers.length,
      layerIds: layers.map((l) => l.id),
      hatchEnabled,
      yearFilter,
      mapLoaded,
    });
    applyLayerVisibility(map, layers, hatchEnabled, yearFilter);
  }, [layers, hatchEnabled, yearFilter, mapLoaded]);

  // Apply timeline year filter + age-grading to cutblocks tiles.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    pipelineLog("timeline-effect", "entry", { yearFilter, layerCount: layers.length });
    applyTimelineFilter(map, layers, yearFilter);
  }, [yearFilter, layers, mapLoaded]);

  // On map load: add sources, layers, terrain, hatch pattern
  const onLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    pipelineLog("onLoad", "start");

    // Register all story sources and layers via extracted setup function
    const hatchPattern = !hatchAddedRef.current ? createHatchPattern() : null;
    setupStoryLayers(map, {
      terrain: TERRAIN_SOURCE,
      hatchPattern,
    });
    if (hatchPattern) hatchAddedRef.current = true;

    pipelineLog("onLoad", "layers registered");

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

    // Signal that map is loaded -- triggers layer visibility + timeline effects
    mapReadyRef.current = true;
    setMapLoaded(true);
    pipelineLog("setMapLoaded", "true");
    pipelineLog("onLoad", "end");
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
