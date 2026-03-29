/**
 * Single tippecanoe configuration test.
 *
 * Builds a test PMTiles archive from a regional bbox extract, runs the same
 * boundary artifact + feature count checks as audit-tiles.ts, then compares
 * the test config against the current production tiles.
 *
 * Usage:
 *   npx tsx scripts/test-tile-config.ts
 *   npx tsx scripts/test-tile-config.ts \
 *     --simplification-overview=6 \
 *     --simplification-detail=4 \
 *     --buffer=16 \
 *     --detect-shared-borders \
 *     --lat=49.4 --lon=-118.8 --radius=0.5
 */

import path from "path";
import {
  existsSync,
  mkdirSync,
  statSync,
  readdirSync,
  unlinkSync,
} from "fs";
import { execSync } from "child_process";
import { PMTiles } from "pmtiles";
import { NodeFileSource } from "./lib/node-file-source";
import { parseTile, getLayerFeatures } from "./lib/mvt-reader";
import { latLonToTile } from "./lib/tile-math";
import { extractToBbox, type Bbox } from "./lib/ndjson-filter";
import {
  computeQualityScore,
  formatComparisonTable,
  type ConfigMetrics,
} from "./lib/quality-score";
import { writeFileSync } from "fs";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = path.resolve(__dirname, "..");

// ── Paths ──────────────────────────────────────────────────────────────────────

const GEOJSON_DIR = path.resolve(PROJECT_ROOT, "data/geojson");
const TEST_DIR = path.resolve(PROJECT_ROOT, "data/tiles/test");
const TEST_GEOJSON_DIR = path.resolve(TEST_DIR, "geojson");
const PRODUCTION_PMTILES = path.resolve(PROJECT_ROOT, "data/tiles/opencanopy.pmtiles");
const REPORTS_DIR = path.resolve(PROJECT_ROOT, "data/reports");

// ── CLI Argument Parsing ───────────────────────────────────────────────────────

export interface TileConfig {
  simplificationOverview: number;
  simplificationDetail: number;
  buffer: number | null;
  detectSharedBorders: boolean;
  maxTileSize: number;
}

interface TestArgs extends TileConfig {
  lat: number;
  lon: number;
  radius: number;
}

function parseArgs(argv: string[]): TestArgs {
  const args = argv.slice(2);

  function getFlag(name: string): string | null {
    const prefix = `--${name}=`;
    const exact = `--${name}`;
    for (const arg of args) {
      if (arg.startsWith(prefix)) return arg.slice(prefix.length);
      if (arg === exact) return "true";
    }
    return null;
  }

  const soStr = getFlag("simplification-overview");
  const sdStr = getFlag("simplification-detail");
  const bufStr = getFlag("buffer");
  const dsb = getFlag("detect-shared-borders");
  const mtsStr = getFlag("max-tile-size");
  const latStr = getFlag("lat");
  const lonStr = getFlag("lon");
  const radiusStr = getFlag("radius");

  return {
    simplificationOverview: soStr !== null ? parseInt(soStr, 10) : 10,
    simplificationDetail: sdStr !== null ? parseInt(sdStr, 10) : 8,
    buffer: bufStr !== null ? parseInt(bufStr, 10) : null,
    detectSharedBorders: dsb !== null,
    maxTileSize: mtsStr !== null ? parseInt(mtsStr, 10) : 10_000_000,
    lat: latStr !== null ? parseFloat(latStr) : 49.4,
    lon: lonStr !== null ? parseFloat(lonStr) : -118.8,
    radius: radiusStr !== null ? parseFloat(radiusStr) : 0.5,
  };
}

export function configToParamString(cfg: TileConfig): string {
  const parts = [
    `sO=${cfg.simplificationOverview}`,
    `sD=${cfg.simplificationDetail}`,
  ];
  if (cfg.buffer !== null) parts.push(`buf=${cfg.buffer}`);
  if (cfg.detectSharedBorders) parts.push("shared");
  return parts.join(" ");
}

// ── Step 1: Extract test region ────────────────────────────────────────────────

export async function extractTestRegion(
  lat: number,
  lon: number,
  radius: number,
  force = false
): Promise<Map<string, number>> {
  const bbox: Bbox = [lon - radius, lat - radius, lon + radius, lat + radius];

  mkdirSync(TEST_GEOJSON_DIR, { recursive: true });

  const ndjsonFiles = readdirSync(GEOJSON_DIR).filter((f) => f.endsWith(".ndjson"));

  const counts = new Map<string, number>();

  for (const file of ndjsonFiles) {
    const layerName = path.basename(file, ".ndjson");
    const inputPath = path.join(GEOJSON_DIR, file);
    const outputPath = path.join(TEST_GEOJSON_DIR, file);

    const count = await extractToBbox(inputPath, outputPath, bbox, force);

    if (count === -1) {
      // Cached
      const cachedStat = statSync(outputPath);
      const cachedCount = cachedStat.size > 0 ? -1 : 0;
      counts.set(layerName, cachedCount);
      console.log(`  ${layerName}: cached (${outputPath})`);
    } else {
      counts.set(layerName, count);
      console.log(`  ${layerName}: ${count} features extracted`);
    }
  }

  return counts;
}

// ── Step 2: Build tippecanoe commands ──────────────────────────────────────────

export function buildTippecanoeCommands(cfg: TileConfig, outputName: string): {
  overviewCmd: string;
  detailCmd: string;
  mergeCmd: string;
  overviewPath: string;
  detailPath: string;
  outputPath: string;
  inputs: string[];
} {
  const outputPath = path.resolve(TEST_DIR, `${outputName}.pmtiles`);
  const overviewPath = path.resolve(TEST_DIR, `${outputName}-overview.pmtiles`);
  const detailPath = path.resolve(TEST_DIR, `${outputName}-detail.pmtiles`);

  // Find non-empty NDJSON files in the test geojson dir
  const ndjsonFiles = existsSync(TEST_GEOJSON_DIR)
    ? readdirSync(TEST_GEOJSON_DIR).filter((f) => f.endsWith(".ndjson"))
    : [];

  const inputs: string[] = [];
  for (const file of ndjsonFiles) {
    const fullPath = path.join(TEST_GEOJSON_DIR, file);
    if (existsSync(fullPath) && statSync(fullPath).size > 0) {
      const layerName = path.basename(file, ".ndjson");
      inputs.push("-L", `${layerName}:${fullPath}`);
    }
  }

  // Shared border / buffer flags
  const sharedBorderFlag = cfg.detectSharedBorders ? "--detect-shared-borders" : "";
  const bufferFlag = cfg.buffer !== null ? `--buffer=${cfg.buffer}` : "";
  const extraFlags = [sharedBorderFlag, bufferFlag].filter(Boolean);

  // Overview: z4-z7 with tile cap + coalescing
  const overviewParts = [
    "tippecanoe",
    "-o", overviewPath,
    "-Z", "4", "-z", "7",
    "--no-feature-limit",
    "-M", String(cfg.maxTileSize),
    "--coalesce-smallest-as-needed",
    `--simplification=${cfg.simplificationOverview}`,
    ...extraFlags,
    "--force",
    "-P",
    ...inputs,
  ];
  const overviewCmd = overviewParts.join(" ");

  // Detail: z8-z10 with no tile size limit
  const detailParts = [
    "tippecanoe",
    "-o", detailPath,
    "-Z", "8", "-z", "10",
    "--no-feature-limit", "--no-tile-size-limit",
    `--simplification=${cfg.simplificationDetail}`,
    ...extraFlags,
    "--force",
    "-P",
    ...inputs,
  ];
  const detailCmd = detailParts.join(" ");

  // Merge
  const mergeCmd = [
    "tile-join",
    "-o", outputPath,
    "-pk",
    "--force",
    overviewPath,
    detailPath,
  ].join(" ");

  return { overviewCmd, detailCmd, mergeCmd, overviewPath, detailPath, outputPath, inputs };
}

// ── Step 3: Run tippecanoe ─────────────────────────────────────────────────────

export function runTippecanoeCommands(
  overviewCmd: string,
  detailCmd: string,
  mergeCmd: string,
  overviewPath: string,
  detailPath: string
): boolean {
  try {
    console.log(`  $ ${overviewCmd}`);
    execSync(overviewCmd, { stdio: "inherit", timeout: 3_600_000 });

    console.log(`  $ ${detailCmd}`);
    execSync(detailCmd, { stdio: "inherit", timeout: 3_600_000 });

    console.log(`  $ ${mergeCmd}`);
    execSync(mergeCmd, { stdio: "inherit", timeout: 600_000 });

    // Clean up intermediates
    try { unlinkSync(overviewPath); } catch { /* ignore */ }
    try { unlinkSync(detailPath); } catch { /* ignore */ }

    return true;
  } catch (err) {
    console.error("tippecanoe build failed:", (err as Error).message);
    return false;
  }
}

// ── Step 4: Measure artifact percentage ───────────────────────────────────────

async function readTileSafe(
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
 * Measure the boundary artifact percentage for a tile at the given coordinate.
 * Replicates the A5 edge-alignment check from audit-tiles.ts.
 *
 * Returns [boundaryPercent, featureCount].
 */
async function measureArtifactPercent(
  pmtiles: PMTiles,
  lat: number,
  lon: number,
  zoom: number
): Promise<{ artifactPercent: number; featureCount: number }> {
  const tile = latLonToTile(lat, lon, zoom);
  const tileData = await readTileSafe(pmtiles, tile.z, tile.x, tile.y);

  if (!tileData) {
    return { artifactPercent: 0, featureCount: 0 };
  }

  const parsed = parseTile(tileData);
  const features = getLayerFeatures(parsed, "forest-age");

  if (features.length === 0) {
    return { artifactPercent: 0, featureCount: 0 };
  }

  const TILE_EXTENT = 4096;
  const BOUNDARY_TOLERANCE = 4;
  let boundaryEdgeCount = 0;
  let totalEdgeCount = 0;

  for (const feature of features) {
    const f = feature as {
      type: number;
      loadGeometry: () => Array<Array<{ x: number; y: number }>>;
    };

    if (f.type !== 3) continue;

    try {
      const rings = f.loadGeometry();
      for (const ring of rings) {
        for (let i = 0; i < ring.length - 1; i++) {
          const p0 = ring[i];
          const p1 = ring[i + 1];

          const onLeftEdge =
            Math.abs(p0.x) <= BOUNDARY_TOLERANCE && Math.abs(p1.x) <= BOUNDARY_TOLERANCE;
          const onRightEdge =
            Math.abs(p0.x - TILE_EXTENT) <= BOUNDARY_TOLERANCE &&
            Math.abs(p1.x - TILE_EXTENT) <= BOUNDARY_TOLERANCE;
          const onTopEdge =
            Math.abs(p0.y) <= BOUNDARY_TOLERANCE && Math.abs(p1.y) <= BOUNDARY_TOLERANCE;
          const onBottomEdge =
            Math.abs(p0.y - TILE_EXTENT) <= BOUNDARY_TOLERANCE &&
            Math.abs(p1.y - TILE_EXTENT) <= BOUNDARY_TOLERANCE;

          totalEdgeCount++;
          if (onLeftEdge || onRightEdge || onTopEdge || onBottomEdge) {
            boundaryEdgeCount++;
          }
        }
      }
    } catch {
      // Skip features with geometry load errors
    }
  }

  const ratio = totalEdgeCount > 0 ? boundaryEdgeCount / totalEdgeCount : 0;
  return { artifactPercent: ratio * 100, featureCount: features.length };
}

/**
 * Count features across all layers in the tile at the given coordinate.
 */
async function countFeaturesAtTile(
  pmtiles: PMTiles,
  lat: number,
  lon: number,
  zoom: number
): Promise<number> {
  const tile = latLonToTile(lat, lon, zoom);
  const tileData = await readTileSafe(pmtiles, tile.z, tile.x, tile.y);
  if (!tileData) return 0;

  const parsed = parseTile(tileData);
  return Object.keys(parsed.layers).reduce(
    (sum, layer) => sum + getLayerFeatures(parsed, layer).length,
    0
  );
}

/**
 * Find the maximum tile size in MB by reading all tiles in a bounding box
 * at the given zoom levels.
 */
async function findMaxTileSize(
  pmtiles: PMTiles,
  lat: number,
  lon: number,
  radius: number,
  zooms: number[]
): Promise<number> {
  let maxBytes = 0;

  for (const zoom of zooms) {
    const swTile = latLonToTile(lat - radius, lon - radius, zoom);
    const neTile = latLonToTile(lat + radius, lon + radius, zoom);

    const xMin = Math.min(swTile.x, neTile.x);
    const xMax = Math.max(swTile.x, neTile.x);
    const yMin = Math.min(swTile.y, neTile.y);
    const yMax = Math.max(swTile.y, neTile.y);

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        const tileData = await readTileSafe(pmtiles, zoom, x, y);
        if (tileData && tileData.byteLength > maxBytes) {
          maxBytes = tileData.byteLength;
        }
      }
    }
  }

  return maxBytes / (1024 * 1024);
}

// ── Step 5: Measure metrics for a PMTiles file ────────────────────────────────

export async function measureMetrics(
  pmtilesPath: string,
  lat: number,
  lon: number,
  radius: number,
  ndjsonFeatureCount: number
): Promise<ConfigMetrics> {
  const source = new NodeFileSource(pmtilesPath);
  const pmtiles = new PMTiles(source);

  const [z7, z9, z10] = await Promise.all([
    measureArtifactPercent(pmtiles, lat, lon, 7),
    measureArtifactPercent(pmtiles, lat, lon, 9),
    countFeaturesAtTile(pmtiles, lat, lon, 10),
  ]);

  const maxTileSizeMB = await findMaxTileSize(pmtiles, lat, lon, radius, [7, 9]);

  await source.close();

  const totalSizeMB = statSync(pmtilesPath).size / (1024 * 1024);

  // Feature preservation: ratio of tile features at z10 to NDJSON features in bbox
  const featurePreservationPercent =
    ndjsonFeatureCount > 0
      ? Math.min(100, (z10 / ndjsonFeatureCount) * 100)
      : 0;

  return {
    artifactPercentZ7: z7.artifactPercent,
    artifactPercentZ9: z9.artifactPercent,
    featurePreservationPercent,
    maxTileSizeMB,
    totalSizeMB,
  };
}

// ── Step 6: Count NDJSON features in test region ───────────────────────────────

async function countTestRegionFeatures(): Promise<number> {
  if (!existsSync(TEST_GEOJSON_DIR)) return 0;

  const { countLines } = await import("./lib/ndjson-sampler");

  const files = readdirSync(TEST_GEOJSON_DIR).filter((f) => f.endsWith(".ndjson"));
  let total = 0;
  for (const f of files) {
    const p = path.join(TEST_GEOJSON_DIR, f);
    if (statSync(p).size > 0) {
      total += await countLines(p);
    }
  }
  return total;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  console.log("\nTippecanoe Config Test");
  console.log("─".repeat(60));
  console.log(`  Center: ${args.lat}, ${args.lon}  radius: ±${args.radius}°`);
  console.log(`  simplification-overview: ${args.simplificationOverview}`);
  console.log(`  simplification-detail:   ${args.simplificationDetail}`);
  console.log(`  buffer:                  ${args.buffer ?? "(not set)"}`);
  console.log(`  detect-shared-borders:   ${args.detectSharedBorders}`);
  console.log(`  max-tile-size:           ${args.maxTileSize.toLocaleString()}`);
  console.log();

  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(REPORTS_DIR, { recursive: true });

  // ── Step 1: Extract test region ──
  console.log("Step 1: Extracting test region...");
  await extractTestRegion(args.lat, args.lon, args.radius);
  console.log();

  // ── Step 2: Build ──
  console.log("Step 2: Building test tiles...");
  const { overviewCmd, detailCmd, mergeCmd, overviewPath, detailPath, outputPath, inputs } =
    buildTippecanoeCommands(args, "test-config");

  if (inputs.length === 0) {
    console.error("No NDJSON data found in test region. Cannot build tiles.");
    process.exit(1);
  }

  const built = runTippecanoeCommands(
    overviewCmd,
    detailCmd,
    mergeCmd,
    overviewPath,
    detailPath
  );

  if (!built || !existsSync(outputPath)) {
    console.error("Build failed. Cannot proceed with audit.");
    process.exit(1);
  }
  console.log();

  // ── Step 3: Count source features in test area ──
  const ndjsonCount = await countTestRegionFeatures();
  console.log(`Step 3: Source features in test region: ${ndjsonCount.toLocaleString()}`);
  console.log();

  // ── Step 4: Measure test config metrics ──
  console.log("Step 4: Measuring test config metrics...");
  const testMetrics = await measureMetrics(
    outputPath,
    args.lat,
    args.lon,
    args.radius,
    ndjsonCount
  );
  console.log(`  Artifact z7: ${testMetrics.artifactPercentZ7.toFixed(1)}%`);
  console.log(`  Artifact z9: ${testMetrics.artifactPercentZ9.toFixed(1)}%`);
  console.log(`  Preservation: ${testMetrics.featurePreservationPercent.toFixed(1)}%`);
  console.log(`  Max tile: ${testMetrics.maxTileSizeMB.toFixed(2)} MB`);
  console.log(`  Total: ${testMetrics.totalSizeMB.toFixed(1)} MB`);
  console.log();

  // ── Step 5: Measure current production metrics ──
  console.log("Step 5: Measuring production tile metrics...");
  let currentMetrics: ConfigMetrics;

  if (!existsSync(PRODUCTION_PMTILES)) {
    console.warn("  Production PMTiles not found. Using zero baseline.");
    currentMetrics = {
      artifactPercentZ7: 0,
      artifactPercentZ9: 0,
      featurePreservationPercent: 0,
      maxTileSizeMB: 0,
      totalSizeMB: 0,
    };
  } else {
    currentMetrics = await measureMetrics(
      PRODUCTION_PMTILES,
      args.lat,
      args.lon,
      args.radius,
      ndjsonCount
    );
  }
  console.log(`  Artifact z7: ${currentMetrics.artifactPercentZ7.toFixed(1)}%`);
  console.log(`  Artifact z9: ${currentMetrics.artifactPercentZ9.toFixed(1)}%`);
  console.log(`  Preservation: ${currentMetrics.featurePreservationPercent.toFixed(1)}%`);
  console.log(`  Max tile: ${currentMetrics.maxTileSizeMB.toFixed(2)} MB`);
  console.log(`  Total: ${currentMetrics.totalSizeMB.toFixed(1)} MB`);
  console.log();

  // ── Step 6: Output comparison ──
  const paramStr = configToParamString(args);
  const table = formatComparisonTable(currentMetrics, testMetrics, paramStr);
  console.log(table);

  // ── Save JSON report ──
  const reportPath = path.join(REPORTS_DIR, "tile-config-test.json");
  const report = {
    timestamp: new Date().toISOString(),
    params: {
      lat: args.lat,
      lon: args.lon,
      radius: args.radius,
      simplificationOverview: args.simplificationOverview,
      simplificationDetail: args.simplificationDetail,
      buffer: args.buffer,
      detectSharedBorders: args.detectSharedBorders,
      maxTileSize: args.maxTileSize,
    },
    current: {
      label: "production",
      metrics: currentMetrics,
      score: computeQualityScore(currentMetrics),
    },
    test: {
      label: paramStr,
      metrics: testMetrics,
      score: computeQualityScore(testMetrics),
    },
    ndjsonFeaturesInRegion: ndjsonCount,
  };

  try {
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`Report saved: ${reportPath}`);
  } catch (err) {
    console.warn(`Could not save report: ${(err as Error).message}`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
