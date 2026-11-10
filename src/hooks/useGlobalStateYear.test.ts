/**
 * useGlobalStateYear: the single writer of MapLibre's `currentYear` (R1-02).
 *
 * The defect it replaces: page.tsx guarded the write with `map.isStyleLoaded()`,
 * which is false whenever a tile is in flight, so ticks were silently dropped,
 * and CanopyMap's onLoad wrote DEFAULT_RANGE[0] over a year chosen before load.
 *
 * One ref object is created outside the renderHook callback, as CanopyMap's
 * useRef does, so the hook's `[yearFilter, mapRef]` deps are stable.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { MapRef } from "react-map-gl/maplibre";
import { createMockMap, type MockMap } from "@/test/mocks/maplibre";
import { DEFAULT_RANGE } from "@/hooks/useTimeline";
import { useGlobalStateYear } from "./useGlobalStateYear";

let mockMap: MockMap;
let mapRef: { current: MapRef | null };

function writes() {
  return mockMap._getCalls().setGlobalState;
}
function lastWrite() {
  const w = writes();
  return w[w.length - 1];
}

beforeEach(() => {
  mockMap = createMockMap();
  mapRef = { current: { getMap: () => mockMap } as unknown as MapRef };
});

function setup(initial: number | null | undefined) {
  return renderHook(
    ({ year }: { year: number | null | undefined }) => useGlobalStateYear(mapRef, year),
    { initialProps: { year: initial } },
  );
}

describe("useGlobalStateYear", () => {
  it("11: writes a year change while tiles are loading (isStyleLoaded false)", () => {
    const { result, rerender } = setup(1960);
    result.current(); // load fired
    mockMap._setStyleLoaded(false); // a tile is in flight
    rerender({ year: 1975 });
    expect(lastWrite()).toEqual({ name: "currentYear", value: 1975 });
    expect(mockMap.getGlobalState()).toEqual({ currentYear: 1975 });
  });

  it("12: a year chosen before load survives load", () => {
    const { result, rerender } = setup(null);
    rerender({ year: 1987 });
    expect(writes()).toHaveLength(0); // not yet loaded: nothing written
    result.current();
    expect(lastWrite()).toEqual({ name: "currentYear", value: 1987 });
  });

  it("13: with no year chosen before load, load writes DEFAULT_RANGE[0]", () => {
    const { result } = setup(null);
    result.current();
    expect(writes()).toEqual([{ name: "currentYear", value: DEFAULT_RANGE[0] }]);
  });

  it("14: a null year never writes", () => {
    const { result, rerender } = setup(1990);
    result.current();
    const before = writes().length;
    rerender({ year: null });
    rerender({ year: undefined });
    expect(writes()).toHaveLength(before);
    expect(lastWrite()).toEqual({ name: "currentYear", value: 1990 });
  });

  it("15: rerendering with an unchanged year writes nothing", () => {
    const { result, rerender } = setup(2001);
    result.current();
    rerender({ year: 2002 });
    const before = writes().length;
    rerender({ year: 2002 });
    rerender({ year: 2002 });
    expect(writes()).toHaveLength(before);
    expect(lastWrite()).toEqual({ name: "currentYear", value: 2002 });
  });
});
