"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import type { Map as MaplibreMap } from "maplibre-gl";
import { DEFAULT_RANGE } from "@/hooks/useTimeline";
import { pipelineLog } from "@/lib/debug/pipeline-logger";
import { onStyleReady } from "@/lib/map/style-ready";

type WriteSource = "tick" | "style-ready";

/** The slice of a MapLibre map this hook touches. */
export type GlobalStateYearMap = Pick<
  MaplibreMap,
  "getStyle" | "once" | "off" | "setGlobalStateProperty"
>;

/**
 * The single writer of MapLibre's `currentYear` global state (R1-02).
 *
 * GPU-side expressions (buildYearFilter, buildAgeGradedOpacity) read
 * `["global-state", "currentYear"]`, so the timeline year must reach the map on
 * every tick and once the style is ready.
 *
 * Readiness is a latch set through `onStyleReady` (style JSON parsed), never
 * `map.isStyleLoaded()` (false whenever any tile is in flight, so ticks were
 * silently dropped) and never `load` (on production it did not fire until
 * the visitor interacted; Amendment A). `Style.setGlobalStateProperty` only
 * throws before the style JSON is parsed, so once the latch is set the write
 * cannot throw in this app.
 *
 * Takes the map instance: it runs in MapStyleSync, a child of `<Map>`, which
 * react-maplibre renders only once the instance exists.
 */
export function useGlobalStateYear(
  map: GlobalStateYearMap | null | undefined,
  yearFilter: number | null | undefined,
): void {
  const styleReadyRef = useRef(false);
  const latestYearRef = useRef<number | null>(null);

  // Most recent non-null year, written after commit (never during render) so
  // a style-ready that fires before the tick effect still writes the chosen year.
  useLayoutEffect(() => {
    if (yearFilter != null) latestYearRef.current = yearFilter;
  }, [yearFilter]);

  // Latch on style ready, then write the latest year (or the default).
  useEffect(() => {
    if (!map) return;
    styleReadyRef.current = false;
    return onStyleReady(map, () => {
      styleReadyRef.current = true;
      writeYear(map, latestYearRef.current ?? DEFAULT_RANGE[0], "style-ready");
    });
  }, [map]);

  useEffect(() => {
    if (yearFilter == null) return;
    if (!map || !styleReadyRef.current) return;
    writeYear(map, yearFilter, "tick");
  }, [yearFilter, map]);
}

function writeYear(
  map: GlobalStateYearMap,
  year: number,
  source: WriteSource,
): void {
  // Deliberately not wrapped in try/catch: once the style is ready this cannot
  // throw while the style is never replaced. Any future `setStyle` (a basemap
  // toggle, say) re-opens the pre-parse window and must revisit this write;
  // until then a throw here reaches MapErrorBoundary, loudly.
  map.setGlobalStateProperty("currentYear", year);
  pipelineLog("global-state-year", "currentYear", { year, source });
}
