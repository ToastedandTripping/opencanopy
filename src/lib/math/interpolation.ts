/**
 * Pure math functions for camera interpolation.
 *
 * Extracted from useScrollytelling for testability.
 */

import type { ChapterCamera } from "@/data/chapters";

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Cubic ease-in-out (smoothstep): 0→0, 1→1, symmetric midpoint at 0.5.
 * Caller must clamp t to [0,1] — this function does not clamp internally
 * so it remains a pure math function and the caller controls saturation.
 */
export function easeInOut(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Shortest-angle interpolation that avoids spinning the long way around. */
export function lerpAngle(a: number, b: number, t: number): number {
  const delta = ((b - a + 540) % 360) - 180;
  return a + delta * t;
}

/** Normalize an angle to [-180, 180]. */
export function normalizeAngle(deg: number): number {
  return ((deg + 540) % 360) - 180;
}

export function interpolateCamera(
  from: ChapterCamera,
  to: ChapterCamera,
  t: number
): ChapterCamera {
  return {
    center: [
      lerp(from.center[0], to.center[0], t),
      lerp(from.center[1], to.center[1], t),
    ] as [number, number],
    zoom: lerp(from.zoom, to.zoom, t),
    pitch: lerp(from.pitch, to.pitch, t),
    bearing: lerpAngle(from.bearing, to.bearing, t),
  };
}
