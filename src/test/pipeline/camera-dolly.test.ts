/**
 * Tests for the dolly camera math and the `remains` chapter configuration.
 *
 * The live `cameraTo` scrub (jumpTo-per-scroll-frame) was replaced by a
 * pre-rendered play-on-scroll video (DollyVideo) — the frame-sampling math
 * that used to run at RUNTIME via useScrollytelling now runs OFFLINE via
 * `dollyCameraForFrame` (src/lib/story/dolly-config.ts), with easing baked
 * into the sample instead of applied per-scroll-frame. This file covers:
 *
 *   1. easeInOut pure math: boundary values, symmetry at 0.5, monotonicity
 *   2. easeInOut + interpolateCamera composition: the exact math
 *      `dollyCameraForFrame` bakes into each offline-rendered frame
 *      (see dolly-frame-index.test.ts for dollyCameraForFrame itself)
 *   3. `remains` chapter config: cameraTo===undefined (live scrub removed),
 *      camera holds at FLAT_BC_CAMERA, scrollHeight sized for the clip
 *   4. useScrollytelling's toward-next interpolation still works for chapters
 *      that DO have a next chapter, and is correctly absent for `remains`
 *      (the last chapter — nothing to interpolate toward)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { easeInOut, interpolateCamera } from "@/lib/math/interpolation";
import { CHAPTERS, FLAT_BC_CAMERA, STORY_END_CAMERA } from "@/data/chapters";
import type { ChapterCamera } from "@/data/chapters";

// ─── scrollama mock (mirrors scrollytelling-raf.test.ts) ──────────────────────

type StepEnterCb = (response: { index: number }) => void;
type StepProgressCb = (response: { index: number; progress: number }) => void;

let capturedEnter: StepEnterCb | null = null;
let capturedProgress: StepProgressCb | null = null;

vi.mock("scrollama", () => {
  const factory = vi.fn(() => {
    const instance = {
      setup: vi.fn().mockReturnThis(),
      onStepEnter: vi.fn().mockImplementation((cb: StepEnterCb) => {
        capturedEnter = cb;
        return instance;
      }),
      onStepProgress: vi.fn().mockImplementation((cb: StepProgressCb) => {
        capturedProgress = cb;
        return instance;
      }),
      destroy: vi.fn(),
    };
    return instance;
  });
  return { default: factory };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function flushRaf() {
  vi.runAllTimers();
}

async function setupHook() {
  const { useScrollytelling } = await import("@/hooks/useScrollytelling");
  const result = renderHook(() => useScrollytelling());
  await act(async () => { await Promise.resolve(); });
  return result;
}

function fireEnter(index: number) {
  act(() => { capturedEnter?.({ index }); });
}

function fireProgress(index: number, progress: number) {
  act(() => { capturedProgress?.({ index, progress }); });
}

function camerasEqual(a: ChapterCamera, b: ChapterCamera, precision = 4) {
  expect(a.center[0]).toBeCloseTo(b.center[0], precision);
  expect(a.center[1]).toBeCloseTo(b.center[1], precision);
  expect(a.zoom).toBeCloseTo(b.zoom, precision);
  expect(a.pitch).toBeCloseTo(b.pitch, precision);
  expect(a.bearing).toBeCloseTo(b.bearing, precision);
}

// ─── 1. easeInOut pure math ───────────────────────────────────────────────────

describe("easeInOut", () => {
  it("returns 0 at t=0", () => {
    expect(easeInOut(0)).toBe(0);
  });

  it("returns 1 at t=1", () => {
    expect(easeInOut(1)).toBe(1);
  });

  it("returns 0.5 at t=0.5 (symmetric midpoint)", () => {
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 10);
  });

  it("is monotonically non-decreasing on [0, 1]", () => {
    const steps = 100;
    let prev = easeInOut(0);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const val = easeInOut(t);
      expect(val).toBeGreaterThanOrEqual(prev - 1e-12); // allow floating-point noise
      prev = val;
    }
  });

  it("output is bounded [0, 1] for inputs [0, 1]", () => {
    const steps = 20;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const val = easeInOut(t);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });

  it("is slower near edges than at midpoint (ease characteristic)", () => {
    // The eased distance over [0, 0.1] is smaller than over [0.45, 0.55]
    const edgeDelta = easeInOut(0.1) - easeInOut(0);
    const midDelta = easeInOut(0.55) - easeInOut(0.45);
    expect(midDelta).toBeGreaterThan(edgeDelta);
  });
});

// ─── 2. easeInOut + interpolateCamera composition ─────────────────────────────
//
// This IS the math dollyCameraForFrame bakes into every offline-rendered
// frame: t_i = easeInOut(i / (count-1)), camera = interpolateCamera(FLAT_BC,
// STORY_END, t_i). Verified independently here against hand-computed values;
// dolly-frame-index.test.ts verifies dollyCameraForFrame itself matches this.

describe("easeInOut + interpolateCamera composition (province→pocket dolly)", () => {
  const province = FLAT_BC_CAMERA;
  const pocket = STORY_END_CAMERA;

  function cameraAt(t: number): ChapterCamera {
    return interpolateCamera(province, pocket, easeInOut(t));
  }

  it("at t=0, camera equals province (FLAT_BC_CAMERA)", () => {
    camerasEqual(cameraAt(0), province);
  });

  it("at t=1, camera equals pocket (STORY_END_CAMERA)", () => {
    camerasEqual(cameraAt(1), pocket);
  });

  it("at t=0.5 (symmetric midpoint), zoom is exactly the arithmetic mean", () => {
    // easeInOut(0.5) = 0.5 exactly -> interpolateCamera lerps zoom at t=0.5
    const cam = cameraAt(0.5);
    expect(cam.zoom).toBeCloseTo((province.zoom + pocket.zoom) / 2, 6);
  });

  it("at t=0.25, zoom is strictly between province and pocket", () => {
    const cam = cameraAt(0.25);
    expect(cam.zoom).toBeGreaterThan(province.zoom);
    expect(cam.zoom).toBeLessThan(pocket.zoom);
  });

  it("at t=0.25, center is strictly between province and pocket centers", () => {
    const cam = cameraAt(0.25);
    expect(cam.center[0]).toBeGreaterThan(
      Math.min(province.center[0], pocket.center[0])
    );
    expect(cam.center[0]).toBeLessThan(
      Math.max(province.center[0], pocket.center[0])
    );
  });

  it("zoom is monotonically increasing as t sweeps 0 -> 1", () => {
    let prev = cameraAt(0).zoom;
    const steps = 50;
    for (let i = 1; i <= steps; i++) {
      const cur = cameraAt(i / steps).zoom;
      expect(cur).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = cur;
    }
  });
});

// ─── 3. remains chapter config — DollyVideo era ───────────────────────────────

describe("remains chapter config — pre-rendered DollyVideo era", () => {
  const remainsIdx = CHAPTERS.findIndex((c) => c.id === "remains");

  it("remains chapter exists", () => {
    expect(remainsIdx).toBeGreaterThan(-1);
  });

  it("remains chapter has cameraTo===undefined (live scrub removed)", () => {
    const remains = CHAPTERS[remainsIdx];
    expect(remains.cameraTo).toBeUndefined();
  });

  it("remains chapter camera is FLAT_BC_CAMERA (live map holds at province scale)", () => {
    const remains = CHAPTERS[remainsIdx];
    expect(remains.camera.center).toEqual(FLAT_BC_CAMERA.center);
    expect(remains.camera.zoom).toBe(FLAT_BC_CAMERA.zoom);
  });

  it("ending chapter also uses FLAT_BC_CAMERA (no jump on the toward-next lerp)", () => {
    const ending = CHAPTERS.find((c) => c.id === "ending");
    expect(ending?.camera.center).toEqual(FLAT_BC_CAMERA.center);
    expect(ending?.camera.zoom).toBe(FLAT_BC_CAMERA.zoom);
  });

  it("remains chapter has revealBinary===true (binary layer stays on under the video)", () => {
    const remains = CHAPTERS[remainsIdx];
    expect(remains.revealBinary).toBe(true);
  });

  it("remains is the last chapter (nothing to toward-next-interpolate into)", () => {
    expect(remainsIdx).toBe(CHAPTERS.length - 1);
  });
});

// ─── 4. useScrollytelling: cameraTo branch removed, toward-next intact ────────

describe("useScrollytelling camera — cameraTo branch removed", () => {
  beforeEach(() => {
    capturedEnter = null;
    capturedProgress = null;
    vi.useFakeTimers();
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      media: "",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("remains chapter camera stays at FLAT_BC_CAMERA at prog=0 (no cameraTo scrub)", async () => {
    const { result } = await setupHook();
    const remainsIdx = CHAPTERS.findIndex((c) => c.id === "remains");
    act(() => { fireEnter(remainsIdx); });
    act(() => { fireProgress(remainsIdx, 0); });
    act(() => { flushRaf(); });

    expect(result.current.currentCamera.zoom).toBeCloseTo(FLAT_BC_CAMERA.zoom, 6);
  });

  it("remains chapter camera stays at FLAT_BC_CAMERA even at prog=1.0 (no live dolly left to scrub)", async () => {
    const { result } = await setupHook();
    const remainsIdx = CHAPTERS.findIndex((c) => c.id === "remains");
    act(() => { fireEnter(remainsIdx); });
    act(() => { fireProgress(remainsIdx, 1.0); });
    act(() => { flushRaf(); });

    // Previously (live cameraTo dolly) this would have been ~STORY_END_CAMERA.zoom.
    // Now the live map never moves during `remains` -- DollyVideo owns the zoom.
    expect(result.current.currentCamera.zoom).toBeCloseTo(FLAT_BC_CAMERA.zoom, 6);
    expect(result.current.currentCamera.zoom).not.toBeCloseTo(STORY_END_CAMERA.zoom, 1);
  });

  it("toward-next interpolation still applies to a chapter with a next sibling (e.g. `ending` -> `remains`)", async () => {
    const { result } = await setupHook();
    const endingIdx = CHAPTERS.findIndex((c) => c.id === "ending");
    act(() => { fireEnter(endingIdx); });
    act(() => { fireProgress(endingIdx, 0.9); });
    act(() => { flushRaf(); });

    // ending.camera === remains.camera === FLAT_BC_CAMERA, so this doesn't prove
    // much numerically, but it must not throw and must resolve to a valid camera.
    expect(result.current.currentCamera.zoom).toBeCloseTo(FLAT_BC_CAMERA.zoom, 6);
  });
});
