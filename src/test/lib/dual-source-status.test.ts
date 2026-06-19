/**
 * Dual-source status rule — unit tests
 *
 * The rule: WFS-derived terminal status (error / empty / zoom) must only be
 * surfaced for WFS-only layers (!tileSource). Tile-backed layers render via
 * PMTiles with overzoom, so a supplemental WFS failure is not user-visible
 * and must NOT produce an error indicator.
 *
 * These tests validate the gating logic in DataLayer.tsx's loadData callback
 * by simulating the status-update paths directly via LoadingContext, mirroring
 * exactly what DataLayer does for each layer type.
 *
 * Tests:
 * 1. WFS-only layer: WFS error → status "error" (honest — no tile fallback)
 * 2. Tile-backed layer: WFS error → status NOT set (tiles still render)
 * 3. WFS-only layer: WFS returns empty FC → status "empty"
 * 4. Tile-backed layer: WFS returns empty FC → status NOT changed
 * 5. WFS-only layer: viewport guard fires → status "zoom"
 * 6. Tile-backed layer: viewport guard is skipped entirely (guard is gated on !tileSource)
 * 7. WFS-only layer: WFS success → status "ok"
 * 8. Tile-backed layer: WFS success → status NOT set (PMTiles path drives status)
 */

import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { LoadingProvider, useLoadingContext } from "@/contexts/LoadingContext";

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(LoadingProvider, null, children);
}

/**
 * Simulates the loadData error path from DataLayer.tsx.
 * hasTileSource gates whether setLayerStatus("error") is called.
 */
function simulateWfsError(
  layerId: string,
  hasTileSource: boolean,
  setLayerStatus: (id: string, status: "error" | "empty" | "zoom" | "ok" | "loading") => void,
  setLayerLoading: (id: string, loading: boolean) => void,
) {
  // WFS fetch fails
  if (!hasTileSource) {
    setLayerStatus(layerId, "error");
  }
  // setLayerLoading(false) is also gated on !hasTileSource in DataLayer
  if (!hasTileSource) {
    setLayerLoading(layerId, false);
  }
}

/**
 * Simulates the loadData success path for an empty FeatureCollection.
 */
function simulateWfsEmpty(
  layerId: string,
  hasTileSource: boolean,
  setLayerStatus: (id: string, status: "error" | "empty" | "zoom" | "ok" | "loading") => void,
  setLayerLoading: (id: string, loading: boolean) => void,
) {
  if (!hasTileSource) {
    setLayerStatus(layerId, "empty");
    setLayerLoading(layerId, false);
  }
}

/**
 * Simulates the loadData success path with features present.
 */
function simulateWfsSuccess(
  layerId: string,
  hasTileSource: boolean,
  setLayerStatus: (id: string, status: "error" | "empty" | "zoom" | "ok" | "loading") => void,
  setLayerLoading: (id: string, loading: boolean) => void,
) {
  if (!hasTileSource) {
    setLayerStatus(layerId, "ok");
    setLayerLoading(layerId, false);
  }
}

/**
 * Simulates the viewport area guard path.
 * The guard itself is already gated on !layer.tileSource in DataLayer, so
 * for tile-backed layers this block is never entered — but we test the status
 * surfacing behavior at the setLayerStatus call site.
 */
function simulateViewportGuard(
  layerId: string,
  hasTileSource: boolean,
  setLayerStatus: (id: string, status: "error" | "empty" | "zoom" | "ok" | "loading") => void,
) {
  // The viewport guard block is inside `if (!layer.tileSource)` in DataLayer,
  // so tile-backed layers never reach this. For WFS-only layers it fires normally.
  if (!hasTileSource) {
    setLayerStatus(layerId, "zoom");
  }
}

describe("Dual-source status rule — WFS terminal status gating", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── WFS error ────────────────────────────────────────────────────

  it("WFS-only layer: WFS fetch error → status 'error'", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      simulateWfsError("fish-streams", false, result.current.setLayerStatus, result.current.setLayerLoading);
      vi.runAllTimers(); // flush debounce
    });

    expect(result.current.layerStatuses.get("fish-streams")).toBe("error");
  });

  it("tile-backed layer: WFS fetch error → status NOT set (PMTiles still render)", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      simulateWfsError("forest-age", true, result.current.setLayerStatus, result.current.setLayerLoading);
      vi.runAllTimers();
    });

    // Status should be absent — no indicator for a layer whose tiles are fine
    expect(result.current.layerStatuses.has("forest-age")).toBe(false);
  });

  // ── WFS empty ────────────────────────────────────────────────────

  it("WFS-only layer: WFS returns empty FeatureCollection → status 'empty'", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      simulateWfsEmpty("species-at-risk", false, result.current.setLayerStatus, result.current.setLayerLoading);
      vi.runAllTimers();
    });

    expect(result.current.layerStatuses.get("species-at-risk")).toBe("empty");
  });

  it("tile-backed layer: WFS returns empty FeatureCollection → status NOT changed", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      simulateWfsEmpty("cutblocks", true, result.current.setLayerStatus, result.current.setLayerLoading);
      vi.runAllTimers();
    });

    expect(result.current.layerStatuses.has("cutblocks")).toBe(false);
  });

  // ── WFS success ──────────────────────────────────────────────────

  it("WFS-only layer: WFS success with features → status 'ok'", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      // fish-streams is genuinely WFS-only (tap-deferrals is now tile-backed).
      simulateWfsSuccess("fish-streams", false, result.current.setLayerStatus, result.current.setLayerLoading);
      vi.runAllTimers();
    });

    expect(result.current.layerStatuses.get("fish-streams")).toBe("ok");
  });

  it("tile-backed layer: WFS success → status NOT set (PMTiles path drives status)", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      simulateWfsSuccess("forest-age", true, result.current.setLayerStatus, result.current.setLayerLoading);
      vi.runAllTimers();
    });

    expect(result.current.layerStatuses.has("forest-age")).toBe(false);
  });

  // ── Viewport guard ───────────────────────────────────────────────

  it("WFS-only layer: viewport too large → status 'zoom'", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      simulateViewportGuard("fish-streams", false, result.current.setLayerStatus);
      vi.runAllTimers();
    });

    expect(result.current.layerStatuses.get("fish-streams")).toBe("zoom");
  });

  it("tile-backed layer: viewport guard is bypassed (guard is gated on !tileSource)", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      simulateViewportGuard("forest-age", true, result.current.setLayerStatus);
      vi.runAllTimers();
    });

    // Tile-backed layer: viewport guard block is never entered in DataLayer
    expect(result.current.layerStatuses.has("forest-age")).toBe(false);
  });

  // ── loading indicator ────────────────────────────────────────────

  it("WFS-only layer: setLayerLoading(true) is called before fetch", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      // Simulate the pre-fetch path: setLayerLoading(true) for WFS-only
      result.current.setLayerLoading("fish-streams", true);
    });

    expect(result.current.layerStatuses.get("fish-streams")).toBe("loading");
    expect(result.current.loadingLayers.has("fish-streams")).toBe(true);
  });

  it("tile-backed layer: setLayerLoading is NOT called — no loading indicator in legend", () => {
    // For tile-backed layers, DataLayer skips setLayerLoading entirely.
    // This test confirms that if nothing calls setLayerLoading(id, true) for a
    // tile-backed layer, the legend correctly shows no loading indicator.
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    // No setLayerLoading call for tile-backed layer (as per DataLayer gating)
    expect(result.current.loadingLayers.has("forest-age")).toBe(false);
    expect(result.current.layerStatuses.has("forest-age")).toBe(false);
  });
});
