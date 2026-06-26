/**
 * Layer mutual-exclusivity guard
 *
 * "forest-age" and "logging-risk" share PMTiles source-layer "forest-age".
 * Enabling one must auto-disable the other to prevent conflicting fills.
 */

import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useLayerState } from "@/hooks/useLayerState";

beforeEach(() => {
  // Clear localStorage and URL hash between tests
  localStorage.clear();
  window.location.hash = "";
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  window.location.hash = "";
});

describe("useLayerState — shared-source mutual exclusivity", () => {
  it("enabling forest-age auto-disables logging-risk when it was active", () => {
    const { result } = renderHook(() => useLayerState());

    // Manually set logging-risk as active
    act(() => {
      result.current.toggleLayer("logging-risk");
    });
    expect(result.current.enabledLayers).toContain("logging-risk");

    // Enable forest-age — should kick out logging-risk
    act(() => {
      result.current.toggleLayer("forest-age");
    });

    expect(result.current.enabledLayers).toContain("forest-age");
    expect(result.current.enabledLayers).not.toContain("logging-risk");
  });

  it("enabling logging-risk auto-disables forest-age when it was active", () => {
    const { result } = renderHook(() => useLayerState());

    act(() => {
      result.current.toggleLayer("forest-age");
    });
    expect(result.current.enabledLayers).toContain("forest-age");

    act(() => {
      result.current.toggleLayer("logging-risk");
    });

    expect(result.current.enabledLayers).toContain("logging-risk");
    expect(result.current.enabledLayers).not.toContain("forest-age");
  });

  it("enabling forest-age alone (no logging-risk active) works normally", () => {
    const { result } = renderHook(() => useLayerState());

    act(() => {
      result.current.toggleLayer("forest-age");
    });

    expect(result.current.enabledLayers).toContain("forest-age");
  });

  it("disabling forest-age normally does not affect logging-risk", () => {
    const { result } = renderHook(() => useLayerState());

    act(() => {
      result.current.toggleLayer("forest-age");
    });
    expect(result.current.enabledLayers).toContain("forest-age");

    // Disable forest-age
    act(() => {
      result.current.toggleLayer("forest-age");
    });

    expect(result.current.enabledLayers).not.toContain("forest-age");
    expect(result.current.enabledLayers).not.toContain("logging-risk");
  });

  it("other layers are not affected by the exclusivity guard", () => {
    const { result } = renderHook(() => useLayerState());

    act(() => {
      result.current.toggleLayer("parks");
      result.current.toggleLayer("forest-age");
    });

    // Parks should still be present after forest-age is enabled
    expect(result.current.enabledLayers).toContain("parks");
    expect(result.current.enabledLayers).toContain("forest-age");
  });
});

describe("useLayerState — setLayers validation and mutual exclusivity", () => {
  it("setLayers drops layer IDs not in the available registry", () => {
    const { result } = renderHook(() => useLayerState());

    act(() => {
      result.current.setLayers(["parks", "forest-age", "logging-risk"]);
    });

    // logging-risk is hidden from the public surface → silently dropped
    expect(result.current.enabledLayers).toContain("parks");
    expect(result.current.enabledLayers).toContain("forest-age");
    expect(result.current.enabledLayers).not.toContain("logging-risk");
  });

  it("setLayers with only valid IDs works normally", () => {
    const { result } = renderHook(() => useLayerState());

    act(() => {
      result.current.setLayers(["forest-age", "parks"]);
    });

    expect(result.current.enabledLayers).toContain("forest-age");
    expect(result.current.enabledLayers).toContain("parks");
  });

  it("setLayers with entirely invalid IDs results in empty enabled set", () => {
    const { result } = renderHook(() => useLayerState());

    act(() => {
      result.current.setLayers(["logging-risk", "fish-streams"]);
    });

    expect(result.current.enabledLayers).toHaveLength(0);
  });
});
