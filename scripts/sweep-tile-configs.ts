/**
 * Automated tippecanoe parameter sweep.
 *
 * Tests ~24 representative configurations covering the parameter space,
 * ranks them by quality score, marks Pareto-optimal configs, and saves results.
 *
 * Usage:
 *   npx tsx scripts/sweep-tile-configs.ts
 *   npx tsx scripts/sweep-tile-configs.ts --lat=51.0 --lon=-118.2
 *   npx tsx scripts/sweep-tile-configs.ts --lat=49.4 --lon=-118.8 --radius=0.5
 */

import path from "path";
import {
  existsSync,
  mkdirSync,
  statSync,
  readdirSync,
  writeFileSync,
  unlinkSync,
} from "fs";
import { PMTiles } from "pmtiles";
import { NodeFileSource } from "./lib/node-file-source";
import {
  extractTestRegion,
  buildTippecanoeCommands,
  runTippecanoeCommands,
  measureMetrics,
  configToParamString,
  type TileConfig,
} from "./test-tile-config";
import {
  computeQualityScore,
  findParetoOptimal,
  formatSweepTable,
  type ConfigMetrics,
  type ScoredConfig,
} from "./lib/quality-score";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = path.resolve(__dirname, "..");

const TEST_DIR = path.resolve(PROJECT_ROOT, "data/tiles/test");
const TEST_GEOJSON_DIR = path.resolve(TEST_DIR, "geojson");
const PRODUCTION_PMTILES = path.resolve(PROJECT_ROOT, "data/tiles/opencanopy.pmtiles");
const REPORTS_DIR = path.resolve(PROJECT_ROOT, "data/reports");

// ── CLI Argument Parsing ───────────────────────────────────────────────────────

function parseArgs(argv: string[]): { lat: number; lon: number; radius: number } {
  const args = argv.slice(2);

  function getFlag(name: string): string | null {
    const prefix = `--${name}=`;
    for (const arg of args) {
      if (arg.startsWith(prefix)) return arg.slice(prefix.length);
    }
    return null;
  }

  return {
    lat: parseFloat(getFlag("lat") ?? "49.4"),
    lon: parseFloat(getFlag("lon") ?? "-118.8"),
    radius: parseFloat(getFlag("radius") ?? "0.5"),
  };
}

// ── Config Definitions ─────────────────────────────────────────────────────────

/**
 * ~24 representative configurations using Latin hypercube-style sampling.
 *
 * Parameter ranges:
 *   simplification-overview: [4, 6, 8, 10]
 *   simplification-detail:   [2, 4, 6, 8]
 *   buffer:                  [0, 8, 16, 32] (null = not set, same as 0 effectively)
 *   detect-shared-borders:   [true, false]
 *
 * Includes: current baseline, extremes (all-low, all-high),
 * and a spread of representative combos to cover the parameter space.
 */
function buildConfigSet(): Array<{ name: string; config: TileConfig }> {
  return [
    // ── Baseline (current production) ──
    {
      name: "baseline",
      config: { simplificationOverview: 10, simplificationDetail: 8, buffer: null, detectSharedBorders: false, maxTileSize: 10_000_000 },
    },

    // ── All-low extreme ──
    {
      name: "all-low",
      config: { simplificationOverview: 4, simplificationDetail: 2, buffer: null, detectSharedBorders: false, maxTileSize: 10_000_000 },
    },

    // ── All-high extreme ──
    {
      name: "all-high",
      config: { simplificationOverview: 10, simplificationDetail: 8, buffer: 32, detectSharedBorders: true, maxTileSize: 10_000_000 },
    },

    // ── Low overview, low detail variations ──
    {
      name: "sO4-sD2-noextra",
      config: { simplificationOverview: 4, simplificationDetail: 2, buffer: null, detectSharedBorders: false, maxTileSize: 10_000_000 },
    },
    {
      name: "sO4-sD4-b8-shared",
      config: { simplificationOverview: 4, simplificationDetail: 4, buffer: 8, detectSharedBorders: true, maxTileSize: 10_000_000 },
    },
    {
      name: "sO4-sD6-b16",
      config: { simplificationOverview: 4, simplificationDetail: 6, buffer: 16, detectSharedBorders: false, maxTileSize: 10_000_000 },
    },
    {
      name: "sO4-sD8-b32-shared",
      config: { simplificationOverview: 4, simplificationDetail: 8, buffer: 32, detectSharedBorders: true, maxTileSize: 10_000_000 },
    },

    // ── Medium-low overview ──
    {
      name: "sO6-sD2-b16-shared",
      config: { simplificationOverview: 6, simplificationDetail: 2, buffer: 16, detectSharedBorders: true, maxTileSize: 10_000_000 },
    },
    {
      name: "sO6-sD4-noextra",
      config: { simplificationOverview: 6, simplificationDetail: 4, buffer: null, detectSharedBorders: false, maxTileSize: 10_000_000 },
    },
    {
      name: "sO6-sD4-b8",
      config: { simplificationOverview: 6, simplificationDetail: 4, buffer: 8, detectSharedBorders: false, maxTileSize: 10_000_000 },
    },
    {
      name: "sO6-sD4-shared",
      config: { simplificationOverview: 6, simplificationDetail: 4, buffer: null, detectSharedBorders: true, maxTileSize: 10_000_000 },
    },
    {
      name: "sO6-sD6-b32",
      config: { simplificationOverview: 6, simplificationDetail: 6, buffer: 32, detectSharedBorders: false, maxTileSize: 10_000_000 },
    },
    {
      name: "sO6-sD8-b16-shared",
      config: { simplificationOverview: 6, simplificationDetail: 8, buffer: 16, detectSharedBorders: true, maxTileSize: 10_000_000 },
    },

    // ── Medium-high overview ──
    {
      name: "sO8-sD2-b8",
      config: { simplificationOverview: 8, simplificationDetail: 2, buffer: 8, detectSharedBorders: false, maxTileSize: 10_000_000 },
    },
    {
      name: "sO8-sD4-b16-shared",
      config: { simplificationOverview: 8, simplificationDetail: 4, buffer: 16, detectSharedBorders: true, maxTileSize: 10_000_000 },
    },
    {
      name: "sO8-sD4-noextra",
      config: { simplificationOverview: 8, simplificationDetail: 4, buffer: null, detectSharedBorders: false, maxTileSize: 10_000_000 },
    },
    {
      name: "sO8-sD6-b32-shared",
      config: { simplificationOverview: 8, simplificationDetail: 6, buffer: 32, detectSharedBorders: true, maxTileSize: 10_000_000 },
    },
    {
      name: "sO8-sD6-noextra",
      config: { simplificationOverview: 8, simplificationDetail: 6, buffer: null, detectSharedBorders: false, maxTileSize: 10_000_000 },
    },
    {
      name: "sO8-sD8-b8",
      config: { simplificationOverview: 8, simplificationDetail: 8, buffer: 8, detectSharedBorders: false, maxTileSize: 10_000_000 },
    },

    // ── High overview variations ──
    {
      name: "sO10-sD2-b16",
      config: { simplificationOverview: 10, simplificationDetail: 2, buffer: 16, detectSharedBorders: false, maxTileSize: 10_000_000 },
    },
    {
      name: "sO10-sD4-b8-shared",
      config: { simplificationOverview: 10, simplificationDetail: 4, buffer: 8, detectSharedBorders: true, maxTileSize: 10_000_000 },
    },
    {
      name: "sO10-sD4-noextra",
      config: { simplificationOverview: 10, simplificationDetail: 4, buffer: null, detectSharedBorders: false, maxTileSize: 10_000_000 },
    },
    {
      name: "sO10-sD6-shared",
      config: { simplificationOverview: 10, simplificationDetail: 6, buffer: null, detectSharedBorders: true, maxTileSize: 10_000_000 },
    },
    {
      name: "sO10-sD8-b16",
      config: { simplificationOverview: 10, simplificationDetail: 8, buffer: 16, detectSharedBorders: false, maxTileSize: 10_000_000 },
    },
  ];
}

// ── Count NDJSON features in test region ───────────────────────────────────────

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
  const { lat, lon, radius } = parseArgs(process.argv);

  console.log("\nTippecanoe Parameter Sweep");
  console.log("─".repeat(60));
  console.log(`  Center: ${lat}, ${lon}  radius: ±${radius}°`);

  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(REPORTS_DIR, { recursive: true });

  // ── Step 1: Extract test region once ──
  console.log("\nStep 1: Extracting test region...");
  await extractTestRegion(lat, lon, radius);

  const ndjsonCount = await countTestRegionFeatures();
  console.log(`  Total source features in region: ${ndjsonCount.toLocaleString()}`);

  if (ndjsonCount === 0) {
    console.error("No NDJSON data found in test region. Cannot proceed.");
    process.exit(1);
  }

  // ── Step 2: Measure production baseline ──
  let productionMetrics: ConfigMetrics | null = null;
  if (existsSync(PRODUCTION_PMTILES)) {
    console.log("\nStep 2: Measuring production baseline...");
    productionMetrics = await measureMetrics(
      PRODUCTION_PMTILES,
      lat, lon, radius,
      ndjsonCount
    );
    console.log(`  Production score: ${computeQualityScore(productionMetrics)}`);
  } else {
    console.log("\nStep 2: Production PMTiles not found, skipping baseline.");
  }

  // ── Step 3: Run all configs ──
  const configs = buildConfigSet();
  // Deduplicate: "baseline" and "all-low" share the same config as "sO4-sD2-noextra"
  // Keep unique configs by stringifying their params (name-based dedup)
  const seen = new Set<string>();
  const uniqueConfigs = configs.filter((c) => {
    const key = JSON.stringify(c.config);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(`\nStep 3: Testing ${uniqueConfigs.length} configurations...`);
  console.log("─".repeat(60));

  const results: ScoredConfig[] = [];

  for (let i = 0; i < uniqueConfigs.length; i++) {
    const { name, config } = uniqueConfigs[i];
    const paramStr = configToParamString(config);

    console.log(`\n[${i + 1}/${uniqueConfigs.length}] ${name}  (${paramStr})`);

    const { overviewCmd, detailCmd, mergeCmd, overviewPath, detailPath, outputPath, inputs } =
      buildTippecanoeCommands(config, `sweep-${name}`);

    if (inputs.length === 0) {
      console.warn("  No NDJSON inputs — skipping.");
      continue;
    }

    const built = runTippecanoeCommands(
      overviewCmd,
      detailCmd,
      mergeCmd,
      overviewPath,
      detailPath
    );

    if (!built || !existsSync(outputPath)) {
      console.error(`  Build failed — skipping ${name}.`);
      continue;
    }

    const metrics = await measureMetrics(outputPath, lat, lon, radius, ndjsonCount);
    const score = computeQualityScore(metrics);

    console.log(
      `  Score: ${score}  artifact z7: ${metrics.artifactPercentZ7.toFixed(1)}%  ` +
      `z9: ${metrics.artifactPercentZ9.toFixed(1)}%  ` +
      `preserve: ${metrics.featurePreservationPercent.toFixed(1)}%  ` +
      `maxTile: ${metrics.maxTileSizeMB.toFixed(2)} MB`
    );

    results.push({ name, metrics, score, pareto: false });

    // Clean up test PMTiles to save disk space
    try { unlinkSync(outputPath); } catch { /* ignore */ }
  }

  if (results.length === 0) {
    console.error("No results collected. Sweep failed.");
    process.exit(1);
  }

  // ── Step 4: Find Pareto-optimal configs ──
  const paretoNames = new Set(
    findParetoOptimal(results.map((r) => ({ name: r.name, metrics: r.metrics })))
  );

  for (const r of results) {
    r.pareto = paretoNames.has(r.name);
  }

  // ── Step 5: Sort by score descending ──
  results.sort((a, b) => b.score - a.score);

  // ── Step 6: Output results table ──
  const table = formatSweepTable(results);
  console.log(table);

  // Print production comparison if we have it
  if (productionMetrics !== null) {
    console.log(`  Production (baseline) score: ${computeQualityScore(productionMetrics)}`);
    const bestResult = results[0];
    if (bestResult && bestResult.score > computeQualityScore(productionMetrics)) {
      console.log(
        `  Best config "${bestResult.name}" scores ${bestResult.score - computeQualityScore(productionMetrics)} points higher than production.`
      );
    }
    console.log();
  }

  // ── Step 7: Save results ──
  const reportPath = path.join(REPORTS_DIR, "sweep-results.json");
  const report = {
    timestamp: new Date().toISOString(),
    sweepParams: { lat, lon, radius },
    ndjsonFeaturesInRegion: ndjsonCount,
    production: productionMetrics
      ? {
          metrics: productionMetrics,
          score: computeQualityScore(productionMetrics),
        }
      : null,
    configs: results.map((r) => ({
      name: r.name,
      metrics: r.metrics,
      score: r.score,
      pareto: r.pareto,
    })),
    paretoOptimal: [...paretoNames],
    winner: results[0]?.name ?? null,
  };

  try {
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`Sweep results saved: ${reportPath}`);
  } catch (err) {
    console.warn(`Could not save report: ${(err as Error).message}`);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
