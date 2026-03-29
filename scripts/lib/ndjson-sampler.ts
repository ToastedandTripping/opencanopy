/**
 * Streaming NDJSON utilities for the tile audit pipeline.
 *
 * Avoids loading full NDJSON files into memory -- works with the
 * large province-scale datasets in data/geojson/.
 */

import { createReadStream } from "fs";
import { createInterface } from "readline";
import type { GeoJSON } from "geojson";

/**
 * Count lines in an NDJSON file without loading it into memory.
 * Each line = one feature.
 */
export async function countLines(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let count = 0;
    const rl = createInterface({
      input: createReadStream(path, { encoding: "utf-8" }),
      crlfDelay: Infinity,
    });
    rl.on("line", (line) => {
      if (line.trim().length > 0) count++;
    });
    rl.on("close", () => resolve(count));
    rl.on("error", reject);
  });
}

/**
 * Sample n features from an NDJSON file using evenly-spaced line sampling.
 *
 * Reads the file twice: once to count lines, once to collect samples.
 * For large files (>500k lines) this is still faster than loading the whole file.
 */
export async function sampleFeatures(
  path: string,
  n: number
): Promise<GeoJSON.Feature[]> {
  const total = await countLines(path);
  if (total === 0) return [];

  // Pick evenly-spaced indices
  const step = Math.max(1, Math.floor(total / n));
  const targetIndices = new Set<number>();
  for (let i = 0; i < n && i * step < total; i++) {
    targetIndices.add(i * step);
  }

  const features: GeoJSON.Feature[] = [];
  let lineIndex = 0;

  await new Promise<void>((resolve, reject) => {
    const rl = createInterface({
      input: createReadStream(path, { encoding: "utf-8" }),
      crlfDelay: Infinity,
    });
    rl.on("line", (line) => {
      if (line.trim().length === 0) return;
      if (targetIndices.has(lineIndex)) {
        try {
          const feature = JSON.parse(line) as GeoJSON.Feature;
          features.push(feature);
        } catch {
          // Skip malformed lines
        }
      }
      lineIndex++;
    });
    rl.on("close", resolve);
    rl.on("error", reject);
  });

  return features;
}
