/**
 * Geometry precision measurement utilities.
 *
 * Measures Hausdorff distance and area preservation between source GeoJSON
 * polygon features and their tiled counterparts in the MVT pipeline.
 *
 * Design decisions:
 * - Hausdorff: O(n*m) with haversine. No new dependencies.
 * - Area: @turf/area (already installed) for geodesic m².
 * - Both source and tile polygons use only the outer ring for comparison.
 *   Inner rings (holes) are intentionally excluded — MVT tiling may drop or
 *   simplify holes, and the outer-ring comparison gives a cleaner signal for
 *   the vertex displacement metric.
 */

import type { GeoJSON } from "geojson";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const turfArea = require("@turf/area");
const area: (f: unknown) => number = turfArea.default ?? turfArea;

// ── Public interface ──────────────────────────────────────────────────────────

export interface PrecisionResult {
  /** MVT source layer name */
  sourceLayer: string;
  /** Zoom level measured */
  zoom: number;
  /** One-sided directed Hausdorff distance in metres (max of both directions) */
  hausdorffDistanceMeters: number;
  /** Mean per-vertex displacement between source and nearest tile vertex (metres) */
  avgVertexDisplacementMeters: number;
  /** Number of vertices in source outer ring */
  sourceVertexCount: number;
  /** Number of vertices in tile outer ring */
  tileVertexCount: number;
  /**
   * (tile area / source area) × 100.
   * 100 = perfect preservation. <90 or >110 triggers G3 WARN.
   */
  areaRatioPercent: number;
}

// ── Haversine helper ──────────────────────────────────────────────────────────

const EARTH_RADIUS_M = 6_371_000;

/**
 * Haversine distance in metres between two WGS84 [lon, lat] points.
 */
function haversine(a: [number, number], b: [number, number]): number {
  const lat1 = (a[1] * Math.PI) / 180;
  const lat2 = (b[1] * Math.PI) / 180;
  const dLat = lat2 - lat1;
  const dLon = ((b[0] - a[0]) * Math.PI) / 180;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

// ── Ring extraction ───────────────────────────────────────────────────────────

/**
 * Extract the outer ring from a GeoJSON Polygon or MultiPolygon geometry.
 * Returns the coordinate array of the outer ring of the first (largest by
 * vertex count) polygon ring. Returns null if geometry is not a polygon type.
 *
 * We use vertex count as "largest" proxy because area computation is too
 * expensive per-ring at scale; vertex count correlates well for this purpose.
 */
function extractOuterRing(
  geometry: GeoJSON.Geometry | null | undefined
): Array<[number, number]> | null {
  if (!geometry) return null;

  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as Array<Array<[number, number]>>;
    if (rings.length === 0 || rings[0].length === 0) return null;
    return rings[0];
  }

  if (geometry.type === "MultiPolygon") {
    const polys = geometry.coordinates as Array<Array<Array<[number, number]>>>;
    if (polys.length === 0) return null;
    // Pick the polygon with the most vertices in its outer ring
    let best: Array<[number, number]> | null = null;
    for (const poly of polys) {
      if (poly.length > 0 && poly[0].length > 0) {
        if (!best || poly[0].length > best.length) {
          best = poly[0] as Array<[number, number]>;
        }
      }
    }
    return best;
  }

  return null;
}

/**
 * Extract the outer ring from a raw @mapbox/vector-tile feature using
 * feature.toGeoJSON(x, y, z).
 */
function extractTileOuterRing(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tileFeature: any
): Array<[number, number]> | null {
  try {
    const geom = tileFeature.geometry as GeoJSON.Geometry | undefined;
    if (!geom) return null;
    return extractOuterRing(geom);
  } catch {
    return null;
  }
}

// ── Directed Hausdorff ────────────────────────────────────────────────────────

/**
 * One-sided directed Hausdorff distance from set A to set B.
 * For each point in A, find the minimum distance to any point in B.
 * The directed Hausdorff is the maximum of those minimums.
 *
 * O(n * m) with haversine.
 */
function directedHausdorff(
  a: Array<[number, number]>,
  b: Array<[number, number]>
): number {
  if (a.length === 0 || b.length === 0) return 0;

  let maxMin = 0;
  for (const pa of a) {
    let minDist = Infinity;
    for (const pb of b) {
      const d = haversine(pa, pb);
      if (d < minDist) minDist = d;
      if (minDist === 0) break; // can't get lower
    }
    if (minDist > maxMin) maxMin = minDist;
  }
  return maxMin;
}

/**
 * Symmetric Hausdorff distance: max(d(A→B), d(B→A)).
 */
function hausdorffDistance(
  a: Array<[number, number]>,
  b: Array<[number, number]>
): number {
  return Math.max(directedHausdorff(a, b), directedHausdorff(b, a));
}

// ── Average vertex displacement ───────────────────────────────────────────────

/**
 * For each vertex in `source`, find the nearest vertex in `tile` and record
 * that distance. Returns the mean of all nearest-neighbour distances.
 *
 * This is a softer metric than Hausdorff — it tells you the typical vertex
 * displacement rather than the worst-case outlier.
 */
function avgVertexDisplacement(
  source: Array<[number, number]>,
  tile: Array<[number, number]>
): number {
  if (source.length === 0 || tile.length === 0) return 0;

  let total = 0;
  for (const ps of source) {
    let minDist = Infinity;
    for (const pt of tile) {
      const d = haversine(ps, pt);
      if (d < minDist) minDist = d;
      if (minDist === 0) break;
    }
    total += minDist;
  }
  return total / source.length;
}

// ── Area measurement ──────────────────────────────────────────────────────────

/**
 * Compute geodesic area in m² for a GeoJSON Feature with polygon geometry.
 * Returns 0 on error.
 */
function featureArea(geometry: GeoJSON.Geometry | null | undefined): number {
  if (!geometry) return 0;
  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") return 0;
  try {
    const feature: GeoJSON.Feature = { type: "Feature", geometry, properties: null };
    return area(feature);
  } catch {
    return 0;
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Measure geometric precision between a source NDJSON feature and its
 * tiled counterpart.
 *
 * @param sourceFeature  GeoJSON Feature from the source NDJSON file
 * @param tileFeature    MVT feature object returned by @mapbox/vector-tile
 *                       (the result of layer.feature(i).toGeoJSON(x,y,z) is
 *                        used internally to get WGS84 coordinates)
 * @param sourceLayer    Name of the MVT source layer (for labelling)
 * @param zoom           Zoom level the tile was read at (for labelling)
 * @param tileX          Tile x coordinate (needed to call toGeoJSON)
 * @param tileY          Tile y coordinate (needed to call toGeoJSON)
 */
export function measurePrecision(
  sourceFeature: GeoJSON.Feature,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tileFeature: any,
  sourceLayer: string,
  zoom: number,
  tileX: number,
  tileY: number
): PrecisionResult {
  // Convert tile feature to WGS84 GeoJSON
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tileGeoJSON: any = null;
  try {
    tileGeoJSON = tileFeature.toGeoJSON(tileX, tileY, zoom);
  } catch {
    // toGeoJSON failed — return zeroed result
    return {
      sourceLayer,
      zoom,
      hausdorffDistanceMeters: 0,
      avgVertexDisplacementMeters: 0,
      sourceVertexCount: 0,
      tileVertexCount: 0,
      areaRatioPercent: 0,
    };
  }

  const sourceRing = extractOuterRing(sourceFeature.geometry);
  const tileRing = extractTileOuterRing(tileGeoJSON);

  const sourceVertexCount = sourceRing?.length ?? 0;
  const tileVertexCount = tileRing?.length ?? 0;

  let hausdorffDistanceMeters = 0;
  let avgVertexDisplacementMeters = 0;

  if (sourceRing && tileRing && sourceRing.length > 0 && tileRing.length > 0) {
    hausdorffDistanceMeters = hausdorffDistance(sourceRing, tileRing);
    avgVertexDisplacementMeters = avgVertexDisplacement(sourceRing, tileRing);
  }

  const sourceArea = featureArea(sourceFeature.geometry);
  const tileGeom = tileGeoJSON?.geometry as GeoJSON.Geometry | null;
  const tileArea = featureArea(tileGeom);

  const areaRatioPercent =
    sourceArea > 0 ? (tileArea / sourceArea) * 100 : 0;

  return {
    sourceLayer,
    zoom,
    hausdorffDistanceMeters,
    avgVertexDisplacementMeters,
    sourceVertexCount,
    tileVertexCount,
    areaRatioPercent,
  };
}
