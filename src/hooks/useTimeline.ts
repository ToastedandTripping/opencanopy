"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { LayerDefinition } from "@/types/layers";
import { pipelineLog } from "@/lib/debug/pipeline-logger";

export interface TimelineState {
  /** Whether the timeline UI is shown */
  enabled: boolean;
  /** The year currently being displayed */
  currentYear: number;
  /** Whether the play animation is running */
  playing: boolean;
  /** Milliseconds per year step (400 = ~30s for 75 years) */
  playSpeed: number;
  /** [startYear, endYear] -- derived from active layers' timelineRange */
  range: [number, number];
}

const DEFAULT_RANGE: [number, number] = [1950, 2025];
const DEFAULT_SPEED = 400;

/** How long the render-gate will wait for `map.once('idle')` before giving
 *  up and advancing anyway (the "honesty degrades to slow, never deadlocks"
 *  guarantee -- see the plan's pre-mortem #2). Exported so page.tsx's real
 *  `waitForRender` can share the same constant (single source of truth) for
 *  its own internal timeout. */
export const RENDER_WATCHDOG_MS = 1800;

/** A step's `waitForRender()` must be pending longer than this before the
 *  "rendering..." chip appears -- avoids flicker on fast (already-idle)
 *  repaints. */
const RENDERING_DEBOUNCE_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface UseTimelineOptions {
  /** Resolves once the map has settled (no pending tiles, no running
   *  transitions) after the current year's setFilter has been applied.
   *  Injected so this hook stays maplibre-free and fully unit-testable --
   *  the hook never imports maplibre or reads a map ref directly. Defaults
   *  to an immediately-resolving promise, which degrades gracefully to
   *  today's dwell-timed cadence when no map is available (SSR, keyless
   *  sandbox, or a caller that hasn't wired one up). */
  waitForRender?: () => Promise<void>;
  /** Returns true when the user prefers reduced motion. Called fresh on
   *  every check (never cached inside this hook) so tests -- and a live OS
   *  setting change -- are always honored. Mirrors the injectable-matchMedia
   *  pattern in useScrollytelling.ts (cached MediaQueryList keyed on
   *  window.matchMedia identity); the caller is expected to build the
   *  function the same way. Defaults to `() => false`. */
  prefersReducedMotion?: () => boolean;
}

const defaultWaitForRender = () => Promise.resolve();
const defaultPrefersReducedMotion = () => false;

/**
 * Timeline hook for year-range animation.
 *
 * Accepts an optional list of active LayerDefinitions that have timelineField
 * set. When provided, derives the merged [startYear, endYear] range from the
 * union of all active layers' timelineRange values.
 *
 * IMPORTANT: range is derived (not stored in useState) to avoid the
 * "useState freeze" bug (Razor W1) where the play interval closes over a
 * stale range value. The range is computed on every render, so the interval
 * always sees the current value via the effect dependency.
 *
 * SCHEDULER CONTRACT (Phase A, honest timeline -- replaces the old fixed
 * setInterval scheduler): `currentYear` is the single source of truth,
 * driving both the bar display AND the map's yearFilter (see `yearFilter`
 * below). While playing, a self-rescheduling async loop advances the year
 * ONLY after the prior year's paint has settled (gated on the injected
 * `waitForRender`, itself raced against a `RENDER_WATCHDOG_MS` timeout so a
 * paint that never settles can't deadlock playback). This makes it
 * structurally impossible for the displayed year to outrun the map's actual
 * render -- "speed" becomes a minimum dwell-per-year, not a hard timer.
 *
 * Stale-closure discipline (mirrors the W1/W2 mitigations above -- do NOT
 * regress them with this scheduler):
 *   - The play loop lives in a `useEffect` keyed ONLY on `[playing]`. Every
 *     other value the loop needs (range, stepSize, playSpeed, the injected
 *     waitForRender/prefersReducedMotion) is read from a ref that's kept
 *     fresh every render -- never captured in the effect's closure.
 *   - The year ADVANCE always uses the functional-updater form of
 *     `setCurrentYear` (reading the live `prev`, never a loop-local
 *     captured year), clamped with `Math.min(prev + stepSize, range[1])`.
 *     This is what lets a mid-play manual scrub (`setYear`) or an
 *     arrow-step (`stepForward`/`stepBackward`, fired while playing) WIN --
 *     the loop's next advance builds on top of wherever the user moved it,
 *     exactly as the old interval-based scheduler did via its own
 *     functional updater.
 *   - `runIdRef` (incremented each time the play effect starts) plus
 *     `cancelledRef` (set by the effect's cleanup) let an in-flight loop
 *     detect it's stale -- either paused/unmounted (cancelledRef) or
 *     superseded by a newer play cycle whose setup reset cancelledRef back
 *     to false before this one noticed (runIdRef) -- and bail without
 *     scheduling further work.
 *   - The idle listener is registered SYNCHRONOUSLY, in the same tick as the
 *     `setCurrentYear` call that will trigger the next setFilter (no `await`
 *     in between). This ordering is load-bearing: if the listener attached
 *     AFTER React had a chance to flush and DataLayer's effect had already
 *     kicked off (and possibly finished) a fast repaint, the idle event
 *     could fire before we're listening, and that year would silently pay
 *     the full RENDER_WATCHDOG_MS instead of the real (short) render time.
 *   - The derived `range` (useMemo) and the clamp-on-range-change effect
 *     below are the W1/W2 fix and are NOT touched by this scheduler change.
 */
export function useTimeline(
  activeTimelineLayers?: LayerDefinition[],
  options?: UseTimelineOptions
) {
  const [enabled, setEnabled] = useState(false);
  const [currentYear, setCurrentYear] = useState(DEFAULT_RANGE[0]);
  const [playing, setPlaying] = useState(false);
  const [playSpeed, setPlaySpeedState] = useState(DEFAULT_SPEED);
  const [stepSize, setStepSize] = useState(1);
  const [rendering, setRendering] = useState(false);

  const waitForRender = options?.waitForRender ?? defaultWaitForRender;
  const prefersReducedMotion = options?.prefersReducedMotion ?? defaultPrefersReducedMotion;

  /**
   * Merge the timelineRange values of all active layers.
   * Takes the minimum start year and maximum end year across all active layers.
   * Falls back to DEFAULT_RANGE when no active layers have timelineRange set.
   */
  const range = useMemo<[number, number]>(() => {
    if (!activeTimelineLayers || activeTimelineLayers.length === 0) {
      return DEFAULT_RANGE;
    }
    const layersWithRange = activeTimelineLayers.filter((l) => l.timelineRange);
    if (layersWithRange.length === 0) return DEFAULT_RANGE;

    const startYear = Math.min(...layersWithRange.map((l) => l.timelineRange![0]));
    const endYear = Math.max(...layersWithRange.map((l) => l.timelineRange![1]));
    return [startYear, endYear];
  }, [activeTimelineLayers]);

  // ── Always-fresh refs (the stale-closure guard) ─────────────────────────
  // Assigned during render (not in an effect) so the play loop -- which runs
  // across many awaits, well outside any single render -- always reads the
  // LIVE value on its next synchronous check, never a value captured when
  // the effect started.
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const stepSizeRef = useRef(stepSize);
  stepSizeRef.current = stepSize;
  const playSpeedRef = useRef(playSpeed);
  playSpeedRef.current = playSpeed;
  const currentYearRef = useRef(currentYear);
  currentYearRef.current = currentYear;
  const waitForRenderRef = useRef(waitForRender);
  waitForRenderRef.current = waitForRender;
  const prefersReducedMotionRef = useRef(prefersReducedMotion);
  prefersReducedMotionRef.current = prefersReducedMotion;

  // Re-entrancy guards for the async play loop.
  const runIdRef = useRef(0);
  const cancelledRef = useRef(false);
  const renderingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearRenderingTimer = useCallback(() => {
    if (renderingTimerRef.current) {
      clearTimeout(renderingTimerRef.current);
      renderingTimerRef.current = null;
    }
  }, []);

  // Clamp currentYear when range changes (e.g. a layer is toggled off that
  // extended the range, or a new layer with a different range is enabled).
  // P1c: kept as a setState-in-effect deliberately, not refactored. This is
  // a legitimate synchronize-with-a-derived-value effect (range is derived,
  // not stored — see the useMemo above and its "useState freeze" comment),
  // and this hook has prior stale-closure bug history (Razor W1/W2) that a
  // structural rewrite risks reintroducing.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentYear((prev) => {
      if (prev < range[0]) return range[0];
      if (prev > range[1]) return range[1];
      return prev;
    });
  }, [range]);

  // ── Render-gated play loop ───────────────────────────────────────────
  // Effect keyed ONLY on [playing] -- every other input is read from a ref
  // above, never a closure var, so this effect body only re-runs when play
  // actually starts or stops (matching the old scheduler's dependency
  // discipline, just with a different trigger set).
  useEffect(() => {
    if (!playing) return;

    cancelledRef.current = false;
    const runId = ++runIdRef.current;

    /** Race the injected waitForRender against the watchdog, tracking the
     *  debounced "rendering" chip and reporting whether the watchdog won
     *  (so the caller can pipelineLog it -- a diagnosable field report for
     *  "the timeline crawls on my machine"). */
    async function waitForPaintTracked(): Promise<boolean> {
      clearRenderingTimer();
      renderingTimerRef.current = setTimeout(() => {
        renderingTimerRef.current = null;
        setRendering(true);
      }, RENDERING_DEBOUNCE_MS);

      const winner = await Promise.race([
        waitForRenderRef.current().then(() => "render" as const),
        sleep(RENDER_WATCHDOG_MS).then(() => "watchdog" as const),
      ]);

      clearRenderingTimer();
      setRendering(false);
      return winner === "watchdog";
    }

    async function runContinuousLoop() {
      // eslint-disable-next-line no-constant-condition
      while (true) {
        if (cancelledRef.current || runIdRef.current !== runId) return;

        // Render-wait and the minimum dwell run CONCURRENTLY -- the actual
        // per-year cadence is max(dwell, render time), not their sum (a
        // fast repaint still waits out the chosen "speed"; a slow repaint
        // is never rushed past dwell).
        const dwellPromise = sleep(playSpeedRef.current);
        const watchdogFired = await waitForPaintTracked();
        if (watchdogFired) {
          pipelineLog("timeline-watchdog", `year=${currentYearRef.current}`, {
            watchdogMs: RENDER_WATCHDOG_MS,
          });
        }
        if (cancelledRef.current || runIdRef.current !== runId) return;

        // The year whose paint we just confirmed is already the end of the
        // range -- we're done. This is what makes "final year settled
        // before we stop" true: we only reach this branch AFTER a
        // waitForPaintTracked() call for that exact year.
        if (currentYearRef.current >= rangeRef.current[1]) {
          setPlaying(false);
          return;
        }

        await dwellPromise;
        if (cancelledRef.current || runIdRef.current !== runId) return;

        // Advance via the FUNCTIONAL UPDATER, reading the live `prev` --
        // never a loop-local captured year. A mid-play manual scrub
        // (setYear) or an arrow-step (stepForward/stepBackward) that landed
        // between the last render and now is what `prev` reflects here, so
        // it wins: our advance builds on top of it rather than clobbering
        // it. `Math.min(..., range[1])` preserves the overshoot guard (at
        // stepSize=10, prev+10 can exceed range[1]).
        setCurrentYear((prev) => Math.min(prev + stepSizeRef.current, rangeRef.current[1]));
        // Loop back to the top immediately (no await before the next
        // waitForPaintTracked() call) -- this is the synchronous
        // attach-before-flush ordering the docstring above calls load-bearing.
      }
    }

    async function runReducedMotionJump() {
      // No continuous auto-advance under prefers-reduced-motion (WCAG
      // 2.2.2). togglePlay's existing restart-at-end check already moved
      // currentYear to range[0] before this effect ran if we were sitting
      // at the end, so this is always either "jump from wherever the user
      // is" or, after that restart, "jump from the start" -- satisfying the
      // "restarts to start then jumps to end" pinned RM play-at-end
      // semantics without any RM-specific branching in togglePlay itself.
      setCurrentYear(rangeRef.current[1]);
      const watchdogFired = await waitForPaintTracked();
      if (watchdogFired) {
        pipelineLog("timeline-watchdog", `year=${rangeRef.current[1]}`, {
          watchdogMs: RENDER_WATCHDOG_MS,
          reducedMotion: true,
        });
      }
      if (cancelledRef.current || runIdRef.current !== runId) return;
      setPlaying(false);
    }

    if (prefersReducedMotionRef.current()) {
      runReducedMotionJump();
    } else {
      runContinuousLoop();
    }

    return () => {
      cancelledRef.current = true;
      clearRenderingTimer();
      setRendering(false);
    };
  }, [playing, clearRenderingTimer]);

  // enable() and disable() reset to range[0], not DEFAULT_RANGE[0].
  // Deps include range to avoid stale closure (Razor W2).
  const enable = useCallback(() => {
    setEnabled(true);
    setCurrentYear(range[0]);
    setPlaying(false);
  }, [range]);

  const disable = useCallback(() => {
    setEnabled(false);
    setPlaying(false);
    setCurrentYear(range[0]);
  }, [range]);

  const togglePlay = useCallback(() => {
    setPlaying((prev) => {
      if (!prev) {
        // Starting play -- if at end, restart
        setCurrentYear((year) => {
          if (year >= range[1]) return range[0];
          return year;
        });
      }
      return !prev;
    });
  }, [range]);

  const setYear = useCallback(
    (year: number) => {
      const clamped = Math.max(range[0], Math.min(range[1], year));
      setCurrentYear(clamped);
    },
    [range]
  );

  const setSpeed = useCallback((ms: number) => {
    setPlaySpeedState(ms);
  }, []);

  const stepForward = useCallback(() => {
    setCurrentYear((prev) => Math.min(prev + stepSize, range[1]));
  }, [range, stepSize]);

  const stepBackward = useCallback(() => {
    setCurrentYear((prev) => Math.max(prev - stepSize, range[0]));
  }, [range, stepSize]);

  /** null when timeline is disabled, currentYear when enabled */
  const yearFilter = enabled ? currentYear : null;

  return {
    enabled,
    currentYear,
    playing,
    playSpeed,
    range,
    rendering,
    enable,
    disable,
    togglePlay,
    setYear,
    setSpeed,
    stepForward,
    stepBackward,
    stepSize,
    setStepSize,
    yearFilter,
  };
}
