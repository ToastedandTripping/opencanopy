/**
 * Dual-source status gating logic.
 *
 * The rule: WFS-derived terminal status (error / empty / zoom / ok) must only
 * be surfaced for WFS-only layers (!hasTileSource). Tile-backed layers render
 * via PMTiles with overzoom, so a supplemental WFS failure is not user-visible
 * and must NOT produce a status indicator.
 *
 * Extracted from DataLayer.tsx so both the component and tests exercise the
 * same decision function — no tautological re-implementation in test helpers.
 */

export type WfsTerminalStatus = "error" | "empty" | "zoom" | "ok";

/**
 * Determine the appropriate layer status after a WFS fetch outcome.
 *
 * @param hasTileSource  Whether this layer has a PMTiles tile source (dual-source)
 * @param outcome        The WFS fetch outcome
 * @returns The status to set, or null if the status should not be surfaced
 */
export function resolveWfsStatus(
  hasTileSource: boolean,
  outcome: WfsTerminalStatus,
): WfsTerminalStatus | null {
  if (hasTileSource) return null;
  return outcome;
}

/**
 * Whether WFS loading state should be surfaced for this layer type.
 * Tile-backed layers skip loading indicators because tiles are already visible.
 */
export function shouldSurfaceWfsLoading(hasTileSource: boolean): boolean {
  return !hasTileSource;
}
