/**
 * OpenCanopy Temporal Consistency Audit — Part C
 *
 * Compares the current PMTiles archive against the most recent archived version
 * to detect unexpected feature count changes or feature disappearances.
 *
 * Archive directory: data/tiles/archive/
 * Archives are created automatically by build-tiles.ts before each build.
 *
 * Checks:
 *   C1: Feature count delta per layer: >10% = WARN, >25% = FAIL
 *   C2: Feature persistence in tenure-cutblocks: >5% disappearance = WARN
 *
 * Usage:
 *   npx tsx scripts/audit-temporal.ts
 *   npx tsx scripts/audit-temporal.ts --output data/reports/temporal-results.json
 */

import path from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, readdirSync } from "fs";
import { PMTiles } from "pmtiles";
import { NodeFileSource } from "./lib/node-file-source";
import { parseTile, getLayerFeatures } from "./lib/mvt-reader";
import { latLonToTile } from "./lib/tile-math";
import { AuditResult, printResults, saveResults } from "./lib/audit-types";
import { BC_SAMPLE_POINTS, EXPECTED_SOURCE_LAYERS } from "./lib/bc-sample-grid";

// -- Configuration -------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, "..");
const TILES_DIR = path.resolve(PROJECT_ROOT, "data", "tiles");
const ARCHIVE_DIR = path.resolve(TILES_DIR, "archive");
const PMTILES_PATH = path.resolve(TILES_DIR, "opencanopy.pmtiles");
const REPORTS_DIR = path.resolve(PROJECT_ROOT, "data", "reports");
const DEFAULT_OUTPUT = path.resolve(REPORTS_DIR, "temporal-results.json");

// Zoom level for temporal comparison
const COMPARE_ZOOM = 10;

// Sample 50 features from previous archive to check for disappearance
const PERSISTENCE_SAMPLE_SIZE = 50;

// Thresholds
const WARN_DELTA_PCT = 10;
const FAIL_DELTA_PCT = 25;
const WARN_DISAPPEARANCE_PCT = 5;

// -- Archive helpers -----------------------------------------------------------

/**
 * Find the most recent PMTiles archive file in data/tiles/archive/.
 * Archives are named opencanopy-YYYYMMDD.pmtiles.
 */
function findMostRecentArchive(): string | null {
  if (!existsSync(ARCHIVE_DIR)) return null;

  const archives = readdirSync(ARCHIVE_DIR)
    .filter((f) => f.startsWith("opencanopy-") && f.endsWith(".pmtiles"))
    .sort() // lexicographic sort works because YYYYMMDD is sortable
    .reverse();

  if (archives.length === 0) return null;
  return path.resolve(ARCHIVE_DIR, archives[0]);
}

// -- PMTiles helper ------------------------------------------------------------

async function readTile(
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

// -- Feature count comparison --------------------------------------------------

interface LayerCounts {
  [layerName: string]: number;
}

/**
 * Count features per layer at the 9 BC sample points at a given zoom.
 * Returns total feature count per layer across all sample tiles.
 */
async function countFeaturesPerLayer(
  pmtiles: PMTiles,
  zoom: number
): Promise<LayerCounts> {
  const counts: LayerCounts = {};

  for (const layerName of EXPECTED_SOURCE_LAYERS) {
    counts[layerName] = 0;
  }

  for (const point of BC_SAMPLE_POINTS) {
    const tile = latLonToTile(point.lat, point.lon, zoom);
    const tileData = await readTile(pmtiles, tile.z, tile.x, tile.y);
    if (!tileData) continue;

    const vectorTile = parseTile(tileData);
    for (const layerName of EXPECTED_SOURCE_LAYERS) {
      const features = getLayerFeatures(vectorTile, layerName);
      counts[layerName] += features.length;
    }
  }

  return counts;
}

// -- Feature persistence check ------------------------------------------------

/**
 * Sample up to N feature IDs from a layer and check if they exist in a newer PMTiles.
 * Uses the feature's properties as a fingerprint (combines all property values).
 *
 * Note: MVT features don't have stable IDs after tiling; we use a property hash
 * as a proxy for identity. This is approximate but sufficient for bulk disappearance detection.
 */
function featureFingerprint(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  feature: any
): string {
  const props = feature.properties ?? {};
  // Combine all property values into a deterministic string
  return Object.keys(props)
    .sort()
    .map((k) => `${k}=${props[k]}`)
    .join("|");
}

async function checkFeaturePersistence(
  previousPmtiles: PMTiles,
  currentPmtiles: PMTiles,
  sourceLayer: string,
  zoom: number,
  sampleSize: number
): Promise<AuditResult[]> {
  const results: AuditResult[] = [];

  // Collect fingerprints from previous archive
  const previousFingerprints = new Set<string>();

  for (const point of BC_SAMPLE_POINTS) {
    const tile = latLonToTile(point.lat, point.lon, zoom);
    const tileData = await readTile(previousPmtiles, tile.z, tile.x, tile.y);
    if (!tileData) continue;

    const vectorTile = parseTile(tileData);
    const features = getLayerFeatures(vectorTile, sourceLayer);

    for (const f of features) {
      if (previousFingerprints.size >= sampleSize) break;
      const fp = featureFingerprint(f);
      if (fp) previousFingerprints.add(fp);
    }
    if (previousFingerprints.size >= sampleSize) break;
  }

  if (previousFingerprints.size === 0) {
    results.push({
      check: `Temporal — ${sourceLayer} feature persistence`,
      status: "WARN",
      message: `No features sampled from previous archive for ${sourceLayer} at z${zoom}`,
    });
    return results;
  }

  // Collect fingerprints from current archive
  const currentFingerprints = new Set<string>();

  for (const point of BC_SAMPLE_POINTS) {
    const tile = latLonToTile(point.lat, point.lon, zoom);
    const tileData = await readTile(currentPmtiles, tile.z, tile.x, tile.y);
    if (!tileData) continue;

    const vectorTile = parseTile(tileData);
    const features = getLayerFeatures(vectorTile, sourceLayer);
    for (const f of features) {
      currentFingerprints.add(featureFingerprint(f));
    }
  }

  // Check how many previous fingerprints exist in current
  let disappeared = 0;
  for (const fp of previousFingerprints) {
    if (!currentFingerprints.has(fp)) disappeared++;
  }

  const disappearancePct = (disappeared / previousFingerprints.size) * 100;

  if (disappearancePct > WARN_DISAPPEARANCE_PCT) {
    results.push({
      check: `Temporal — ${sourceLayer} feature persistence`,
      status: "WARN",
      message: `${disappearancePct.toFixed(1)}% of sampled features disappeared (${disappeared}/${previousFingerprints.size})`,
      details: { disappeared, sampled: previousFingerprints.size, disappearancePct },
    });
  } else {
    results.push({
      check: `Temporal — ${sourceLayer} feature persistence`,
      status: "PASS",
      message: `${disappearancePct.toFixed(1)}% disappearance (${disappeared}/${previousFingerprints.size} sampled)`,
    });
  }

  return results;
}

// -- Main ----------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outputArg = args.find((a) => a.startsWith("--output"));
  const outputPath = outputArg
    ? args[args.indexOf(outputArg) + 1] ?? outputArg.split("=")[1]
    : DEFAULT_OUTPUT;

  console.log("=== OpenCanopy Temporal Consistency Audit ===\n");

  mkdirSync(REPORTS_DIR, { recursive: true });

  const results: AuditResult[] = [];

  // Check current PMTiles exists
  if (!existsSync(PMTILES_PATH)) {
    results.push({
      check: "Temporal audit — current PMTiles",
      status: "FAIL",
      message: `Current PMTiles not found: ${PMTILES_PATH}. Run build-tiles first.`,
    });
    printResults(results);
    saveResults(results, outputPath);
    return;
  }

  // Find most recent archive
  const archivePath = findMostRecentArchive();

  if (!archivePath) {
    results.push({
      check: "Temporal audit — archive availability",
      status: "WARN",
      message: `No archives found in ${ARCHIVE_DIR}. Temporal comparison requires at least one previous build. Skipping temporal checks.`,
    });
    printResults(results);
    saveResults(results, outputPath);
    return;
  }

  console.log(`Current: ${PMTILES_PATH}`);
  console.log(`Archive: ${archivePath}\n`);

  const currentSource = new NodeFileSource(PMTILES_PATH);
  const archiveSource = new NodeFileSource(archivePath);
  const currentPmtiles = new PMTiles(currentSource);
  const archivePmtiles = new PMTiles(archiveSource);

  // C1: Feature count delta per layer
  console.log(`Counting features per layer at z${COMPARE_ZOOM}...`);
  const currentCounts = await countFeaturesPerLayer(currentPmtiles, COMPARE_ZOOM);
  const previousCounts = await countFeaturesPerLayer(archivePmtiles, COMPARE_ZOOM);

  for (const layerName of EXPECTED_SOURCE_LAYERS) {
    const current = currentCounts[layerName] ?? 0;
    const previous = previousCounts[layerName] ?? 0;

    if (previous === 0 && current === 0) {
      results.push({
        check: `Temporal — ${layerName} feature count`,
        status: "WARN",
        message: `No features in either current or previous archive at z${COMPARE_ZOOM}`,
      });
      continue;
    }

    if (previous === 0) {
      results.push({
        check: `Temporal — ${layerName} feature count`,
        status: "WARN",
        message: `Layer had 0 features in archive, now has ${current}. New layer?`,
        details: { previous, current },
      });
      continue;
    }

    const deltaPct = Math.abs(((current - previous) / previous) * 100);
    const deltaSign = current >= previous ? "+" : "-";

    if (deltaPct > FAIL_DELTA_PCT) {
      results.push({
        check: `Temporal — ${layerName} feature count`,
        status: "FAIL",
        message: `Feature count changed by ${deltaSign}${deltaPct.toFixed(1)}% (${previous} → ${current})`,
        details: { previous, current, deltaPct: `${deltaSign}${deltaPct.toFixed(1)}%` },
      });
    } else if (deltaPct > WARN_DELTA_PCT) {
      results.push({
        check: `Temporal — ${layerName} feature count`,
        status: "WARN",
        message: `Feature count changed by ${deltaSign}${deltaPct.toFixed(1)}% (${previous} → ${current})`,
        details: { previous, current, deltaPct: `${deltaSign}${deltaPct.toFixed(1)}%` },
      });
    } else {
      results.push({
        check: `Temporal — ${layerName} feature count`,
        status: "PASS",
        message: `Feature count stable: ${deltaSign}${deltaPct.toFixed(1)}% (${previous} → ${current})`,
      });
    }
  }

  // C2: Feature persistence for tenure-cutblocks
  console.log("\nChecking tenure-cutblocks feature persistence...");
  const persistenceResults = await checkFeaturePersistence(
    archivePmtiles,
    currentPmtiles,
    "tenure-cutblocks",
    COMPARE_ZOOM,
    PERSISTENCE_SAMPLE_SIZE
  );
  results.push(...persistenceResults);

  await currentSource.close();
  await archiveSource.close();

  printResults(results);
  saveResults(results, outputPath);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
