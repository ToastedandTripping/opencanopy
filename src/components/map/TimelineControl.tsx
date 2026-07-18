"use client";

import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { getScentedTrack, cumulativeHectares } from "@/lib/timeline/scented-track";

interface TimelineControlProps {
  currentYear: number;
  playing: boolean;
  playSpeed: number;
  range: [number, number];
  stepSize: number;
  /** True while the current step's render-gate has been pending > 500ms
   *  (useTimeline's debounced signal) -- shows the "rendering…" chip. */
  rendering: boolean;
  /** Live prefers-reduced-motion snapshot -- swaps the play button's
   *  label/behavior description to the jump-to-end variant. */
  prefersReducedMotion: boolean;
  /** Ids of the currently-active timeline-eligible layers. Drives the
   *  scented histogram + cumulative readout: only shown when this is
   *  exactly ["fire-history"] (see scented-track.ts for why). */
  activeLayerIds: string[];
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

/** "22,089,171" -> "22.1M"; "7,061,938" -> "7.1M"; small values -> "12K" / "340". */
function formatHectares(ha: number): string {
  if (ha >= 1_000_000) return `${(ha / 1_000_000).toFixed(1)}M`;
  if (ha >= 1_000) return `${Math.round(ha / 1000)}K`;
  return `${Math.round(ha)}`;
}

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
  rendering,
  prefersReducedMotion,
  activeLayerIds,
  onTogglePlay,
  onSetYear,
  onSetSpeed,
  onSetStepSize,
  onClose,
}: TimelineControlProps) {
  const totalYears = range[1] - range[0];

  // Scented track (fire-history sole-active only -- see scented-track.ts).
  // Null for every other layer combination, which renders the plain track
  // exactly as before this plan.
  const scentedTrack = useMemo(() => getScentedTrack(activeLayerIds), [activeLayerIds]);

  const maxDelta = useMemo(() => {
    if (!scentedTrack) return 0;
    return Math.max(...scentedTrack.deltas, 0);
  }, [scentedTrack]);

  const cumulativeHa = useMemo(() => {
    if (!scentedTrack) return null;
    return cumulativeHectares(scentedTrack, currentYear);
  }, [scentedTrack, currentYear]);

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

  // ── SR announcements (§5): boundaries only (start / end / pause), never
  // per-year -- render-gating makes an "arrived" announcement true rather
  // than premature, but spamming one per year would still be noise.
  const [announcement, setAnnouncement] = useState("");
  const prevPlayingRef = useRef(playing);
  useEffect(() => {
    const wasPlaying = prevPlayingRef.current;
    if (!wasPlaying && playing) {
      setAnnouncement("Playback started");
    } else if (wasPlaying && !playing) {
      if (currentYear >= range[1]) {
        setAnnouncement(`Reached ${range[1]}. Playback complete.`);
      } else {
        setAnnouncement(`Paused at ${currentYear}`);
      }
    }
    prevPlayingRef.current = playing;
    // currentYear intentionally omitted -- this effect only cares about the
    // playing transition; the year is read fresh at the moment it fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, range]);

  const playLabel = prefersReducedMotion
    ? playing
      ? "Jumping to end…"
      : "Jump to end (reduced motion)"
    : playing
      ? "Pause"
      : "Play";

  // Enriched aria-valuetext (§5): cumulative phrasing when the scented track
  // is available, plain year otherwise (plain-track layers/combinations).
  const ariaValueText =
    cumulativeHa != null
      ? `${currentYear} — ${formatHectares(cumulativeHa)} hectares burned through ${currentYear}`
      : String(currentYear);

  return (
    <div className="w-full px-3 sm:px-4 py-3 rounded-xl bg-black/80 backdrop-blur-xl border border-white/10">
      {/* SR-only live region -- boundary announcements, not per-year */}
      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/* Top row: year display + controls */}
      <div className="flex items-center justify-between gap-3 mb-2">
        {/* Play/Pause + Year */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onTogglePlay}
            className="flex items-center justify-center w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors focus-visible:ring-2 focus-visible:ring-white/30"
            title={playLabel}
            aria-label={`${playLabel} timeline`}
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

          {/* "rendering…" chip -- debounced (>500ms pending), avoids flicker
              on fast repaints. Honest feedback that the map is catching up. */}
          {rendering && (
            <span
              className="text-[10px] font-medium text-amber-300/90 bg-amber-400/10 px-1.5 py-0.5 rounded select-none animate-pulse"
              aria-hidden="true"
            >
              rendering…
            </span>
          )}

          {/* Cumulative hectares readout -- fire-history sole-active only.
              "burned" is the deliberate wording (per-fire cumulative-area
              convention; re-burned ground counts per fire), not "lost". */}
          {cumulativeHa != null && (
            <span className="text-[11px] text-zinc-400 select-none tabular-nums hidden sm:inline">
              {formatHectares(cumulativeHa)} ha burned through {currentYear}
            </span>
          )}
        </div>

        {/* Speed + Close */}
        <div className="flex items-center gap-1.5">
          {SPEED_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onSetSpeed(opt.value)}
              className={`
                px-2 py-1 rounded text-[10px] font-medium transition-colors
                focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:outline-none
                ${
                  playSpeed === opt.value
                    ? "bg-teal-400/20 text-teal-300"
                    : "text-zinc-400 hover:text-zinc-300"
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
                focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:outline-none
                ${
                  stepSize === size
                    ? "bg-teal-400/20 text-teal-300"
                    : "text-zinc-400 hover:text-zinc-300"
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
            className="flex items-center justify-center w-7 h-7 rounded text-zinc-500 hover:text-white hover:bg-white/10 transition-colors focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:outline-none"
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
                className="absolute text-[9px] text-zinc-400 -translate-x-1/2 select-none"
                style={{ left: `${pct}%` }}
              >
                {year}
              </span>
            );
          })}
        </div>

        {/* Range input with tick marks */}
        <div className="relative">
          {/* Scented histogram track (fire-history sole-active only) -- bar
              height = that year's share of century-total burned area. Bars
              left of currentYear bright ("already shown"), right dim
              ("still to come"). Doubles as the reduced-motion static
              telling since the whole shape is visible at a glance. */}
          {scentedTrack && maxDelta > 0 && (
            <div
              className="absolute inset-x-0 bottom-0 h-3 pointer-events-none flex items-end"
              aria-hidden="true"
            >
              {scentedTrack.deltas.map((delta, i) => {
                const year = scentedTrack.start + i;
                const heightPct = Math.max(2, (delta / maxDelta) * 100);
                const shown = year <= currentYear;
                return (
                  <div
                    key={year}
                    className={`flex-1 mx-px rounded-t-sm ${
                      shown ? "bg-amber-400/70" : "bg-zinc-600/50"
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                );
              })}
            </div>
          )}

          {/* Decade tick lines */}
          <div
            className="absolute inset-x-0 top-0 h-full pointer-events-none"
            aria-hidden="true"
          >
            {decadeMarkers.filter((year) => {
              const pct = yearToPercent(year);
              return pct > 5 && pct < 95;
            }).map((year) => {
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
            aria-valuetext={ariaValueText}
          />
        </div>

        {/* Range labels */}
        <div className="flex justify-between mt-0.5">
          <span className="text-[10px] text-zinc-400 select-none">
            {range[0]}
          </span>
          <span className="text-[10px] text-zinc-400 select-none">
            {range[1]}
          </span>
        </div>
      </div>

      {/* Slider styles are in globals.css (.timeline-slider). Track fill
          driven by --track-fill CSS custom property set on the <input>. */}
    </div>
  );
}
