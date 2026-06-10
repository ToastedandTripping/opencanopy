"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDefaultLayers } from "@/lib/layers";
import { LAYER_PRESETS } from "@/lib/layers";
import { LAYER_REGISTRY } from "@/lib/layers";

// ── Shared-source mutual-exclusivity guard ───────────────────────────────
// "logging-risk" and "forest-age" both use PMTiles source-layer "forest-age".
// Enabling both simultaneously stacks conflicting fills on the same geometry.
// When one is toggled on, auto-disable the other.
//
// Approach: targeted pair (simpler and more explicit than a dynamic
// sourceLayer-collision scan, which would require comparing across PMTiles
// entries in the registry and could miss intentional overlapping sources).
const MUTUALLY_EXCLUSIVE_PAIRS: [string, string][] = [
  ["forest-age", "logging-risk"],
];

/**
 * Apply mutual-exclusivity de-confliction to a set of layer IDs.
 *
 * For each exclusive pair where both members are present, the LAST one
 * in the array wins (i.e. the one with the higher index is kept). This is
 * deterministic: callers that build arrays left-to-right get "last specified
 * takes precedence" semantics, which matches the toggleLayer behavior of
 * always appending the newly-enabled layer at the end.
 */
function deconflictExclusivePairs(ids: string[]): string[] {
  const result = [...ids];
  for (const [a, b] of MUTUALLY_EXCLUSIVE_PAIRS) {
    const idxA = result.lastIndexOf(a);
    const idxB = result.lastIndexOf(b);
    if (idxA !== -1 && idxB !== -1) {
      // Both present: drop the one that appears EARLIER (lower index).
      const dropIdx = idxA < idxB ? idxA : idxB;
      result.splice(dropIdx, 1);
    }
  }
  return result;
}

const STORAGE_KEY = "opencanopy-layers-v2";

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

/**
 * Resolve the initial enabled layers using the documented priority order:
 * URL hash -> localStorage -> registry defaults.
 *
 * Exported so useMapState can seed its URL-sync baseline from the SAME resolved
 * value this hook hydrates to, preventing a spurious history entry on load.
 */
export function resolveInitialLayers(): string[] {
  return parseLayersFromHash() ?? readFromStorage() ?? getDefaultLayers();
}

/** Determine which preset (if any) exactly matches the given layers */
export function computeActivePreset(layers: string[]): string | null {
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

  // Hydrate from URL -> localStorage on mount. Only set when a non-default
  // source provides layers, so the common no-layers case keeps the useState
  // default and avoids an extra render. (Defaults already set via initializer.)
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const fromUrlOrStorage = parseLayersFromHash() ?? readFromStorage();
    if (fromUrlOrStorage) {
      setEnabledLayers(fromUrlOrStorage);
    }
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
      // Append the new layer, then de-conflict: if both members of an exclusive
      // pair are present, the last one (the newly-added id) wins.
      return deconflictExclusivePairs([...prev, id]);
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
    const filtered = ids.filter((id) => validIds.has(id));
    // Apply the same mutual-exclusivity de-confliction used by toggleLayer so
    // preset/URL-hydration paths can't silently enable conflicting pairs.
    setEnabledLayers(deconflictExclusivePairs(filtered));
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
