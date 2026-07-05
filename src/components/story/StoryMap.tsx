"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import Map, { type MapRef, AttributionControl } from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_STYLES } from "@/lib/mapConfig";
import { initPMTiles } from "@/lib/layers/pmtiles-source";
import type { ChapterCamera, ChapterLayer } from "@/data/chapters";
import { setupStoryLayers, OVERLAY_SOURCES } from "@/lib/story/setup-layers";
import { applyLayerVisibility } from "@/lib/story/visibility";
import { registerBinaryTileProtocol } from "@/lib/story/tile-manifest";
import {
  prefetchYearOverlays,
  prefetchFireOverlays,
  prefetchBinaryTiles,
} from "@/lib/story/prefetch";
import type { ResolvedOverlay } from "@/hooks/useScrollytelling";
import { pipelineLog } from "@/lib/debug/pipeline-logger";

initPMTiles();
registerBinaryTileProtocol();

interface StoryMapProps {
  camera: ChapterCamera;
  layers: ChapterLayer[];
  yearFilter: number | null;
  overlays: ResolvedOverlay[];
  counterLabel?: string;
  supports3D: boolean;
  /** When true, shows the binary end-reveal raster (ending + remains chapters). */
  revealBinary?: boolean;
  /**
   * Per-frame opacity for story-binary-reveal [0, 0.85].
   * This effect is the SOLE writer of that layer's raster-opacity.
   * applyLayerVisibility does not touch it.
   */
  binaryRevealOpacity: number;
}

function clampYear(year: number, start: number, end: number): number {
  return Math.max(start, Math.min(end, year));
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
  layers,
  yearFilter,
  overlays,
  counterLabel,
  supports3D,
  revealBinary,
  binaryRevealOpacity,
}: StoryMapProps) {
  const mapRef = useRef<MapRef>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  // Last-applied {year,opacity} per overlay source — guards redundant GL calls
  // (the overlays prop changes identity every scroll frame).
  const overlayAppliedRef = useRef<Record<string, { year: number; opacity: number }>>({});
  // Last-applied binary reveal opacity — guards redundant GL calls on the
  // per-frame binary effect (sole writer of story-binary-reveal raster-opacity).
  const binaryAppliedRef = useRef<number>(-1);

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

  // Apply layer visibility and opacity (only on chapter change, not every scroll frame)
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    pipelineLog("visibility-effect", "entry", {
      isStyleLoaded: map.isStyleLoaded(),
      layerCount: layers.length,
      layerIds: layers.map((l) => l.id),
      yearFilter,
      mapLoaded,
    });
    applyLayerVisibility(map, layers, revealBinary);
  }, [layers, mapLoaded, revealBinary]);

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

  // Per-frame binary end-reveal opacity.
  // SOLE writer of story-binary-reveal raster-opacity. applyLayerVisibility
  // does not touch this layer. The opacity is driven by binaryRevealOpacity
  // (scroll-coupled in `ending`, immediate 0.85 in `remains`, 0 elsewhere).
  // Guards redundant GL calls with binaryAppliedRef so per-frame identity
  // churn doesn't fire unnecessary setPaintProperty calls.
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !mapLoaded) return;
    if (!map.isStyleLoaded()) return;

    const binaryLayerId = "story-binary-reveal";
    if (!map.getLayer(binaryLayerId)) return;

    if (binaryRevealOpacity !== binaryAppliedRef.current) {
      map.setPaintProperty(binaryLayerId, "raster-opacity", binaryRevealOpacity);
      binaryAppliedRef.current = binaryRevealOpacity;
    }
  }, [binaryRevealOpacity, mapLoaded]);

  // On map load: add sources/layers, set the sky, kick off prefetch
  const onLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    pipelineLog("onLoad", "start");

    // Register all story sources and layers via extracted setup function
    try {
      setupStoryLayers(map);
    } catch (err) {
      console.error("[OpenCanopy] setupStoryLayers failed:", err);
    }

    pipelineLog("onLoad", "layers registered");

    // Sky: no chapter ever sets `fog`, so this is unconditionally the dark
    // override -- explicit dark values avoid MapLibre's default light-blue
    // sky. One-time (not a per-frame/per-chapter effect): there is nothing
    // left that ever changes it after this.
    map.setSky({
      "sky-color": "#0a0a0c",
      "fog-color": "#0a0a0c",
      "fog-ground-blend": 0,
      "horizon-fog-blend": 0,
      "sky-horizon-blend": 0,
      "atmosphere-blend": 0,
    });

    // Prefetch raster tiles and year overlays. Fire overlays are larger and
    // belong to a later beat — defer them behind the cutblocks. Binary tiles
    // are deferred 1s behind the others (called from onLoad so they start
    // warming well before the ending chapter is reached).
    prefetchYearOverlays();
    prefetchFireOverlays();
    prefetchBinaryTiles();

    // Signal that map is loaded -- triggers the layer visibility effect
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
