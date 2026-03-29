/**
 * OpenCanopy Spatial Audit — Part B
 *
 * Validates that land-use features (e.g. tenure-cutblocks) do not overlap
 * significantly with water bodies, using BC FWA lakes as reference data.
 *
 * Prerequisites:
 *   - PMTiles archive: data/tiles/opencanopy.pmtiles
 *   - Lakes reference: data/geojson/reference/fwa-lakes.ndjson
 *     (download with: npm run audit:download-reference)
 *
 * Usage:
 *   npx tsx scripts/audit-spatial.ts
 *   npx tsx scripts/audit-spatial.ts --output data/reports/spatial-results.json
 */

import path from "path";
import { existsSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { AuditResult, printResults, saveResults } from "./lib/audit-types";
import { checkWaterBodyOverlap } from "./lib/spatial-checks";
import { BC_SAMPLE_POINTS } from "./lib/bc-sample-grid";

// -- Configuration -------------------------------------------------------------

const PROJECT_ROOT = path.resolve(__dirname, "..");
const PMTILES_PATH = path.resolve(PROJECT_ROOT, "data", "tiles", "opencanopy.pmtiles");
const LAKES_PATH = path.resolve(PROJECT_ROOT, "data", "geojson", "reference", "fwa-lakes.ndjson");
const REPORTS_DIR = path.resolve(PROJECT_ROOT, "data", "reports");
const DEFAULT_OUTPUT = path.resolve(REPORTS_DIR, "spatial-results.json");

// Layer and zoom to check for water-body overlap
const CHECK_LAYER = "tenure-cutblocks";
const CHECK_ZOOM = 10;

// -- Main ----------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outputArg = args.find((a) => a.startsWith("--output"));
  const outputPath = outputArg
    ? args[args.indexOf(outputArg) + 1] ?? outputArg.split("=")[1]
    : DEFAULT_OUTPUT;

  console.log("=== OpenCanopy Spatial Audit ===\n");

  mkdirSync(REPORTS_DIR, { recursive: true });

  const results: AuditResult[] = [];

  // Check if PMTiles exists
  if (!existsSync(PMTILES_PATH)) {
    results.push({
      check: "Spatial audit — PMTiles availability",
      status: "FAIL",
      message: `PMTiles file not found: ${PMTILES_PATH}. Run build-tiles first.`,
    });
    printResults(results);
    saveResults(results, outputPath);
    return;
  }

  results.push({
    check: "Spatial audit — PMTiles availability",
    status: "PASS",
    message: `PMTiles archive found: ${PMTILES_PATH}`,
  });

  // Check if lakes reference data exists; offer to download
  if (!existsSync(LAKES_PATH)) {
    console.log("  FWA lakes reference data not found. Attempting download...\n");
    try {
      execSync(`npx tsx ${path.resolve(__dirname, "download-reference-data.ts")}`, {
        stdio: "inherit",
        timeout: 3_600_000, // 1 hour
      });
    } catch (err) {
      results.push({
        check: "Spatial audit — lakes reference data",
        status: "WARN",
        message: `Could not auto-download lakes data: ${(err as Error).message}. Run audit:download-reference manually.`,
      });
      printResults(results);
      saveResults(results, outputPath);
      return;
    }
  }

  if (!existsSync(LAKES_PATH)) {
    results.push({
      check: "Spatial audit — lakes reference data",
      status: "WARN",
      message: `Lakes reference file still not found after download attempt: ${LAKES_PATH}`,
    });
    printResults(results);
    saveResults(results, outputPath);
    return;
  }

  results.push({
    check: "Spatial audit — lakes reference data",
    status: "PASS",
    message: `FWA lakes reference data found: ${LAKES_PATH}`,
  });

  // Water body overlap check for tenure-cutblocks at z10
  console.log(`\nChecking ${CHECK_LAYER} water body overlap at z${CHECK_ZOOM}...`);
  const overlapResults = await checkWaterBodyOverlap(
    PMTILES_PATH,
    LAKES_PATH,
    BC_SAMPLE_POINTS,
    CHECK_LAYER,
    CHECK_ZOOM
  );
  results.push(...overlapResults);

  printResults(results);
  saveResults(results, outputPath);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
