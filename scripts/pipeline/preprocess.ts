/**
 * OpenCanopy Pipeline — Phase 3: Preprocess
 *
 * Simplified from scripts/preprocess-tiles.ts. Key changes:
 *   - NO dedup stage (bulk downloads have no cell-boundary duplicates)
 *   - Validation via scripts/lib/validate-features.ts (unchanged)
 *   - Water subtraction via scripts/water-subtract-gdal.py, forest-age ONLY
 *   - Atomic writes ({path}.tmp → rename on completion)
 *   - Per-stage counters written to _report.json and _manifest.json
 *
 * Usage:
 *   NODE_OPTIONS='--max-old-space-size=8192' npx tsx scripts/pipeline/preprocess.ts
 *   npx tsx scripts/pipeline/preprocess.ts --layer forest-age
 *   npx tsx scripts/pipeline/preprocess.ts --validate-only
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  existsSync,
  mkdirSync,
  unlinkSync,
  writeFileSync,
  renameSync,
  readdirSync,
  copyFileSync,
} from "fs";
import { execSync } from "child_process";

import { validateNdjson, type ValidationResult } from "../lib/validate-features.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "../..");

const GEOJSON_DIR = resolve(PROJECT_ROOT, "data", "geojson");
const PREPROCESSED_DIR = resolve(PROJECT_ROOT, "data", "geojson", "preprocessed");
const LAKES_GPKG = resolve(PROJECT_ROOT, "data", "geojson", "reference", "fwa-lakes.gpkg");
const LAKES_NDJSON = resolve(PROJECT_ROOT, "data", "geojson", "reference", "fwa-lakes.ndjson");
const WATER_SUBTRACT_SCRIPT = resolve(PROJECT_ROOT, "scripts", "water-subtract-gdal.py");

// ── Layer discovery ───────────────────────────────────────────────────────────

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
  validation?: ValidationResult;
  waterSubtract?: {
    total: number;
    intersected: number;
    modified: number;
    dropped: number;
    failed: number;
  };
  finalFeatures?: number;
  skippedWater?: boolean;
  error?: string;
}

async function processLayer(
  layerName: string,
  opts: { validateOnly: boolean }
): Promise<LayerReport> {
  const report: LayerReport = { layer: layerName };

  const inputPath = resolve(GEOJSON_DIR, `${layerName}.ndjson`);
  const outputPath = resolve(PREPROCESSED_DIR, `${layerName}.ndjson`);
  const outputTmp = outputPath + ".tmp";

  if (!existsSync(inputPath)) {
    report.error = `Source file not found: ${inputPath}`;
    return report;
  }

  // Temp file for validation output (water subtract reads from it)
  const tempValidate = resolve(PREPROCESSED_DIR, `_tmp_validate_${layerName}.ndjson`);

  try {
    // ── Step 1: Validation ──
    process.stdout.write(`  [${layerName}] Validate: checking...`);
    const validateResult = await validateNdjson(inputPath, tempValidate, layerName);
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

    // ── Step 2: Water subtraction (forest-age only) ──
    const isForestAge = layerName === "forest-age";
    const shouldWaterSubtract = isForestAge && !opts.validateOnly;

    if (shouldWaterSubtract) {
      if (!existsSync(LAKES_NDJSON) && !existsSync(LAKES_GPKG)) {
        console.log(
          `  [${layerName}] Water subtract: SKIPPED (no lakes data found)`
        );
        console.log(`    Run: npm run audit:download-reference`);
        copyFileSync(tempValidate, outputTmp);
        renameSync(outputTmp, outputPath);
        report.skippedWater = true;
        report.finalFeatures = validateResult.passed;
      } else {
        // Build lakes GPKG from NDJSON if needed (one-time, ~30s)
        if (!existsSync(LAKES_GPKG) && existsSync(LAKES_NDJSON)) {
          console.log(`  [${layerName}] Building lakes GPKG (one-time)...`);
          execSync(
            `ogr2ogr -f GPKG "${LAKES_GPKG}" "${LAKES_NDJSON}" -where "AREA_HA >= 5" -nln lakes -lco SPATIAL_INDEX=YES`,
            { stdio: "inherit", timeout: 300_000 }
          );
          console.log(`  [${layerName}] Lakes GPKG built.`);
        }

        console.log(`  [${layerName}] Water subtract (GDAL/GEOS)...`);
        execSync(
          `python3 "${WATER_SUBTRACT_SCRIPT}" "${tempValidate}" "${outputTmp}" --lakes "${LAKES_GPKG}" --min-area 5`,
          { stdio: "inherit", timeout: 86_400_000 } // 24h timeout
        );

        renameSync(outputTmp, outputPath);

        // Read stats from the GDAL script sidecar output
        const statsPath = outputPath + ".stats.json";
        if (existsSync(statsPath)) {
          const { readFileSync } = await import("fs");
          const stats = JSON.parse(readFileSync(statsPath, "utf-8")) as {
            total: number;
            intersected: number;
            modified: number;
            dropped: number;
            failed: number;
          };
          report.waterSubtract = stats;
          report.finalFeatures = stats.total - stats.dropped;
          unlinkSync(statsPath);
        } else {
          report.finalFeatures = validateResult.passed;
        }
      }
    } else {
      // Non-forest-age layers: validate only, copy to output
      copyFileSync(tempValidate, outputTmp);
      renameSync(outputTmp, outputPath);
      report.skippedWater = true;
      report.finalFeatures = validateResult.passed;

      if (!isForestAge) {
        console.log(`  [${layerName}] Water subtract: skipped (not forest-age)`);
      } else {
        console.log(`  [${layerName}] Water subtract: skipped (--validate-only)`);
      }
    }

  } catch (err) {
    report.error = (err as Error).message;
    console.error(`  [${layerName}] ERROR: ${report.error}`);
  } finally {
    // Clean up temp files
    if (existsSync(tempValidate)) {
      try { unlinkSync(tempValidate); } catch { /* ignore */ }
    }
  }

  return report;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  const layerArg = args.indexOf("--layer");
  let targetLayer: string | null = null;
  if (layerArg >= 0) {
    const val = args[layerArg + 1];
    if (!val || val.startsWith("--")) {
      console.error("Error: --layer requires a layer name argument");
      process.exit(1);
    }
    targetLayer = val;
  }
  const validateOnly = args.includes("--validate-only");

  console.log("=== OpenCanopy Pipeline: Phase 3 — Preprocess ===");
  console.log();
  if (validateOnly) console.log("Mode: validate-only (skipping water subtraction)");
  if (targetLayer) console.log(`Layer: ${targetLayer} only`);
  console.log("Note: dedup stage removed — bulk downloads have no cell-boundary duplicates");
  console.log();

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

  const reports: LayerReport[] = [];
  const completedLayers: string[] = [];
  const startTime = Date.now();

  for (const layer of layers) {
    console.log(`Processing: ${layer}`);
    const report = await processLayer(layer, { validateOnly });
    reports.push(report);
    if (!report.error) {
      completedLayers.push(layer);
    }
    console.log();
  }

  // ── Write report ──
  const reportPath = resolve(PREPROCESSED_DIR, "_report.json");
  const reportData = {
    timestamp: new Date().toISOString(),
    options: { validateOnly, targetLayer },
    elapsedMs: Date.now() - startTime,
    layers: reports,
  };
  writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
  console.log(`Report written to: ${reportPath}`);

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
      const input = report.validation?.total?.toLocaleString() ?? "?";
      const final = report.finalFeatures?.toLocaleString() ?? "?";
      console.log(`  [OK]   ${report.layer}: ${input} validated → ${final} final`);
    }
  }

  const failed = reports.filter((r) => !!r.error);
  if (failed.length > 0) {
    console.error(`\n${failed.length} layer(s) failed. Check errors above.`);
    process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nPreprocessing complete (${elapsed}s).`);
}

main().catch((err) => {
  console.error("Preprocess pipeline error:", err);
  process.exit(1);
});
