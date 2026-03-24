import { describe, it, expect } from "vitest";
import { roundBBox, cacheKey } from "@/lib/data/wfs-client";
import type { BBox } from "@/types/layers";

describe("roundBBox", () => {
  it("rounds to 1 decimal place (precision=1)", () => {
    const bbox: BBox = [-125.5678, 48.1234, -124.9876, 49.5432];
    const result = roundBBox(bbox, 1);
    expect(result).toEqual([-125.6, 48.1, -125.0, 49.5]);
  });

  it("rounds to 2 decimal places (precision=2)", () => {
    const bbox: BBox = [-125.5678, 48.1234, -124.9876, 49.5432];
    const result = roundBBox(bbox, 2);
    expect(result).toEqual([-125.57, 48.12, -124.99, 49.54]);
  });

  it("rounds to 3 decimal places (precision=3)", () => {
    const bbox: BBox = [-125.5678, 48.1234, -124.9876, 49.5432];
    const result = roundBBox(bbox, 3);
    expect(result).toEqual([-125.568, 48.123, -124.988, 49.543]);
  });

  it("handles already-rounded values", () => {
    const bbox: BBox = [-126, 48, -124, 50];
    const result = roundBBox(bbox, 2);
    expect(result).toEqual([-126, 48, -124, 50]);
  });

  it("handles negative values correctly", () => {
    const bbox: BBox = [-180, -90, 180, 90];
    const result = roundBBox(bbox, 1);
    expect(result).toEqual([-180, -90, 180, 90]);
  });
});

describe("cacheKey", () => {
  const bbox: BBox = [-125.5678, 48.1234, -124.9876, 49.5432];

  it("uses precision=1 for zoom <= 8", () => {
    const key = cacheKey("forest-age", bbox, 5);
    // At precision=1, bbox rounds to [-125.6, 48.1, -125.0, 49.5]
    expect(key).toBe("forest-age:-125.6,48.1,-125,49.5:5");
  });

  it("uses precision=2 for zoom 9-12", () => {
    const key = cacheKey("forest-age", bbox, 10);
    expect(key).toBe("forest-age:-125.57,48.12,-124.99,49.54:10");
  });

  it("uses precision=3 for zoom > 12", () => {
    const key = cacheKey("forest-age", bbox, 14);
    expect(key).toBe("forest-age:-125.568,48.123,-124.988,49.543:14");
  });

  it("floors fractional zoom", () => {
    const key1 = cacheKey("forest-age", bbox, 5.7);
    const key2 = cacheKey("forest-age", bbox, 5.1);
    // Both should floor to zoom 5
    expect(key1).toBe(key2);
  });

  it("includes layer ID in key", () => {
    const key1 = cacheKey("forest-age", bbox, 10);
    const key2 = cacheKey("cutblocks", bbox, 10);
    expect(key1).not.toBe(key2);
    expect(key1.startsWith("forest-age:")).toBe(true);
    expect(key2.startsWith("cutblocks:")).toBe(true);
  });

  it("produces same key for slightly different bboxes (dedup via rounding)", () => {
    const bbox1: BBox = [-125.5678, 48.1234, -124.9876, 49.5432];
    const bbox2: BBox = [-125.5612, 48.1289, -124.9801, 49.5499];
    // At zoom 5, precision=1, both round the same
    const key1 = cacheKey("layer", bbox1, 5);
    const key2 = cacheKey("layer", bbox2, 5);
    expect(key1).toBe(key2);
  });

  it("produces different keys for significantly different bboxes", () => {
    const bbox1: BBox = [-125.5, 48.1, -124.9, 49.5];
    const bbox2: BBox = [-120.0, 50.0, -119.0, 51.0];
    const key1 = cacheKey("layer", bbox1, 5);
    const key2 = cacheKey("layer", bbox2, 5);
    expect(key1).not.toBe(key2);
  });
});
