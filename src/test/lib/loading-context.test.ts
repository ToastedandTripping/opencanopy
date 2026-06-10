/**
 * LoadingContext — per-layer status model
 *
 * Tests:
 * 1. Back-compat: setLayerLoading(id, true/false) maps to loading/ok correctly
 * 2. setLayerStatus writes the expected status
 * 3. clearLayerStatus removes a layer
 * 4. Error status takes precedence — setLayerLoading(false) won't overwrite "error"
 * 5. loadingLayers Set is derived correctly from the status map
 * 6. Rapid-transition regression: setting loading then a terminal status
 *    correctly produces the terminal status (debounce bypassed with fake timers)
 */

import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { LoadingProvider, useLoadingContext } from "@/contexts/LoadingContext";

// Wrapper factory to provide context
function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(LoadingProvider, null, children);
}

describe("LoadingContext — per-layer status map", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("back-compat: setLayerLoading(id, true) sets status to loading", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      result.current.setLayerLoading("forest-age", true);
    });

    expect(result.current.layerStatuses.get("forest-age")).toBe("loading");
    expect(result.current.loadingLayers.has("forest-age")).toBe(true);
  });

  it("back-compat: setLayerLoading(id, false) transitions loading→ok", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      result.current.setLayerLoading("forest-age", true);
    });
    // "false" sets loading→ok immediately (bypasses debounce in setLayerLoading)
    act(() => {
      result.current.setLayerLoading("forest-age", false);
    });

    expect(result.current.layerStatuses.get("forest-age")).toBe("ok");
    expect(result.current.loadingLayers.has("forest-age")).toBe(false);
  });

  it("setLayerStatus sets the authoritative status", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      result.current.setLayerStatus("fish-streams", "empty");
      vi.runAllTimers(); // flush debounce
    });

    expect(result.current.layerStatuses.get("fish-streams")).toBe("empty");
  });

  it("setLayerStatus('error') reports error status after debounce", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      result.current.setLayerStatus("parks", "error");
      vi.runAllTimers();
    });

    expect(result.current.layerStatuses.get("parks")).toBe("error");
  });

  it("setLayerStatus('zoom') reports zoom status after debounce", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      result.current.setLayerStatus("fish-streams", "zoom");
      vi.runAllTimers();
    });

    expect(result.current.layerStatuses.get("fish-streams")).toBe("zoom");
  });

  it("clearLayerStatus removes a layer from the map", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      result.current.setLayerLoading("forest-age", true);
      result.current.clearLayerStatus("forest-age");
    });

    expect(result.current.layerStatuses.has("forest-age")).toBe(false);
    expect(result.current.loadingLayers.has("forest-age")).toBe(false);
  });

  it("error status is NOT overwritten by setLayerLoading(false) — preserves terminal state", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      // Simulate: start loading, then error fires before finally-block runs
      result.current.setLayerLoading("parks", true);
    });
    act(() => {
      result.current.setLayerStatus("parks", "error");
      vi.runAllTimers(); // flush debounce → status is now "error"
    });
    act(() => {
      // finally-block calls setLayerLoading(false) — should NOT overwrite error
      result.current.setLayerLoading("parks", false);
    });

    expect(result.current.layerStatuses.get("parks")).toBe("error");
    expect(result.current.loadingLayers.has("parks")).toBe(false);
  });

  it("loadingLayers accurately reflects all layers in loading state", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      result.current.setLayerLoading("forest-age", true);
      result.current.setLayerLoading("parks", true);
    });

    expect(result.current.loadingLayers.size).toBe(2);
    expect(result.current.loadingLayers.has("forest-age")).toBe(true);
    expect(result.current.loadingLayers.has("parks")).toBe(true);
  });

  it("rapid-moveend regression: rapid status transitions settle correctly after debounce", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    // Simulate 3 rapid pan/zoom events producing: loading → ok → loading → empty
    act(() => {
      result.current.setLayerStatus("fish-streams", "loading"); // immediate
    });
    act(() => {
      result.current.setLayerStatus("fish-streams", "ok"); // debounced
    });
    act(() => {
      result.current.setLayerStatus("fish-streams", "loading"); // immediate
    });
    act(() => {
      result.current.setLayerStatus("fish-streams", "empty"); // debounced
    });

    // Before debounce flushes: loading (immediate) is the live state
    expect(result.current.layerStatuses.get("fish-streams")).toBe("loading");

    // After debounce: only the last terminal status fires
    act(() => {
      vi.runAllTimers();
    });

    expect(result.current.layerStatuses.get("fish-streams")).toBe("empty");
    expect(result.current.loadingLayers.has("fish-streams")).toBe(false);
  });

  it("rapid error transitions: error clears the loading indicator", () => {
    const { result } = renderHook(() => useLoadingContext(), { wrapper });

    act(() => {
      result.current.setLayerStatus("parks", "loading");
    });

    expect(result.current.loadingLayers.has("parks")).toBe(true);

    act(() => {
      result.current.setLayerStatus("parks", "error");
      vi.runAllTimers();
    });

    expect(result.current.layerStatuses.get("parks")).toBe("error");
    expect(result.current.loadingLayers.has("parks")).toBe(false);
  });
});
