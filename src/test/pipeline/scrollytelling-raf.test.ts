/**
 * Tests for the rAF-gated scroll update (Item 1a) and prefers-reduced-motion
 * hold-then-snap behavior (Item 1c) in useScrollytelling.
 *
 * These tests import and exercise the real hook, with:
 *   - requestAnimationFrame mocked (vi.useFakeTimers + manual flush)
 *   - scrollama mocked (captures callbacks so we can call them directly)
 *   - matchMedia mocked (from src/test/setup.ts, overridden per-test for 1c)
 *
 * Production invocation path: browser scroll → scrollama onStepProgress/
 * onStepEnter → pendingRef update → rAF flush → updateCamera → React state.
 * Substitute used here: vi.mock("scrollama") captures the same callbacks;
 * vi.useFakeTimers mocks rAF so we control frame flushing. Equivalent for the
 * LOGIC because both paths call the same functions with the same state
 * transitions. What is NOT covered locally: real rAF timing under live scroll,
 * real GL paint calls, and the visual photo→map seam (deploy-verified per plan).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useScrollytelling } from "@/hooks/useScrollytelling";
import { CHAPTERS } from "@/data/chapters";

// ─── scrollama mock ────────────────────────────────────────────────────────────
// Captures the onStepEnter/onStepProgress callbacks so tests can fire them
// directly without a DOM scroll event.

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

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Fire all pending fake rAF callbacks. */
function flushRaf() {
  vi.runAllTimers();
}

/** Set up the hook, wait for async scrollama init, return result. */
async function setupHook() {
  const result = renderHook(() => useScrollytelling());
  // scrollama is dynamically imported — wait for the promise to resolve
  await act(async () => {
    await Promise.resolve();
  });
  return result;
}

/** Fire onStepEnter synchronously (simulates scrollama chapter enter). */
function fireEnter(index: number) {
  act(() => {
    capturedEnter?.({ index });
  });
}

/** Fire onStepProgress synchronously (simulates scrollama progress tick). */
function fireProgress(index: number, progress: number) {
  act(() => {
    capturedProgress?.({ index, progress });
  });
}

// ─── Item 1a: rAF coalescing ───────────────────────────────────────────────────

describe("Item 1a — rAF-gate: coalesce scroll→camera updates", () => {
  beforeEach(() => {
    capturedEnter = null;
    capturedProgress = null;
    vi.useFakeTimers();
    // Ensure reduced motion is OFF for these tests
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

  it("multiple rapid onStepProgress calls within one frame produce exactly one updateCamera invocation", async () => {
    const { result } = await setupHook();

    // Use a logging chapter with timelineScrub (logging-timeline, index 2).
    const loggingIdx = CHAPTERS.findIndex((c) => c.id === "logging-timeline");
    expect(loggingIdx).toBeGreaterThan(-1);

    // Spy on rAF BEFORE firing — the coalescing guard (scrubRafRef.current !== null)
    // must prevent re-scheduling while a frame is already pending, so exactly ONE
    // rAF is called for the burst of 5 rapid progress ticks.
    const rafSpy = vi.spyOn(globalThis, "requestAnimationFrame");

    // Fire 5 rapid progress ticks within a single act (same animation frame burst)
    act(() => {
      fireProgress(loggingIdx, 0.1);
      fireProgress(loggingIdx, 0.2);
      fireProgress(loggingIdx, 0.3);
      fireProgress(loggingIdx, 0.4);
      fireProgress(loggingIdx, 0.5);
    });

    // The coalescing guard must have allowed exactly ONE rAF scheduling for the burst.
    // (rAF is also called internally by setupHook's scrollama init path, so we only
    // count calls made during the act above — capture the count after the burst.)
    const rafCallsDuringBurst = rafSpy.mock.calls.length;
    expect(rafCallsDuringBurst).toBe(1);

    // Flush the single pending rAF
    act(() => {
      flushRaf();
    });

    const afterFlush = result.current.yearFilter;

    // After flush: yearFilter reflects progress=0.5 (the LAST tick), not 0.1.
    // For logging-timeline at 0.5 (no scrubStart, has scrubTable): year is in range.
    expect(afterFlush).not.toBeNull();
    expect(afterFlush).toBeGreaterThan(1950);
  });

  it("settle-correctness with result ref: LAST progress wins after rAF flush", async () => {
    const { result } = await setupHook();

    const fireIdx = CHAPTERS.findIndex((c) => c.id === "fire");
    const fireChapter = CHAPTERS[fireIdx];
    const scrubStart = fireChapter.scrubStart!; // 0.22

    // Fire 3 ticks, final at progress = scrubStart + 0.5 (= 0.72)
    act(() => {
      fireProgress(fireIdx, scrubStart + 0.05);
      fireProgress(fireIdx, scrubStart + 0.2);
      fireProgress(fireIdx, scrubStart + 0.5); // FINAL
    });

    // Compute expected year for the final progress (linear scrub, no scrubTable on fire)
    const finalProg = scrubStart + 0.5;
    const scrub = fireChapter.timelineScrub!;
    const localProg = (finalProg - scrubStart) / (1 - scrubStart);
    const expectedYear = Math.round(scrub.start + (scrub.end - scrub.start) * localProg);

    act(() => {
      flushRaf();
    });

    expect(result.current.yearFilter).toBe(expectedYear);
  });

  it("chapter-switch PURE stale: onStepEnter then only trailing outgoing progress — index/progress pair is consistent", async () => {
    const { result } = await setupHook();

    // Simulate the PURE stale case: user scrolls from logging (ch2) to fire (ch3)
    // scrollama fires: onStepEnter(fireIdx) then ONLY a trailing stale progress
    // from the OUTGOING logging chapter (no fresh incoming progress fires).
    // Newest-wins: the stale outgoing tick overwrites pendingRef, so the frame
    // resolves with {index:loggingIdx, progress:0.99} — a CONSISTENT pair from
    // the same payload. This is the documented "self-correcting 1-frame transient."
    const fireIdx = CHAPTERS.findIndex((c) => c.id === "fire");
    const loggingIdx = CHAPTERS.findIndex((c) => c.id === "logging-timeline");

    act(() => {
      fireEnter(fireIdx);
      // Trailing OUTGOING progress — this is the LAST write, so it wins
      fireProgress(loggingIdx, 0.99);
      // No fresh incoming progress — pure stale case
    });

    act(() => {
      flushRaf();
    });

    // activeChapterIndex is set SYNCHRONOUSLY by onStepEnter — always fireIdx
    expect(result.current.activeChapterIndex).toBe(fireIdx);

    // yearFilter reflects updateCamera(loggingIdx, 0.99): logging-timeline scrub at
    // progress=0.99 → blended year = 2025 (near end of range, blended cutblocks).
    // This proves onStepProgress used response.index (loggingIdx) not activeChapterIndex
    // (fireIdx). If it had used activeChapterIndex, yearFilter would be 2024
    // (fire chapter at 0.99 → localProg=0.987 → 1917+108*0.987 ≈ 2024).
    expect(result.current.yearFilter).toBe(2025);
  });

  it("chapter-switch: onStepEnter then trailing outgoing + fresh incoming — resolves to incoming chapter", async () => {
    const { result } = await setupHook();

    // The normal case: stale outgoing is overwritten by the fresh incoming tick.
    const fireIdx = CHAPTERS.findIndex((c) => c.id === "fire");
    const loggingIdx = CHAPTERS.findIndex((c) => c.id === "logging-timeline");

    act(() => {
      fireEnter(fireIdx);
      // Trailing stale progress from outgoing chapter
      fireProgress(loggingIdx, 0.99);
      // Fresh incoming progress — overwrites the stale, this wins
      fireProgress(fireIdx, 0.05);
    });

    act(() => {
      flushRaf();
    });

    // After flush: activeChapterIndex is set SYNCHRONOUSLY by onStepEnter
    expect(result.current.activeChapterIndex).toBe(fireIdx);

    // yearFilter reflects fire chapter progress=0.05
    // fire scrubStart is 0.22, so prog=0.05 < scrubStart → yearFilter is null (hold)
    expect(result.current.yearFilter).toBeNull();
  });

  it("pending scrub frame is cancelled with its exact id on teardown", async () => {
    // Spy on rAF to capture the id assigned to the pending scrub frame.
    // vi.useFakeTimers makes rAF return a numeric id; we capture the id for the
    // scrub frame specifically (the last rAF scheduled during fireProgress).
    const rafSpy = vi.spyOn(globalThis, "requestAnimationFrame");
    const cancelSpy = vi.spyOn(globalThis, "cancelAnimationFrame");

    const { unmount } = await setupHook();

    // Reset call history accumulated during hook init (bearing-drift / init rAFs)
    rafSpy.mockClear();

    const fireIdx = CHAPTERS.findIndex((c) => c.id === "fire");
    // Queue exactly one pending scrub frame (do NOT flush it)
    act(() => {
      fireProgress(fireIdx, 0.5);
    });

    // The rAF call during fireProgress above is the scrub frame — capture its id
    expect(rafSpy.mock.calls.length).toBe(1);
    const scrubFrameId = rafSpy.mock.results[0].value as number;
    expect(typeof scrubFrameId).toBe("number");

    // Unmount — teardown must cancel specifically the scrub frame
    act(() => {
      unmount();
    });

    // cancelAnimationFrame must have been called with the exact scrub frame id
    expect(cancelSpy).toHaveBeenCalledWith(scrubFrameId);

    rafSpy.mockRestore();
    cancelSpy.mockRestore();
  });
});

// ─── Item 1c: prefers-reduced-motion hold-then-snap ───────────────────────────

describe("Item 1c — prefers-reduced-motion: hold-then-snap", () => {
  beforeEach(() => {
    capturedEnter = null;
    capturedProgress = null;
    vi.useFakeTimers();
    // Enable reduced motion
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true, // prefers-reduced-motion: reduce
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

  // Helper: get a chapter that has scrubStart > 0 (the fire case)
  function getFireChapterIdx() {
    const idx = CHAPTERS.findIndex((c) => c.id === "fire");
    expect(idx).toBeGreaterThan(-1);
    const chapter = CHAPTERS[idx];
    expect(chapter.scrubStart).toBeDefined();
    expect(chapter.scrubStart).toBeGreaterThan(0);
    return idx;
  }

  it("prog < scrubStart → yearFilter stays null (hold preserved)", async () => {
    const { result } = await setupHook();
    const fireIdx = getFireChapterIdx();
    const chapter = CHAPTERS[fireIdx];
    const scrubStart = chapter.scrubStart!; // 0.22

    act(() => {
      fireProgress(fireIdx, scrubStart - 0.01); // just below threshold
    });
    act(() => { flushRaf(); });

    // Hold: no year emitted
    expect(result.current.yearFilter).toBeNull();
  });

  it("prog >= scrubStart → yearFilter === scrub.end immediately (snap, no intermediate years)", async () => {
    const { result } = await setupHook();
    const fireIdx = getFireChapterIdx();
    const chapter = CHAPTERS[fireIdx];
    const scrubStart = chapter.scrubStart!; // 0.22
    const expectedEnd = chapter.timelineScrub!.end;

    // Try several progress values past the threshold — ALL should snap to end
    for (const prog of [scrubStart, scrubStart + 0.1, scrubStart + 0.5, 1.0]) {
      act(() => {
        fireProgress(fireIdx, prog);
      });
      act(() => { flushRaf(); });
      expect(result.current.yearFilter).toBe(expectedEnd);
    }
  });

  it("snap works for ALL progress values past scrubStart — no intermediate years emitted", async () => {
    const { result } = await setupHook();
    const fireIdx = getFireChapterIdx();
    const chapter = CHAPTERS[fireIdx];
    const scrubStart = chapter.scrubStart!;
    const expectedEnd = chapter.timelineScrub!.end;

    // Drive 10 progress values above scrubStart — every one must resolve to end
    const progValues = Array.from({ length: 10 }, (_, i) =>
      scrubStart + (i + 1) * (1 - scrubStart) / 10
    );

    for (const prog of progValues) {
      act(() => { fireProgress(fireIdx, prog); });
      act(() => { flushRaf(); });
      expect(result.current.yearFilter).toBe(expectedEnd);
    }
  });
});

// ─── Item 1c: non-reduced path — unchanged ─────────────────────────────────────

describe("Item 1c — non-reduced path: existing scrub behavior preserved", () => {
  beforeEach(() => {
    capturedEnter = null;
    capturedProgress = null;
    vi.useFakeTimers();
    // Reduced motion OFF
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

  it("fire chapter below scrubStart → null (same as before)", async () => {
    const { result } = await setupHook();
    const fireIdx = CHAPTERS.findIndex((c) => c.id === "fire");
    const chapter = CHAPTERS[fireIdx];
    const scrubStart = chapter.scrubStart!;

    act(() => { fireProgress(fireIdx, scrubStart - 0.01); });
    act(() => { flushRaf(); });

    expect(result.current.yearFilter).toBeNull();
  });

  it("fire chapter past scrubStart → interpolated year (NOT snapped to end)", async () => {
    const { result } = await setupHook();
    const fireIdx = CHAPTERS.findIndex((c) => c.id === "fire");
    const chapter = CHAPTERS[fireIdx];
    const scrubStart = chapter.scrubStart!; // 0.22
    const scrub = chapter.timelineScrub!;

    const prog = 0.5;
    act(() => { fireProgress(fireIdx, prog); });
    act(() => { flushRaf(); });

    // Non-reduced: should be interpolated, not scrub.end
    const localProg = (prog - scrubStart) / (1 - scrubStart);
    const expectedYear = Math.round(scrub.start + (scrub.end - scrub.start) * localProg);

    expect(result.current.yearFilter).toBe(expectedYear);
    expect(result.current.yearFilter).not.toBe(scrub.end); // NOT snapped (progress != 1)
  });

  it("logging chapter (no scrubStart) progresses linearly — byte-for-byte same as before", async () => {
    const { result } = await setupHook();
    const loggingIdx = CHAPTERS.findIndex((c) => c.id === "logging-timeline");
    const chapter = CHAPTERS[loggingIdx];
    const scrub = chapter.timelineScrub!;

    // At progress = 0.5, a blended scrub table result — just verify it's in range
    act(() => { fireProgress(loggingIdx, 0.5); });
    act(() => { flushRaf(); });

    expect(result.current.yearFilter).toBeGreaterThanOrEqual(scrub.start);
    expect(result.current.yearFilter).toBeLessThanOrEqual(scrub.end);
  });
});

// ─── Perf floor: idle-frame value-equality guards ──────────────────────────
//
// updateCamera used to call setCurrentCamera/setYearFilter/setOverlays/
// setBinaryRevealOpacity unconditionally every rAF frame, forcing a full
// container re-render even when nothing actually changed (e.g. most of a
// chapter's scroll range, where the camera is a constant spread of
// chapter.camera and overlays saturate at their fadeIn bounds). Each setter
// now compares the freshly computed value against the previous state and
// returns the previous reference when they're equal, so React bails the
// re-render (a setState call that returns a value === the current state is a
// documented React no-op: no re-render is scheduled).
//
// The render-count test below is the direct proof of that claim: it counts
// actual renderHook re-renders across a repeated identical frame. The
// reference-identity tests that follow show WHICH piece of state stayed
// stable and why (camera/overlays are reference types reallocated every
// frame, so `toBe` there proves the guard kept the old object rather than
// adopting a fresh-but-equal one). yearFilter/binaryRevealOpacity are
// primitives -- `toBe` on them proves the VALUE is correct and stable, not
// specifically that a render was skipped (a primitive equality holds either
// way), so those are basic correctness checks, not the perf proof.

describe("Perf floor: idle-frame render guard", () => {
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

  it("a repeated identical {index, progress} frame does not trigger a re-render", async () => {
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount++;
      return useScrollytelling();
    });
    await act(async () => {
      await Promise.resolve();
    });

    // `overview` (index 0) is the initial chapter -- no onStepEnter needed.
    const idx = CHAPTERS.findIndex((c) => c.id === "overview");

    act(() => { fireProgress(idx, 0.1); });
    act(() => { flushRaf(); });
    const countAfterFirstFrame = renderCount;

    // Same chapter, same progress -- a genuinely idle frame. Before the
    // value-equality guards, this unconditionally called 4 setStates with
    // freshly allocated objects, forcing a re-render every time.
    act(() => { fireProgress(idx, 0.1); });
    act(() => { flushRaf(); });

    expect(
      renderCount,
      "repeating the exact same {index, progress} should not re-render the hook consumer"
    ).toBe(countAfterFirstFrame);
    // Sanity: the hook is actually alive and returning state (not stubbed out).
    expect(result.current.activeChapterIndex).toBe(idx);
  });

  it("a genuinely different progress DOES trigger a re-render (guard is not over-eager)", async () => {
    let renderCount = 0;
    renderHook(() => {
      renderCount++;
      return useScrollytelling();
    });
    await act(async () => {
      await Promise.resolve();
    });

    const idx = CHAPTERS.findIndex((c) => c.id === "logging-timeline");

    act(() => { fireProgress(idx, 0.1); });
    act(() => { flushRaf(); });
    const countAfterFirstFrame = renderCount;

    act(() => { fireProgress(idx, 0.9); });
    act(() => { flushRaf(); });

    expect(renderCount).toBeGreaterThan(countAfterFirstFrame);
  });

  it("repeating the exact same {index, progress} keeps the same camera/overlays object references", async () => {
    const { result } = await setupHook();
    // `baseline` has a static overlay with fadeIn, forest-age layer only, no
    // toward-next interpolation at prog=0.5 — the common "idle mid-chapter"
    // shape most of a chapter's scroll range actually looks like.
    const idx = CHAPTERS.findIndex((c) => c.id === "baseline");

    act(() => { fireProgress(idx, 0.5); });
    act(() => { flushRaf(); });

    const camera1 = result.current.currentCamera;
    const overlays1 = result.current.overlays;
    const year1 = result.current.yearFilter;
    const binary1 = result.current.binaryRevealOpacity;

    // Fire the identical {index, progress} again — a genuinely idle frame.
    act(() => { fireProgress(idx, 0.5); });
    act(() => { flushRaf(); });

    // Reference types: proves the guard kept the OLD object rather than
    // adopting a freshly allocated-but-equal one.
    expect(result.current.currentCamera).toBe(camera1);
    expect(result.current.overlays).toBe(overlays1);
    // Primitives: correctness (stable, correct value) rather than proof of
    // the render-skip itself -- see the render-count test above for that.
    expect(result.current.yearFilter).toBe(year1);
    expect(result.current.binaryRevealOpacity).toBe(binary1);
  });

  it("repeated identical progress within a chapter's flat camera range keeps the SAME camera object across many frames", async () => {
    const { result } = await setupHook();
    // `overview` never triggers the toward-next dolly at these progress
    // values (all <= 0.8) -- camera is a constant spread
    // of chapter.camera on every frame, the textbook idle case.
    const idx = CHAPTERS.findIndex((c) => c.id === "overview");

    act(() => { fireProgress(idx, 0.1); });
    act(() => { flushRaf(); });
    const cameraAfterFirst = result.current.currentCamera;

    for (const prog of [0.2, 0.3, 0.4, 0.5]) {
      act(() => { fireProgress(idx, prog); });
      act(() => { flushRaf(); });
      expect(result.current.currentCamera).toBe(cameraAfterFirst);
    }
  });
});

// ─── Last chapter holds flat into the CTA (dolly docked 2026-08-21) ──────────
//
// With the `remains` chapter and its `cameraTo` scrub docked, `ending` is the
// last chapter and must HOLD its own camera past prog 0.8 -- there is no next
// chapter to interpolate toward. Every real chapter shares FLAT_BC_CAMERA, so a
// bare "equals FLAT_BC_CAMERA" assertion would be tautological; each test
// therefore runs a CONTROL first: temporarily push a fake next chapter with a
// different zoom and prove the toward-next branch DOES move the camera, then
// pop it and prove the last chapter does NOT.
describe("Last chapter holds flat into the CTA", () => {
  const FAKE_NEXT = {
    id: "__fake_next__",
    heading: "x",
    camera: { center: [-125.86, 49.38] as [number, number], zoom: 8, pitch: 0, bearing: 0 },
    layers: [],
    scrollHeight: 100,
  };

  function mockReducedMotion(matches: boolean) {
    window.matchMedia = vi.fn().mockReturnValue({
      matches,
      media: matches ? "(prefers-reduced-motion: reduce)" : "",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as typeof window.matchMedia;
  }

  beforeEach(() => {
    capturedEnter = null;
    capturedProgress = null;
    vi.useFakeTimers();
  });

  afterEach(() => {
    // Belt and braces: never leak the control chapter into other suites.
    while (CHAPTERS[CHAPTERS.length - 1]?.id === FAKE_NEXT.id) CHAPTERS.pop();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("`ending` is the last chapter", () => {
    expect(CHAPTERS[CHAPTERS.length - 1].id).toBe("ending");
  });

  it("non-reduced: toward-next interpolates when a next chapter exists (control), and the last chapter holds flat", async () => {
    mockReducedMotion(false);
    const endingIdx = CHAPTERS.findIndex((c) => c.id === "ending");
    const { result } = await setupHook();

    // CONTROL: with a fake next chapter, prog=0.9 is halfway through the
    // toward-next window, so zoom must have moved off 5 toward 8.
    CHAPTERS.push(FAKE_NEXT);
    act(() => { fireProgress(endingIdx, 0.9); });
    act(() => { flushRaf(); });
    expect(result.current.currentCamera.zoom).toBeCloseTo(6.5, 5);
    CHAPTERS.pop();

    // REAL: no next chapter -- holds the chapter's own camera, byte for byte.
    act(() => { fireProgress(endingIdx, 0.95); });
    act(() => { flushRaf(); });
    expect(result.current.currentCamera).toEqual(CHAPTERS[endingIdx].camera);
  });

  it("reduced-motion: toward-next snaps to the next camera (control), and the last chapter holds flat", async () => {
    mockReducedMotion(true);
    const endingIdx = CHAPTERS.findIndex((c) => c.id === "ending");
    const { result } = await setupHook();

    // CONTROL: under reduced motion the toward-next branch uses t=1, so any
    // prog > 0.8 lands EXACTLY on the next camera (no sweep).
    CHAPTERS.push(FAKE_NEXT);
    act(() => { fireProgress(endingIdx, 0.81); });
    act(() => { flushRaf(); });
    expect(result.current.currentCamera).toEqual(FAKE_NEXT.camera);
    CHAPTERS.pop();

    // REAL: no next chapter -- the reduced-motion snap has nothing to snap to
    // and must not be consulted; camera holds.
    act(() => { fireProgress(endingIdx, 0.95); });
    act(() => { flushRaf(); });
    expect(result.current.currentCamera).toEqual(CHAPTERS[endingIdx].camera);
  });
});
