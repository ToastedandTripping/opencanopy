"use client";

import { useCallback, useRef, useState } from "react";
import {
  fetchWatershedAtPoint,
  type WatershedInfo,
} from "@/lib/data/watershed-client";

export type WatershedMode = "off" | "selecting" | "selected";

export interface WatershedSelectionState {
  mode: WatershedMode;
  watershed: WatershedInfo | null;
  loading: boolean;
  /**
   * Set only on a genuine server/network failure (D3, honest failure
   * states) -- NOT on a resolved-but-empty click (e.g. ocean), which is a
   * normal "no watershed here" result and stays silent (mode stays
   * "selecting" so the user can just click elsewhere). Cleared on the next
   * selectAtPoint call, clear(), or disableMode().
   */
  error: string | null;
  selectAtPoint: (lng: number, lat: number) => Promise<void>;
  clear: () => void;
  enableMode: () => void;
  disableMode: () => void;
}

/**
 * Manages the watershed selection lifecycle:
 *   off -> selecting (click anywhere) -> selected (boundary + stats)
 *
 * The hook handles the WFS fetch and exposes the watershed polygon
 * for map rendering and metadata for the calculator panel.
 */
export function useWatershedSelection(): WatershedSelectionState {
  const [mode, setMode] = useState<WatershedMode>("off");
  const [watershed, setWatershed] = useState<WatershedInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const enableMode = useCallback(() => {
    setMode("selecting");
    setWatershed(null);
    setError(null);
  }, []);

  const disableMode = useCallback(() => {
    setMode("off");
    setWatershed(null);
    setLoading(false);
    setError(null);
  }, []);

  const clear = useCallback(() => {
    setMode("off");
    setWatershed(null);
    setLoading(false);
    setError(null);
  }, []);

  const selectAtPoint = useCallback(async (lng: number, lat: number) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchWatershedAtPoint(lng, lat);
      if (result) {
        setWatershed(result);
        setMode("selected");
      } else {
        // Resolved with no features -- genuinely no watershed at this
        // point (e.g. ocean click). NOT an error: stay in selecting mode
        // silently so the user can just click elsewhere, same as before.
        setMode("selecting");
      }
    } catch {
      // Real server/network failure (D3) -- distinct from the empty-result
      // branch above. Stay in selecting mode (clicking again should still
      // work) but surface the failure instead of swallowing it.
      setMode("selecting");
      setError("Couldn't load watershed data — try again.");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  return {
    mode,
    watershed,
    loading,
    error,
    selectAtPoint,
    clear,
    enableMode,
    disableMode,
  };
}
