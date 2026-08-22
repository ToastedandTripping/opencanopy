/**
 * Deep-link hydration — visual-audit Batch 0 (P1 + P8).
 *
 * P1: the on-mount flyTo used to poll for the map 20 × 100 ms and then give up
 *     silently, so any load slower than ~2.2 s (cold cache, mobile, headless)
 *     landed on the default province view while `layers=` still applied. The
 *     camera must be applied whenever the map shows up — exactly once. (A
 *     re-fly on the map's `load` event was tried and removed: MapLibre honours
 *     an early flyTo, and a late re-fly would yank the camera off a user pan.)
 *
 * P8: `#preset=threats` with no `layers=` hydrated nothing on initial load
 *     (parseLayersFromHash only read `layers=`) and nothing on popstate (the
 *     restore was gated on `parsed.layers`). A bare preset link must resolve to
 *     the preset's layers on both paths.
 *
 * Revert-proof: every test here fails against the pre-fix hook EXCEPT
 * "explicit layers= still wins", which is a regression guard (old code also
 * passed it).
 */
import { StrictMode, createElement, type ReactNode } from "react";
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
  const onceCalls: string[] = [];
  const fakeMap = {
    getCenter: () => ({ lat: 50, lng: -124 }),
    getZoom: () => 10,
    getPitch: () => 0,
    getBearing: () => 0,
    on: () => {},
    off: () => {},
    loaded: () => loaded,
    once: (ev: string, fn: () => void) => { onceCalls.push(ev); (listeners[ev] ||= []).push(fn); },
    fire: (ev: string) => { (listeners[ev] || []).splice(0).forEach((fn) => fn()); },
  };
  const handle = { getMap: () => fakeMap, flyTo };
  const ref = { current: null as null | typeof handle };
  return { ref: ref as never, attach: () => { ref.current = handle; }, flyTo, fakeMap, onceCalls };
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

  it("flies exactly once, immediately, even when the map reports loaded() === false; never subscribes to load", () => {
    window.history.replaceState(null, "", "/#lat=49.38&lng=-125.86&z=8&layers=forest-age");
    const m = makeLateMap(false);
    m.attach();
    renderHook(() => useMapState({ mapRef: m.ref, enabledLayers: ["forest-age"], activePreset: null }));

    act(() => { vi.advanceTimersByTime(1000); });
    expect(m.flyTo).toHaveBeenCalledTimes(1);
    expect(m.flyTo.mock.calls[0][0].zoom).toBe(8);
    // A late re-fly would call stop() over the user's first pan (Razor W1).
    expect(m.onceCalls).not.toContain("load");
    act(() => { m.fakeMap.fire("load"); });
    expect(m.flyTo).toHaveBeenCalledTimes(1);
  });

  it("React StrictMode double-invoke still produces exactly one fly", () => {
    window.history.replaceState(null, "", "/#lat=53.9&lng=-122.75&z=11");
    const m = makeLateMap(true);
    m.attach();
    const wrapper = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children);
    renderHook(() => useMapState({ mapRef: m.ref, enabledLayers: [], activePreset: null }), { wrapper });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(m.flyTo).toHaveBeenCalledTimes(1);
  });

  it("gives up after 120 s if the map never mounts (no forever-timer)", () => {
    window.history.replaceState(null, "", "/#lat=53.9&lng=-122.75&z=11");
    const m = makeLateMap(true);
    renderHook(() => useMapState({ mapRef: m.ref, enabledLayers: [], activePreset: null }));
    act(() => { vi.advanceTimersByTime(130_000); });
    expect(vi.getTimerCount()).toBe(0);
    m.attach();
    act(() => { vi.advanceTimersByTime(5000); });
    expect(m.flyTo).not.toHaveBeenCalled();
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

  it("unknown preset id falls through to stored layers", () => {
    localStorage.setItem("opencanopy-layers-v2", JSON.stringify(["parks"]));
    window.history.replaceState(null, "", "/#preset=nope");
    const { result } = renderHook(() => useLayerState());
    expect(result.current.enabledLayers).toEqual(["parks"]);
  });

  it("layers= with only invalid ids plus preset= resolves to the preset on initial load", () => {
    window.history.replaceState(null, "", "/#layers=bogus,nope&preset=threats");
    const { result } = renderHook(() => useLayerState());
    expect([...result.current.enabledLayers].sort()).toEqual([...threats.layers].sort());
  });

  it("layers= with only invalid ids plus preset= reaches the restore handler as ([], preset) on popstate", () => {
    const m = makeLateMap(true);
    m.attach();
    const onLayerRestore = vi.fn();
    renderHook(() => useMapState({ mapRef: m.ref, enabledLayers: [], activePreset: null, onLayerRestore }));
    window.history.replaceState(null, "", "/#lat=53.9&lng=-122.75&z=9&layers=bogus&preset=threats");
    act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
    // Same URL must resolve the same way on Back/Forward as on a fresh load (Razor W2).
    expect(onLayerRestore).toHaveBeenCalledWith([], "threats");
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
