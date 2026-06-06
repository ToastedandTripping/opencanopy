/**
 * URL <-> layer-state history behavior.
 *
 * Regression test for the shared-link Back-button trap: useLayerState hydrates
 * layers from the URL in a post-mount effect (a second render). useMapState must
 * seed its URL-sync baseline from the SAME resolved value so that hydration
 * render does NOT push a spurious history entry. A genuine user toggle still
 * must push.
 */

import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useLayerState } from "@/hooks/useLayerState";
import { useMapState } from "@/hooks/useMapState";

/** Minimal MapRef stub sufficient for useMapState's URL-sync effects. */
function makeMapRef() {
  const fakeMap = {
    getCenter: () => ({ lat: 50, lng: -124 }),
    getZoom: () => 10,
    getPitch: () => 0,
    getBearing: () => 0,
    on: () => {},
    off: () => {},
  };
  return { current: { getMap: () => fakeMap, flyTo: () => {} } } as never;
}

function useComposed(mapRef: ReturnType<typeof makeMapRef>) {
  const ls = useLayerState();
  useMapState({
    mapRef,
    enabledLayers: ls.enabledLayers,
    activePreset: ls.activePreset,
    onLayerRestore: () => {},
  });
  return ls;
}

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/"); // reset hash
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

describe("shared #layers= link does not trap the Back button", () => {
  it("hydrating layers from the URL pushes NO history entry", () => {
    window.history.replaceState(null, "", "/#layers=cutblocks");
    const mapRef = makeMapRef();
    const pushSpy = vi.spyOn(window.history, "pushState");

    const { result } = renderHook(() => useComposed(mapRef));

    // Layers hydrated from the URL...
    expect(result.current.enabledLayers).toEqual(["cutblocks"]);
    // ...but that hydration must NOT have pushed a history entry.
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("a genuine layer toggle after hydration DOES push once", () => {
    window.history.replaceState(null, "", "/#layers=cutblocks");
    const mapRef = makeMapRef();
    const pushSpy = vi.spyOn(window.history, "pushState");

    const { result } = renderHook(() => useComposed(mapRef));
    expect(pushSpy).not.toHaveBeenCalled();

    act(() => result.current.toggleLayer("parks"));

    expect(result.current.enabledLayers).toContain("parks");
    expect(pushSpy).toHaveBeenCalledTimes(1);
  });
});

describe("fresh visit (no URL layers)", () => {
  it("pushes nothing on load and once on the first user toggle", () => {
    const mapRef = makeMapRef();
    const pushSpy = vi.spyOn(window.history, "pushState");

    const { result } = renderHook(() => useComposed(mapRef));
    expect(pushSpy).not.toHaveBeenCalled();

    act(() => result.current.toggleLayer("parks"));
    expect(pushSpy).toHaveBeenCalledTimes(1);
  });
});
