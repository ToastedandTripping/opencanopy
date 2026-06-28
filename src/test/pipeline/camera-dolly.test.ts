/**
 * Tests for the intra-chapter camera dolly (cameraTo) and easeInOut helper.
 *
 * Covers:
 *   1. easeInOut pure math: boundary values, symmetry at 0.5, monotonicity
 *   2. easeInOut + interpolateCamera composition: province→pocket at key progress values
 *   3. cameraTo scrub through the hook: remains chapter dolly at prog 0.4/0.8/1.0,
 *      and reduced-motion snap directly to the pocket at all progress values
 *
 * The dolly works as follows in updateCamera:
 *   DOLLY_END = 0.8
 *   t = reducedMotion ? 1 : easeInOut(clamp01(prog / DOLLY_END))
 *   camera = interpolateCamera(chapter.camera, chapter.cameraTo, t)
 *
 * So at prog=DOLLY_END the eased t reaches 1.0 → camera === cameraTo.
 * For prog > DOLLY_END, clamp01 caps t=1.0 → camera holds at the pocket.
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

describe("easeInOut + interpolateCamera composition (province→pocket dolly)", () => {
  const DOLLY_END = 0.8;
  const province = FLAT_BC_CAMERA;
  const pocket = STORY_END_CAMERA;

  function cameraAt(prog: number): ChapterCamera {
    const t = easeInOut(Math.min(1, Math.max(0, prog / DOLLY_END)));
    return interpolateCamera(province, pocket, t);
  }

  it("at prog=0, camera equals province (FLAT_BC_CAMERA)", () => {
    camerasEqual(cameraAt(0), province);
  });

  it("at prog=DOLLY_END (0.8), camera equals pocket (STORY_END_CAMERA)", () => {
    camerasEqual(cameraAt(DOLLY_END), pocket);
  });

  it("at prog=1.0 (past DOLLY_END, clamped), camera still equals pocket", () => {
    camerasEqual(cameraAt(1.0), pocket);
  });

  it("at prog=0.4 (halfway to DOLLY_END), zoom is strictly between province and pocket", () => {
    const cam = cameraAt(0.4);
    // easeInOut(0.5) = 0.5 → zoom = lerp(5, 8, 0.5) = 6.5
    expect(cam.zoom).toBeGreaterThan(province.zoom);
    expect(cam.zoom).toBeLessThan(pocket.zoom);
    expect(cam.zoom).toBeCloseTo(6.5, 3);
  });

  it("at prog=0.4, center is strictly between province and pocket centers", () => {
    const cam = cameraAt(0.4);
    expect(cam.center[0]).toBeGreaterThan(
      Math.min(province.center[0], pocket.center[0])
    );
    expect(cam.center[0]).toBeLessThan(
      Math.max(province.center[0], pocket.center[0])
    );
  });
});

// ─── 3. cameraTo scrub via the hook ───────────────────────────────────────────

describe("cameraTo intra-chapter scrub — useScrollytelling remains chapter", () => {
  const remainsIdx = CHAPTERS.findIndex((c) => c.id === "remains");

  it("remains chapter has cameraTo set to STORY_END_CAMERA", () => {
    const remains = CHAPTERS[remainsIdx];
    expect(remains.cameraTo).toBeDefined();
    expect(remains.cameraTo?.center).toEqual(STORY_END_CAMERA.center);
    expect(remains.cameraTo?.zoom).toBe(STORY_END_CAMERA.zoom);
  });

  it("remains chapter starts at FLAT_BC_CAMERA (no jump entering from ending)", () => {
    const remains = CHAPTERS[remainsIdx];
    expect(remains.camera.center).toEqual(FLAT_BC_CAMERA.center);
    expect(remains.camera.zoom).toBe(FLAT_BC_CAMERA.zoom);
  });

  it("ending chapter also uses FLAT_BC_CAMERA (no jump on the toward-next lerp)", () => {
    const ending = CHAPTERS.find((c) => c.id === "ending");
    expect(ending?.camera.center).toEqual(FLAT_BC_CAMERA.center);
    expect(ending?.camera.zoom).toBe(FLAT_BC_CAMERA.zoom);
  });

  describe("non-reduced-motion: eased province→pocket across chapter", () => {
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

    it("at prog=0.0, camera is at province (zoom≈5)", async () => {
      const { result } = await setupHook();
      act(() => { fireEnter(remainsIdx); });
      act(() => { fireProgress(remainsIdx, 0.0); });
      act(() => { flushRaf(); });

      expect(result.current.currentCamera.zoom).toBeCloseTo(FLAT_BC_CAMERA.zoom, 3);
    });

    it("at prog=0.4, zoom is strictly between 5 and 8 (mid-dolly)", async () => {
      const { result } = await setupHook();
      act(() => { fireEnter(remainsIdx); });
      act(() => { fireProgress(remainsIdx, 0.4); });
      act(() => { flushRaf(); });

      const zoom = result.current.currentCamera.zoom;
      expect(zoom).toBeGreaterThan(FLAT_BC_CAMERA.zoom);
      expect(zoom).toBeLessThan(STORY_END_CAMERA.zoom);
    });

    it("at prog=0.8 (DOLLY_END), camera has arrived at pocket (zoom≈8)", async () => {
      const { result } = await setupHook();
      act(() => { fireEnter(remainsIdx); });
      act(() => { fireProgress(remainsIdx, 0.8); });
      act(() => { flushRaf(); });

      expect(result.current.currentCamera.zoom).toBeCloseTo(STORY_END_CAMERA.zoom, 3);
    });

    it("at prog=1.0 (past DOLLY_END), camera holds at pocket (zoom≈8)", async () => {
      const { result } = await setupHook();
      act(() => { fireEnter(remainsIdx); });
      act(() => { fireProgress(remainsIdx, 1.0); });
      act(() => { flushRaf(); });

      expect(result.current.currentCamera.zoom).toBeCloseTo(STORY_END_CAMERA.zoom, 3);
    });
  });

  describe("reduced-motion: snap directly to pocket at all progress values", () => {
    beforeEach(() => {
      capturedEnter = null;
      capturedProgress = null;
      vi.useFakeTimers();
      window.matchMedia = vi.fn().mockReturnValue({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
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

    it("at prog=0.0, camera is already at pocket under reduced motion (snap)", async () => {
      const { result } = await setupHook();
      act(() => { fireEnter(remainsIdx); });
      act(() => { fireProgress(remainsIdx, 0.0); });
      act(() => { flushRaf(); });

      // reducedMotion → t=1 → camera = cameraTo = STORY_END_CAMERA
      expect(result.current.currentCamera.zoom).toBeCloseTo(STORY_END_CAMERA.zoom, 3);
    });

    it("at prog=0.5, camera is at pocket (no scrub, snap stays at pocket)", async () => {
      const { result } = await setupHook();
      act(() => { fireEnter(remainsIdx); });
      act(() => { fireProgress(remainsIdx, 0.5); });
      act(() => { flushRaf(); });

      expect(result.current.currentCamera.zoom).toBeCloseTo(STORY_END_CAMERA.zoom, 3);
    });

    it("at prog=1.0, camera is at pocket", async () => {
      const { result } = await setupHook();
      act(() => { fireEnter(remainsIdx); });
      act(() => { fireProgress(remainsIdx, 1.0); });
      act(() => { flushRaf(); });

      expect(result.current.currentCamera.zoom).toBeCloseTo(STORY_END_CAMERA.zoom, 3);
    });
  });
});
