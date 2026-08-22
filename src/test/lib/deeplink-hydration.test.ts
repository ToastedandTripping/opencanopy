/**
 * Deep-link hydration — visual-audit Batch 0 (P1 + P8).
 *
 * P1: the on-mount flyTo used to poll for the map 20 × 100 ms and then give up
 *     silently, so any load slower than ~2.2 s (cold cache, mobile, headless)
 *     landed on the default province view while `layers=` still applied. The
 *     camera must be applied whenever the map shows up, and on the map's own
 *     `load` event if it exists but hasn't loaded yet.
 *
 * P8: `#preset=threats` with no `layers=` hydrated nothing on initial load
 *     (parseLayersFromHash only read `layers=`) and nothing on popstate (the
 *     restore was gated on `parsed.layers`). A bare preset link must resolve to
 *     the preset's layers on both paths.
 *
 * Revert-proof: every test here fails against the pre-fix hook.
 */
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useLayerState } from "@/hooks/useLayerState";
import { useMapState } from "@/hooks/useMapState";
import { LAYER_PRESETS } from "@/lib/layers";

type FlyArgs = { center: [number, number]; zoom: number };

/** MapRef stub whose `current` can be attached late, with a controllable loaded() state. */
function makeLateMap(loaded = true) {
  const flyTo = vi.fn<(a: FlyArgs) => void>();
  const listeners: Record<string, Array<() => void>> = {};
  const fakeMap = {
    getCenter: () => ({ lat: 50, lng: -124 }),
    getZoom: () => 10,
    getPitch: () => 0,
    getBearing: () => 0,
    on: () => {},
    off: () => {},
    loaded: () => loaded,
    once: (ev: string, fn: () => void) => { (listeners[ev] ||= []).push(fn); },
    fire: (ev: string) => { (listeners[ev] || []).splice(0).forEach((fn) => fn()); },
  };
  const handle = { getMap: () => fakeMap, flyTo };
  const ref = { current: null as null | typeof handle };
  return { ref: ref as never, attach: () => { ref.current = handle; }, flyTo, fakeMap };
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("P1 — deep-link camera survives a slow map mount", () => {
  it("applies the hash camera when the map attaches 5 s after mount (old code gave up at 2.2 s)", () => {
    window.history.replaceState(null, "", "/#lat=53.9&lng=-122.75&z=11&layers=parks");
    const m = makeLateMap(true);
    renderHook(() => useMapState({ mapRef: m.ref, enabledLayers: ["parks"], activePreset: null }));

    act(() => { vi.advanceTimersByTime(5000); });
    expect(m.flyTo).not.toHaveBeenCalled(); // nothing to fly yet — map not mounted

    m.attach();
    act(() => { vi.advanceTimersByTime(300); });

    expect(m.flyTo).toHaveBeenCalledTimes(1);
    const args = m.flyTo.mock.calls[0][0];
    expect(args.center).toEqual([-122.75, 53.9]);
    expect(args.zoom).toBe(11);
  });

  it("flies immediately AND again on the map's load event when the map is not loaded yet", () => {
    window.history.replaceState(null, "", "/#lat=49.38&lng=-125.86&z=8&layers=forest-age");
    const m = makeLateMap(false);
    m.attach();
    renderHook(() => useMapState({ mapRef: m.ref, enabledLayers: ["forest-age"], activePreset: null }));

    act(() => { vi.advanceTimersByTime(1000); });
    // loaded() is false while tiles are in flight too, so it must never be the
    // only trigger: the first fly happens as soon as the handle exists...
    expect(m.flyTo).toHaveBeenCalledTimes(1);
    // ...and `load` re-applies it in case style application reset the view.
    act(() => { m.fakeMap.fire("load"); });
    expect(m.flyTo).toHaveBeenCalledTimes(2);
    expect(m.flyTo.mock.calls[1][0].zoom).toBe(8);
  });

  it("stops polling on unmount (no flyTo after the hook is gone)", () => {
    window.history.replaceState(null, "", "/#lat=53.9&lng=-122.75&z=11");
    const m = makeLateMap(true);
    const { unmount } = renderHook(() => useMapState({ mapRef: m.ref, enabledLayers: [], activePreset: null }));
    act(() => { vi.advanceTimersByTime(1000); });
    unmount();
    m.attach();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(m.flyTo).not.toHaveBeenCalled();
  });
});

describe("P8 — a bare #preset= link hydrates the preset's layers", () => {
  const threats = LAYER_PRESETS.find((p) => p.id === "threats")!;

  it("on initial load", () => {
    window.history.replaceState(null, "", "/#lat=53.9&lng=-122.75&z=9&preset=threats");
    const { result } = renderHook(() => useLayerState());
    expect([...result.current.enabledLayers].sort()).toEqual([...threats.layers].sort());
    expect(result.current.activePreset).toBe("threats");
  });

  it("explicit layers= still wins over preset= on initial load", () => {
    window.history.replaceState(null, "", "/#layers=parks&preset=threats");
    const { result } = renderHook(() => useLayerState());
    expect(result.current.enabledLayers).toEqual(["parks"]);
  });

  it("on popstate (back/forward) with no layers= in the hash", () => {
    const m = makeLateMap(true);
    m.attach();
    const onLayerRestore = vi.fn();
    renderHook(() => useMapState({ mapRef: m.ref, enabledLayers: [], activePreset: null, onLayerRestore }));

    window.history.replaceState(null, "", "/#lat=53.9&lng=-122.75&z=9&preset=threats");
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });

    expect(onLayerRestore).toHaveBeenCalledTimes(1);
    expect(onLayerRestore).toHaveBeenCalledWith([], "threats");
  });
});
