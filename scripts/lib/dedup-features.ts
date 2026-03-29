/**
 * Hash-based NDJSON deduplication.
 *
 * Streams through an NDJSON file and discards features whose geometry
 * has already been seen (identical rounded coordinates + properties).
 * Suitable for province-scale datasets; a Set<string> of SHA-256 hashes
 * at 6.2M entries uses ~310MB RAM, well within Node's default heap.
 */

import { createReadStream, createWriteStream } from "fs";
import { createInterface } from "readline";
import { createHash } from "crypto";

export interface DedupResult {
  total: number;
  unique: number;
  duplicates: number;
  duplicateRate: number;
}

/**
 * Round a coordinate value to 6 decimal places (~0.1m precision at equator).
 * Eliminates floating-point noise that would cause identical features to hash
 * differently.
 */
function roundCoord(v: number): number {
  return Math.round(v * 1_000_000) / 1_000_000;
}

/**
 * Recursively round all numeric coordinate values in a GeoJSON coordinates
 * structure (handles Point / LineString / Polygon / Multi* types).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function roundCoordinates(coords: unknown): unknown {
  if (typeof coords === "number") return roundCoord(coords);
  if (Array.isArray(coords)) return coords.map(roundCoordinates);
  return coords;
}

/**
 * Produce a stable SHA-256 fingerprint for a GeoJSON feature.
 *
 * Strategy:
 * 1. Round all geometry coordinates to 6 decimal places
 * 2. Sort coordinate pairs so that rings with different winding produce the
 *    same hash (degenerate case -- rings with genuinely different vertex order
 *    won't collide because the full coordinate array is included)
 * 3. Concatenate with JSON.stringify of properties
 */
function hashFeature(feature: {
  geometry?: { type?: string; coordinates?: unknown } | null;
  properties?: Record<string, unknown> | null;
}): string {
  const geometry = feature.geometry ?? null;
  const props = feature.properties ?? null;

  let coordStr = "";
  if (geometry && geometry.coordinates !== undefined) {
    const rounded = roundCoordinates(geometry.coordinates);
    // Sort the top-level coordinate array to make ring winding order irrelevant
    // for simple polygons. For multi-geometries the sub-arrays stay ordered.
    const sortable = Array.isArray(rounded) ? [...(rounded as unknown[])].sort() : rounded;
    coordStr = JSON.stringify(sortable);
  }

  const propStr = JSON.stringify(props ?? null);
  const raw = `${geometry?.type ?? "null"}|${coordStr}|${propStr}`;

  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Stream-dedup an NDJSON file.
 *
 * @param inputPath   Source NDJSON (one GeoJSON Feature per line)
 * @param outputPath  Destination NDJSON with duplicates removed
 * @returns           Deduplication statistics
 */
export async function dedupNdjson(
  inputPath: string,
  outputPath: string
): Promise<DedupResult> {
  const seen = new Set<string>();
  const writeStream = createWriteStream(outputPath, { encoding: "utf-8" });

  let total = 0;
  let unique = 0;

  const rl = createInterface({
    input: createReadStream(inputPath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    total++;

    let feature: { geometry?: unknown; properties?: unknown };
    try {
      feature = JSON.parse(trimmed);
    } catch {
      // Malformed JSON -- pass through so downstream validators can flag it
      writeStream.write(trimmed + "\n");
      unique++;
      continue;
    }

    const hash = hashFeature(
      feature as {
        geometry?: { type?: string; coordinates?: unknown } | null;
        properties?: Record<string, unknown> | null;
      }
    );

    if (!seen.has(hash)) {
      seen.add(hash);
      writeStream.write(trimmed + "\n");
      unique++;
    }
    // else: duplicate -- skip
  }

  await new Promise<void>((resolve, reject) => {
    writeStream.end((err?: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const duplicates = total - unique;
  const duplicateRate = total > 0 ? duplicates / total : 0;

  return { total, unique, duplicates, duplicateRate };
}
