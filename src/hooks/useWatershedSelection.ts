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
  const loadingRef = useRef(false);

  const enableMode = useCallback(() => {
    setMode("selecting");
    setWatershed(null);
  }, []);

  const disableMode = useCallback(() => {
    setMode("off");
    setWatershed(null);
    setLoading(false);
  }, []);

  const clear = useCallback(() => {
    setMode("off");
    setWatershed(null);
    setLoading(false);
  }, []);

  const selectAtPoint = useCallback(async (lng: number, lat: number) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const result = await fetchWatershedAtPoint(lng, lat);
      if (result) {
        setWatershed(result);
        setMode("selected");
      } else {
        // No watershed found at this point (e.g. ocean click)
        setMode("selecting");
      }
    } catch {
      // Network/WFS error -- stay in selecting mode
      setMode("selecting");
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  return {
    mode,
    watershed,
    loading,
    selectAtPoint,
    clear,
    enableMode,
    disableMode,
  };
}
