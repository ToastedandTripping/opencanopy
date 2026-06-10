"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// ── Layer status model ──────────────────────────────────────────────────────
// Each enabled layer transitions through these states:
//   loading → ok | empty | error | zoom
// "ok" is terminal-success: no indicator shown.
// "empty" = viewport contains no features (WFS-only; PMTiles can't distinguish).
// "error"  = hard failure (network, 502, timeout).
// "zoom"   = viewport too large for WFS fetch; user must zoom in.
//
// Dual-source rule: WFS-derived terminal status (error/empty/zoom) is only set
// for WFS-only layers (!tileSource). Tile-backed layers report status exclusively
// via the PMTiles path (handlePmtilesError) — their supplemental WFS fetch failing
// does not mean "no data shown" since PMTiles always render with overzoom.
//
// Precedence contract (enforced by callers, not this context):
//   LoadingBar  = any layer is "loading"  (global top affordance)
//   MapLegend   = per-layer terminal state glyph
//   StatusToast = "error" only (noticed even when legend is collapsed)

export type LayerStatus = "loading" | "ok" | "empty" | "error" | "zoom";

interface LoadingContextValue {
  /** Back-compat: set of layer IDs currently loading */
  loadingLayers: Set<string>;
  /** Back-compat setter (wraps setLayerStatus under the hood) */
  setLayerLoading: (id: string, loading: boolean) => void;
  /** Full per-layer status map */
  layerStatuses: Map<string, LayerStatus>;
  /** Set the authoritative status for a layer */
  setLayerStatus: (id: string, status: LayerStatus) => void;
  /** Remove a layer's status entry (called on disable/unmount) */
  clearLayerStatus: (id: string) => void;
}

const LoadingContext = createContext<LoadingContextValue>({
  loadingLayers: new Set(),
  setLayerLoading: () => {},
  layerStatuses: new Map(),
  setLayerStatus: () => {},
  clearLayerStatus: () => {},
});

// ── Debounce helper ────────────────────────────────────────────────────────
// 200-300ms trailing debounce prevents status thrash on rapid pan/zoom.
// Each layer gets its own timer so one layer's transitions don't delay another.

function useDebounce(delay: number) {
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Clear all pending timers on unmount to prevent setState-after-unmount.
  useEffect(() => {
    return () => {
      for (const id of timers.current.values()) {
        clearTimeout(id);
      }
      timers.current.clear();
    };
  }, []);

  const debounce = useCallback(
    (key: string, fn: () => void) => {
      const existing = timers.current.get(key);
      if (existing) clearTimeout(existing);
      const id = setTimeout(() => {
        timers.current.delete(key);
        fn();
      }, delay);
      timers.current.set(key, id);
    },
    [delay]
  );

  return debounce;
}

export function LoadingProvider({ children }: { children: React.ReactNode }) {
  const [layerStatuses, setLayerStatuses] = useState<Map<string, LayerStatus>>(
    new Map()
  );

  const debounce = useDebounce(250);

  // Derive loadingLayers set from the status map for back-compat consumers
  const loadingLayers = useMemo(() => {
    const result = new Set<string>();
    for (const [id, status] of layerStatuses) {
      if (status === "loading") result.add(id);
    }
    return result;
  }, [layerStatuses]);

  // Core setter — applies status immediately for "loading" (fast feedback),
  // debounced for terminal states to avoid flicker on rapid pan/zoom.
  const setLayerStatus = useCallback(
    (id: string, status: LayerStatus) => {
      if (status === "loading") {
        // Loading transitions are immediate — user needs to see the spinner now
        setLayerStatuses((prev) => {
          const next = new Map(prev);
          next.set(id, status);
          return next;
        });
      } else {
        // Terminal states are debounced to suppress thrash
        debounce(id, () => {
          setLayerStatuses((prev) => {
            const next = new Map(prev);
            next.set(id, status);
            return next;
          });
        });
      }
    },
    [debounce]
  );

  const clearLayerStatus = useCallback((id: string) => {
    setLayerStatuses((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  // Back-compat: setLayerLoading(id, true) → "loading"; false → "ok"
  // Only transitions to "ok" if the current status is "loading" (don't
  // overwrite a terminal error/empty/zoom with ok from the finally-block).
  const setLayerLoading = useCallback(
    (id: string, loading: boolean) => {
      if (loading) {
        setLayerStatus(id, "loading");
      } else {
        setLayerStatuses((prev) => {
          const current = prev.get(id);
          // Only clear loading state; don't overwrite a terminal status
          if (current !== "loading") return prev;
          const next = new Map(prev);
          next.set(id, "ok");
          return next;
        });
      }
    },
    [setLayerStatus]
  );

  const value = useMemo(
    () => ({
      loadingLayers,
      setLayerLoading,
      layerStatuses,
      setLayerStatus,
      clearLayerStatus,
    }),
    [loadingLayers, setLayerLoading, layerStatuses, setLayerStatus, clearLayerStatus]
  );

  return (
    <LoadingContext.Provider value={value}>{children}</LoadingContext.Provider>
  );
}

export function useLoadingContext() {
  return useContext(LoadingContext);
}
