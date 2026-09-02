/**
 * Pure MapLibre expression builders for timeline year filtering.
 *
 * These functions compose GPU-side expressions installed once on the PMTiles
 * vector layers. The year itself is a MapLibre global-state property
 * (`currentYear`) that the expressions read, so a timeline tick is a single
 * `map.setGlobalStateProperty` call rather than a per-layer `setFilter`
 * (switched 2026-08-27). No tiles are hidden and no WFS fallback fires
 * during animation.
 *
 * Field type inference:
 * - Fields with "DATE" in the name (e.g. DISTURBANCE_START_DATE) are string
 *   dates like "2015-06-01". Use slice(0,4) + to-number to extract year.
 * - All other fields (e.g. FIRE_YEAR) may be stored as integer or string
 *   by tippecanoe. Use to-number directly -- handles both.
 */

/**
 * Returns a MapLibre expression that extracts a numeric year from a feature property.
 *
 * Field format is inferred from the property name:
 * - Contains "DATE" -> slice first 4 chars then coerce to number
 * - Otherwise -> coerce directly to number (handles integer and string "2015")
 */
export function buildYearExpression(field: string): unknown[] {
  if (field.includes("DATE")) {
    // Date strings like "2015-06-01": slice the year prefix, then coerce
    return ["to-number", ["slice", ["get", field], 0, 4]];
  }
  // Integer or string year values like 2015 or "2015"
  return ["to-number", ["get", field]];
}

/**
 * Returns a MapLibre filter expression that keeps only features where
 * the year extracted from `field` is <= `year`.
 *
 * Null handling: MapLibre coerces missing properties to null.
 * null <= number evaluates to false, so undated features are
 * correctly hidden during animation without explicit null checks.
 */
export function buildYearFilter(field: string): unknown[] {
  return ["<=", buildYearExpression(field), ["global-state", "currentYear"]];
}

/**
 * Composes a base registry filter, an optional class filter, and an optional
 * year filter into a single MapLibre expression.
 *
 * Rules:
 * - If only one non-null expression: return it directly (no wrapping)
 * - If multiple: wrap in ["all", ...]
 * - All null inputs: return null (no filter)
 */
export function composeFilters(
  base: unknown[] | null,
  classFilter: unknown[] | null,
  yearFilter: unknown[] | null
): unknown[] | null {
  const parts = [base, classFilter, yearFilter].filter((p) => p != null) as unknown[][];
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return ["all", ...parts];
}

/**
 * Returns a MapLibre interpolation expression for age-graded fill opacity.
 *
 * Features are brightest (0.8) at `year` (recently disturbed) and fade
 * to 0.4 at 20 years old and 0.15 at 50+ years old. This matches the
 * story map pattern in visibility.ts:173-183.
 *
 * The age is computed as (currentYear - featureYear). MapLibre evaluates
 * this per-feature on the GPU -- no JS iteration needed.
 */
export function buildAgeGradedOpacity(field: string): unknown[] {
  const yearExpr = buildYearExpression(field);
  return [
    "interpolate",
    ["linear"],
    ["-", ["global-state", "currentYear"], yearExpr],
    0, 0.8,
    20, 0.4,
    50, 0.15,
  ];
}
