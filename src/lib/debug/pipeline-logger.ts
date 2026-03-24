/**
 * Diagnostic pipeline logger for the OpenCanopy rendering pipeline.
 *
 * Enabled by:
 *   - localStorage.setItem('OC_DEBUG', 'true')
 *   - URL query param: ?debug=pipeline
 *
 * Zero overhead when disabled (early return before any work).
 *
 * Usage:
 *   pipelineLog('onLoad', 'start');
 *   pipelineLog('addSource', 'terrain-rgb', { type: 'raster-dem' });
 *   pipelineLog('setPaintProperty', 'story-forest-age-raster', { property: 'raster-opacity', value: 0.6 });
 */

import type maplibregl from "maplibre-gl";
import type { LayerDefinition } from "@/types/layers";

type PipelineStage =
  | "onLoad"
  | "addSource"
  | "addLayer"
  | "setMapLoaded"
  | "visibility-effect"
  | "timeline-effect"
  | "setPaintProperty"
  | "setFilter"
  | "onStepEnter"
  | "onStepProgress"
  | "updateCamera"
  | "setYearFilter"
  | "wfs-fetch"
  | "wfs-data"
  | "pmtiles-source"
  | "pmtiles-layer"
  | "raster-mount"
  | "map-load"
  | "layer-health";

export function isEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    // Check on every call -- localStorage.getItem is fast (~0.01ms)
    // and this avoids stale cache if OC_DEBUG is toggled at runtime.
    if (localStorage.getItem("OC_DEBUG") === "true") {
      return true;
    }

    // Check URL query param (fast string pre-check avoids URLSearchParams allocation)
    if (window.location.search.includes("debug=pipeline")) {
      return true;
    }
  } catch {
    // localStorage access can throw in some contexts (e.g. sandboxed iframes)
  }

  return false;
}

/**
 * Log a pipeline event. Zero overhead when disabled.
 *
 * @param stage - The pipeline stage (e.g. 'onLoad', 'addSource', 'setPaintProperty')
 * @param detail - A string describing what happened (e.g. layer ID, 'start', 'end')
 * @param data - Optional structured data for debugging
 */
export function pipelineLog(
  stage: PipelineStage,
  detail: string,
  data?: Record<string, unknown>
): void {
  if (!isEnabled()) return;

  const timestamp = performance.now().toFixed(1);
  const prefix = `[OC:${stage}]`;

  if (data) {
    console.log(`%c${prefix} %c${detail} %c+${timestamp}ms`, "color: #4ade80; font-weight: bold", "color: #a1a1aa", "color: #6b7280", data);
  } else {
    console.log(`%c${prefix} %c${detail} %c+${timestamp}ms`, "color: #4ade80; font-weight: bold", "color: #a1a1aa", "color: #6b7280");
  }
}

/**
 * No-op -- retained for API compatibility.
 * Previously reset a cached `_enabled` flag. The cache was removed
 * so isEnabled() checks localStorage on every call (fast, ~0.01ms)
 * and responds to runtime OC_DEBUG changes without requiring a reset.
 */
export function _resetPipelineLogger(): void {
  // nothing to reset -- isEnabled() checks live state on each call
}

// ── Health Report ───────────────────────────────────────────────────

interface HealthRow {
  Layer: string;
  Enabled: string;
  PMTiles: string;
  WFS: string;
  Raster: string;
  Visible: string;
  Errors: string;
}

/**
 * Check whether a MapLibre layer exists and is visible.
 * Returns "ok" if the layer exists and is visible,
 * "hidden" if it exists but is not visible, or "" if absent.
 */
function checkLayerVisibility(
  map: maplibregl.Map,
  layerId: string
): "ok" | "hidden" | "" {
  if (!map.getLayer(layerId)) return "";
  const vis = map.getLayoutProperty(layerId, "visibility");
  // MapLibre defaults to "visible" if not explicitly set
  return vis === "none" ? "hidden" : "ok";
}

/**
 * Produce a console.table health report for all registered layers.
 * Checks existence of expected MapLibre sources/layers using naming conventions.
 *
 * @param map - The MapLibre GL map instance
 * @param registry - The full layer registry
 * @param enabledLayers - Array of currently enabled layer IDs
 */
export function pipelineHealthReport(
  map: maplibregl.Map,
  registry: LayerDefinition[],
  enabledLayers: string[]
): void {
  if (!isEnabled()) return;

  const rows: HealthRow[] = [];

  for (const layer of registry) {
    const enabled = enabledLayers.includes(layer.id);
    const errors: string[] = [];

    // PMTiles check
    let pmtilesStatus = "-";
    if (layer.tileSource) {
      const sourceId = `source-${layer.id}-tiles`;
      const hasSource = !!map.getSource(sourceId);
      if (!hasSource) {
        pmtilesStatus = "no source";
        if (enabled) errors.push("PMTiles source missing");
      } else {
        const expectedLayers: string[] = [];
        if (layer.style.type === "fill") {
          expectedLayers.push(
            `layer-${layer.id}-tiles-fill`,
            `layer-${layer.id}-tiles-outline`
          );
        } else if (layer.style.type === "line") {
          expectedLayers.push(`layer-${layer.id}-tiles-line`);
        }

        const found = expectedLayers.filter((id) => !!map.getLayer(id));
        if (found.length === expectedLayers.length) {
          pmtilesStatus = "ok";
        } else {
          const missing = expectedLayers.filter((id) => !map.getLayer(id));
          pmtilesStatus = `${found.length}/${expectedLayers.length}`;
          if (enabled) errors.push(`Missing: ${missing.join(", ")}`);
        }
      }
    }

    // WFS check
    let wfsStatus = "-";
    if (layer.source.type === "wfs") {
      const sourceId = `source-${layer.id}`;
      const hasSource = !!map.getSource(sourceId);
      if (!hasSource) {
        wfsStatus = "no source";
        if (enabled) errors.push("WFS source missing");
      } else {
        const expectedLayers: string[] = [];
        if (layer.style.type === "fill") {
          expectedLayers.push(
            `layer-${layer.id}-fill`,
            `layer-${layer.id}-outline`
          );
        } else if (layer.style.type === "line") {
          expectedLayers.push(`layer-${layer.id}-line`);
        } else if (layer.style.type === "circle") {
          expectedLayers.push(
            `layer-${layer.id}-circle`,
            `layer-${layer.id}-cluster`,
            `layer-${layer.id}-cluster-count`
          );
        }

        const found = expectedLayers.filter((id) => !!map.getLayer(id));
        if (found.length === expectedLayers.length) {
          wfsStatus = "ok";
        } else {
          const missing = expectedLayers.filter((id) => !map.getLayer(id));
          wfsStatus = `${found.length}/${expectedLayers.length}`;
          if (enabled) errors.push(`Missing: ${missing.join(", ")}`);
        }
      }
    }

    // Raster check
    let rasterStatus = "-";
    if (layer.rasterOverview) {
      const sourceId = `source-${layer.id}-raster`;
      const layerId = `layer-${layer.id}-raster`;
      const hasSource = !!map.getSource(sourceId);
      if (!hasSource) {
        rasterStatus = "no source";
        if (enabled) errors.push("Raster source missing");
      } else if (!map.getLayer(layerId)) {
        rasterStatus = "no layer";
        if (enabled) errors.push("Raster layer missing");
      } else {
        rasterStatus = "ok";
      }
    } else if (layer.source.type === "raster") {
      const sourceId = `source-${layer.id}`;
      const layerId = `layer-${layer.id}`;
      const hasSource = !!map.getSource(sourceId);
      if (!hasSource) {
        rasterStatus = "no source";
        if (enabled) errors.push("Raster source missing");
      } else if (!map.getLayer(layerId)) {
        rasterStatus = "no layer";
        if (enabled) errors.push("Raster layer missing");
      } else {
        rasterStatus = "ok";
      }
    }

    // Visibility check -- look at the primary render layer
    let visibleStatus = "-";
    if (enabled) {
      if (layer.style.type === "fill") {
        const tileVis = checkLayerVisibility(map, `layer-${layer.id}-tiles-fill`);
        const wfsVis = checkLayerVisibility(map, `layer-${layer.id}-fill`);
        const rasterVis = checkLayerVisibility(map, `layer-${layer.id}-raster`);
        const statuses = [tileVis, wfsVis, rasterVis].filter(Boolean);
        visibleStatus = statuses.includes("ok") ? "ok" : statuses.includes("hidden") ? "hidden" : "none";
      } else if (layer.style.type === "line") {
        const tileVis = checkLayerVisibility(map, `layer-${layer.id}-tiles-line`);
        const wfsVis = checkLayerVisibility(map, `layer-${layer.id}-line`);
        const statuses = [tileVis, wfsVis].filter(Boolean);
        visibleStatus = statuses.includes("ok") ? "ok" : statuses.includes("hidden") ? "hidden" : "none";
      } else if (layer.style.type === "circle") {
        visibleStatus = checkLayerVisibility(map, `layer-${layer.id}-circle`) || "none";
      } else if (layer.source.type === "raster") {
        visibleStatus = checkLayerVisibility(map, `layer-${layer.id}`) || "none";
      }
    }

    rows.push({
      Layer: layer.id,
      Enabled: enabled ? "yes" : "",
      PMTiles: pmtilesStatus,
      WFS: wfsStatus,
      Raster: rasterStatus,
      Visible: visibleStatus,
      Errors: errors.join("; "),
    });
  }

  pipelineLog("layer-health", "Pipeline Health Report");
  console.table(rows);
}
