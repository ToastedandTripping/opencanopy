"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDefaultLayers } from "@/lib/layers";
import { LAYER_PRESETS } from "@/lib/layers";
import { LAYER_REGISTRY } from "@/lib/layers";

const STORAGE_KEY = "opencanopy-layers";

/** Parse layer IDs from URL hash `layers=` param */
function parseLayersFromHash(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const hash = window.location.hash.slice(1);
    const params = new URLSearchParams(hash);
    const raw = params.get("layers");
    if (!raw) return null;
    const ids = raw.split(",").filter((id) => id.length > 0);
    // Validate against registry
    const validIds = new Set(LAYER_REGISTRY.map((l) => l.id));
    const filtered = ids.filter((id) => validIds.has(id));
    return filtered.length > 0 ? filtered : null;
  } catch {
    return null;
  }
}

/** Read layer IDs from localStorage */
function readFromStorage(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const validIds = new Set(LAYER_REGISTRY.map((l) => l.id));
    const filtered = parsed.filter(
      (id: unknown) => typeof id === "string" && validIds.has(id)
    );
    return filtered.length > 0 ? filtered : null;
  } catch {
    return null;
  }
}

/** Determine which preset (if any) exactly matches the given layers */
function computeActivePreset(layers: string[]): string | null {
  const sorted = [...layers].sort();
  for (const preset of LAYER_PRESETS) {
    const presetSorted = [...preset.layers].sort();
    if (
      presetSorted.length === sorted.length &&
      presetSorted.every((id, i) => id === sorted[i])
    ) {
      return preset.id;
    }
  }
  return null;
}

export interface LayerStateReturn {
  /** Currently enabled layer IDs */
  enabledLayers: string[];
  /** Toggle a single layer on/off */
  toggleLayer: (id: string) => void;
  /** Apply a preset (disable all non-default, enable preset layers) */
  applyPreset: (presetId: string) => void;
  /** Which preset exactly matches current state, or null */
  activePreset: string | null;
  /** Reset to registry defaults */
  resetToDefaults: () => void;
  /** Set specific layer IDs (for hot spots etc.) */
  setLayers: (ids: string[]) => void;
}

/**
 * Hook to manage which layers are enabled.
 *
 * Priority order for initialization:
 *   1. URL hash params
 *   2. localStorage
 *   3. Registry defaults
 *
 * Persists to localStorage on every change.
 * URL sync is handled by useMapState.
 */
export function useLayerState(): LayerStateReturn {
  const initialized = useRef(false);

  const [enabledLayers, setEnabledLayers] = useState<string[]>(() => {
    // SSR-safe: return defaults, will hydrate on mount
    return getDefaultLayers();
  });

  // Hydrate from URL -> localStorage -> defaults on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const fromUrl = parseLayersFromHash();
    if (fromUrl) {
      setEnabledLayers(fromUrl);
      return;
    }

    const fromStorage = readFromStorage();
    if (fromStorage) {
      setEnabledLayers(fromStorage);
      return;
    }
    // Defaults already set via useState initializer
  }, []);

  // Persist to localStorage on every change
  useEffect(() => {
    if (!initialized.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(enabledLayers));
    } catch {
      // Ignore quota errors
    }
  }, [enabledLayers]);

  const toggleLayer = useCallback((id: string) => {
    setEnabledLayers((prev) => {
      if (prev.includes(id)) {
        return prev.filter((l) => l !== id);
      }
      return [...prev, id];
    });
  }, []);

  const applyPreset = useCallback((presetId: string) => {
    const preset = LAYER_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setEnabledLayers(preset.layers);
  }, []);

  const resetToDefaults = useCallback(() => {
    setEnabledLayers(getDefaultLayers());
  }, []);

  const setLayers = useCallback((ids: string[]) => {
    const validIds = new Set(LAYER_REGISTRY.map((l) => l.id));
    setEnabledLayers(ids.filter((id) => validIds.has(id)));
  }, []);

  const activePreset = computeActivePreset(enabledLayers);

  return {
    enabledLayers,
    toggleLayer,
    applyPreset,
    activePreset,
    resetToDefaults,
    setLayers,
  };
}
