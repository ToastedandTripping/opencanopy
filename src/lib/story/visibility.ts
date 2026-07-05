/**
 * Story layer visibility logic.
 *
 * Extracted from StoryMap useEffect for testability.
 * These functions are the imperative paint operations that control which
 * layers are visible and at what opacity.
 *
 * Phase 1 (2026-07): shrunk to forest-base management only. The vector
 * cutblocks/fire-history/parks/forest-age fill+outline layers this used to
 * drive (plus the class-filter logic and applyTimelineFilter, its sibling
 * export) were deleted from setup-layers.ts -- they were minzoom:9 detail
 * layers the story never zoomed past z8 to reach. applyTimelineFilter died
 * with them (its only consumer was story-cutblocks-fill/outline).
 */

import type { ChapterLayer } from "@/data/chapters";
import { pipelineLog } from "@/lib/debug/pipeline-logger";

/**
 * Map interface sufficient for visibility operations.
 * Compatible with both real MapLibre and the test mock.
 */
export interface VisibilityMap {
  getLayer(id: string): unknown;
  isStyleLoaded(): boolean | void;
  once(event: string, callback: () => void): void;
  setPaintProperty(layerId: string, prop: string, value: unknown): void;
}

/**
 * Apply layer visibility and opacity for the current chapter.
 *
 * Only manages story-forest-base (the green substrate). The forest-age
 * raster overview, vector detail layers, and hatch pattern this used to
 * also drive were removed in Phase 1 (dead in the story: pinned to 0,
 * never zoomed to, or gated on a flag no chapter ever set).
 *
 * @param revealBinary - When true (ending + remains chapters), the binary
 *   end-reveal raster is showing and the forest-base is hidden so it doesn't
 *   obscure the red/green contrast. Uses an explicit chapter flag rather than
 *   sniffing layer opacity to avoid fragile heuristics.
 */
export function applyLayerVisibility(
  map: VisibilityMap,
  layers: ChapterLayer[],
  revealBinary?: boolean,
): void {
  if (!map.isStyleLoaded()) {
    pipelineLog("visibility-effect", "style not loaded, deferring to idle");
    map.once("idle", () => applyLayerVisibility(map, layers, revealBinary));
    return;
  }

  const forestAgeActive = layers.some((l) => l.id === "forest-age");

  // Forest base: green silhouette. Hidden during binary reveal (the binary
  // raster carries old-growth at its correct color; keeping forest-base on
  // would paint green everywhere and obscure the red/green contrast).
  const forestBaseId = "story-forest-base";
  if (map.getLayer(forestBaseId)) {
    map.setPaintProperty(
      forestBaseId,
      "raster-opacity",
      revealBinary ? 0 : (forestAgeActive ? 0.7 : 0)
    );
  }

  // story-binary-reveal raster-opacity is managed exclusively by the per-frame
  // binary effect in StoryMap (binaryRevealOpacity prop). applyLayerVisibility
  // does NOT write it. Removing this path eliminates the double-write that caused
  // the immediate fade-in on chapter-enter (race between chapter-enter 0.85 here
  // and the scroll-coupled ramp in the per-frame effect).
}
