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
export const AUDIT_ZOOM_LEVELS: number[] = [5, 7, 9, 12];

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
