/**
 * OpenCanopy Pipeline — Phase 2: Transform
 *
 * Reads raw NDJSON from data/downloads/, applies per-layer property extractors
 * and VRI classification, outputs clean NDJSON to data/geojson/.
 *
 * VRI (forest-age):
 *   data/downloads/vri-raw.ndjson → classify() + extract → data/geojson/forest-age.ndjson
 *
 * 11 other layers:
 *   data/downloads/{layer}-raw.ndjson → extract{Layer}() → data/geojson/{layer}.ndjson
 *
 * All file I/O is streaming (createReadStream + readline) to handle the
 * 10GB+ VRI raw NDJSON without loading it into memory.
 *
 * Atomic writes: output written to {path}.tmp then renamed on completion.
 *
 * Usage:
 *   npx tsx scripts/pipeline/transform.ts
 *   npx tsx scripts/pipeline/transform.ts --layer forest-age
 */

import { createReadStream, createWriteStream, mkdirSync, renameSync, existsSync } from "fs";
import { createInterface } from "readline";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { classify, LAYER_CONFIG, type ForestClass } from "../lib/extractors.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "../..");

const DOWNLOADS_DIR = resolve(PROJECT_ROOT, "data", "downloads");
const GEOJSON_DIR = resolve(PROJECT_ROOT, "data", "geojson");

// ── VRI → forest-age ──────────────────────────────────────────────────────────

async function transformVri(): Promise<void> {
  const inputPath = resolve(DOWNLOADS_DIR, "vri-raw.ndjson");
  const outputPath = resolve(GEOJSON_DIR, "forest-age.ndjson");
  const tmpPath = outputPath + ".tmp";

  if (!existsSync(inputPath)) {
    console.error(`  ERROR: VRI raw file not found: ${inputPath}`);
    console.error(`  Run Phase 1 first: bash scripts/pipeline/download.sh`);
    process.exit(1);
  }

  console.log(`  Input:  ${inputPath}`);
  console.log(`  Output: ${outputPath}`);
  console.log(`  Note: VRI is 10GB+, this will take several minutes...`);
  console.log();

  const writeStream = createWriteStream(tmpPath, { encoding: "utf-8" });

  const rl = createInterface({
    input: createReadStream(inputPath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let total = 0;
  let written = 0;
  let dropped = 0;
  const classCounts: Record<ForestClass, number> = {
    "old-growth": 0,
    "mature": 0,
    "young": 0,
    "harvested": 0,
  };

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    total++;

    let feature: {
      type?: string;
      geometry?: unknown;
      properties?: Record<string, unknown> | null;
    };

    try {
      feature = JSON.parse(trimmed);
    } catch {
      dropped++;
      continue;
    }

    const props = feature.properties ?? {};
    const forestClass = classify(props as Record<string, unknown>);

    if (forestClass === null) {
      dropped++;
      continue;
    }

    classCounts[forestClass]++;

    const outFeature = {
      type: "Feature",
      geometry: feature.geometry,
      properties: {
        class: forestClass,
        age: props.PROJ_AGE_1 ?? null,
        species: props.SPECIES_CD_1 ?? null,
      },
    };

    writeStream.write(JSON.stringify(outFeature) + "\n");
    written++;

    // Progress every 500k features
    if (total % 500_000 === 0) {
      console.log(`  Progress: ${(total / 1_000_000).toFixed(1)}M read, ${written.toLocaleString()} written, ${dropped.toLocaleString()} dropped`);
    }
  }

  await new Promise<void>((resolve, reject) => {
    writeStream.end((err?: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  renameSync(tmpPath, outputPath);

  console.log();
  console.log(`  forest-age transform complete:`);
  console.log(`    Total read:    ${total.toLocaleString()}`);
  console.log(`    Written:       ${written.toLocaleString()}`);
  console.log(`    Dropped:       ${dropped.toLocaleString()} (no classify result)`);
  console.log(`    Classes:`);
  for (const [cls, count] of Object.entries(classCounts)) {
    const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
    console.log(`      ${cls.padEnd(12)}: ${count.toLocaleString()} (${pct}%)`);
  }
}

// ── WFS layers ────────────────────────────────────────────────────────────────

async function transformLayer(layerName: string, extract: (props: Record<string, unknown>) => Record<string, unknown> | null): Promise<void> {
  const inputPath = resolve(DOWNLOADS_DIR, `${layerName}-raw.ndjson`);
  const outputPath = resolve(GEOJSON_DIR, `${layerName}.ndjson`);
  const tmpPath = outputPath + ".tmp";

  if (!existsSync(inputPath)) {
    console.error(`  ERROR: Raw file not found: ${inputPath}`);
    console.error(`  Run Phase 1 first: bash scripts/pipeline/download.sh`);
    return;
  }

  const writeStream = createWriteStream(tmpPath, { encoding: "utf-8" });

  const rl = createInterface({
    input: createReadStream(inputPath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  let total = 0;
  let written = 0;
  let dropped = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    total++;

    let feature: {
      type?: string;
      geometry?: unknown;
      properties?: Record<string, unknown> | null;
    };

    try {
      feature = JSON.parse(trimmed);
    } catch {
      dropped++;
      continue;
    }

    const extracted = extract(feature.properties ?? {});

    if (extracted === null) {
      dropped++;
      continue;
    }

    const outFeature = {
      type: "Feature",
      geometry: feature.geometry,
      properties: extracted,
    };

    writeStream.write(JSON.stringify(outFeature) + "\n");
    written++;
  }

  await new Promise<void>((resolve, reject) => {
    writeStream.end((err?: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  renameSync(tmpPath, outputPath);

  console.log(`  ${layerName}: ${total.toLocaleString()} in → ${written.toLocaleString()} out (${dropped.toLocaleString()} dropped)`);
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

  // Ensure output directory exists
  mkdirSync(GEOJSON_DIR, { recursive: true });

  console.log("=== OpenCanopy Pipeline: Phase 2 — Transform ===");
  console.log();

  const startTime = Date.now();

  if (!targetLayer || targetLayer === "forest-age") {
    console.log("Processing: forest-age (VRI)");
    await transformVri();
    console.log();
  }

  for (const layerConfig of LAYER_CONFIG) {
    if (targetLayer && targetLayer !== layerConfig.name) continue;

    console.log(`Processing: ${layerConfig.name}`);
    await transformLayer(layerConfig.name, layerConfig.extract);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log();
  console.log(`=== Transform complete (${elapsed}s) ===`);
}

main().catch((err) => {
  console.error("Transform pipeline error:", err);
  process.exit(1);
});
