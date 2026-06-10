/**
 * pickDefinedPaint — architecture invariant #4 helper
 *
 * Ensures undefined-valued paint properties are stripped before being
 * passed to MapLibre addLayer / setPaintProperty.
 */

import { describe, it, expect } from "vitest";
import { pickDefinedPaint } from "@/lib/layers/paint";

describe("pickDefinedPaint", () => {
  it("strips undefined values from a paint object", () => {
    const paint = {
      "fill-color": "#ff0000",
      "fill-opacity": undefined,
      "fill-outline-color": undefined,
      "fill-antialias": false,
    };

    const result = pickDefinedPaint(paint);

    expect(result).toEqual({
      "fill-color": "#ff0000",
      "fill-antialias": false,
    });
    expect("fill-opacity" in result).toBe(false);
    expect("fill-outline-color" in result).toBe(false);
  });

  it("passes through a fully-defined paint object unchanged", () => {
    const paint = {
      "fill-color": "#00ff00",
      "fill-opacity": 0.7,
      "fill-outline-color": "rgba(255,255,255,0.2)",
    };

    const result = pickDefinedPaint(paint);
    expect(result).toEqual(paint);
  });

  it("handles an empty paint object", () => {
    expect(pickDefinedPaint({})).toEqual({});
  });

  it("handles paint objects with null values (null is defined, not stripped)", () => {
    const paint = {
      "fill-color": null as unknown as string,
      "fill-opacity": undefined,
    };

    const result = pickDefinedPaint(paint);
    // null is a valid MapLibre value (reset); only undefined is stripped
    expect("fill-color" in result).toBe(true);
    expect("fill-opacity" in result).toBe(false);
  });

  it("handles paint objects with MapLibre expression arrays", () => {
    const paint = {
      "fill-color": ["case", ["has", "class"], "#0d5c2a", "#6b7280"],
      "fill-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.4, 12, 0.65],
      "fill-outline-color": undefined,
    };

    const result = pickDefinedPaint(paint);

    expect(result["fill-color"]).toEqual(paint["fill-color"]);
    expect(result["fill-opacity"]).toEqual(paint["fill-opacity"]);
    expect("fill-outline-color" in result).toBe(false);
  });

  it("does not mutate the original paint object", () => {
    const paint = {
      "fill-color": "#ff0000",
      "fill-opacity": undefined,
    };
    const original = { ...paint };

    pickDefinedPaint(paint);

    expect(paint).toEqual(original);
  });
});
