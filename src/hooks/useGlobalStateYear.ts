"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { DEFAULT_RANGE } from "@/hooks/useTimeline";
import { pipelineLog } from "@/lib/debug/pipeline-logger";

type WriteSource = "tick" | "load";

/**
 * The single writer of MapLibre's `currentYear` global state (R1-02).
 *
 * GPU-side expressions (buildYearFilter, buildAgeGradedOpacity) read
 * `["global-state", "currentYear"]`, so the timeline year must reach the map on
 * every tick and survive the map's `load`.
 *
 * Readiness is a latch set once on `load` (via the returned `onStyleLoad`),
 * never `map.isStyleLoaded()`: that returns false whenever any tile is in
 * flight, so a write guarded by it is silently dropped on most ticks.
 * `Style.setGlobalStateProperty` only throws before the style JSON is parsed,
 * and `Style._loaded` is never reset after `load`, so once the latch is set
 * the write cannot throw in this app.
 *
 * Takes the ref (stable identity), not a getter, so nothing in the effect deps
 * changes per render.
 *
 * @returns `onStyleLoad`, to be called first thing in CanopyMap's `onLoad`.
 */
export function useGlobalStateYear(
  mapRef: RefObject<MapRef | null>,
  yearFilter: number | null | undefined,
): () => void {
  const styleReadyRef = useRef(false);
  const latestYearRef = useRef<number | null>(null);

  // Most recent non-null year, written after commit (never during render) so
  // a `load` that fires before the tick effect still writes the chosen year.
  useLayoutEffect(() => {
    if (yearFilter != null) latestYearRef.current = yearFilter;
  }, [yearFilter]);

  useEffect(() => {
    if (yearFilter == null) return;
    const map = mapRef.current?.getMap();
    if (!map || !styleReadyRef.current) return;
    writeYear(map, yearFilter, "tick");
  }, [yearFilter, mapRef]);

  return useCallback(() => {
    styleReadyRef.current = true;
    const map = mapRef.current?.getMap();
    if (!map) return;
    writeYear(map, latestYearRef.current ?? DEFAULT_RANGE[0], "load");
  }, [mapRef]);
}

function writeYear(
  map: ReturnType<MapRef["getMap"]>,
  year: number,
  source: WriteSource,
): void {
  // Deliberately not wrapped in try/catch: after `load` this cannot throw
  // while the style is never replaced. Any future `setStyle` (a basemap
  // toggle, say) re-opens the pre-parse window and must revisit this write;
  // until then a throw here reaches MapErrorBoundary, loudly.
  map.setGlobalStateProperty("currentYear", year);
  pipelineLog("global-state-year", "currentYear", { year, source });
}
