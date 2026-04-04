"use client";

import { useCallback, useMemo } from "react";

interface TimelineControlProps {
  currentYear: number;
  playing: boolean;
  playSpeed: number;
  range: [number, number];
  stepSize: number;
  onTogglePlay: () => void;
  onSetYear: (year: number) => void;
  onSetSpeed: (ms: number) => void;
  onSetStepSize: (size: number) => void;
  onClose: () => void;
}

const SPEED_OPTIONS = [
  { label: "0.5x", value: 800 },
  { label: "1x", value: 400 },
  { label: "2x", value: 200 },
] as const;

/**
 * Cinematic timeline scrubber for animating feature accumulation over time.
 * Positioned above the preset chips bar at the bottom of the map.
 */
export function TimelineControl({
  currentYear,
  playing,
  playSpeed,
  range,
  stepSize,
  onTogglePlay,
  onSetYear,
  onSetSpeed,
  onSetStepSize,
  onClose,
}: TimelineControlProps) {
  const totalYears = range[1] - range[0];

  /**
   * Compute decade markers dynamically from the active range.
   * Rounds up from range[0] to the nearest decade, then steps by 10
   * through to range[1]. This ensures markers adapt when fire-history
   * expands the range back to 1917.
   */
  const decadeMarkers = useMemo<number[]>(() => {
    const markers: number[] = [];
    // First decade boundary at or above range[0]
    const firstDecade = Math.ceil(range[0] / 10) * 10;
    for (let y = firstDecade; y <= range[1]; y += 10) {
      markers.push(y);
    }
    return markers;
  }, [range]);

  const handleSliderChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onSetYear(Number(e.target.value));
    },
    [onSetYear]
  );

  /** Calculate percentage position for a given year within the range */
  const yearToPercent = (year: number) =>
    ((year - range[0]) / totalYears) * 100;

  return (
    <div className="w-full px-3 sm:px-4 py-3 rounded-xl bg-black/80 backdrop-blur-xl border border-white/10">
      {/* Top row: year display + controls */}
      <div className="flex items-center justify-between gap-3 mb-2">
        {/* Play/Pause + Year */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onTogglePlay}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors focus-visible:ring-2 focus-visible:ring-white/30"
            title={playing ? "Pause" : "Play"}
            aria-label={playing ? "Pause timeline" : "Play timeline"}
          >
            {playing ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M8 5.14v14.72a1 1 0 001.5.86l11.28-7.36a1 1 0 000-1.72L9.5 4.28A1 1 0 008 5.14z" />
              </svg>
            )}
          </button>

          <span className="text-white text-2xl font-light tabular-nums tracking-tight select-none min-w-[4ch]">
            {currentYear}
          </span>
        </div>

        {/* Speed + Close */}
        <div className="flex items-center gap-1.5">
          {SPEED_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onSetSpeed(opt.value)}
              className={`
                px-2 py-1 rounded text-[10px] font-medium transition-colors
                ${
                  playSpeed === opt.value
                    ? "bg-teal-400/20 text-teal-300"
                    : "text-zinc-500 hover:text-zinc-300"
                }
              `}
              title={`Playback speed ${opt.label}`}
              aria-label={`Set speed to ${opt.label}`}
            >
              {opt.label}
            </button>
          ))}

          <div className="w-px h-4 bg-white/10 mx-1" />

          {/* Step size toggle: 1yr / 10yr */}
          {([1, 10] as const).map((size) => (
            <button
              key={size}
              onClick={() => onSetStepSize(size)}
              className={`
                px-2 py-1 rounded text-[10px] font-medium transition-colors
                ${
                  stepSize === size
                    ? "bg-teal-400/20 text-teal-300"
                    : "text-zinc-500 hover:text-zinc-300"
                }
              `}
              title={`Step ${size === 1 ? "1 year" : "10 years"} at a time`}
              aria-label={`Set step size to ${size} year${size > 1 ? "s" : ""}`}
            >
              {size === 1 ? "1yr" : "10yr"}
            </button>
          ))}

          <div className="w-px h-4 bg-white/10 mx-1" />

          <button
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded text-zinc-500 hover:text-white hover:bg-white/10 transition-colors"
            title="Close timeline"
            aria-label="Close timeline"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="w-3.5 h-3.5"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Slider row */}
      <div className="relative">
        {/* Decade markers -- skip extremes to avoid edge clipping */}
        <div className="relative h-4 mb-0.5" aria-hidden="true">
          {decadeMarkers.filter((year) => {
            const pct = yearToPercent(year);
            return pct > 5 && pct < 95;
          }).map((year) => {
            const pct = yearToPercent(year);
            return (
              <span
                key={year}
                className="absolute text-[9px] text-zinc-600 -translate-x-1/2 select-none"
                style={{ left: `${pct}%` }}
              >
                {year}
              </span>
            );
          })}
        </div>

        {/* Range input with tick marks */}
        <div className="relative">
          {/* Decade tick lines */}
          <div
            className="absolute inset-x-0 top-0 h-full pointer-events-none"
            aria-hidden="true"
          >
            {decadeMarkers.map((year) => {
              const pct = yearToPercent(year);
              return (
                <div
                  key={year}
                  className="absolute top-1/2 -translate-y-1/2 w-px h-2 bg-zinc-600"
                  style={{ left: `${pct}%` }}
                />
              );
            })}
          </div>

          <input
            type="range"
            min={range[0]}
            max={range[1]}
            value={currentYear}
            onChange={handleSliderChange}
            className="timeline-slider w-full h-2 appearance-none cursor-pointer rounded-full bg-zinc-800 outline-none"
            style={{ "--track-fill": `${yearToPercent(currentYear)}%` } as React.CSSProperties}
            aria-label="Timeline year"
            aria-valuemin={range[0]}
            aria-valuemax={range[1]}
            aria-valuenow={currentYear}
            aria-valuetext={String(currentYear)}
          />
        </div>

        {/* Range labels */}
        <div className="flex justify-between mt-0.5">
          <span className="text-[10px] text-zinc-600 select-none">
            {range[0]}
          </span>
          <span className="text-[10px] text-zinc-600 select-none">
            {range[1]}
          </span>
        </div>
      </div>

      {/* Slider styles are in globals.css (.timeline-slider). Track fill
          driven by --track-fill CSS custom property set on the <input>. */}
    </div>
  );
}
