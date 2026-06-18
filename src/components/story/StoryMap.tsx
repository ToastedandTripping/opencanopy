"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import Map, { type MapRef, AttributionControl } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_STYLES, TERRAIN_SOURCE } from "@/lib/mapConfig";
import { initPMTiles } from "@/lib/layers/pmtiles-source";
import type { ChapterCamera, ChapterTerrain, ChapterFog, ChapterLayer } from "@/data/chapters";
import { createHatchPattern } from "./HatchPattern";
import { setupStoryLayers, OVERLAY_SOURCES } from "@/lib/story/setup-layers";
import { applyLayerVisibility, applyTimelineFilter } from "@/lib/story/visibility";
import {
  prefetchStoryTiles,
  prefetchTerrainTiles,
  prefetchYearOverlays,
  prefetchFireOverlays,
} from "@/lib/story/prefetch";
import type { ResolvedOverlay } from "@/hooks/useScrollytelling";
import { pipelineLog } from "@/lib/debug/pipeline-logger";

initPMTiles();

interface StoryMapProps {
  camera: ChapterCamera;
  terrain: ChapterTerrain;
  fog?: ChapterFog;
  layers: ChapterLayer[];
  yearFilter: number | null;
  overlays: ResolvedOverlay[];
  counterLabel?: string;
  hatchEnabled: boolean;
  supports3D: boolean;
}

function clampYear(year: number, start: number, end: number): number {
  return Math.max(start, Math.min(end, year));
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
  overlays,
  counterLabel,
  hatchEnabled,
  supports3D,
}: StoryMapProps) {
  const mapRef = useRef<MapRef>(null);
  const hatchAddedRef = useRef(false);
  const terrainExaggerationRef = useRef(0);
  const terrainAnimRef = useRef<number | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  // Last-applied {year,opacity} per overlay source — guards redundant GL calls
  // (the overlays prop changes identity every scroll frame).
  const overlayAppliedRef = useRef<Record<string, { year: number; opacity: number }>>({});

  // Apply camera on every update
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !map.isStyleLoaded()) return;

    map.jumpTo({
      center: camera.center,
      zoom: camera.zoom,
      pitch: supports3D ? camera.pitch : 0,
      bearing: camera.bearing,
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

  // Apply layer visibility and opacity (only on chapter change, not every scroll frame)
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
  }, [layers, hatchEnabled, mapLoaded]); // yearFilter excluded — timeline effect handles cutblocks

  // Apply timeline year filter + age-grading to cutblocks tiles.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    pipelineLog("timeline-effect", "entry", { yearFilter, layerCount: layers.length });
    applyTimelineFilter(map, layers, yearFilter);
  }, [yearFilter, layers, mapLoaded]);

  // Province-scale image overlays (cutblock red + wildfire amber).
  // SOLE writer of each overlay's raster-opacity — opacity is driven by the
  // chapter's `overlays` declaration, fully decoupled from yearFilter. Each
  // source's image swap + opacity are applied atomically here, guarded by
  // overlayAppliedRef so the per-frame `overlays` identity churn doesn't fire
  // redundant GL calls. Sources absent this beat fade to 0.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !mapLoaded) return;

    const active = new Set<string>();

    for (const ov of overlays) {
      const cfg = OVERLAY_SOURCES[ov.source];
      if (!cfg || !map.getLayer(cfg.layerId) || !map.getSource(cfg.sourceId)) continue;
      active.add(ov.source);

      const applied = overlayAppliedRef.current[ov.source] ?? { year: -1, opacity: -1 };
      const year = clampYear(ov.year, cfg.range.start, cfg.range.end);

      if (year !== applied.year) {
        const src = map.getSource(cfg.sourceId);
        if (src && "updateImage" in src) {
          (src as { updateImage: (opts: { url: string }) => void }).updateImage({
            url: cfg.urlPattern.replace("{year}", String(year)),
          });
        }
      }
      if (ov.opacity !== applied.opacity) {
        map.setPaintProperty(cfg.layerId, "raster-opacity", ov.opacity);
      }
      overlayAppliedRef.current[ov.source] = { year, opacity: ov.opacity };
    }

    // Hide overlays not declared by the current beat.
    for (const source of Object.keys(OVERLAY_SOURCES) as Array<keyof typeof OVERLAY_SOURCES>) {
      if (active.has(source)) continue;
      const cfg = OVERLAY_SOURCES[source];
      const applied = overlayAppliedRef.current[source];
      if (map.getLayer(cfg.layerId) && (!applied || applied.opacity !== 0)) {
        map.setPaintProperty(cfg.layerId, "raster-opacity", 0);
        overlayAppliedRef.current[source] = { year: applied?.year ?? -1, opacity: 0 };
      }
    }
  }, [overlays, mapLoaded]);

  // On map load: add sources, layers, terrain, hatch pattern
  const onLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    pipelineLog("onLoad", "start");

    // Register all story sources and layers via extracted setup function
    const hatchPattern = !hatchAddedRef.current ? createHatchPattern() : null;
    try {
      setupStoryLayers(map, { terrain: TERRAIN_SOURCE, hatchPattern });
    } catch (err) {
      console.error("[OpenCanopy] setupStoryLayers failed:", err);
    }
    if (hatchPattern) hatchAddedRef.current = true;

    pipelineLog("onLoad", "layers registered");

    // Prefetch raster tiles, terrain tiles, and year overlays. Fire overlays
    // are larger and belong to a later beat — defer them behind the cutblocks.
    prefetchStoryTiles();
    prefetchYearOverlays();
    prefetchFireOverlays();
    const maptilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    if (TERRAIN_SOURCE.enabled && maptilerKey) {
      prefetchTerrainTiles(maptilerKey);
    }

    // Signal that map is loaded -- triggers layer visibility + timeline effects
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

      {/* Year counter overlay for scrub chapters -- bottom-right position */}
      {yearFilter != null && (
        <div
          className="absolute bottom-6 right-4 md:bottom-8 md:right-8 pointer-events-none flex flex-col items-end"
          role="status"
          aria-live="polite"
          aria-label={`Showing ${counterLabel ?? "data"} through ${yearFilter}`}
        >
          <span
            className="story-year-counter text-4xl md:text-8xl font-light text-white/40 select-none tabular-nums"
            aria-hidden="true"
          >
            {yearFilter}
          </span>
          {counterLabel && (
            <span
              className="text-[10px] md:text-xs uppercase tracking-[0.25em] text-white/40 select-none"
              aria-hidden="true"
            >
              {counterLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
