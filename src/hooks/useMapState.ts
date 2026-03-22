"use client";

import { useCallback, useEffect, useRef } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  DEFAULT_PITCH,
  DEFAULT_BEARING,
  MAP_STYLES,
} from "@/lib/mapConfig";

// ─── Types ───────────────────────────────────────────────────

export type BaseMapStyleName = keyof typeof MAP_STYLES;

export interface ParsedMapState {
  lat: number;
  lng: number;
  zoom: number;
  pitch: number;
  bearing: number;
  layers: string[] | null;
  preset: string | null;
  style: BaseMapStyleName | null;
}

interface UseMapStateOptions {
  mapRef: React.RefObject<MapRef | null>;
  enabledLayers: string[];
  activePreset: string | null;
  style?: BaseMapStyleName;
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
    style: null,
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

    const styleRaw = params.get("style") as BaseMapStyleName | null;
    const validStyles = new Set(Object.keys(MAP_STYLES));
    const style = styleRaw && validStyles.has(styleRaw) ? styleRaw : null;

    return {
      lat: isFinite(lat) ? lat : defaults.lat,
      lng: isFinite(lng) ? lng : defaults.lng,
      zoom: isFinite(z) && z >= 0 && z <= 22 ? z : defaults.zoom,
      pitch: isFinite(pitch) && pitch >= 0 && pitch <= 85 ? pitch : defaults.pitch,
      bearing: isFinite(bearing) ? bearing : defaults.bearing,
      layers,
      preset,
      style,
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
  preset: string | null,
  style?: BaseMapStyleName
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

  if (style && style !== "dark") {
    parts.push(`style=${style}`);
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
  style = "dark",
  onLayerRestore,
}: UseMapStateOptions) {
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);
  const lastLayerHash = useRef<string>("");

  // On mount: if URL has position params, fly to them
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    const parsed = parseHash();
    const hasPosition =
      window.location.hash.includes("lat=") &&
      window.location.hash.includes("lng=");

    if (!hasPosition) return;

    // Wait for map to be ready, then fly to the URL position
    let flyAttempts = 0;
    const MAX_FLY_ATTEMPTS = 20; // 20 * 100ms = 2 seconds max
    const tryFly = () => {
      const map = mapRef.current;
      if (!map) {
        flyAttempts++;
        if (flyAttempts >= MAX_FLY_ATTEMPTS) return; // Give up silently
        setTimeout(tryFly, 100);
        return;
      }

      map.flyTo({
        center: [parsed.lng, parsed.lat],
        zoom: parsed.zoom,
        pitch: parsed.pitch,
        bearing: parsed.bearing,
        duration: 0, // Instant on initial load
      });
    };

    // Small delay to let map initialize
    setTimeout(tryFly, 200);
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
          activePreset,
          style
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
  }, [mapRef, enabledLayers, activePreset, style]);

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
      if (parsed.layers && onLayerRestore) {
        onLayerRestore(parsed.layers, parsed.preset);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [mapRef, onLayerRestore]);

  // Update URL on layer/preset change (pushState for back-nav)
  useEffect(() => {
    const layerKey = enabledLayers.join(",") + "|" + (activePreset || "");
    if (layerKey === lastLayerHash.current) return;
    // Skip on initial mount to avoid double-write
    if (!lastLayerHash.current) {
      lastLayerHash.current = layerKey;
      return;
    }
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
      activePreset,
      style
    );

    window.history.pushState(null, "", `#${hash}`);
  }, [enabledLayers, activePreset, mapRef, style]);

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
      activePreset,
      style
    );

    return `${window.location.origin}${window.location.pathname}#${hash}`;
  }, [mapRef, enabledLayers, activePreset, style]);

  return { getShareUrl };
}
