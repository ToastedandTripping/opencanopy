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
  | "setYearFilter";

function isEnabled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    // Check on every call -- localStorage.getItem is fast (~0.01ms)
    // and this avoids stale cache if OC_DEBUG is toggled at runtime.
    if (localStorage.getItem("OC_DEBUG") === "true") {
      return true;
    }

    // Check URL query param
    const params = new URLSearchParams(window.location.search);
    if (params.get("debug") === "pipeline") {
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
