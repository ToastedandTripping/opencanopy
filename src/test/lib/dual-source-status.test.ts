/**
 * Dual-source status rule — unit tests
 *
 * The rule: WFS-derived terminal status (error / empty / zoom) must only be
 * surfaced for WFS-only layers (!tileSource). Tile-backed layers render via
 * PMTiles with overzoom, so a supplemental WFS failure is not user-visible
 * and must NOT produce an error indicator.
 *
 * These tests validate the REAL gating functions (resolveWfsStatus,
 * shouldSurfaceWfsLoading) extracted from DataLayer.tsx, then exercise them
 * against LoadingContext to verify end-to-end status propagation.
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
import { resolveWfsStatus, shouldSurfaceWfsLoading } from "@/lib/data/wfs-status";
import type { WfsTerminalStatus } from "@/lib/data/wfs-status";

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(LoadingProvider, null, children);
}

/**
 * Apply the real gating logic to set layer status + loading, mirroring
 * exactly what DataLayer does. Uses the extracted shared functions —
 * no re-implementation of the gating condition.
 */
function applyWfsOutcome(
  layerId: string,
  hasTileSource: boolean,
  outcome: WfsTerminalStatus,
  setLayerStatus: (id: string, status: "error" | "empty" | "zoom" | "ok" | "loading") => void,
  setLayerLoading: (id: string, loading: boolean) => void,
) {
  const status = resolveWfsStatus(hasTileSource, outcome);
  if (status) setLayerStatus(layerId, status);
  if (shouldSurfaceWfsLoading(hasTileSource)) {
    setLayerLoading(layerId, false);
  }
}

describe("resolveWfsStatus — pure function", () => {
  it("returns the outcome for WFS-only layers", () => {
    expect(resolveWfsStatus(false, "error")).toBe("error");
    expect(resolveWfsStatus(false, "empty")).toBe("empty");
    expect(resolveWfsStatus(false, "zoom")).toBe("zoom");
    expect(resolveWfsStatus(false, "ok")).toBe("ok");
  });

  it("returns null for tile-backed layers", () => {
    expect(resolveWfsStatus(true, "error")).toBeNull();
    expect(resolveWfsStatus(true, "empty")).toBeNull();
    expect(resolveWfsStatus(true, "zoom")).toBeNull();
    expect(resolveWfsStatus(true, "ok")).toBeNull();
  });
});

describe("shouldSurfaceWfsLoading — pure function", () => {
  it("returns true for WFS-only layers", () => {
    expect(shouldSurfaceWfsLoading(false)).toBe(true);
  });

  it("returns false for tile-backed layers", () => {
    expect(shouldSurfaceWfsLoading(true)).toBe(false);
  });
});

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
      applyWfsOutcome("fish-streams", false, "error", result.current.setLayerStatus, result.current.setLayerLoading);
      vi.runAllTimers(); // flush debounce
    });

    expect(result.current.layerStatuses.get("fish-streams")).toBe("error");
  });

  it("tile-backed layer: WFS fetch error → status NOT set (PMTiles still render)", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      applyWfsOutcome("forest-age", true, "error", result.current.setLayerStatus, result.current.setLayerLoading);
      vi.runAllTimers();
    });

    // Status should be absent — no indicator for a layer whose tiles are fine
    expect(result.current.layerStatuses.has("forest-age")).toBe(false);
  });

  // ── WFS empty ────────────────────────────────────────────────────

  it("WFS-only layer: WFS returns empty FeatureCollection → status 'empty'", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      applyWfsOutcome("species-at-risk", false, "empty", result.current.setLayerStatus, result.current.setLayerLoading);
      vi.runAllTimers();
    });

    expect(result.current.layerStatuses.get("species-at-risk")).toBe("empty");
  });

  it("tile-backed layer: WFS returns empty FeatureCollection → status NOT changed", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      applyWfsOutcome("cutblocks", true, "empty", result.current.setLayerStatus, result.current.setLayerLoading);
      vi.runAllTimers();
    });

    expect(result.current.layerStatuses.has("cutblocks")).toBe(false);
  });

  // ── WFS success ──────────────────────────────────────────────────

  it("WFS-only layer: WFS success with features → status 'ok'", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      applyWfsOutcome("fish-streams", false, "ok", result.current.setLayerStatus, result.current.setLayerLoading);
      vi.runAllTimers();
    });

    expect(result.current.layerStatuses.get("fish-streams")).toBe("ok");
  });

  it("tile-backed layer: WFS success → status NOT set (PMTiles path drives status)", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      applyWfsOutcome("forest-age", true, "ok", result.current.setLayerStatus, result.current.setLayerLoading);
      vi.runAllTimers();
    });

    expect(result.current.layerStatuses.has("forest-age")).toBe(false);
  });

  // ── Viewport guard ───────────────────────────────────────────────

  it("WFS-only layer: viewport too large → status 'zoom'", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      const status = resolveWfsStatus(false, "zoom");
      if (status) result.current.setLayerStatus("fish-streams", status);
      vi.runAllTimers();
    });

    expect(result.current.layerStatuses.get("fish-streams")).toBe("zoom");
  });

  it("tile-backed layer: viewport guard is bypassed (guard is gated on !tileSource)", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      const status = resolveWfsStatus(true, "zoom");
      if (status) result.current.setLayerStatus("forest-age", status);
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
      if (shouldSurfaceWfsLoading(false)) {
        result.current.setLayerLoading("fish-streams", true);
      }
    });

    expect(result.current.layerStatuses.get("fish-streams")).toBe("loading");
    expect(result.current.loadingLayers.has("fish-streams")).toBe(true);
  });

  it("tile-backed layer: setLayerLoading is NOT called — no loading indicator in legend", () => {
    // For tile-backed layers, DataLayer skips setLayerLoading entirely.
    // This test confirms that if nothing calls setLayerLoading(id, true) for a
    // tile-backed layer, the legend correctly shows no loading indicator.
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    // shouldSurfaceWfsLoading(true) returns false — no setLayerLoading call
    expect(shouldSurfaceWfsLoading(true)).toBe(false);
    expect(result.current.loadingLayers.has("forest-age")).toBe(false);
    expect(result.current.layerStatuses.has("forest-age")).toBe(false);
  });
});
