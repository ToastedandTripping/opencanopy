/**
 * useGlobalStateYear: the single writer of MapLibre's `currentYear` (R1-02,
 * Amendment A).
 *
 * The defects it replaces: page.tsx guarded the write with `isStyleLoaded()`,
 * false whenever a tile is in flight, so ticks were silently dropped; and the
 * load-time write hung off `load`, which on production did not fire until the
 * visitor interacted. Readiness is now `onStyleReady` (style JSON parsed).
 *
 * The hook takes the map instance (MapStyleSync passes useMap()'s), stable
 * across renders here as in production.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { createMockMap, type MockMap } from "@/test/mocks/maplibre";
import { DEFAULT_RANGE } from "@/hooks/useTimeline";
import { useGlobalStateYear, type GlobalStateYearMap } from "./useGlobalStateYear";

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
});

function setup(initial: number | null | undefined) {
  const map = mockMap as unknown as GlobalStateYearMap;
  return renderHook(
    ({ year }: { year: number | null | undefined }) => useGlobalStateYear(map, year),
    { initialProps: { year: initial } },
  );
}

/** The style JSON finishes parsing. */
function styleReady() {
  mockMap._setStyleLoaded(true);
  mockMap._emit("style.load");
}

describe("useGlobalStateYear", () => {
  it("11: writes a year change while tiles are loading (isStyleLoaded false)", () => {
    const { rerender } = setup(1960); // style parsed: latched on mount
    mockMap._setTilesPending(true); // a tile is in flight
    expect(mockMap.isStyleLoaded()).toBe(false);
    rerender({ year: 1975 });
    expect(lastWrite()).toEqual({ name: "currentYear", value: 1975 });
    expect(mockMap.getGlobalState()).toEqual({ currentYear: 1975 });
  });

  it("12: a year chosen before the style is ready survives it", () => {
    mockMap._setStyleLoaded(false);
    const { rerender } = setup(null);
    rerender({ year: 1987 });
    expect(writes()).toHaveLength(0); // not ready: nothing written
    styleReady();
    expect(lastWrite()).toEqual({ name: "currentYear", value: 1987 });
  });

  it("13: with no year chosen before ready, it writes DEFAULT_RANGE[0]", () => {
    mockMap._setStyleLoaded(false);
    setup(null);
    styleReady();
    expect(writes()).toEqual([{ name: "currentYear", value: DEFAULT_RANGE[0] }]);
  });

  it("14: a null year never writes", () => {
    const { rerender } = setup(1990);
    const before = writes().length;
    rerender({ year: null });
    rerender({ year: undefined });
    expect(writes()).toHaveLength(before);
    expect(lastWrite()).toEqual({ name: "currentYear", value: 1990 });
  });

  it("15: rerendering with an unchanged year writes nothing", () => {
    const { rerender } = setup(2001);
    rerender({ year: 2002 });
    const before = writes().length;
    rerender({ year: 2002 });
    rerender({ year: 2002 });
    expect(writes()).toHaveLength(before);
    expect(lastWrite()).toEqual({ name: "currentYear", value: 2002 });
  });
});
