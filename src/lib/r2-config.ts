/**
 * Public R2 bucket configuration.
 *
 * Single source of truth for the R2 origin that serves the PMTiles archive
 * and the pre-rendered raster overview tiles. Kept dependency-free so it can
 * be imported from the root layout (preconnect) without pulling in the layer
 * registry. If the bucket ever moves, change it here only.
 */

/** Public R2 origin serving PMTiles + pre-rendered raster overviews. */
export const R2_PUBLIC_BASE = "https://pub-b5568be386ef4e638b4e49af41395600.r2.dev";

/** Pre-rendered forest-age raster overview tiles (z4-z9). */
export const FOREST_AGE_RASTER_URL = `${R2_PUBLIC_BASE}/raster/v2/forest-age/{z}/{x}/{y}.png`;

/**
 * Per-class isolation raster overview tiles (z4-z9).
 * One isolation set per class (old-growth, mature, young, harvested).
 * The {class} placeholder is substituted client-side; all other placeholders
 * are resolved by MapLibre. URL knowledge centralised here per ARCHITECTURE.md.
 */
export const FOREST_AGE_CLASS_RASTER_URL = `${R2_PUBLIC_BASE}/raster/v2/{class}/{z}/{x}/{y}.png`;
