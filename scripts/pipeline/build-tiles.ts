/**
 * OpenCanopy Pipeline — Phase 4: Build Tiles
 *
 * Archives the current PMTiles, then runs a single tippecanoe invocation
 * over all 12 layers to produce opencanopy.pmtiles.
 *
 * Replaces the old two-tier build (overview + detail + tile-join merge).
 *
 * Usage:
 *   npx tsx scripts/pipeline/build-tiles.ts
 */

import {
  existsSync,
  mkdirSync,
  statSync,
  copyFileSync,
  unlinkSync,
  readdirSync,
} from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { validateTileFlags } from "../lib/validate-tile-flags";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "../..");

const TILES_DIR = resolve(PROJECT_ROOT, "data", "tiles");
const GEOJSON_DIR = resolve(PROJECT_ROOT, "data", "geojson");
const PREPROCESSED_DIR = resolve(GEOJSON_DIR, "preprocessed");

// ── Archive current PMTiles ───────────────────────────────────────────────────

/**
 * Archives data/tiles/opencanopy.pmtiles to data/tiles/archive/opencanopy-YYYYMMDD.pmtiles.
 * Retains only the 3 most recent archives. Skips if no existing file.
 */
function archiveCurrentTiles(): void {
  const archiveDir = resolve(TILES_DIR, "archive");
  const outputPath = resolve(TILES_DIR, "opencanopy.pmtiles");

  if (!existsSync(outputPath)) {
    console.log("  No existing PMTiles to archive — skipping.");
    return;
  }

  mkdirSync(archiveDir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  // Avoid silently overwriting a same-day archive: append -1, -2, ... as needed.
  let archiveName = `opencanopy-${today}.pmtiles`;
  let archivePath = resolve(archiveDir, archiveName);
  let suffix = 1;
  while (existsSync(archivePath)) {
    archiveName = `opencanopy-${today}-${suffix}.pmtiles`;
    archivePath = resolve(archiveDir, archiveName);
    suffix++;
  }

  console.log(`  Archiving current PMTiles → ${archivePath}`);
  copyFileSync(outputPath, archivePath);

  // Retain only 3 most recent archives
  const archives = readdirSync(archiveDir)
    .filter((f) => f.startsWith("opencanopy-") && f.endsWith(".pmtiles"))
    .sort()    // YYYYMMDD is lexicographically sortable
    .reverse();

  const toDelete = archives.slice(3);
  for (const name of toDelete) {
    const p = resolve(archiveDir, name);
    console.log(`  Removing old archive: ${name}`);
    try { unlinkSync(p); } catch { /* ignore */ }
  }
}

// ── Build input layer list ────────────────────────────────────────────────────

/**
 * For all layers: prefer data/geojson/preprocessed/{layer}.ndjson if it exists
 * (preprocess.ts validates and may water-subtract the data). Falls back to
 * data/geojson/{layer}.ndjson only if no preprocessed version is present.
 *
 * Exception: forest-age REQUIRES a preprocessed version (has water subtraction
 * applied). Missing preprocessed forest-age is a hard error — using raw data
 * would ship un-water-subtracted tiles.
 */
function buildLayerInputs(): { name: string; path: string }[] {
  // Producer-side list. The checker-side copy is EXPECTED_SOURCE_LAYERS in
  // scripts/lib/bc-sample-grid.ts; verify.ts (Check 8) fails if they drift.
  const layers = [
    "forest-age",
    "parks",
    "conservancies",
    "tenure-cutblocks",
    "fire-history",
    "ogma",
    "wildlife-habitat-areas",
    "ungulate-winter-range",
    "community-watersheds",
    "mining-claims",
    "forestry-roads",
    "conservation-priority",
  ];

  const inputs: { name: string; path: string }[] = [];

  for (const name of layers) {
    const preprocessedPath = resolve(PREPROCESSED_DIR, `${name}.ndjson`);
    const rawPath = resolve(GEOJSON_DIR, `${name}.ndjson`);

    let inputPath: string;
    if (existsSync(preprocessedPath)) {
      inputPath = preprocessedPath;
      console.log(`  ${name}: using preprocessed data`);
    } else if (name === "forest-age") {
      // forest-age requires water subtraction — raw data must not be used
      console.error(`  ERROR: preprocessed forest-age not found at ${preprocessedPath}`);
      console.error(`  Run Phase 3 first: npx tsx scripts/pipeline/preprocess.ts`);
      process.exit(1);
    } else {
      inputPath = rawPath;
      console.log(`  ${name}: preprocessed not found, using raw`);
    }

    if (!existsSync(inputPath)) {
      console.warn(`  WARNING: ${name} not found at ${inputPath} — skipping`);
      continue;
    }

    inputs.push({ name, path: inputPath });
  }

  return inputs;
}

// ── Tippecanoe build ──────────────────────────────────────────────────────────

function runTippecanoe(inputs: { name: string; path: string }[]): void {
  mkdirSync(TILES_DIR, { recursive: true });

  const outputPath = resolve(TILES_DIR, "opencanopy.pmtiles");

  if (inputs.length === 0) {
    console.error("  ERROR: No input layers found. Run phases 2 and 3 first.");
    process.exit(1);
  }

  // Build -L flag list: each layer gets its own named source
  const layerFlags = inputs
    .map(({ name, path }) => `-L ${name}:${path}`)
    .join(" \\\n  ");

  // -P removed: sequential input reading uses far less peak memory (prevents OOM on 32GB)
  // nice/ionice: lowest priority so system stays responsive during 4-5hr build
  // --drop-densest-as-needed: prefer dropping features over coalescing
  //   (coalesce silently reassigns classification attributes — issue #523)
  // --low-detail=11: 2048-unit grid at overview zooms (was 9/512-unit,
  //   which quantized small polygons to zero area at z4)
  // --minimum-detail=10: 1024-unit floor (was 7/128-unit)
  // --full-detail=12: 4096-unit grid at z12 (full polygon boundary fidelity)
  // --buffer=64: industry standard for polygon coverage (~15% tile size increase)
  // -M 5000000: 5MB tile cap (raised to reduce drop frequency with new strategy)
  // --attribute-type: pin types to prevent silent inference divergence across tiles
  const cmd = [
    "nice -n 19 ionice -c 3 tippecanoe",
    `-o ${outputPath}`,
    "-Z 4 -z 12",
    "--no-feature-limit",
    "--drop-densest-as-needed",
    "-M 5000000",
    "--low-detail=11",
    "--minimum-detail=10",
    "--full-detail=12",
    "--simplification=3",
    "--simplification-at-maximum-zoom=1",
    "--no-simplification-of-shared-nodes",
    "--no-tiny-polygon-reduction",
    "--buffer=64",
    "--attribute-type=FIRE_YEAR:string",
    "--attribute-type=class:string",
    "--attribute-type=age:int",
    "--attribute-type=species:string",
    "--attribute-type=DISTURBANCE_START_DATE:string",
    "--attribute-type=company_id:string",
    "--attribute-type=PLANNED_GROSS_BLOCK_AREA:float",
    "--force",
    layerFlags,
  ].join(" \\\n  ");

  const validation = validateTileFlags(cmd);
  if (!validation.valid) {
    console.error("  Tile flag validation FAILED:");
    for (const e of validation.errors) console.error(`    - ${e}`);
    process.exit(1);
  }
  if (validation.warnings.length > 0) {
    console.warn("  Tile flag warnings:");
    for (const w of validation.warnings) console.warn(`    - ${w}`);
    console.log();
  }

  console.log("  Running tippecanoe (single-pass, sequential read, throttled)...");
  console.log("  Expected: 4-5 hours (throttled), ~1.5-2.0GB output");
  console.log();
  console.log("  Command:");
  console.log("  " + cmd.replace(/\n  /g, "\n  "));
  console.log();

  execSync(cmd, {
    stdio: "inherit",
    timeout: 28_800_000, // 8 hours (throttled build)
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=== OpenCanopy Pipeline: Phase 4 — Build Tiles ===");
  console.log();

  const startTime = Date.now();

  // Step 1: Archive current PMTiles (before build, so previous is preserved if build fails)
  console.log("Archiving current PMTiles...");
  archiveCurrentTiles();
  console.log();

  // Step 2: Build input layer list
  console.log("Building layer input list...");
  const inputs = buildLayerInputs();
  console.log(`  ${inputs.length} layers ready`);
  console.log();

  // Step 3: Run tippecanoe
  runTippecanoe(inputs);

  // Step 4: Report output
  const outputPath = resolve(TILES_DIR, "opencanopy.pmtiles");
  if (existsSync(outputPath)) {
    const sizeBytes = statSync(outputPath).size;
    const sizeMb = (sizeBytes / 1024 / 1024).toFixed(0);
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log();
    console.log(`=== Build Complete ===`);
    console.log(`  Output: ${outputPath}`);
    console.log(`  Size:   ${sizeMb} MB`);
    console.log(`  Time:   ${elapsed} minutes`);
  } else {
    console.error("  ERROR: PMTiles output not found after build!");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Build tiles error:", err);
  process.exit(1);
});
