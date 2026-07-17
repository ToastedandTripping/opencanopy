/**
 * B3 (WCAG 2.1.1) -- "Select visible area" keyboard entry point.
 *
 * boundsToSelectionBBox() converts a map viewport's bounds into the exact
 * SelectionBBox shape a manual box-draw produces, using the SAME
 * bboxPolygon() DrawTool's mouse handlers call -- this is the whole point:
 * the keyboard path and the mouse path must be geometrically identical, not
 * just "close enough". page.tsx's handleSelectVisibleArea feeds the result
 * straight into the existing handleSelectionChange -> runCalculation spine
 * (zero downstream change, not re-tested here -- that wiring is
 * pre-existing and already exercised via the DrawTool mouse path).
 */

import { describe, it, expect } from "vitest";
import { bboxPolygon, boundsToSelectionBBox, type BoundsLike } from "@/components/map/DrawTool";

function bounds(west: number, south: number, east: number, north: number): BoundsLike {
  return {
    getWest: () => west,
    getSouth: () => south,
    getEast: () => east,
    getNorth: () => north,
  };
}

describe("boundsToSelectionBBox", () => {
  it("returns a bbox array in [west, south, east, north] order", () => {
    const sel = boundsToSelectionBBox(bounds(-125.5, 49.1, -124.9, 49.6));
    expect(sel.bbox).toEqual([-125.5, 49.1, -124.9, 49.6]);
  });

  it("produces the exact same polygon geometry bboxPolygon() would for the same corners (mouse/keyboard parity)", () => {
    const sel = boundsToSelectionBBox(bounds(-123.2, 48.9, -122.5, 49.4));
    const expected = bboxPolygon(-123.2, 48.9, -122.5, 49.4);
    expect(sel.polygon).toEqual(expected);
  });

  it("produces a closed rectangular ring covering exactly the given bounds", () => {
    const sel = boundsToSelectionBBox(bounds(-120, 50, -119, 51));
    const ring = sel.polygon.geometry.coordinates[0];
    // Closed ring: first and last coordinate identical.
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    // All four corners of the bbox are present.
    const asSet = new Set(ring.map((c) => c.join(",")));
    expect(asSet.has("-120,50")).toBe(true);
    expect(asSet.has("-119,50")).toBe(true);
    expect(asSet.has("-119,51")).toBe(true);
    expect(asSet.has("-120,51")).toBe(true);
  });

  it("normalizes corners even if a caller's bounds object reports them out of min/max order", () => {
    // Not expected from a real maplibregl.LngLatBounds, but bboxPolygon's
    // own Math.min/max normalization must still hold through this wrapper.
    // getWest/getNorth swapped with getEast/getSouth: west=-119 (> east),
    // north=50 (< south) -- the wrapper must still normalize to
    // west=-120, east=-119, south=50, north=51.
    const sel = boundsToSelectionBBox(bounds(-119, 51, -120, 50));
    const ring = sel.polygon.geometry.coordinates[0];
    const asSet = new Set(ring.map((c) => c.join(",")));
    expect(asSet.has("-120,50")).toBe(true);
    expect(asSet.has("-119,50")).toBe(true);
    expect(asSet.has("-119,51")).toBe(true);
    expect(asSet.has("-120,51")).toBe(true);
  });
});
