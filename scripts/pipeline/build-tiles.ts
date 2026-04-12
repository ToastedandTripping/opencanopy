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
 * For forest-age: use preprocessed version (has water subtraction applied).
 * For all other layers: use data/geojson/{layer}.ndjson directly.
 */
function buildLayerInputs(): { name: string; path: string }[] {
  const layers = [
    { name: "forest-age",            preprocessed: true },
    { name: "parks",                  preprocessed: false },
    { name: "conservancies",          preprocessed: false },
    { name: "tenure-cutblocks",       preprocessed: false },
    { name: "fire-history",           preprocessed: false },
    { name: "ogma",                   preprocessed: false },
    { name: "wildlife-habitat-areas", preprocessed: false },
    { name: "ungulate-winter-range",  preprocessed: false },
    { name: "community-watersheds",   preprocessed: false },
    { name: "mining-claims",          preprocessed: false },
    { name: "forestry-roads",         preprocessed: false },
    { name: "conservation-priority",  preprocessed: false },
  ];

  const inputs: { name: string; path: string }[] = [];

  for (const layer of layers) {
    let p: string;
    if (layer.preprocessed) {
      p = resolve(PREPROCESSED_DIR, `${layer.name}.ndjson`);
      if (!existsSync(p)) {
        // Fall back to raw if preprocessed doesn't exist yet
        console.warn(`  WARNING: preprocessed ${layer.name} not found, falling back to raw`);
        p = resolve(GEOJSON_DIR, `${layer.name}.ndjson`);
      } else {
        console.log(`  ${layer.name}: using preprocessed data`);
      }
    } else {
      p = resolve(GEOJSON_DIR, `${layer.name}.ndjson`);
    }

    if (!existsSync(p)) {
      console.warn(`  WARNING: ${layer.name} not found at ${p} — skipping`);
      continue;
    }

    inputs.push({ name: layer.name, path: p });
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

  // Exact tippecanoe command from the plan. Flags documented in plan:
  //   --low-detail=9: 512-unit grid at z4-z7 (prevents OOM on overview tiles)
  //   --minimum-detail=7: 5-level fallback chain before coalescing
  //   --full-detail=12: 4096-unit grid at z12 (full polygon boundary fidelity)
  //   --simplification=3: moderate Douglas-Peucker below maxzoom
  //   --simplification-at-maximum-zoom=1: minimal simplification at z12
  //   --no-simplification-of-shared-nodes: preserves polygon boundary convergence at z8+
  //   --no-tiny-polygon-reduction: coalesce into neighbors, not probabilistic placeholders
  //   -M 2500000: 2.5MB tile cap (proven safe for densest BC tiles)
  //   --extend-zooms-if-still-dropping: safety valve for extremely dense areas
  //   --coalesce-smallest-as-needed: merge small polygons into neighbors
  //   --attribute-type=FIRE_YEAR:string: ensure FIRE_YEAR is always a string attribute
  const cmd = [
    "tippecanoe",
    `-o ${outputPath}`,
    "-P",
    "-Z 4 -z 12",
    "--no-feature-limit",
    "--coalesce-smallest-as-needed",
    "-M 2500000",
    "--extend-zooms-if-still-dropping",
    "--low-detail=9",
    "--minimum-detail=7",
    "--full-detail=12",
    "--simplification=3",
    "--simplification-at-maximum-zoom=1",
    "--no-simplification-of-shared-nodes",
    "--no-tiny-polygon-reduction",
    "--buffer=10",
    "--attribute-type=FIRE_YEAR:string",
    "--force",
    layerFlags,
  ].join(" \\\n  ");

  console.log("  Running tippecanoe (single-pass, all layers)...");
  console.log("  Expected: 2-3 hours, ~1.5-2.0GB output");
  console.log();
  console.log("  Command:");
  console.log("  " + cmd.replace(/\n  /g, "\n  "));
  console.log();

  execSync(cmd, {
    stdio: "inherit",
    timeout: 14_400_000, // 4 hours
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
