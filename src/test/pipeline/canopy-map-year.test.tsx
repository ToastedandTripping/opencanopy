/**
 * Rendered CanopyMap: the year reaches MapLibre's `currentYear` through
 * CanopyMap's own wiring of useGlobalStateYear (R1-02).
 *
 * The hook tests prove the hook; these prove CanopyMap calls `onStyleLoad()`
 * from its real `onLoad` and passes its `yearFilter` prop through, which the
 * hook tests cannot see.
 *
 * Harness: react-map-gl/maplibre's `Map` is a forwardRef stub whose handle
 * returns the mock map from `getMap()` and which captures `props.onLoad` so
 * the test fires it on demand. DataLayer, MapReadout, MapPopup and the three
 * controls are stubbed; maplibre-gl's import-time `setWorkerUrl` and
 * `addProtocol` are mocked.
 *
 * Divergences NOT covered: a real MapLibre `load` event and real tile loading
 * (happy-dom, no WebGL); the terrain block, which never runs without the
 * MapTiler key (its ordering is guarded by the source-text audit test 19).
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
    harness.onLoad = props.onLoad ?? null;
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

function fireLoad() {
  expect(harness.onLoad).toBeTypeOf("function");
  act(() => {
    harness.onLoad!();
  });
}

describe("CanopyMap writes currentYear through useGlobalStateYear", () => {
  it("16: a year set before load is written on load, and later ticks follow", () => {
    const { rerender } = render(<CanopyMap enabledLayers={[]} yearFilter={1987} />);
    expect(writes()).toHaveLength(0);

    fireLoad();
    expect(lastWrite()).toEqual({ name: "currentYear", value: 1987 });

    rerender(<CanopyMap enabledLayers={[]} yearFilter={1990} />);
    expect(lastWrite()).toEqual({ name: "currentYear", value: 1990 });
  });

  it("17: with no year before load, load writes DEFAULT_RANGE[0]", () => {
    render(<CanopyMap enabledLayers={[]} yearFilter={null} />);
    fireLoad();
    expect(lastWrite()).toEqual({ name: "currentYear", value: DEFAULT_RANGE[0] });
  });
});
