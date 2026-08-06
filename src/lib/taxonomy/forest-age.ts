/**
 * Forest age-class taxonomy — single source of truth.
 *
 * Defines the four canonical age classes, their thresholds, and the
 * classification function. Every consumer in the app imports from here
 * instead of maintaining its own copy.
 *
 * Exception: the WFS proxy (Deno edge function) and the build-pipeline
 * extractors cannot import from src/. They keep local copies guarded by
 * consistency tests in src/test/audit/proxy-consistency-audit.test.ts.
 */

// ── Types ───────────────────────────────────────────────────────────────

export type ForestAgeClass = "old-growth" | "mature" | "young" | "harvested";

/** All four canonical class values, ordered from oldest to youngest. */
export const FOREST_AGE_CLASSES: readonly ForestAgeClass[] = [
  "old-growth",
  "mature",
  "young",
  "harvested",
] as const;

// ── Thresholds ──────────────────────────────────────────────────────────

export const AGE_THRESHOLDS = {
  oldGrowth: 250,
  mature: 80,
} as const;

// ── Classification ──────────────────────────────────────────────────────

/**
 * Classify a forest polygon by age class.
 *
 * Precedence: HARVEST_DATE wins over age (proxy's existing behavior,
 * correct for BC VRI data where harvested stands retain a stale PROJ_AGE_1).
 *
 * @returns ForestAgeClass, or null if the feature is unclassifiable
 *          (no age and no harvest date — should be dropped from display).
 */
export function classifyForestAge(
  age: number | null,
  hasHarvestDate: boolean,
): ForestAgeClass | null {
  if (hasHarvestDate) return "harvested";
  if (age === null || age <= 0) return null;
  if (age >= AGE_THRESHOLDS.oldGrowth) return "old-growth";
  if (age >= AGE_THRESHOLDS.mature) return "mature";
  return "young";
}

// ── Display labels ──────────────────────────────────────────────────────

/** Human-readable display names for popups and UI text. */
export const CLASS_DISPLAY_NAMES: Record<ForestAgeClass, string> = {
  "old-growth": "Old Growth",
  "mature": "Mature Second Growth",
  "young": "Young Forest",
  "harvested": "Harvested",
};

/** Legend labels with parenthetical age ranges. */
export const CLASS_LEGEND_LABELS: Record<ForestAgeClass, string> = {
  "old-growth": "Old Growth (250+ yr)",
  "mature": "Mature (80-250 yr)",
  "young": "Young (<80 yr)",
  "harvested": "Harvested",
};
