/**
 * Story layer visibility logic.
 *
 * Extracted from StoryMap useEffect for testability.
 * These functions are the imperative paint/filter operations that
 * control which layers are visible and at what opacity.
 */

import type { ChapterLayer } from "@/data/chapters";
import { pipelineLog } from "@/lib/debug/pipeline-logger";

/**
 * Map interface sufficient for visibility operations.
 * Compatible with both real MapLibre and the test mock.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface VisibilityMap {
  getLayer(id: string): unknown;
  isStyleLoaded(): boolean | void;
  once(event: string, callback: () => void): void;
  setPaintProperty(layerId: string, prop: string, value: any): void;  // eslint-disable-line @typescript-eslint/no-explicit-any
  setFilter(layerId: string, filter: any): void;                      // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * Apply layer visibility and opacity for the current chapter.
 *
 * This is the "general visibility" effect -- controls raster overview,
 * vector fills/outlines, hatch, and class filters for all layers
 * EXCEPT cutblocks opacity when timeline is active (that is managed
 * by applyTimelineFilter exclusively).
 */
export function applyLayerVisibility(
  map: VisibilityMap,
  layers: ChapterLayer[],
  hatchEnabled: boolean,
  yearFilter: number | null,
): void {
  if (!map.isStyleLoaded()) {
    pipelineLog("visibility-effect", "style not loaded, deferring to idle");
    map.once("idle", () => applyLayerVisibility(map, layers, hatchEnabled, yearFilter));
    return;
  }

  const layerIds = ["forest-age", "cutblocks", "fire-history", "parks"];
  const activeLayers = Object.fromEntries(
    layers.map((l) => [l.id, l])
  ) as Record<string, ChapterLayer>;

  const forestAgeActive = activeLayers["forest-age"];

  // Forest-age raster overview: kept at near-zero during the timeline so
  // MapLibre pre-fetches tiles, then REVEALED in the ending chapter to show
  // the full VRI picture -- all harvesting the vegetation survey detected,
  // not just the FTEN permit records the timeline was built from.
  const rasterLayerId = "story-forest-age-raster";
  const isEnding = layers.some((l) => l.id === "forest-age" && l.opacity <= 0.25);
  if (map.getLayer(rasterLayerId)) {
    map.setPaintProperty(rasterLayerId, "raster-opacity", isEnding ? 0.85 : 0.01);
  }

  // Forest base: green silhouette. Dimmed during end-reveal so VRI red
  // isn't fighting the green substrate underneath.
  const forestBaseId = "story-forest-base";
  if (map.getLayer(forestBaseId)) {
    map.setPaintProperty(
      forestBaseId,
      "raster-opacity",
      isEnding ? 0.15 : (forestAgeActive ? 0.7 : 0)
    );
  }

  for (const layerId of layerIds) {
    const storyLayer = activeLayers[layerId];
    const opacity = storyLayer?.opacity ?? 0;

    const fillId = `story-${layerId}-fill`;
    const outlineId = `story-${layerId}-outline`;

    // Build class filter
    let classFilterExpr: unknown = null;
    if (storyLayer?.classFilter && storyLayer.classFilter.length > 0) {
      classFilterExpr = [
        "any",
        ...storyLayer.classFilter.map((cls) => [
          "==",
          ["get", "class"],
          cls,
        ]),
      ];
    }

    const isCutblocks = layerId === "cutblocks";

    if (map.getLayer(fillId)) {
      const isTimelineControlled = isCutblocks && yearFilter != null;
      if (!isTimelineControlled) {
        map.setPaintProperty(fillId, "fill-opacity", opacity);
      }
      if (!isCutblocks) {
        map.setFilter(fillId, classFilterExpr);
      }
    }
    if (map.getLayer(outlineId)) {
      map.setPaintProperty(
        outlineId,
        "line-opacity",
        opacity > 0 ? 0.4 : 0
      );
      if (!isCutblocks) {
        map.setFilter(outlineId, classFilterExpr);
      }
    }
  }

  // Hatch layer
  const hatchFillId = "story-harvested-hatch";
  if (map.getLayer(hatchFillId)) {
    map.setPaintProperty(
      hatchFillId,
      "fill-opacity",
      hatchEnabled ? 0.6 : 0
    );
  }
}

/**
 * Apply timeline year filter and age-grading to cutblocks.
 *
 * This is the SINGLE AUTHORITY for cutblock filters. Composes
 * classFilter + yearFilter into one expression.
 */
export function applyTimelineFilter(
  map: VisibilityMap,
  layers: ChapterLayer[],
  yearFilter: number | null,
): void {
  if (!map.isStyleLoaded()) {
    pipelineLog("timeline-effect", "style not loaded, deferring to idle");
    map.once("idle", () => applyTimelineFilter(map, layers, yearFilter));
    return;
  }

  const fillId = "story-cutblocks-fill";
  const outlineId = "story-cutblocks-outline";
  if (!map.getLayer(fillId)) return;

  const cutblocksLayer = layers.find((l) => l.id === "cutblocks");
  let classFilterExpr: unknown = null;
  if (
    cutblocksLayer?.classFilter &&
    cutblocksLayer.classFilter.length > 0
  ) {
    classFilterExpr = [
      "any",
      ...cutblocksLayer.classFilter.map((cls) => [
        "==",
        ["get", "class"],
        cls,
      ]),
    ];
  }

  const yearExpr = [
    "to-number",
    ["slice", ["get", "DISTURBANCE_START_DATE"], 0, 4],
  ];

  if (yearFilter != null) {
    const yearFilterExpr = ["<=", yearExpr, yearFilter];
    const composedFilter = classFilterExpr
      ? ["all", classFilterExpr, yearFilterExpr]
      : yearFilterExpr;

    map.setFilter(fillId, composedFilter);
    if (map.getLayer(outlineId)) map.setFilter(outlineId, composedFilter);

    map.setPaintProperty(fillId, "fill-opacity", 0.7);

    map.setPaintProperty(fillId, "fill-color", [
      "interpolate",
      ["linear"],
      ["-", yearFilter, yearExpr],
      0,
      "#ef4444",
      25,
      "#b91c1c",
      50,
      "#7f1d1d",
    ]);
  } else {
    map.setFilter(fillId, classFilterExpr);
    if (map.getLayer(outlineId))
      map.setFilter(outlineId, classFilterExpr);

    const scalarOpacity = cutblocksLayer?.opacity ?? 0;
    map.setPaintProperty(fillId, "fill-opacity", scalarOpacity);
    map.setPaintProperty(fillId, "fill-color", "#dc2626");
  }
}
