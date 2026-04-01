/**
 * Feature Matcher — Unified property comparison and fingerprint scoring.
 *
 * Replaces duplicate implementations in feature-tracer.ts and
 * audit-geometry-precision.ts. All property comparison and feature matching
 * logic lives here.
 *
 * Key design: propsMatch() handles type-coercion (number ↔ string) because
 * the tile pipeline intentionally converts some numeric fields to strings
 * (e.g. FIRE_YEAR 2021 → "2021" for timeline slicing in MapLibre).
 */

import { THRESHOLDS } from "./audit-config";

// ── Property comparison ──────────────────────────────────────────────────────

/**
 * Compare two property values with type-coercion awareness.
 *
 * Rules:
 *   - both null/undefined → match
 *   - one null, other non-null → no match
 *   - same value (===) → match
 *   - different types but same String() → match (handles 2021 vs "2021")
 */
export function propsMatch(a: unknown, b: unknown): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (a === b) return true;
  return String(a) === String(b);
}

// ── Fingerprint scoring ──────────────────────────────────────────────────────

/**
 * Compute property fingerprint overlap between a source feature's properties
 * and a candidate tile feature's properties.
 *
 * Returns a score in [0, 1]: fraction of source property keys whose values
 * match the candidate. Only keys present in the source are scored.
 *
 * Uses propsMatch() for type-coercion-aware comparison.
 */
export function fingerprintScore(
  sourceProps: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tileFeature: any
): number {
  const tileProps: Record<string, unknown> = tileFeature.properties ?? {};
  const sourceKeys = Object.keys(sourceProps);
  if (sourceKeys.length === 0) return 0;

  let matches = 0;
  for (const key of sourceKeys) {
    if (propsMatch(sourceProps[key], tileProps[key])) matches++;
  }
  return matches / sourceKeys.length;
}

/**
 * Build a propertyComparison record: one entry per source property key,
 * each with { source, tile, match }.
 *
 * Null/undefined parity: if both sides are null or undefined (any combination),
 * the pair is considered a match. MVT encoding drops null values, so a source
 * null and a missing tile key are semantically equivalent.
 */
export function buildPropertyComparison(
  sourceProps: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tileFeature: any
): Record<string, { source: unknown; tile: unknown; match: boolean }> {
  const tileProps: Record<string, unknown> = tileFeature.properties ?? {};
  const comparison: Record<string, { source: unknown; tile: unknown; match: boolean }> = {};

  for (const key of Object.keys(sourceProps)) {
    const source = sourceProps[key];
    const tile = tileProps[key];
    comparison[key] = { source, tile, match: propsMatch(source, tile) };
  }
  return comparison;
}

// ── Feature matching ─────────────────────────────────────────────────────────

/**
 * Find the best-matching tile feature in `features` for the given source
 * properties. Returns [bestFeature, score] or [null, 0].
 *
 * Uses THRESHOLDS.matchThreshold (default 0.5) as minimum score.
 */
export function findBestCandidate(
  features: unknown[],
  sourceProps: Record<string, unknown>,
  threshold: number = THRESHOLDS.matchThreshold
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): [any | null, number] {
  let best: unknown = null;
  let bestScore = 0;

  for (const f of features) {
    const score = fingerprintScore(sourceProps, f);
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }

  return bestScore >= threshold ? [best, bestScore] : [null, 0];
}
