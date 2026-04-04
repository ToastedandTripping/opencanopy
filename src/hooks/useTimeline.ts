"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { LayerDefinition } from "@/types/layers";

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
 */
export function useTimeline(activeTimelineLayers?: LayerDefinition[]) {
  const [enabled, setEnabled] = useState(false);
  const [currentYear, setCurrentYear] = useState(DEFAULT_RANGE[0]);
  const [playing, setPlaying] = useState(false);
  const [playSpeed, setPlaySpeedState] = useState(DEFAULT_SPEED);
  const [stepSize, setStepSize] = useState(1);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  // Clamp currentYear when range changes (e.g. a layer is toggled off that
  // extended the range, or a new layer with a different range is enabled).
  useEffect(() => {
    setCurrentYear((prev) => {
      if (prev < range[0]) return range[0];
      if (prev > range[1]) return range[1];
      return prev;
    });
  }, [range]);

  // Manage the play interval -- restart whenever playing, playSpeed, or range changes
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (!playing) return;

    intervalRef.current = setInterval(() => {
      setCurrentYear((prev) => {
        const next = prev + stepSize;
        if (next >= range[1]) {
          // Reached the end -- auto-pause
          setPlaying(false);
          return range[1];
        }
        return next;
      });
    }, playSpeed);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [playing, playSpeed, range, stepSize]);

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

  const play = useCallback(() => {
    // If at the end, restart from the beginning
    setCurrentYear((prev) => {
      if (prev >= range[1]) return range[0];
      return prev;
    });
    setPlaying(true);
  }, [range]);

  const pause = useCallback(() => {
    setPlaying(false);
  }, []);

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
    enable,
    disable,
    play,
    pause,
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
