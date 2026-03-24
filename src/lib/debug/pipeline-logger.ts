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

let _enabled: boolean | null = null;

function isEnabled(): boolean {
  if (_enabled !== null) return _enabled;

  if (typeof window === "undefined") {
    _enabled = false;
    return false;
  }

  try {
    // Check localStorage
    if (localStorage.getItem("OC_DEBUG") === "true") {
      _enabled = true;
      return true;
    }

    // Check URL query param
    const params = new URLSearchParams(window.location.search);
    if (params.get("debug") === "pipeline") {
      _enabled = true;
      return true;
    }
  } catch {
    // localStorage access can throw in some contexts (e.g. sandboxed iframes)
  }

  _enabled = false;
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
    console.log(`%c${prefix} %c${detail}`, "color: #4ade80; font-weight: bold", "color: #a1a1aa", data);
  } else {
    console.log(`%c${prefix} %c${detail}`, "color: #4ade80; font-weight: bold", "color: #a1a1aa");
  }
}

/**
 * Reset the enabled cache. Useful for testing.
 */
export function _resetPipelineLogger(): void {
  _enabled = null;
}
