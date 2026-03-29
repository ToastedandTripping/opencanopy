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

// 1 hectare in square metres
const ONE_HECTARE_M2 = 10_000;

// Minimum lake size to index (filters noise, reduces memory)
const MIN_LAKE_AREA_HA = 1;

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
// Divides BC into 1° cells and maps each cell to the lake features that
// overlap it. O(1) lookup per grid cell; sufficiently fast for ~386K features.
// Falls back gracefully when @turf/geojson-rbush is unavailable.

interface GridIndex {
  cells: Map<string, number[]>; // "lon_lat" → lake indices
  lakes: GeoJSONPolygon[];
  lakeBboxes: Bbox4[];
}

function cellKey(lon: number, lat: number): string {
  return `${Math.floor(lon)}_${Math.floor(lat)}`;
}

function buildGridIndex(lakes: GeoJSONPolygon[], lakeBboxes: Bbox4[]): GridIndex {
  const cells = new Map<string, number[]>();

  for (let i = 0; i < lakes.length; i++) {
    const [west, south, east, north] = lakeBboxes[i];
    const lonMin = Math.floor(west);
    const lonMax = Math.floor(east);
    const latMin = Math.floor(south);
    const latMax = Math.floor(north);

    for (let lon = lonMin; lon <= lonMax; lon++) {
      for (let lat = latMin; lat <= latMax; lat++) {
        const key = cellKey(lon, lat);
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
  const lonMin = Math.floor(west);
  const lonMax = Math.floor(east);
  const latMin = Math.floor(south);
  const latMax = Math.floor(north);

  const seen = new Set<number>();
  const candidates: number[] = [];

  for (let lon = lonMin; lon <= lonMax; lon++) {
    for (let lat = latMin; lat <= latMax; lat++) {
      const list = index.cells.get(cellKey(lon, lat));
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

      // Filter out tiny lakes to reduce memory and processing time
      const props = feature.properties ?? {};
      const areaHa = Number(props["AREA_HA"] ?? props["area_ha"] ?? NaN);
      if (!isNaN(areaHa) && areaHa < MIN_LAKE_AREA_HA) {
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

  // Pre-compute bboxes
  const lakeBboxes: Bbox4[] = lakes.map((l) => {
    try {
      return bbox(l) as Bbox4;
    } catch {
      return [-180, -90, 180, 90];
    }
  });

  const index = buildGridIndex(lakes, lakeBboxes);

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

    for (const idx of candidates) {
      const lake = lakes[idx];
      try {
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
        result.failed++;
      }
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
  lakesPath: string
): Promise<WaterSubtractResult> {
  const { subtract, stats } = await createWaterSubtractor(lakesPath);

  const writeStream = createWriteStream(outputPath, { encoding: "utf-8" });

  const rl = createInterface({
    input: createReadStream(inputPath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let feature: unknown;
    try {
      feature = JSON.parse(trimmed);
    } catch {
      // Pass through malformed lines (validator already flagged these)
      writeStream.write(trimmed + "\n");
      continue;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = subtract(feature as any);
    if (result !== null) {
      writeStream.write(JSON.stringify(result) + "\n");
    }
  }

  await new Promise<void>((resolve, reject) => {
    writeStream.end((err?: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  return stats();
}
