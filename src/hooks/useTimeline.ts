"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export interface TimelineState {
  /** Whether the timeline UI is shown */
  enabled: boolean;
  /** The year currently being displayed */
  currentYear: number;
  /** Whether the play animation is running */
  playing: boolean;
  /** Milliseconds per year step (400 = ~30s for 75 years) */
  playSpeed: number;
  /** [startYear, endYear] */
  range: [number, number];
}

const DEFAULT_RANGE: [number, number] = [1950, 2025];
const DEFAULT_SPEED = 400;

export function useTimeline() {
  const [enabled, setEnabled] = useState(false);
  const [currentYear, setCurrentYear] = useState(DEFAULT_RANGE[0]);
  const [playing, setPlaying] = useState(false);
  const [playSpeed, setPlaySpeedState] = useState(DEFAULT_SPEED);
  const [stepSize, setStepSize] = useState(1);
  const [range] = useState<[number, number]>(DEFAULT_RANGE);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

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

  const enable = useCallback(() => {
    setEnabled(true);
    setCurrentYear(DEFAULT_RANGE[0]);
    setPlaying(false);
  }, []);

  const disable = useCallback(() => {
    setEnabled(false);
    setPlaying(false);
    setCurrentYear(DEFAULT_RANGE[0]);
  }, []);

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
