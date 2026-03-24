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
  isStyleLoaded(): boolean;
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
  yearFilter: number | null
): void {
  if (!map.isStyleLoaded()) {
    pipelineLog("visibility-effect", "skipped: style not loaded");
    return;
  }

  const layerIds = ["forest-age", "cutblocks", "fire-history", "parks"];
  const activeLayers = Object.fromEntries(
    layers.map((l) => [l.id, l])
  ) as Record<string, ChapterLayer>;

  // Raster overview: visible when forest-age is active
  const forestAgeActive = activeLayers["forest-age"];
  const rasterLayerId = "story-forest-age-raster";
  if (map.getLayer(rasterLayerId)) {
    const rasterOpacity = forestAgeActive ? Math.min(forestAgeActive.opacity, 0.85) : 0;
    pipelineLog("setPaintProperty", rasterLayerId, { property: "raster-opacity", value: rasterOpacity });
    map.setPaintProperty(
      rasterLayerId,
      "raster-opacity",
      rasterOpacity
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
  yearFilter: number | null
): void {
  if (!map.isStyleLoaded()) return;

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

    map.setPaintProperty(fillId, "fill-opacity", [
      "interpolate",
      ["linear"],
      ["-", yearFilter, yearExpr],
      0,
      0.8,
      20,
      0.4,
      50,
      0.15,
    ]);
  } else {
    map.setFilter(fillId, classFilterExpr);
    if (map.getLayer(outlineId))
      map.setFilter(outlineId, classFilterExpr);

    const scalarOpacity = cutblocksLayer?.opacity ?? 0;
    map.setPaintProperty(fillId, "fill-opacity", scalarOpacity);
  }
}
