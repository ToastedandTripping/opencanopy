"use client";

import { useCallback, useEffect, useRef } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  DEFAULT_PITCH,
  DEFAULT_BEARING,
} from "@/lib/mapConfig";
import { resolveInitialLayers, computeActivePreset, validateLayerIds, resolveAliases } from "@/hooks/useLayerState";

// ─── Types ───────────────────────────────────────────────────

export interface ParsedMapState {
  lat: number;
  lng: number;
  zoom: number;
  pitch: number;
  bearing: number;
  layers: string[] | null;
  preset: string | null;
}

interface UseMapStateOptions {
  mapRef: React.RefObject<MapRef | null>;
  enabledLayers: string[];
  activePreset: string | null;
  onLayerRestore?: (layers: string[], preset: string | null) => void;
}

// ─── URL Parsing ─────────────────────────────────────────────

/** Parse all state params from the URL hash */
export function parseHash(): ParsedMapState {
  const defaults: ParsedMapState = {
    lat: DEFAULT_CENTER[1],
    lng: DEFAULT_CENTER[0],
    zoom: DEFAULT_ZOOM,
    pitch: DEFAULT_PITCH,
    bearing: DEFAULT_BEARING,
    layers: null,
    preset: null,
  };

  if (typeof window === "undefined") return defaults;

  try {
    const hash = window.location.hash.slice(1);
    if (!hash) return defaults;

    const params = new URLSearchParams(hash);

    const lat = parseFloat(params.get("lat") || "");
    const lng = parseFloat(params.get("lng") || "");
    const z = parseFloat(params.get("z") || "");
    const pitch = parseFloat(params.get("pitch") || "");
    const bearing = parseFloat(params.get("bearing") || "");

    const layersRaw = params.get("layers");
    const layers = layersRaw
      ? layersRaw.split(",").filter((id) => id.length > 0)
      : null;

    const preset = params.get("preset") || null;

    return {
      lat: isFinite(lat) ? lat : defaults.lat,
      lng: isFinite(lng) ? lng : defaults.lng,
      zoom: isFinite(z) && z >= 0 && z <= 22 ? z : defaults.zoom,
      pitch: isFinite(pitch) && pitch >= 0 && pitch <= 85 ? pitch : defaults.pitch,
      bearing: isFinite(bearing) ? bearing : defaults.bearing,
      layers,
      preset,
    };
  } catch {
    return defaults;
  }
}

// ─── URL Encoding ────────────────────────────────────────────

/** Build the hash string from current state */
function buildHash(
  lat: number,
  lng: number,
  zoom: number,
  pitch: number,
  bearing: number,
  layers: string[],
  preset: string | null
): string {
  const parts: string[] = [
    `lat=${lat.toFixed(4)}`,
    `lng=${lng.toFixed(4)}`,
    `z=${zoom.toFixed(1)}`,
  ];

  // Only include pitch/bearing when non-default to keep URLs clean
  if (Math.abs(pitch) > 0.5) {
    parts.push(`pitch=${pitch.toFixed(0)}`);
  }
  if (Math.abs(bearing) > 0.5) {
    parts.push(`bearing=${bearing.toFixed(0)}`);
  }

  // Layer IDs are controlled by registry and guaranteed URL-safe (alphanumeric + hyphens only)
  if (layers.length > 0) {
    parts.push(`layers=${layers.join(",")}`);
  }

  if (preset) {
    parts.push(`preset=${preset}`);
  }

  return parts.join("&");
}

// ─── Hook ────────────────────────────────────────────────────

/**
 * Manages bidirectional sync between the map state and the URL hash.
 *
 * URL format:
 *   #lat=50.15&lng=-124.21&z=12&layers=forest-age,cutblocks&preset=threats
 *
 * - On mount: parses URL hash, applies initial position via flyTo
 * - On map move: updates URL with replaceState (no history entries)
 * - On layer/preset change: updates URL with pushState (back-navigable)
 * - Debounces map-move URL updates by 200ms
 */
export function useMapState({
  mapRef,
  enabledLayers,
  activePreset,
  onLayerRestore,
}: UseMapStateOptions) {
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLayerHash = useRef<string>("");

  // On mount: if URL has position params, fly to them
  useEffect(() => {
    const parsed = parseHash();
    const hasPosition =
      window.location.hash.includes("lat=") &&
      window.location.hash.includes("lng=");

    if (!hasPosition) return;

    // Wait for the map, then fly to the URL position. This used to poll
    // 20 × 100 ms and "give up silently" — on any load slower than ~2 s (cold
    // cache, mobile) the deep-link camera was dropped while `layers=` still
    // applied, so shared links and the landing-page CTA landed on the default
    // province view (visual audit 2026-08-22, P1). Now: poll until the map
    // ref exists — 10 Hz for the first 10 s, then 2 Hz, giving up only after
    // 120 s (a map that never mounts: error boundary, no WebGL) or unmount.
    //
    // One fly is enough. MapLibre honours flyTo({duration:0}) any time after
    // construction: the style only overrides the camera on `style.load` when
    // the transform is still `unmodified` (maplibre map.ts ~830), and
    // INITIAL_VIEW_STATE already modified it. A re-fly on `load` was tried and
    // removed: `load` fires seconds later on slow devices and flyTo calls
    // stop() first, which would yank the camera back over the user's first pan.
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();
    const tryFly = () => {
      if (cancelled) return;
      const handle = mapRef.current;
      if (!handle) {
        const elapsed = Date.now() - startedAt;
        if (elapsed > 120_000) return;
        timer = setTimeout(tryFly, elapsed > 10_000 ? 500 : 100);
        return;
      }
      handle.flyTo({
        center: [parsed.lng, parsed.lat],
        zoom: parsed.zoom,
        pitch: parsed.pitch,
        bearing: parsed.bearing,
        duration: 0, // Instant on initial load
      });
    };

    // Small delay to let map initialize
    timer = setTimeout(tryFly, 200);
    return () => {
      // Also what makes a StrictMode double-invoke safe: the first run is
      // cancelled before its 200 ms timer fires, so exactly one fly happens.
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [mapRef]);

  // Update URL on map move (replaceState, debounced)
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    const handleMove = () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      debounceTimer.current = setTimeout(() => {
        const center = map.getCenter();
        const zoom = map.getZoom();
        const pitch = map.getPitch();
        const bearing = map.getBearing();

        const hash = buildHash(
          center.lat,
          center.lng,
          zoom,
          pitch,
          bearing,
          enabledLayers,
          activePreset
        );

        window.history.replaceState(null, "", `#${hash}`);
      }, 200);
    };

    map.on("moveend", handleMove);

    return () => {
      map.off("moveend", handleMove);
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [mapRef, enabledLayers, activePreset]);

  // Restore map + layer state when browser back/forward is used
  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseHash();
      const map = mapRef.current;
      if (map) {
        map.flyTo({
          center: [parsed.lng, parsed.lat],
          zoom: parsed.zoom,
          pitch: parsed.pitch,
          bearing: parsed.bearing,
          duration: 500,
        });
      }
      // A bare `#preset=` hash (no `layers=`) used to restore nothing here —
      // the gate only looked at layers (visual audit 2026-08-22, P8). The
      // restore handler already falls back to the preset when layers is empty.
      // Validate ids here so an all-invalid `layers=` list becomes [] and the
      // handler's preset fallback engages — the same resolution the initial
      // load path (parseLayersFromHash) applies to the same URL.
      if ((parsed.layers || parsed.preset) && onLayerRestore) {
        onLayerRestore(validateLayerIds(resolveAliases(parsed.layers ?? [])), parsed.preset);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [mapRef, onLayerRestore]);

  // Update URL on layer/preset change (pushState for back-nav)
  useEffect(() => {
    const layerKey = enabledLayers.join(",") + "|" + (activePreset || "");

    // First run: seed the baseline from the URL/storage-resolved initial layers,
    // NOT the pre-hydration default. useLayerState hydrates layers in a post-mount
    // effect (a second render); seeding to the resolved value means that hydration
    // render matches the baseline and does NOT push a spurious history entry.
    // Without this, opening a shared "#layers=" link traps the Back button.
    if (!lastLayerHash.current) {
      const initial = resolveInitialLayers();
      lastLayerHash.current =
        initial.join(",") + "|" + (computeActivePreset(initial) || "");
      return;
    }

    if (layerKey === lastLayerHash.current) return;
    lastLayerHash.current = layerKey;

    const map = mapRef.current?.getMap();
    if (!map) return;

    const center = map.getCenter();
    const zoom = map.getZoom();
    const pitch = map.getPitch();
    const bearing = map.getBearing();

    const hash = buildHash(
      center.lat,
      center.lng,
      zoom,
      pitch,
      bearing,
      enabledLayers,
      activePreset
    );

    window.history.pushState(null, "", `#${hash}`);
  }, [enabledLayers, activePreset, mapRef]);

  /** Get the full shareable URL with current state */
  const getShareUrl = useCallback((): string => {
    const map = mapRef.current?.getMap();
    if (!map) {
      return window.location.href;
    }

    const center = map.getCenter();
    const zoom = map.getZoom();
    const pitch = map.getPitch();
    const bearing = map.getBearing();

    const hash = buildHash(
      center.lat,
      center.lng,
      zoom,
      pitch,
      bearing,
      enabledLayers,
      activePreset
    );

    return `${window.location.origin}${window.location.pathname}#${hash}`;
  }, [mapRef, enabledLayers, activePreset]);

  return { getShareUrl };
}
