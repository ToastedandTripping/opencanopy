/**
 * Tests for useTimeline (Phase A, honest timeline).
 *
 * No `useTimeline.test.*` existed before this plan, so "existing suite green"
 * protected none of the transport semantics this hook has carried since the
 * original setInterval scheduler. This suite covers BOTH:
 *   - the NEW render-gated scheduler (watchdog, cancellation, ordering), and
 *   - the CARRIED-OVER transport contract (mid-play scrub wins, overshoot
 *     clamp, restart-at-end, enable/disable resets) as a regression lock.
 *
 * Production invocation path: page.tsx builds a real `waitForRender` from
 * `mapRef` (map.once('idle') raced against a timeout) and a real
 * `prefersReducedMotion` from `window.matchMedia`, and passes both in.
 * Substitute used here: both are injected as plain mocks/controllable
 * promises -- equivalent for the LOGIC under test (the hook never touches
 * maplibre or matchMedia itself), but real `idle`-event timing against a
 * live map is NOT exercised here (that's Lee's live QA per the plan).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useEffect } from "react";
import { renderHook, act } from "@testing-library/react";
import { useTimeline, RENDER_WATCHDOG_MS } from "./useTimeline";
import type { LayerDefinition } from "@/types/layers";
import { pipelineLog } from "@/lib/debug/pipeline-logger";

vi.mock("@/lib/debug/pipeline-logger", () => ({ pipelineLog: vi.fn() }));

const FIRE_RANGE_LAYERS = [
  { timelineRange: [1917, 2025] },
] as unknown as LayerDefinition[];

const DEFAULT_SPEED = 400;

/** A `waitForRender` mock whose promises are resolved on demand by the test,
 *  in call order. Each call is also logged (with an index) into a shared
 *  order array so tests can assert relative ordering against other events. */
function makeControllableWaitForRender(order?: string[]) {
  const resolvers: Array<() => void> = [];
  const fn = vi.fn(() => {
    const idx = resolvers.length;
    order?.push(`waitForRender-call-${idx}`);
    return new Promise<void>((resolve) => {
      resolvers.push(resolve);
    });
  });
  return { fn, resolvers };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(pipelineLog).mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useTimeline — render-gated scheduler (new)", () => {
  it("Razor W1: the FIRST iteration of a run does NOT gate on waitForRender -- a settled map (nothing to paint yet this run) must not stall play/resume", async () => {
    const { fn: waitForRender } = makeControllableWaitForRender();
    const { result } = renderHook(() =>
      useTimeline(FIRE_RANGE_LAYERS, { waitForRender, prefersReducedMotion: () => false })
    );

    act(() => result.current.enable());
    const startYear = result.current.currentYear;
    act(() => result.current.togglePlay());

    // No render-wait call yet -- there's nothing painted this run to gate on.
    expect(waitForRender).toHaveBeenCalledTimes(0);
    expect(result.current.rendering).toBe(false);

    // The dwell floor alone is enough to advance -- no 1800ms watchdog stall.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_SPEED);
    });
    expect(result.current.currentYear).toBe(startYear + 1);
    // Iteration 2 (now painting a real year) gates normally.
    expect(waitForRender).toHaveBeenCalledTimes(1);
  });

  it("does not advance the year until the injected waitForRender resolves (iteration 2+, once this run has actually painted something)", async () => {
    const { fn: waitForRender, resolvers } = makeControllableWaitForRender();
    const { result } = renderHook(() =>
      useTimeline(FIRE_RANGE_LAYERS, { waitForRender, prefersReducedMotion: () => false })
    );

    act(() => result.current.enable());
    const startYear = result.current.currentYear;
    act(() => result.current.togglePlay());

    // Iteration 1 advances for free (Razor W1 -- no gate on the first
    // iteration of a run).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_SPEED);
    });
    const yearAfterFirstAdvance = result.current.currentYear;
    expect(yearAfterFirstAdvance).toBe(startYear + 1);
    expect(waitForRender).toHaveBeenCalledTimes(1); // iteration 2's gate call

    // Dwell + well past it, WITHOUT resolving the render-wait -- must stay gated.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_SPEED * 3);
    });
    expect(result.current.currentYear).toBe(yearAfterFirstAdvance);
    expect(result.current.playing).toBe(true);

    // Resolve the render-wait -- the dwell already elapsed, so the advance
    // should follow almost immediately.
    await act(async () => {
      resolvers[0]();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.currentYear).toBe(yearAfterFirstAdvance + 1);
  });

  it("advances via the watchdog if the injected waitForRender never resolves, and logs it (iteration 2+)", async () => {
    const waitForRender = vi.fn(() => new Promise<void>(() => {})); // never resolves
    const { result } = renderHook(() =>
      useTimeline(FIRE_RANGE_LAYERS, { waitForRender, prefersReducedMotion: () => false })
    );
    act(() => result.current.enable());
    const startYear = result.current.currentYear;
    act(() => result.current.togglePlay());

    // Iteration 1 advances for free (no gate -- Razor W1).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_SPEED);
    });
    expect(result.current.currentYear).toBe(startYear + 1);

    // Iteration 2 gates on the (never-resolving) mock -- must watchdog through.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RENDER_WATCHDOG_MS + DEFAULT_SPEED + 10);
    });

    expect(result.current.currentYear).toBe(startYear + 2);
    expect(pipelineLog).toHaveBeenCalledWith(
      "timeline-watchdog",
      expect.stringContaining(`year=${startYear + 1}`),
      expect.objectContaining({ watchdogMs: RENDER_WATCHDOG_MS })
    );
  });

  it("Razor W3 (mutation lock): a pause DURING the dwell window -- not just the render-gate window -- prevents the pending advance from applying", async () => {
    // The post-dwell cancellation guard (`if (cancelledRef.current || ...)
    // return;` right after `await dwellPromise`) has no other test lock:
    // every other pause test in this file pauses while parked at the
    // render-gate, never mid-dwell. This test fails if that guard is
    // deleted (the dwell's own setTimeout still fires regardless of pause,
    // so without the guard the advance would apply anyway).
    const { fn: waitForRender } = makeControllableWaitForRender();
    const { result } = renderHook(() =>
      useTimeline(FIRE_RANGE_LAYERS, { waitForRender, prefersReducedMotion: () => false })
    );
    act(() => result.current.enable());
    const startYear = result.current.currentYear;
    act(() => result.current.togglePlay());

    // Halfway through iteration 1's dwell (no gate on iteration 1 -- W1).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_SPEED / 2);
    });
    expect(result.current.currentYear).toBe(startYear); // still mid-dwell

    act(() => result.current.togglePlay()); // pause mid-dwell
    expect(result.current.playing).toBe(false);

    // Advance PAST the full dwell duration -- the dwellPromise's own timer
    // fires regardless of pause, but the post-dwell guard must stop the
    // advance from being applied.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_SPEED);
    });

    expect(result.current.currentYear).toBe(startYear);
    expect(result.current.playing).toBe(false);
  });

  it("stops scheduling once paused immediately (before iteration 1's dwell even completes)", async () => {
    const { fn: waitForRender } = makeControllableWaitForRender();
    const { result } = renderHook(() =>
      useTimeline(FIRE_RANGE_LAYERS, { waitForRender, prefersReducedMotion: () => false })
    );
    act(() => result.current.enable());
    const startYear = result.current.currentYear;
    act(() => result.current.togglePlay());
    act(() => result.current.togglePlay()); // pause immediately -- no gate call yet (W1)

    expect(result.current.playing).toBe(false);
    expect(waitForRender).toHaveBeenCalledTimes(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RENDER_WATCHDOG_MS + DEFAULT_SPEED * 2);
    });

    expect(result.current.currentYear).toBe(startYear);
    expect(result.current.playing).toBe(false);
    expect(waitForRender).toHaveBeenCalledTimes(0);
  });

  it("stops scheduling on unmount, even if a stale render-wait later resolves", async () => {
    const { fn: waitForRender, resolvers } = makeControllableWaitForRender();
    const { result, unmount } = renderHook(() =>
      useTimeline(FIRE_RANGE_LAYERS, { waitForRender, prefersReducedMotion: () => false })
    );
    act(() => result.current.enable());
    act(() => result.current.togglePlay());

    // Let iteration 1's dwell elapse so iteration 2 actually calls
    // waitForRender (a real, in-flight render-wait to unmount underneath).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_SPEED);
    });
    expect(resolvers.length).toBe(1);

    unmount();

    // Resolving late + flushing timers must not throw and must not attempt
    // any further scheduling (nothing to assert on `result` post-unmount --
    // this is a "does not throw / does not schedule" smoke test).
    await expect(
      act(async () => {
        resolvers[0]?.();
        await vi.advanceTimersByTimeAsync(RENDER_WATCHDOG_MS + DEFAULT_SPEED * 2);
      })
    ).resolves.not.toThrow();
  });

  it("clamps currentYear to a shrunk range mid-play and then auto-stops at the new end (no stale range)", async () => {
    const waitForRender = vi.fn(() => Promise.resolve());
    const { result, rerender } = renderHook(
      ({ layers }: { layers: LayerDefinition[] }) =>
        useTimeline(layers, { waitForRender, prefersReducedMotion: () => false }),
      { initialProps: { layers: FIRE_RANGE_LAYERS } }
    );
    act(() => result.current.enable());
    act(() => result.current.setYear(2020));
    act(() => result.current.togglePlay());

    const SHRUNK = [{ timelineRange: [1950, 2015] }] as unknown as LayerDefinition[];
    act(() => rerender({ layers: SHRUNK }));

    // The (untouched) clamp-on-range-change effect fires immediately.
    expect(result.current.range).toEqual([1950, 2015]);
    expect(result.current.currentYear).toBeLessThanOrEqual(2015);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_SPEED * 2);
    });

    // The loop's own advance also respects the fresh range and auto-stops there.
    expect(result.current.currentYear).toBe(2015);
    expect(result.current.playing).toBe(false);
  });

  it("attaches the render-wait listener synchronously right after each advance -- before React commits the new year (ordering invariant)", async () => {
    const order: string[] = [];
    const { fn: waitForRender, resolvers } = makeControllableWaitForRender(order);

    function useHarness() {
      const timeline = useTimeline(FIRE_RANGE_LAYERS, {
        waitForRender,
        prefersReducedMotion: () => false,
      });
      useEffect(() => {
        order.push(`commit-${timeline.currentYear}`);
      }, [timeline.currentYear]);
      return timeline;
    }

    const { result } = renderHook(() => useHarness());
    // Initial mount uses the hook's hardcoded DEFAULT_RANGE[0] (1950), NOT
    // the fire-history range -- unchanged pre-existing behavior (enable()
    // is what actually seeds currentYear from `range[0]`).
    expect(order).toEqual(["commit-1950"]);

    act(() => result.current.enable()); // 1950 -> 1917 (range[0]) -- a real commit
    expect(order).toEqual(["commit-1950", "commit-1917"]);

    act(() => result.current.togglePlay());
    // Iteration 1 does NOT call waitForRender (Razor W1 -- nothing painted
    // yet this run to gate on); it goes straight to the dwell.
    expect(order).toEqual(["commit-1950", "commit-1917"]);

    // Let iteration 1's dwell elapse -- its advance (to 1918) is what
    // iteration 2 gates on. This is the transition the invariant covers:
    // waitForRender must be called for 1918's paint SYNCHRONOUSLY, in the
    // same tick as the setCurrentYear(1918) call that ends iteration 1 --
    // before React has a chance to commit that render.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_SPEED);
    });

    const idxCall = order.indexOf("waitForRender-call-0");
    const idxCommit1918 = order.indexOf("commit-1918");
    expect(idxCall).toBeGreaterThan(-1);
    expect(idxCommit1918).toBeGreaterThan(-1);
    expect(idxCall).toBeLessThan(idxCommit1918);

    // And the SAME invariant holds again on the next transition (1918 -> 1919).
    await act(async () => {
      resolvers[0]();
      await vi.advanceTimersByTimeAsync(DEFAULT_SPEED);
    });
    const idxNextCall = order.indexOf("waitForRender-call-1");
    const idxNextCommit = order.indexOf("commit-1919");
    expect(idxNextCall).toBeGreaterThan(-1);
    expect(idxNextCommit).toBeGreaterThan(-1);
    expect(idxNextCall).toBeLessThan(idxNextCommit);
  });

  it("exposes a debounced `rendering` flag only once a step's render-wait has been pending > 500ms", async () => {
    const { fn: waitForRender, resolvers } = makeControllableWaitForRender();
    const { result } = renderHook(() =>
      useTimeline(FIRE_RANGE_LAYERS, { waitForRender, prefersReducedMotion: () => false })
    );
    act(() => result.current.enable());
    act(() => result.current.togglePlay());

    // Iteration 1 has no gate (W1), so let its dwell elapse first --
    // iteration 2 is the first one that actually starts a render-wait for
    // the debounce timer to measure.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_SPEED);
    });
    expect(waitForRender).toHaveBeenCalledTimes(1);
    expect(result.current.rendering).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(499);
    });
    expect(result.current.rendering).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(result.current.rendering).toBe(true);

    await act(async () => {
      resolvers[0]();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.rendering).toBe(false);
  });
});

describe("useTimeline — carried-over transport semantics (regression lock)", () => {
  it("a manual setYear during a dwell wins over the loop's own advance", async () => {
    const waitForRender = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() =>
      useTimeline(FIRE_RANGE_LAYERS, { waitForRender, prefersReducedMotion: () => false })
    );
    act(() => result.current.enable()); // 1917
    act(() => result.current.togglePlay());

    // Let the (already-resolved) render-wait's microtask chain settle, which
    // lands the loop inside its dwell await -- the window where a user scrub
    // must win.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    act(() => result.current.setYear(1950));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_SPEED);
    });

    expect(result.current.currentYear).toBe(1951);
  });

  it("clamps the advance at stepSize=10 so currentYear never exceeds range[1] (overshoot guard)", async () => {
    const waitForRender = vi.fn(() => Promise.resolve());
    const SMALL_RANGE = [{ timelineRange: [2010, 2019] }] as unknown as LayerDefinition[];
    const { result } = renderHook(() =>
      useTimeline(SMALL_RANGE, { waitForRender, prefersReducedMotion: () => false })
    );
    act(() => result.current.enable()); // 2010
    act(() => result.current.setStepSize(10));
    act(() => result.current.togglePlay());

    // Two full render-gate + dwell cycles: 2010 -> 2019 (clamped), then the
    // loop confirms 2019's paint and auto-stops -- give it enough passes.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_SPEED * 3);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_SPEED * 3);
    });

    expect(result.current.currentYear).toBe(2019);
    expect(result.current.currentYear).toBeLessThanOrEqual(2019);
    expect(result.current.playing).toBe(false);
  });

  it("restarts to range[0] when togglePlay is pressed while already at range[1]", () => {
    const { result } = renderHook(() => useTimeline(FIRE_RANGE_LAYERS));
    act(() => result.current.enable());
    act(() => result.current.setYear(2025));
    act(() => result.current.togglePlay());

    expect(result.current.currentYear).toBe(1917);
    expect(result.current.playing).toBe(true);
  });

  it("enable() and disable() both reset currentYear to range[0]", () => {
    const { result } = renderHook(() => useTimeline(FIRE_RANGE_LAYERS));
    act(() => result.current.enable());
    expect(result.current.currentYear).toBe(1917);

    act(() => result.current.setYear(2000));
    expect(result.current.currentYear).toBe(2000);

    act(() => result.current.disable());
    expect(result.current.currentYear).toBe(1917);
  });
});

describe("useTimeline — reduced motion (WCAG 2.2.2)", () => {
  it("play performs a single idle-gated jump-to-end, not a continuous loop", async () => {
    const waitForRender = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() =>
      useTimeline(FIRE_RANGE_LAYERS, { waitForRender, prefersReducedMotion: () => true })
    );
    act(() => result.current.enable()); // 1917
    act(() => result.current.togglePlay());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.currentYear).toBe(2025);
    expect(result.current.playing).toBe(false);
    expect(waitForRender).toHaveBeenCalledTimes(1);

    // No interval scheduled -- waiting further does nothing more.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(result.current.currentYear).toBe(2025);
    expect(waitForRender).toHaveBeenCalledTimes(1);
  });

  it("pressing play again while at the end restarts to start then jumps back to end (no dead-end)", async () => {
    // togglePlay's restart-at-end check (unchanged, shared with the
    // non-reduced-motion path) fires FIRST -- setCurrentYear(range[0]) is
    // batched together with the setPlaying(true) that follows it, and the
    // effect's own setCurrentYear(range[1]) then runs synchronously within
    // the SAME act() flush (no await before it) -- so the 1917 waypoint is
    // real (it's what makes this "restart then jump" rather than a no-op)
    // but isn't independently observable via result.current between two
    // synchronous state transitions in one commit cascade. What IS
    // observable and proves the no-dead-end contract: the render-gate
    // machinery runs AGAIN (a second waitForRender call) rather than
    // bailing out because "we're already at range[1]".
    const waitForRender = vi.fn(() => Promise.resolve());
    const { result } = renderHook(() =>
      useTimeline(FIRE_RANGE_LAYERS, { waitForRender, prefersReducedMotion: () => true })
    );
    act(() => result.current.enable());
    act(() => result.current.togglePlay());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.currentYear).toBe(2025);
    expect(waitForRender).toHaveBeenCalledTimes(1);

    act(() => result.current.togglePlay());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(waitForRender).toHaveBeenCalledTimes(2); // ran again -- not a no-op
    expect(result.current.currentYear).toBe(2025); // lands back at the end
    expect(result.current.playing).toBe(false);
  });
});
