/**
 * Water body subtraction for OpenCanopy source polygon data.
 *
 * Loads FWA lake polygons, builds a spatial index, then streams through
 * an input NDJSON and subtracts intersecting lake geometry from each feature.
 * Features that become smaller than 1 ha after subtraction are dropped.
 *
 * Memory note:
 *   386K lake features at ~1.5GB total. Run with:
 *   NODE_OPTIONS='--max-old-space-size=8192' npx tsx ...
 *   The preprocess npm script sets this automatically.
 *
 * Turf v7 API note:
 *   @turf/difference in v7 takes a FeatureCollection of two polygons:
 *   difference(featureCollection([subject, clip]))
 *   (v6-style difference(a, b) throws "Must have at least two features")
 */

import { createReadStream, createWriteStream, existsSync } from "fs";
import { createInterface } from "readline";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const turfDifference = require("@turf/difference");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const turfArea = require("@turf/area");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const turfBbox = require("@turf/bbox");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const turfHelpers = require("@turf/helpers");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const turfIntersect = require("@turf/intersect");

// Resolve compat shims for default vs named exports (turf v7 pattern)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const difference: (fc: any) => any =
  turfDifference.difference ?? turfDifference.default ?? turfDifference;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const area: (f: any) => number =
  turfArea.area ?? turfArea.default ?? turfArea;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const bbox: (f: any) => [number, number, number, number] =
  turfBbox.bbox ?? turfBbox.default ?? turfBbox;
const featureCollection: (
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  features: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
) => any =
  turfHelpers.featureCollection ?? turfHelpers.default?.featureCollection;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const intersect: (fc: any) => any =
  turfIntersect.intersect ?? turfIntersect.default ?? turfIntersect;

// 1 hectare in square metres
const ONE_HECTARE_M2 = 10_000;

// Minimum lake size to index. 5 ha filters tiny ponds invisible at tile
// resolution (5 ha ≈ 225m × 225m ≈ 2 pixels at z10). Reduces lake count
// by ~30-50% with zero visual impact on rendered tiles.
const MIN_LAKE_AREA_HA = 5;

export interface WaterSubtractResult {
  total: number;
  intersected: number;   // features that overlapped at least one lake
  subtracted: number;    // features with geometry actually modified
  dropped: number;       // features entirely inside a lake (< 1 ha remaining)
  failed: number;        // difference() threw an error
}

// ── Bbox helpers ──────────────────────────────────────────────────────────────

type Bbox4 = [number, number, number, number];

function bboxesOverlap(a: Bbox4, b: Bbox4): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

// ── Grid-based spatial index ──────────────────────────────────────────────────
//
// Divides BC into 0.1° cells (~8km × 11km) and maps each cell to the lake
// features that overlap it. At 1° cells, dense lake regions (Interior Plateau)
// had 50-100 candidates per query, causing intersect() to run 50-100 times per
// feature. At 0.1°, most cells contain 0-3 lakes — a 10-50x reduction in
// candidates for lake-dense regions.
//
// Grid memory: ~50K cells (vs ~500 at 1°) — trivial overhead.

const GRID_SCALE = 10; // 1/GRID_SCALE degree cells (10 = 0.1°)

interface GridIndex {
  cells: Map<string, number[]>; // "lon_lat" → lake indices
  lakes: GeoJSONPolygon[];
  lakeBboxes: Bbox4[];
}

function cellKey(lon: number, lat: number): string {
  return `${Math.floor(lon * GRID_SCALE)}_${Math.floor(lat * GRID_SCALE)}`;
}

function buildGridIndex(lakes: GeoJSONPolygon[], lakeBboxes: Bbox4[]): GridIndex {
  const cells = new Map<string, number[]>();

  for (let i = 0; i < lakes.length; i++) {
    const [west, south, east, north] = lakeBboxes[i];
    const lonMin = Math.floor(west * GRID_SCALE);
    const lonMax = Math.floor(east * GRID_SCALE);
    const latMin = Math.floor(south * GRID_SCALE);
    const latMax = Math.floor(north * GRID_SCALE);

    for (let lon = lonMin; lon <= lonMax; lon++) {
      for (let lat = latMin; lat <= latMax; lat++) {
        const key = `${lon}_${lat}`;
        const list = cells.get(key);
        if (list) {
          list.push(i);
        } else {
          cells.set(key, [i]);
        }
      }
    }
  }

  return { cells, lakes, lakeBboxes };
}

function queryCandidates(index: GridIndex, featureBbox: Bbox4): number[] {
  const [west, south, east, north] = featureBbox;
  const lonMin = Math.floor(west * GRID_SCALE);
  const lonMax = Math.floor(east * GRID_SCALE);
  const latMin = Math.floor(south * GRID_SCALE);
  const latMax = Math.floor(north * GRID_SCALE);

  const seen = new Set<number>();
  const candidates: number[] = [];

  for (let lon = lonMin; lon <= lonMax; lon++) {
    for (let lat = latMin; lat <= latMax; lat++) {
      const list = index.cells.get(`${lon}_${lat}`);
      if (!list) continue;
      for (const idx of list) {
        if (!seen.has(idx) && bboxesOverlap(featureBbox, index.lakeBboxes[idx])) {
          seen.add(idx);
          candidates.push(idx);
        }
      }
    }
  }

  return candidates;
}

// ── Lake loader ───────────────────────────────────────────────────────────────

type GeoJSONPolygon = {
  type: "Feature";
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  properties: Record<string, unknown> | null;
};

async function loadLakes(lakesPath: string): Promise<GeoJSONPolygon[]> {
  const lakes: GeoJSONPolygon[] = [];

  const rl = createInterface({
    input: createReadStream(lakesPath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const feature = JSON.parse(trimmed) as {
        type: string;
        geometry?: { type: string; coordinates: unknown } | null;
        properties?: Record<string, unknown> | null;
      };

      if (
        feature.type !== "Feature" ||
        !feature.geometry ||
        (feature.geometry.type !== "Polygon" &&
          feature.geometry.type !== "MultiPolygon")
      ) {
        continue;
      }

      // Filter out tiny lakes to reduce memory and processing time.
      // Default missing area to 0 so lakes without AREA_HA are always skipped.
      const props = feature.properties ?? {};
      const areaHa = Number(props["AREA_HA"] ?? props["area_ha"] ?? 0);
      if (areaHa < MIN_LAKE_AREA_HA) {
        continue;
      }

      lakes.push(feature as unknown as GeoJSONPolygon);
    } catch {
      // Skip malformed lines
    }
  }

  return lakes;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a reusable water subtractor backed by a spatial index.
 * The subtractor is stateful (accumulates stats) and can be applied
 * to individual features.
 */
export async function createWaterSubtractor(lakesPath: string): Promise<{
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subtract: (feature: any) => any | null;
  stats: () => WaterSubtractResult;
}> {
  if (!existsSync(lakesPath)) {
    throw new Error(`Lakes file not found: ${lakesPath}`);
  }

  console.log(`  Loading lake reference data from ${lakesPath}...`);
  const lakes = await loadLakes(lakesPath);
  console.log(`  Loaded ${lakes.length} lake polygons (>= ${MIN_LAKE_AREA_HA} ha)`);

  // Pre-compute bboxes, skipping any lake whose bbox() throws to avoid
  // a global [-180,-90,180,90] fallback that would make it a candidate for
  // every feature.
  const validLakes: GeoJSONPolygon[] = [];
  const lakeBboxes: Bbox4[] = [];
  let skipped = 0;
  for (const l of lakes) {
    try {
      lakeBboxes.push(bbox(l) as Bbox4);
      validLakes.push(l);
    } catch {
      // Skip corrupt lake geometry
      skipped++;
    }
  }
  if (skipped > 0) {
    console.log(`  Skipped ${skipped} lake(s) with corrupt geometry`);
  }

  // Rebind to validLakes so the index and subtract closure use the same array
  const indexedLakes = validLakes;
  const index = buildGridIndex(indexedLakes, lakeBboxes);

  const result: WaterSubtractResult = {
    total: 0,
    intersected: 0,
    subtracted: 0,
    dropped: 0,
    failed: 0,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function subtract(feature: any): any | null {
    result.total++;

    // Only process polygon/multipolygon geometries
    const geomType = feature?.geometry?.type;
    if (geomType !== "Polygon" && geomType !== "MultiPolygon") {
      return feature;
    }

    let featureBbox: Bbox4;
    try {
      featureBbox = bbox(feature) as Bbox4;
    } catch {
      return feature;
    }

    const candidates = queryCandidates(index, featureBbox);
    if (candidates.length === 0) {
      return feature;
    }

    result.intersected++;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let current: any = feature;
    let modified = false;
    let failedForThisFeature = false;

    for (const idx of candidates) {
      const lake = indexedLakes[idx];
      try {
        // Pre-filter: skip expensive difference() if geometries don't actually intersect.
        // intersect() returns null when polygons don't overlap — much cheaper than
        // computing the full boolean difference on non-overlapping geometry.
        const overlap = intersect(featureCollection([current, lake]));
        if (overlap === null) continue;

        // Turf v7: difference(featureCollection([subject, clip]))
        const diff = difference(featureCollection([current, lake]));

        if (diff === null) {
          // Feature is entirely inside the lake
          result.dropped++;
          return null;
        }

        // Check if area dropped below 1 ha
        const remainingArea = area(diff);
        if (remainingArea < ONE_HECTARE_M2) {
          result.dropped++;
          return null;
        }

        current = diff;
        modified = true;
      } catch {
        // Degenerate geometry pair -- skip this lake
        failedForThisFeature = true;
      }
    }

    if (failedForThisFeature) {
      result.failed++;
    }

    if (modified) {
      result.subtracted++;
    }

    return current;
  }

  return {
    subtract,
    stats: () => ({ ...result }),
  };
}

/**
 * Apply water subtraction to an entire NDJSON file.
 *
 * @param inputPath   Source NDJSON
 * @param outputPath  Destination NDJSON with lake geometry removed
 * @param lakesPath   FWA lakes NDJSON reference file
 * @returns           Subtraction statistics
 */
export async function subtractWaterFromNdjson(
  inputPath: string,
  outputPath: string,
  lakesPath: string,
  totalFeatures?: number
): Promise<WaterSubtractResult> {
  const { subtract, stats } = await createWaterSubtractor(lakesPath);

  const writeStream = createWriteStream(outputPath, { encoding: "utf-8" });

  const rl = createInterface({
    input: createReadStream(inputPath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let lineCount = 0;
  const startTime = Date.now();
  const WRITE_BATCH = 1000;
  const writeBuf: string[] = [];

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    lineCount++;
    if (lineCount % 100_000 === 0) {
      const elapsedS = (Date.now() - startTime) / 1000;
      const rate = Math.round(lineCount / elapsedS);
      const s = stats();
      const pct = totalFeatures ? ` (${((lineCount / totalFeatures) * 100).toFixed(1)}%)` : "";
      const eta = totalFeatures && rate > 0
        ? ` | ETA ${Math.round((totalFeatures - lineCount) / rate / 60)}m`
        : "";
      const avgCandidates = s.intersected > 0
        ? (s.intersected / lineCount).toFixed(2)
        : "0";
      process.stdout.write(
        `\r  [water-subtract] ${lineCount.toLocaleString()}${pct} | ` +
        `${rate} f/s${eta} | ` +
        `${s.subtracted} modified, ${s.dropped} dropped | ` +
        `${avgCandidates} candidates/feat     `
      );
    }

    let feature: unknown;
    try {
      feature = JSON.parse(trimmed);
    } catch {
      writeBuf.push(trimmed);
      if (writeBuf.length >= WRITE_BATCH) {
        writeStream.write(writeBuf.join("\n") + "\n");
        writeBuf.length = 0;
      }
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = subtract(feature as any);
    if (result !== null) {
      writeBuf.push(JSON.stringify(result));
      if (writeBuf.length >= WRITE_BATCH) {
        writeStream.write(writeBuf.join("\n") + "\n");
        writeBuf.length = 0;
      }
    }
  }

  // Flush remaining buffer
  if (writeBuf.length > 0) {
    writeStream.write(writeBuf.join("\n") + "\n");
  }

  // Final progress line
  const elapsedS = (Date.now() - startTime) / 1000;
  const rate = Math.round(lineCount / elapsedS);
  const finalStats = stats();
  console.log(
    `\n  [water-subtract] ${lineCount.toLocaleString()} features complete in ${Math.round(elapsedS)}s ` +
    `(${rate} f/s) | ${finalStats.intersected} intersected, ${finalStats.subtracted} modified, ${finalStats.dropped} dropped`
  );

  await new Promise<void>((resolve, reject) => {
    writeStream.end((err?: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  return stats();
}
