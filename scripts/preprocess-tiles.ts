/**
 * OpenCanopy Source Data Preprocessing Pipeline
 *
 * Runs deduplication, per-layer validation, and water body subtraction on
 * the raw NDJSON files in data/geojson/ and writes clean output to
 * data/geojson/preprocessed/.
 *
 * Usage:
 *   npx tsx scripts/preprocess-tiles.ts                     # All layers
 *   npx tsx scripts/preprocess-tiles.ts --layer tenure-cutblocks
 *   npx tsx scripts/preprocess-tiles.ts --validate-only     # Skip water subtraction
 *   npx tsx scripts/preprocess-tiles.ts --skip-dedup        # Skip deduplication
 *
 * Output:
 *   data/geojson/preprocessed/{layer}.ndjson   -- clean data
 *   data/geojson/preprocessed/_report.json     -- per-layer statistics
 *   data/geojson/preprocessed/_manifest.json   -- layer list + timestamp
 *
 * Memory:
 *   Run via `npm run preprocess` to set NODE_OPTIONS='--max-old-space-size=8192'.
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "fs";

import { dedupNdjson, type DedupResult } from "./lib/dedup-features";
import { validateNdjson, type ValidationResult } from "./lib/validate-features";
import { subtractWaterFromNdjson, type WaterSubtractResult } from "./lib/water-subtract";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");

const GEOJSON_DIR = resolve(PROJECT_ROOT, "data", "geojson");
const PREPROCESSED_DIR = resolve(PROJECT_ROOT, "data", "geojson", "preprocessed");
const LAKES_PATH = resolve(PROJECT_ROOT, "data", "reference", "fwa-lakes.ndjson");

// ── Layer discovery ───────────────────────────────────────────────────────────

/**
 * Find all NDJSON files in the GEOJSON_DIR (top-level only, not preprocessed/).
 * Returns layer names without the .ndjson extension.
 */
function discoverLayers(): string[] {
  if (!existsSync(GEOJSON_DIR)) return [];

  return readdirSync(GEOJSON_DIR)
    .filter((f) => f.endsWith(".ndjson") && !f.startsWith("_"))
    .map((f) => f.replace(/\.ndjson$/, ""))
    .sort();
}

// ── Per-layer pipeline ────────────────────────────────────────────────────────

interface LayerReport {
  layer: string;
  rawFeatures?: number;
  dedup?: DedupResult;
  validation?: ValidationResult;
  waterSubtract?: WaterSubtractResult;
  finalFeatures?: number;
  skippedDedup?: boolean;
  skippedWater?: boolean;
  error?: string;
}

async function processLayer(
  layerName: string,
  opts: {
    skipDedup: boolean;
    validateOnly: boolean;
  }
): Promise<LayerReport> {
  const report: LayerReport = { layer: layerName };

  const inputPath = resolve(GEOJSON_DIR, `${layerName}.ndjson`);
  const outputPath = resolve(PREPROCESSED_DIR, `${layerName}.ndjson`);

  if (!existsSync(inputPath)) {
    report.error = `Source file not found: ${inputPath}`;
    return report;
  }

  // Temp files for intermediate steps
  const tempDedup = resolve(PREPROCESSED_DIR, `_tmp_dedup_${layerName}.ndjson`);
  const tempValidate = resolve(PREPROCESSED_DIR, `_tmp_validate_${layerName}.ndjson`);

  try {
    // ── Step 1: Deduplication ──
    let afterDedupPath: string;

    if (opts.skipDedup) {
      console.log(`  [${layerName}] Dedup: skipped`);
      afterDedupPath = inputPath;
      report.skippedDedup = true;
    } else {
      process.stdout.write(`  [${layerName}] Dedup: scanning...`);
      const dedupResult = await dedupNdjson(inputPath, tempDedup);
      report.dedup = dedupResult;
      report.rawFeatures = dedupResult.total;
      const pct = (dedupResult.duplicateRate * 100).toFixed(1);
      console.log(
        ` ${dedupResult.total.toLocaleString()} features → ${dedupResult.unique.toLocaleString()} unique ` +
        `(${dedupResult.duplicates.toLocaleString()} duplicates, ${pct}%)`
      );
      afterDedupPath = tempDedup;
    }

    // ── Step 2: Validation ──
    process.stdout.write(`  [${layerName}] Validate: checking...`);
    const validateResult = await validateNdjson(afterDedupPath, tempValidate, layerName);
    report.validation = validateResult;
    const rejectPct = validateResult.total > 0
      ? ((validateResult.rejected / validateResult.total) * 100).toFixed(1)
      : "0.0";
    console.log(
      ` ${validateResult.total.toLocaleString()} → ${validateResult.passed.toLocaleString()} passed ` +
      `(${validateResult.rejected.toLocaleString()} rejected, ${rejectPct}%)`
    );
    if (validateResult.rejected > 0) {
      const topReasons = Object.entries(validateResult.reasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      for (const [reason, count] of topReasons) {
        console.log(`    - ${reason}: ${count.toLocaleString()}`);
      }
    }

    // ── Step 3: Water subtraction ──
    if (opts.validateOnly) {
      console.log(`  [${layerName}] Water subtract: skipped (--validate-only)`);
      // Copy validated output to final location
      const { copyFileSync } = await import("fs");
      copyFileSync(tempValidate, outputPath);
      report.skippedWater = true;
      report.finalFeatures = validateResult.passed;
    } else {
      if (!existsSync(LAKES_PATH)) {
        console.log(
          `  [${layerName}] Water subtract: SKIPPED (lakes file not found at ${LAKES_PATH})`
        );
        console.log(`    Run: npm run audit:download-reference`);
        const { copyFileSync } = await import("fs");
        copyFileSync(tempValidate, outputPath);
        report.skippedWater = true;
        report.finalFeatures = validateResult.passed;
      } else {
        process.stdout.write(`  [${layerName}] Water subtract: processing...`);
        const waterResult = await subtractWaterFromNdjson(tempValidate, outputPath, LAKES_PATH);
        report.waterSubtract = waterResult;
        const finalCount = waterResult.total - waterResult.dropped;
        report.finalFeatures = finalCount;
        console.log(
          ` ${waterResult.total.toLocaleString()} → ${finalCount.toLocaleString()} features ` +
          `(${waterResult.intersected.toLocaleString()} intersected, ${waterResult.dropped.toLocaleString()} dropped, ` +
          `${waterResult.failed.toLocaleString()} errors)`
        );
      }
    }

  } catch (err) {
    report.error = (err as Error).message;
    console.error(`  [${layerName}] ERROR: ${report.error}`);
  } finally {
    // Clean up temp files
    for (const tmp of [tempDedup, tempValidate]) {
      if (existsSync(tmp)) {
        try { unlinkSync(tmp); } catch { /* ignore */ }
      }
    }
  }

  return report;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const layerArg = args.indexOf("--layer");
  const targetLayer = layerArg >= 0 ? args[layerArg + 1] : null;
  const validateOnly = args.includes("--validate-only");
  const skipDedup = args.includes("--skip-dedup");

  console.log("=== OpenCanopy Preprocessing Pipeline ===\n");
  if (validateOnly) console.log("Mode: validate-only (skipping water subtraction)");
  if (skipDedup) console.log("Mode: skip-dedup (using raw input for validation)");
  if (targetLayer) console.log(`Layer: ${targetLayer} only`);
  console.log();

  // Ensure output directory exists
  mkdirSync(PREPROCESSED_DIR, { recursive: true });

  // Discover layers to process
  let layers: string[];
  if (targetLayer) {
    const inputPath = resolve(GEOJSON_DIR, `${targetLayer}.ndjson`);
    if (!existsSync(inputPath)) {
      console.error(`Layer not found: ${targetLayer}.ndjson in ${GEOJSON_DIR}`);
      process.exit(1);
    }
    layers = [targetLayer];
  } else {
    layers = discoverLayers();
    if (layers.length === 0) {
      console.error(`No NDJSON files found in ${GEOJSON_DIR}`);
      process.exit(1);
    }
    console.log(`Found ${layers.length} layers: ${layers.join(", ")}\n`);
  }

  // Process each layer sequentially (water subtract loads all lakes into memory)
  const reports: LayerReport[] = [];
  const completedLayers: string[] = [];

  for (const layer of layers) {
    console.log(`Processing: ${layer}`);
    const report = await processLayer(layer, { skipDedup, validateOnly });
    reports.push(report);

    if (!report.error) {
      completedLayers.push(layer);
    }
  }

  // ── Write report ──
  const reportPath = resolve(PREPROCESSED_DIR, "_report.json");
  const reportData = {
    timestamp: new Date().toISOString(),
    options: { validateOnly, skipDedup, targetLayer },
    layers: reports,
  };
  writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  console.log(`\nReport written to: ${reportPath}`);

  // ── Write manifest ──
  const manifestPath = resolve(PREPROCESSED_DIR, "_manifest.json");
  const manifestData = {
    layers: completedLayers,
    timestamp: new Date().toISOString(),
    validateOnly,
  };
  writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2));
  console.log(`Manifest written to: ${manifestPath}`);

  // ── Summary ──
  console.log("\n=== Summary ===");
  for (const report of reports) {
    if (report.error) {
      console.log(`  [FAIL] ${report.layer}: ${report.error}`);
    } else {
      const raw = report.rawFeatures?.toLocaleString() ?? "?";
      const final = report.finalFeatures?.toLocaleString() ?? "?";
      console.log(`  [OK]   ${report.layer}: ${raw} raw → ${final} final`);
    }
  }

  const failed = reports.filter((r) => !!r.error);
  if (failed.length > 0) {
    console.error(`\n${failed.length} layer(s) failed. Check errors above.`);
    process.exit(1);
  }

  console.log("\nPreprocessing complete.");
}

main().catch((err) => {
  console.error("Preprocessing pipeline error:", err);
  process.exit(1);
});
