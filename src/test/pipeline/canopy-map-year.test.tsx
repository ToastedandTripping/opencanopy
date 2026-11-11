/**
 * Rendered CanopyMap: the year reaches MapLibre's `currentYear` through
 * CanopyMap's MapStyleSync child (R1-02, Amendment A).
 *
 * The hook tests prove the hook; these prove CanopyMap mounts MapStyleSync
 * inside `<Map>` and passes its `yearFilter` prop through, and that nothing
 * waits for `load` (test 22: style parsed, tiles pending, `load` never fired).
 *
 * Harness: react-map-gl/maplibre's `Map` is a forwardRef stub that renders
 * its children; `useMap()` returns a handle whose `getMap()` is the mock map.
 * DataLayer, MapReadout, MapPopup and the three controls are stubbed;
 * maplibre-gl's import-time `setWorkerUrl` and `addProtocol` are mocked.
 *
 * Divergences NOT covered: a real MapLibre style parse and real tile loading
 * (happy-dom, no WebGL); the terrain block, which never runs without the
 * MapTiler key.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { createMockMap, type MockMap } from "../mocks/maplibre";
import { DEFAULT_RANGE } from "@/hooks/useTimeline";

const harness = vi.hoisted(() => ({
  mockMap: null as unknown,
  onLoad: null as null | (() => void),
}));

vi.mock("react-map-gl/maplibre", async () => {
  const { forwardRef: fwd, useImperativeHandle: useHandle } = await import("react");
  const MapStub = fwd(function MapStub(
    props: { onLoad?: () => void; children?: React.ReactNode },
    ref: React.Ref<unknown>,
  ) {
    useHandle(ref, () => ({ getMap: () => harness.mockMap }));
    harness.onLoad = props.onLoad ?? null; // must stay null: no onLoad prop
    return <div data-testid="map-stub">{props.children}</div>;
  });
  return {
    default: MapStub,
    NavigationControl: () => null,
    ScaleControl: () => null,
    GeolocateControl: () => null,
    useMap: () => ({ current: { getMap: () => harness.mockMap } }),
  };
});

vi.mock("maplibre-gl", () => ({
  default: {},
  setWorkerUrl: vi.fn(),
  addProtocol: vi.fn(),
}));

vi.mock("@/components/map/DataLayer", () => ({ DataLayer: () => null }));
vi.mock("@/components/map/MapReadout", () => ({ MapReadout: () => null }));
vi.mock("@/components/map/MapPopup", () => ({ MapPopup: () => null }));

// Imported after the mocks are registered (vi.mock is hoisted).
import { CanopyMap } from "@/components/map/CanopyMap";

let mockMap: MockMap;

function writes() {
  return mockMap._getCalls().setGlobalState;
}
function lastWrite() {
  const w = writes();
  return w[w.length - 1];
}

beforeEach(() => {
  mockMap = createMockMap();
  harness.mockMap = mockMap;
  harness.onLoad = null;
});

afterEach(() => {
  cleanup();
});

/** The style JSON finishes parsing. */
function styleReady() {
  act(() => {
    mockMap._setStyleLoaded(true);
    mockMap._emit("style.load");
  });
}

describe("CanopyMap writes currentYear through MapStyleSync", () => {
  it("16: a year set before the style is ready is written when it is, and later ticks follow", () => {
    mockMap._setStyleLoaded(false);
    const { rerender } = render(<CanopyMap enabledLayers={[]} yearFilter={1987} />);
    expect(writes()).toHaveLength(0);

    styleReady();
    expect(lastWrite()).toEqual({ name: "currentYear", value: 1987 });

    rerender(<CanopyMap enabledLayers={[]} yearFilter={1990} />);
    expect(lastWrite()).toEqual({ name: "currentYear", value: 1990 });
  });

  it("17: with no year before ready, it writes DEFAULT_RANGE[0]", () => {
    mockMap._setStyleLoaded(false);
    render(<CanopyMap enabledLayers={[]} yearFilter={null} />);
    styleReady();
    expect(lastWrite()).toEqual({ name: "currentYear", value: DEFAULT_RANGE[0] });
  });

  it("22: style parsed, tiles pending, load never fired: the year is written, and ticks follow", () => {
    mockMap._setTilesPending(true);
    expect(mockMap.isStyleLoaded()).toBe(false);
    const { rerender } = render(<CanopyMap enabledLayers={[]} yearFilter={1987} />);
    expect(lastWrite()).toEqual({ name: "currentYear", value: 1987 });

    rerender(<CanopyMap enabledLayers={[]} yearFilter={2001} />);
    expect(lastWrite()).toEqual({ name: "currentYear", value: 2001 });

    // Nothing in CanopyMap waits on `load`.
    expect(harness.onLoad).toBeNull();
    expect(mockMap._listenerCount("load")).toBe(0);
  });

  it("22b: with no year, style parsed and tiles pending, it writes DEFAULT_RANGE[0]", () => {
    mockMap._setTilesPending(true);
    render(<CanopyMap enabledLayers={[]} yearFilter={null} />);
    expect(lastWrite()).toEqual({ name: "currentYear", value: DEFAULT_RANGE[0] });
  });
});
