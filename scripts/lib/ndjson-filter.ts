/**
 * Streaming NDJSON bbox filter.
 *
 * Filters large NDJSON files by bounding box without loading them into memory.
 * Used by the tippecanoe parameter sweep pipeline to extract test regions.
 */

import { createReadStream, createWriteStream, existsSync, statSync } from "fs";
import { createInterface } from "readline";

export type Bbox = [west: number, south: number, east: number, north: number];

/**
 * Extract the representative coordinate from a GeoJSON geometry.
 * - Polygon: first coord of first ring
 * - LineString: first coord
 * - Point: the coord
 * Returns null for unrecognized or missing geometry.
 */
function extractFirstCoord(
  geometry: { type: string; coordinates: unknown } | null | undefined
): [number, number] | null {
  if (!geometry || !geometry.coordinates) return null;

  const coords = geometry.coordinates;

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
      return polys.length > 0 && polys[0].length > 0 && polys[0][0].length > 0
        ? polys[0][0][0]
        : null;
    }

    default:
      return null;
  }
}

/**
 * Async generator that streams an NDJSON file and yields features
 * whose representative coordinate falls within the given bbox.
 *
 * @param inputPath  Path to input NDJSON file
 * @param bbox       [west, south, east, north] in decimal degrees
 */
export async function* filterByBbox(
  inputPath: string,
  bbox: Bbox
): AsyncGenerator<string> {
  const [west, south, east, north] = bbox;

  const rl = createInterface({
    input: createReadStream(inputPath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    let feature: {
      geometry?: { type: string; coordinates: unknown } | null;
    };
    try {
      feature = JSON.parse(trimmed);
    } catch {
      continue; // skip malformed lines
    }

    const coord = extractFirstCoord(feature.geometry ?? null);
    if (!coord) continue;

    const [lon, lat] = coord;
    if (lon >= west && lon <= east && lat >= south && lat <= north) {
      yield trimmed;
    }
  }
}

/**
 * Write features from inputPath that fall within bbox to outputPath.
 * Returns the count of features written.
 *
 * Skips writing if outputPath already exists and has size > 0 (cache).
 * Pass force=true to overwrite.
 */
export async function extractToBbox(
  inputPath: string,
  outputPath: string,
  bbox: Bbox,
  force = false
): Promise<number> {
  // Cache: skip if output already exists and is non-empty
  if (!force && existsSync(outputPath)) {
    const stat = statSync(outputPath);
    if (stat.size > 0) {
      return -1; // -1 signals "skipped (cached)"
    }
  }

  // Stream directly to the output file rather than accumulating in memory.
  // createWriteStream was already imported but unused in the original implementation.
  const writeStream = createWriteStream(outputPath, { encoding: "utf-8" });

  let count = 0;

  for await (const line of filterByBbox(inputPath, bbox)) {
    writeStream.write(line + "\n");
    count++;
  }

  await new Promise<void>((resolve, reject) => {
    writeStream.end((err?: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  return count;
}
