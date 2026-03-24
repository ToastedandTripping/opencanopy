import { describe, it, expect } from "vitest";
import {
  lerp,
  lerpAngle,
  normalizeAngle,
  interpolateCamera,
} from "@/lib/math/interpolation";
import type { ChapterCamera } from "@/data/chapters";

describe("lerp", () => {
  it("returns a at t=0", () => {
    expect(lerp(10, 20, 0)).toBe(10);
  });

  it("returns b at t=1", () => {
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it("returns midpoint at t=0.5", () => {
    expect(lerp(10, 20, 0.5)).toBe(15);
  });

  it("handles negative values", () => {
    expect(lerp(-10, 10, 0.5)).toBe(0);
  });

  it("handles equal values", () => {
    expect(lerp(5, 5, 0.7)).toBe(5);
  });

  it("extrapolates beyond t=1", () => {
    expect(lerp(0, 10, 2)).toBe(20);
  });
});

describe("lerpAngle", () => {
  it("returns a at t=0", () => {
    expect(lerpAngle(0, 90, 0)).toBe(0);
  });

  it("returns b at t=1", () => {
    expect(lerpAngle(0, 90, 1)).toBe(90);
  });

  it("takes shortest path across 360/0 boundary", () => {
    // From 350 to 10: shortest path is +20 degrees, not -340
    const result = lerpAngle(350, 10, 0.5);
    expect(result).toBeCloseTo(360, 5); // 350 + 10 = 360 (i.e. 0)
  });

  it("takes shortest path from negative to positive", () => {
    const result = lerpAngle(-170, 170, 0.5);
    // Shortest path: -170 -> -180 -> 170 = delta of -20
    // Midpoint: -170 + (-10) = -180
    expect(result).toBeCloseTo(-180, 5);
  });

  it("handles zero-delta", () => {
    expect(lerpAngle(45, 45, 0.5)).toBe(45);
  });
});

describe("normalizeAngle", () => {
  it("keeps angle within [-180, 180] for 0", () => {
    expect(normalizeAngle(0)).toBe(0);
  });

  it("normalizes 360 to 0", () => {
    expect(normalizeAngle(360)).toBe(0);
  });

  it("normalizes 270 to -90", () => {
    expect(normalizeAngle(270)).toBe(-90);
  });

  it("normalizes -270 to 90", () => {
    expect(normalizeAngle(-270)).toBe(90);
  });

  it("normalizes 540 to -180 (boundary case)", () => {
    // The formula ((deg + 540) % 360) - 180 yields -180 for multiples of 180
    // Both -180 and 180 represent the same angle; the function normalizes to -180
    expect(normalizeAngle(540)).toBe(-180);
  });

  it("normalizes 180 to -180 (boundary case)", () => {
    expect(normalizeAngle(180)).toBe(-180);
  });

  it("normalizes -180 to -180", () => {
    expect(normalizeAngle(-180)).toBe(-180);
  });

  it("normalizes large positive angle", () => {
    expect(normalizeAngle(720)).toBe(0);
  });
});

describe("interpolateCamera", () => {
  const from: ChapterCamera = {
    center: [-125.5, 54.0],
    zoom: 5,
    pitch: 0,
    bearing: 0,
  };

  const to: ChapterCamera = {
    center: [-124.55, 48.64],
    zoom: 12.5,
    pitch: 55,
    bearing: -30,
  };

  it("returns from camera at t=0", () => {
    const result = interpolateCamera(from, to, 0);
    expect(result.center[0]).toBe(from.center[0]);
    expect(result.center[1]).toBe(from.center[1]);
    expect(result.zoom).toBe(from.zoom);
    expect(result.pitch).toBe(from.pitch);
    expect(result.bearing).toBe(from.bearing);
  });

  it("returns to camera at t=1", () => {
    const result = interpolateCamera(from, to, 1);
    expect(result.center[0]).toBe(to.center[0]);
    expect(result.center[1]).toBe(to.center[1]);
    expect(result.zoom).toBe(to.zoom);
    expect(result.pitch).toBe(to.pitch);
    expect(result.bearing).toBe(to.bearing);
  });

  it("returns midpoint at t=0.5", () => {
    const result = interpolateCamera(from, to, 0.5);
    expect(result.center[0]).toBeCloseTo(-125.025, 3);
    expect(result.center[1]).toBeCloseTo(51.32, 3);
    expect(result.zoom).toBeCloseTo(8.75, 3);
    expect(result.pitch).toBeCloseTo(27.5, 3);
  });

  it("uses lerpAngle for bearing (shortest path)", () => {
    const result = interpolateCamera(from, to, 0.5);
    // from 0 to -30: midpoint should be -15
    expect(result.bearing).toBeCloseTo(-15, 3);
  });

  it("returns correct center type [number, number]", () => {
    const result = interpolateCamera(from, to, 0.5);
    expect(result.center).toHaveLength(2);
    expect(typeof result.center[0]).toBe("number");
    expect(typeof result.center[1]).toBe("number");
  });
});
