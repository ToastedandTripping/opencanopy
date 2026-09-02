/**
 * Scented scrubber track — per-year histogram + cumulative-hectares lookup
 * for the timeline scrubber, derived from the fire-history scrub table.
 *
 * v1 scope (plan critic must-fix #2, X3 gating): scent `fire-history` ONLY.
 * `fire-history` has no registry base filter, so its scrub table (built from
 * ALL dated features) matches exactly what the map paints. `cutblocks` DOES
 * carry a base filter excluding features >= CUTBLOCK_AREA_CAP_HA (2000 ha, registry.ts) ("tenure boundaries --
 * real cutblocks rarely exceed 1000ha", registry.ts) while its scrub table
 * sums every dated feature -- scenting that layer would put a public figure
 * on screen that the map's own filter contradicts. That mismatch is deferred
 * to Phase B (harvest consolidation), not resolved here. `tenure-cutblocks`
 * has no such filter but is likewise out of v1 scope per the plan's pinned
 * decision -- only fire gets the scented telling; every other combination
 * (cutblocks, tenure-cutblocks, 0 or >1 active layers) renders a plain track.
 */

import type { ScrubTable } from "@/lib/story/scrub";
import fireScrub from "@/data/scrub/fire-scrub.json";

const FIRE_TABLE = fireScrub as ScrubTable;

/** The single layer id eligible for the scented track in v1. */
const SCENTED_LAYER_ID = "fire-history";

export interface ScentedTrack {
  start: number;
  end: number;
  /** Monotonic 0..1 cumulative curve, one entry per year (same array the
   *  scrub table ships) -- kept alongside `deltas` so cumulativeHectares can
   *  do a direct, boundary-exact lookup rather than re-deriving it from
   *  summed deltas (which would accumulate float error). */
  cumulativeNorm: number[];
  /** Per-year share of century-total burned area (0..1), one entry per year.
   *  `deltas[i] = cumulativeNorm[i] - cumulativeNorm[i-1]` (deltas[0] = 0,
   *  since cumulativeNorm[0] is pinned to 0 -- no fires are attributed
   *  before `start`). Non-negative (cumulativeNorm is monotonic by
   *  construction); sums to ~1 across the full array. */
  deltas: number[];
  /** Absolute hectares the normalized curve is a fraction of. */
  total: number;
}

/**
 * Returns the fire-scrub-derived scented track ONLY when `fire-history` is
 * the SOLE active timeline layer. Every other combination (including 0 or
 * >1 active layers, or any layer other than fire-history) returns null,
 * signalling "render a plain track" to the caller.
 */
export function getScentedTrack(activeLayerIds: readonly string[]): ScentedTrack | null {
  if (activeLayerIds.length !== 1 || activeLayerIds[0] !== SCENTED_LAYER_ID) {
    return null;
  }
  if (FIRE_TABLE.total == null) {
    // Defensive: a scrub table regenerated without the `total` key (e.g. an
    // older build) can't back the hectares readout -- fall back to no
    // scenting rather than rendering a broken/zero figure.
    return null;
  }

  const { start, end, cumulativeNorm, total } = FIRE_TABLE;
  const deltas = cumulativeNorm.map((value, i) =>
    i === 0 ? 0 : value - cumulativeNorm[i - 1]
  );

  return { start, end, cumulativeNorm, deltas, total };
}

/**
 * Cumulative hectares burned through `year` (inclusive), boundary-clamped to
 * [track.start, track.end]. Matches the map's `<=` filter semantics: a year
 * before `start` reads as 0 (nothing shown yet), a year at/after `end` reads
 * as the full `total` (everything shown).
 *
 * N4 (Razor): at `track.start` (1917) this reads exactly 0 ha even though
 * the map paints some 1917 fires -- `cumulativeNorm[0]` is pinned to 0.0 by
 * build-scrub-tables.py (features dated before `start` fold INTO `start`,
 * see its docstring), so the very first year is definitionally "not yet
 * counted" in the cumulative curve. The magnitude is negligible (<600ha of
 * a 22.1M ha total) and this is a pre-existing scrub-table convention this
 * readout merely exposes, not a bug introduced by it -- documented here so
 * the "honest" framing is a deliberate, known tradeoff rather than an
 * accident someone has to re-discover later.
 */
export function cumulativeHectares(track: ScentedTrack, year: number): number {
  const idx = Math.max(
    0,
    Math.min(track.cumulativeNorm.length - 1, Math.round(year) - track.start)
  );
  return track.total * track.cumulativeNorm[idx];
}
