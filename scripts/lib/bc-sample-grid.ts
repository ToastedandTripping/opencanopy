/**
 * Centralized BC sample grid definitions for the V2 diagnostic pipeline.
 *
 * Extracted from audit-tiles.ts and extended with screenshot viewport
 * definitions used by the Playwright screenshot regression specs.
 */

export interface SamplePoint {
  name: string;
  lat: number;
  lon: number;
}

export interface ScreenshotViewport {
  name: string;
  lat: number;
  lon: number;
  zoom: number;
  /** Filesystem-safe slug: e.g. "nw-z5" */
  slug: string;
}

/** 9 representative points distributed across BC */
export const BC_SAMPLE_POINTS: SamplePoint[] = [
  { name: "NW", lat: 57.0, lon: -130.0 },
  { name: "N",  lat: 57.0, lon: -125.0 },
  { name: "NE", lat: 57.0, lon: -120.0 },
  { name: "W",  lat: 52.0, lon: -128.0 },
  { name: "C",  lat: 52.0, lon: -125.0 },
  { name: "E",  lat: 52.0, lon: -118.0 },
  { name: "SW", lat: 49.0, lon: -126.0 },
  { name: "S",  lat: 49.0, lon: -122.0 },
  { name: "SE", lat: 49.0, lon: -117.0 },
];

/** Zoom levels used across the audit pipeline */
export const AUDIT_ZOOM_LEVELS: number[] = [5, 7, 9, 10];

/**
 * The 12 PMTiles source layer names expected in the OpenCanopy archive.
 * Keep in sync with EXPECTED_SOURCE_LAYERS in audit-tiles.ts.
 */
export const EXPECTED_SOURCE_LAYERS = [
  "forest-age",
  "tenure-cutblocks",
  "fire-history",
  "parks",
  "conservancies",
  "ogma",
  "wildlife-habitat-areas",
  "ungulate-winter-range",
  "community-watersheds",
  "mining-claims",
  "forestry-roads",
  "conservation-priority",
] as const;

export type SourceLayerName = typeof EXPECTED_SOURCE_LAYERS[number];

/**
 * 36-point 6×6 grid covering the full BC extent.
 *
 * Latitude range:  48.5 → 59.5 in 6 steps (~2.2° spacing)
 * Longitude range: -136 → -115 in 6 steps (~4.2° spacing)
 * Named R0C0 (northwest corner) through R5C5 (southeast corner).
 */
export const BC_EXTENDED_GRID: SamplePoint[] = (() => {
  const LAT_START = 48.5;
  const LAT_END = 59.5;
  const LON_START = -136.0;
  const LON_END = -115.0;
  const ROWS = 6;
  const COLS = 6;

  const latStep = (LAT_END - LAT_START) / (ROWS - 1);
  const lonStep = (LON_END - LON_START) / (COLS - 1);

  const points: SamplePoint[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      points.push({
        name: `R${r}C${c}`,
        lat: parseFloat((LAT_START + r * latStep).toFixed(4)),
        lon: parseFloat((LON_START + c * lonStep).toFixed(4)),
      });
    }
  }
  return points;
})();

/**
 * 36 screenshot viewport definitions: 9 BC points × 4 zoom levels.
 * slug is filesystem-safe (lowercase, hyphens).
 */
export const SCREENSHOT_VIEWPORTS: ScreenshotViewport[] = BC_SAMPLE_POINTS.flatMap(
  (point) =>
    AUDIT_ZOOM_LEVELS.map((zoom) => ({
      name: `${point.name} z${zoom}`,
      lat: point.lat,
      lon: point.lon,
      zoom,
      slug: `${point.name.toLowerCase()}-z${zoom}`,
    }))
);
