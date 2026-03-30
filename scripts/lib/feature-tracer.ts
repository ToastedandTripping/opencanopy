/**
 * Feature tracer: given a source NDJSON feature, locate it in PMTiles and
 * verify its properties survived the tiling pipeline.
 *
 * Design decisions:
 * - Accepts a PMTiles instance (not a path) — callers open a single file handle
 *   and pass it here so the trace loop doesn't repeatedly open/close.
 * - Centroid extraction uses the first-coordinate approach, consistent with
 *   ndjson-filter.ts extractFirstCoord().
 * - Match uses property fingerprint overlap score; threshold 0.5 means at least
 *   half the source properties must match a candidate to be considered the same
 *   feature.
 * - If not found in the primary tile, all 8 neighbours are checked before
 *   returning found: false.
 */

import { PMTiles } from "pmtiles";
import type { GeoJSON } from "geojson";
import { latLonToTile } from "./tile-math";
import { parseTile, getLayerFeatures } from "./mvt-reader";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TraceResult {
  sourceLayer: string;
  centroid: { lat: number; lon: number };
  tileCoord: { z: number; x: number; y: number };
  found: boolean;
  propertyComparison: Record<string, { source: unknown; tile: unknown; match: boolean }>;
  candidateCount: number;
  neighborChecked: boolean;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Extract representative [lon, lat] from a GeoJSON geometry using the
 * first-coordinate approach (consistent with ndjson-filter.ts).
 */
function extractFirstCoord(
  geometry: GeoJSON.Geometry | null | undefined
): [number, number] | null {
  if (!geometry) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const coords = (geometry as any).coordinates;
  if (!coords) return null;

  switch (geometry.type) {
    case "Point":
      return coords as [number, number];

    case "LineString":
    case "MultiPoint": {
      const arr = coords as Array<[number, number]>;
      return arr.length > 0 ? arr[0] : null;
    }

    case "Polygon":
    case "MultiLineString": {
      const outer = coords as Array<Array<[number, number]>>;
      return outer.length > 0 && outer[0].length > 0 ? outer[0][0] : null;
    }

    case "MultiPolygon": {
      const polys = coords as Array<Array<Array<[number, number]>>>;
      return polys.length > 0 &&
        polys[0].length > 0 &&
        polys[0][0].length > 0
        ? polys[0][0][0]
        : null;
    }

    default:
      return null;
  }
}

/**
 * Fetch a tile from PMTiles. Returns null if the tile doesn't exist or errors.
 */
async function fetchTile(
  pmtiles: PMTiles,
  z: number,
  x: number,
  y: number
): Promise<ArrayBuffer | null> {
  try {
    const result = await pmtiles.getZxy(z, x, y);
    if (!result || !result.data) return null;
    return result.data;
  } catch {
    return null;
  }
}

/**
 * Compute property fingerprint overlap between a source feature's properties
 * and a candidate tile feature's properties.
 *
 * Returns a score in [0, 1]: fraction of source property keys whose values
 * match the candidate. Only keys present in the source are scored.
 */
function fingerprintScore(
  sourceProps: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tileFeature: any
): number {
  const tileProps: Record<string, unknown> = tileFeature.properties ?? {};
  const sourceKeys = Object.keys(sourceProps);
  if (sourceKeys.length === 0) return 1; // no properties to compare — vacuous match

  let matches = 0;
  for (const key of sourceKeys) {
    const sv = sourceProps[key];
    const tv = tileProps[key];
    // Loose equality: tile may stringify numbers or truncate floats
    // eslint-disable-next-line eqeqeq
    if (sv == tv) matches++;
  }
  return matches / sourceKeys.length;
}

/**
 * Build a propertyComparison record: one entry per source property key,
 * each with { source, tile, match: strict equality }.
 */
function buildPropertyComparison(
  sourceProps: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tileFeature: any
): Record<string, { source: unknown; tile: unknown; match: boolean }> {
  const tileProps: Record<string, unknown> = tileFeature.properties ?? {};
  const comparison: Record<string, { source: unknown; tile: unknown; match: boolean }> = {};

  for (const key of Object.keys(sourceProps)) {
    const source = sourceProps[key];
    const tile = tileProps[key];
    comparison[key] = { source, tile, match: source === tile };
  }
  return comparison;
}

/**
 * Find the best-matching tile feature in `features` for the given source
 * properties. Returns [bestFeature, score] or [null, 0].
 */
function findBestCandidate(
  features: unknown[],
  sourceProps: Record<string, unknown>
): [unknown, number] {
  let bestFeature: unknown = null;
  let bestScore = 0;

  for (const feat of features) {
    const score = fingerprintScore(sourceProps, feat);
    if (score > bestScore) {
      bestScore = score;
      bestFeature = feat;
    }
  }
  return [bestFeature, bestScore];
}

// ── Match threshold ───────────────────────────────────────────────────────────

const MATCH_THRESHOLD = 0.5;

// ── Core trace function ───────────────────────────────────────────────────────

/**
 * Trace a single source NDJSON feature through the PMTiles archive at zoom z.
 *
 * Algorithm:
 * 1. Extract centroid from source geometry (first-coord approach).
 * 2. Convert to tile coords via latLonToTile().
 * 3. Fetch primary tile, get all features from sourceLayer.
 * 4. Find best property-fingerprint match (threshold 0.5).
 * 5. If not found in primary tile, check all 8 neighbours.
 * 6. Return TraceResult.
 *
 * @param pmtiles     Open PMTiles instance (caller manages lifecycle)
 * @param feature     GeoJSON Feature from source NDJSON
 * @param sourceLayer Name of the MVT layer to search within the tile
 * @param zoom        Zoom level to trace at (typically 10)
 */
export async function traceFeature(
  pmtiles: PMTiles,
  feature: GeoJSON.Feature,
  sourceLayer: string,
  zoom = 10
): Promise<TraceResult> {
  const sourceProps = (feature.properties ?? {}) as Record<string, unknown>;

  // Step 1 + 2: centroid and tile coord
  const coord = extractFirstCoord(feature.geometry);
  if (!coord) {
    // No geometry — cannot locate in tile
    return {
      sourceLayer,
      centroid: { lat: 0, lon: 0 },
      tileCoord: { z: zoom, x: 0, y: 0 },
      found: false,
      propertyComparison: Object.fromEntries(
        Object.keys(sourceProps).map((k) => [
          k,
          { source: sourceProps[k], tile: undefined, match: false },
        ])
      ),
      candidateCount: 0,
      neighborChecked: false,
    };
  }

  const [lon, lat] = coord;
  const tileCoord = latLonToTile(lat, lon, zoom);
  const { z, x, y } = tileCoord;

  // Step 3 + 4: primary tile
  const primaryData = await fetchTile(pmtiles, z, x, y);
  let allCandidates = 0;
  let bestFeature: unknown = null;
  let bestScore = 0;

  if (primaryData) {
    const tile = parseTile(primaryData);
    const features = getLayerFeatures(tile, sourceLayer);
    allCandidates += features.length;
    const [f, s] = findBestCandidate(features, sourceProps);
    if (s > bestScore) {
      bestScore = s;
      bestFeature = f;
    }
  }

  // Step 5: if not found above threshold, check 8 neighbours
  let neighborChecked = false;
  if (bestScore < MATCH_THRESHOLD) {
    neighborChecked = true;
    const maxTile = Math.pow(2, z) - 1;

    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue; // skip primary

        const nx = Math.max(0, Math.min(maxTile, x + dx));
        const ny = Math.max(0, Math.min(maxTile, y + dy));
        const neighborData = await fetchTile(pmtiles, z, nx, ny);
        if (!neighborData) continue;

        const tile = parseTile(neighborData);
        const features = getLayerFeatures(tile, sourceLayer);
        allCandidates += features.length;

        const [f, s] = findBestCandidate(features, sourceProps);
        if (s > bestScore) {
          bestScore = s;
          bestFeature = f;
          // early exit if we already have a very strong match
          if (bestScore >= 0.9) break;
        }
      }
      if (bestScore >= 0.9) break;
    }
  }

  const found = bestScore >= MATCH_THRESHOLD;
  const propertyComparison = found && bestFeature != null
    ? buildPropertyComparison(sourceProps, bestFeature)
    : Object.fromEntries(
        Object.keys(sourceProps).map((k) => [
          k,
          { source: sourceProps[k], tile: undefined, match: false },
        ])
      );

  return {
    sourceLayer,
    centroid: { lat, lon },
    tileCoord: { z, x, y },
    found,
    propertyComparison,
    candidateCount: allCandidates,
    neighborChecked,
  };
}

/**
 * Trace multiple features. Thin wrapper around traceFeature for convenience.
 *
 * @param pmtiles     Open PMTiles instance
 * @param features    Array of GeoJSON Features from source NDJSON
 * @param sourceLayer MVT layer name to search
 * @param zoom        Zoom level (default 10)
 */
export async function traceFeatures(
  pmtiles: PMTiles,
  features: GeoJSON.Feature[],
  sourceLayer: string,
  zoom = 10
): Promise<TraceResult[]> {
  const results: TraceResult[] = [];
  for (const feature of features) {
    results.push(await traceFeature(pmtiles, feature, sourceLayer, zoom));
  }
  return results;
}
