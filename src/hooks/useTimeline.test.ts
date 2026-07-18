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
  it("does not advance the year until the injected waitForRender resolves", async () => {
    const { fn: waitForRender, resolvers } = makeControllableWaitForRender();
    const { result } = renderHook(() =>
      useTimeline(FIRE_RANGE_LAYERS, { waitForRender, prefersReducedMotion: () => false })
    );

    act(() => result.current.enable());
    const startYear = result.current.currentYear;
    act(() => result.current.togglePlay());

    expect(waitForRender).toHaveBeenCalledTimes(1);

    // Dwell + well past it, WITHOUT resolving the render-wait -- must stay gated.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_SPEED * 3);
    });
    expect(result.current.currentYear).toBe(startYear);
    expect(result.current.playing).toBe(true);

    // Resolve the render-wait -- the dwell already elapsed, so the advance
    // should follow almost immediately.
    await act(async () => {
      resolvers[0]();
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.currentYear).toBe(startYear + 1);
  });

  it("advances via the watchdog if the injected waitForRender never resolves, and logs it", async () => {
    const waitForRender = vi.fn(() => new Promise<void>(() => {})); // never resolves
    const { result } = renderHook(() =>
      useTimeline(FIRE_RANGE_LAYERS, { waitForRender, prefersReducedMotion: () => false })
    );
    act(() => result.current.enable());
    const startYear = result.current.currentYear;
    act(() => result.current.togglePlay());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RENDER_WATCHDOG_MS + DEFAULT_SPEED + 10);
    });

    expect(result.current.currentYear).toBe(startYear + 1);
    expect(pipelineLog).toHaveBeenCalledWith(
      "timeline-watchdog",
      expect.stringContaining(`year=${startYear}`),
      expect.objectContaining({ watchdogMs: RENDER_WATCHDOG_MS })
    );
  });

  it("stops scheduling once paused, even if a stale render-wait later resolves", async () => {
    const { fn: waitForRender, resolvers } = makeControllableWaitForRender();
    const { result } = renderHook(() =>
      useTimeline(FIRE_RANGE_LAYERS, { waitForRender, prefersReducedMotion: () => false })
    );
    act(() => result.current.enable());
    const startYear = result.current.currentYear;
    act(() => result.current.togglePlay());
    act(() => result.current.togglePlay()); // pause immediately

    expect(result.current.playing).toBe(false);

    await act(async () => {
      resolvers[0]?.();
      await vi.advanceTimersByTimeAsync(RENDER_WATCHDOG_MS + DEFAULT_SPEED * 2);
    });

    expect(result.current.currentYear).toBe(startYear);
    expect(result.current.playing).toBe(false);
  });

  it("stops scheduling on unmount, even if a stale render-wait later resolves", async () => {
    const { fn: waitForRender, resolvers } = makeControllableWaitForRender();
    const { result, unmount } = renderHook(() =>
      useTimeline(FIRE_RANGE_LAYERS, { waitForRender, prefersReducedMotion: () => false })
    );
    act(() => result.current.enable());
    act(() => result.current.togglePlay());

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
    expect(order).toEqual(["commit-1950", "commit-1917", "waitForRender-call-0"]);

    await act(async () => {
      resolvers[0]();
      await vi.advanceTimersByTimeAsync(DEFAULT_SPEED);
    });

    const idxNextCall = order.indexOf("waitForRender-call-1");
    const idxNextCommit = order.indexOf("commit-1918");
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
