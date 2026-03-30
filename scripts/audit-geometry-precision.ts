/**
 * OpenCanopy Geometry Precision Audit
 *
 * Measures how faithfully the MVT tiling pipeline preserves polygon geometry
 * from the source NDJSON files. Four groups of results:
 *
 *   G1: Per-layer Hausdorff distance at z10 (mean, median, max, 95th pct)
 *   G2: Per-layer Hausdorff distance at z7  (same stats)
 *   G3: Area preservation — WARN if tile area differs >10% from source
 *   G4: Vertex reduction ratio per layer
 *
 * Coverage: 20 features × 12 layers × 2 zooms = 480 measurements
 *
 * Usage:
 *   npx tsx scripts/audit-geometry-precision.ts
 *
 * Output:
 *   data/reports/geometry-precision-results.json
 */

import path from "path";
import { mkdirSync, writeFileSync } from "fs";
import { PMTiles } from "pmtiles";
import { NodeFileSource } from "./lib/node-file-source";
import { sampleFeatures } from "./lib/ndjson-sampler";
import { traceFeature } from "./lib/feature-tracer";
import { parseTile, getLayerFeatures } from "./lib/mvt-reader";
import { measurePrecision, type PrecisionResult } from "./lib/geometry-precision";
import { EXPECTED_SOURCE_LAYERS } from "./lib/bc-sample-grid";
import type { GeoJSON } from "geojson";

// ── Configuration ─────────────────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PMTILES_PATH = path.join(PROJECT_ROOT, "data", "tiles", "opencanopy.pmtiles");
const NDJSON_DIR = path.join(PROJECT_ROOT, "data", "geojson");
const OUTPUT_PATH = path.join(PROJECT_ROOT, "data", "reports", "geometry-precision-results.json");

/** Samples per layer per zoom level */
const SAMPLES_PER_LAYER = 20;

/** Zoom levels to measure */
const MEASURE_ZOOMS = [7, 10] as const;

/**
 * Polygon layers to measure.
 * Excludes forestry-roads (line layer, not polygon).
 */
const POLYGON_LAYERS = EXPECTED_SOURCE_LAYERS.filter(
  (l) => l !== "forestry-roads"
) as string[];

/** Area divergence threshold for G3 WARN (10%) */
const AREA_WARN_THRESHOLD_PCT = 10;

// ── ANSI colours ──────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

function tag(status: "PASS" | "WARN" | "FAIL"): string {
  const col = status === "PASS" ? C.green : status === "WARN" ? C.yellow : C.red;
  return `${col}[${status}]${C.reset}`;
}

// ── Statistics helpers ────────────────────────────────────────────────────────

function computeStats(values: number[]): {
  mean: number;
  median: number;
  max: number;
  p95: number;
  count: number;
} {
  if (values.length === 0) {
    return { mean: 0, median: 0, max: 0, p95: 0, count: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  const max = sorted[sorted.length - 1];
  const p95Idx = Math.min(
    sorted.length - 1,
    Math.floor(sorted.length * 0.95)
  );
  const p95 = sorted[p95Idx];
  return { mean, median, max, p95, count: values.length };
}

// ── Property fingerprint matching (mirrors feature-tracer logic) ──────────────

/**
 * Compute a property fingerprint match score in [0, 1] between source
 * properties and a candidate tile feature.
 */
function fingerprintScore(
  sourceProps: Record<string, unknown>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tileFeature: any
): number {
  const tileProps: Record<string, unknown> = tileFeature.properties ?? {};
  const keys = Object.keys(sourceProps);
  if (keys.length === 0) return 0;
  let matches = 0;
  for (const key of keys) {
    if (sourceProps[key] === tileProps[key]) matches++;
  }
  return matches / keys.length;
}

const MATCH_THRESHOLD = 0.5;

/**
 * Find the best-matching tile feature for the given source properties.
 * Returns null if nothing meets the threshold.
 */
function findMatch(
  features: unknown[],
  sourceProps: Record<string, unknown>
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): any | null {
  let best: unknown = null;
  let bestScore = 0;
  for (const f of features) {
    const score = fingerprintScore(sourceProps, f);
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return bestScore >= MATCH_THRESHOLD ? best : null;
}

// ── PMTiles fetch helper ──────────────────────────────────────────────────────

async function fetchTile(
  pmtiles: PMTiles,
  z: number,
  x: number,
  y: number
): Promise<ArrayBuffer | null> {
  try {
    const result = await pmtiles.getZxy(z, x, y);
    return result?.data ?? null;
  } catch {
    return null;
  }
}

// ── Per-layer measurement ─────────────────────────────────────────────────────

interface LayerZoomMeasurement {
  layer: string;
  zoom: number;
  measurements: PrecisionResult[];
  skipped: number;
}

/**
 * Measure precision for a single layer at a single zoom level.
 * Returns all PrecisionResult objects collected (may be fewer than SAMPLES_PER_LAYER
 * if some features cannot be traced or matched).
 */
async function measureLayer(
  pmtiles: PMTiles,
  features: GeoJSON.Feature[],
  layer: string,
  zoom: number
): Promise<LayerZoomMeasurement> {
  const measurements: PrecisionResult[] = [];
  let skipped = 0;

  for (const feature of features) {
    const sourceProps = (feature.properties ?? {}) as Record<string, unknown>;

    // Trace to find tile coord and verify existence at this zoom
    const trace = await traceFeature(pmtiles, feature, layer, zoom);
    if (!trace.found) {
      skipped++;
      continue;
    }

    const { z, x, y } = trace.tileCoord;

    // Re-fetch tile to get raw MVT features with full geometry
    const tileData = await fetchTile(pmtiles, z, x, y);
    if (!tileData) {
      skipped++;
      continue;
    }

    const tile = parseTile(tileData);
    const tileFeatures = getLayerFeatures(tile, layer);

    // Re-match by property fingerprint to get the raw MVT feature object
    // (traceFeature only returns comparison data, not the raw feature)
    const matchedRaw = findMatch(tileFeatures, sourceProps);
    if (!matchedRaw) {
      skipped++;
      continue;
    }

    // Measure precision
    const result = measurePrecision(feature, matchedRaw, layer, zoom, x, y);
    measurements.push(result);
  }

  return { layer, zoom, measurements, skipped };
}

// ── G1/G2: Hausdorff stats per layer per zoom ─────────────────────────────────

interface HausdorffLayerStats {
  layer: string;
  zoom: number;
  measuredCount: number;
  skippedCount: number;
  hausdorff: {
    mean: number;
    median: number;
    max: number;
    p95: number;
    count: number;
  };
}

function buildHausdorffStats(measurement: LayerZoomMeasurement): HausdorffLayerStats {
  const values = measurement.measurements.map((m) => m.hausdorffDistanceMeters);
  return {
    layer: measurement.layer,
    zoom: measurement.zoom,
    measuredCount: measurement.measurements.length,
    skippedCount: measurement.skipped,
    hausdorff: computeStats(values),
  };
}

// ── G3: Area preservation per layer ──────────────────────────────────────────

interface AreaPreservationResult {
  layer: string;
  zoom: number;
  status: "PASS" | "WARN";
  maxAreaDivergencePct: number;
  warnCount: number;
  totalMeasured: number;
  message: string;
}

function checkAreaPreservation(measurement: LayerZoomMeasurement): AreaPreservationResult {
  const { layer, zoom, measurements } = measurement;
  let warnCount = 0;
  let maxDivergence = 0;

  for (const m of measurements) {
    if (m.areaRatioPercent === 0) continue; // source area was 0 or unmeasurable — skip
    const divergence = Math.abs(m.areaRatioPercent - 100);
    if (divergence > maxDivergence) maxDivergence = divergence;
    if (divergence > AREA_WARN_THRESHOLD_PCT) warnCount++;
  }

  const status: "PASS" | "WARN" = warnCount > 0 ? "WARN" : "PASS";
  const message =
    warnCount === 0
      ? `All ${measurements.length} features within ±${AREA_WARN_THRESHOLD_PCT}% area tolerance`
      : `${warnCount}/${measurements.length} features exceed ±${AREA_WARN_THRESHOLD_PCT}% area tolerance (max divergence: ${maxDivergence.toFixed(1)}%)`;

  return {
    layer,
    zoom,
    status,
    maxAreaDivergencePct: maxDivergence,
    warnCount,
    totalMeasured: measurements.length,
    message,
  };
}

// ── G4: Vertex reduction ratio per layer ──────────────────────────────────────

interface VertexReductionResult {
  layer: string;
  zoom: number;
  avgSourceVertices: number;
  avgTileVertices: number;
  reductionRatio: number; // tile / source — <1.0 means vertices were reduced
  totalMeasured: number;
}

function computeVertexReduction(measurement: LayerZoomMeasurement): VertexReductionResult {
  const { layer, zoom, measurements } = measurement;
  if (measurements.length === 0) {
    return { layer, zoom, avgSourceVertices: 0, avgTileVertices: 0, reductionRatio: 0, totalMeasured: 0 };
  }

  const avgSource =
    measurements.reduce((s, m) => s + m.sourceVertexCount, 0) / measurements.length;
  const avgTile =
    measurements.reduce((s, m) => s + m.tileVertexCount, 0) / measurements.length;
  const reductionRatio = avgSource > 0 ? avgTile / avgSource : 0;

  return {
    layer,
    zoom,
    avgSourceVertices: avgSource,
    avgTileVertices: avgTile,
    reductionRatio,
    totalMeasured: measurements.length,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(C.bold + "\nOpenCanopy Geometry Precision Audit" + C.reset);
  console.log(C.dim + "─".repeat(60) + C.reset);
  console.log(`Layers: ${POLYGON_LAYERS.length}  Samples/layer: ${SAMPLES_PER_LAYER}  Zooms: ${MEASURE_ZOOMS.join(", ")}`);
  console.log(`Expected measurements: ${POLYGON_LAYERS.length * SAMPLES_PER_LAYER * MEASURE_ZOOMS.length}\n`);

  // Open a single PMTiles source for the entire run
  const source = new NodeFileSource(PMTILES_PATH);
  const pmtiles = new PMTiles(source);

  // ── Sample features for all layers upfront ────────────────────────────────
  // Keyed by layer name; features are reused across both zoom levels
  console.log("Sampling source NDJSON features...");
  const layerFeatures: Map<string, GeoJSON.Feature[]> = new Map();

  for (const layer of POLYGON_LAYERS) {
    const ndjsonPath = path.join(NDJSON_DIR, `${layer}.ndjson`);
    process.stdout.write(`  ${layer.padEnd(30)} `);
    try {
      const features = await sampleFeatures(ndjsonPath, SAMPLES_PER_LAYER);
      layerFeatures.set(layer, features);
      console.log(`${features.length} features`);
    } catch (err) {
      console.log(`SKIP (${(err as Error).message})`);
      layerFeatures.set(layer, []);
    }
  }

  // ── Measure at each zoom level ────────────────────────────────────────────
  // allMeasurements: layer → zoom → LayerZoomMeasurement
  const allMeasurements: Map<string, Map<number, LayerZoomMeasurement>> = new Map();

  for (const layer of POLYGON_LAYERS) {
    allMeasurements.set(layer, new Map());
  }

  for (const zoom of MEASURE_ZOOMS) {
    console.log(`\nMeasuring at z${zoom}...`);
    for (const layer of POLYGON_LAYERS) {
      const features = layerFeatures.get(layer) ?? [];
      process.stdout.write(`  ${layer.padEnd(30)} `);

      if (features.length === 0) {
        console.log("SKIP (no features)");
        allMeasurements.get(layer)!.set(zoom, {
          layer,
          zoom,
          measurements: [],
          skipped: 0,
        });
        continue;
      }

      const result = await measureLayer(pmtiles, features, layer, zoom);
      allMeasurements.get(layer)!.set(zoom, result);

      const hausdorffs = result.measurements.map((m) => m.hausdorffDistanceMeters);
      const stats = computeStats(hausdorffs);
      console.log(
        `${result.measurements.length} measured, ${result.skipped} skipped` +
          (stats.count > 0
            ? ` | H mean=${stats.mean.toFixed(1)}m max=${stats.max.toFixed(1)}m`
            : "")
      );
    }
  }

  await source.close();

  // ── Build G1/G2 results ───────────────────────────────────────────────────
  console.log("\n" + C.bold + "G1: Hausdorff distance at z10" + C.reset);
  const g1: HausdorffLayerStats[] = [];
  for (const layer of POLYGON_LAYERS) {
    const m = allMeasurements.get(layer)!.get(10)!;
    const stats = buildHausdorffStats(m);
    g1.push(stats);
    console.log(
      `  ${layer.padEnd(30)} mean=${stats.hausdorff.mean.toFixed(1)}m ` +
        `median=${stats.hausdorff.median.toFixed(1)}m ` +
        `max=${stats.hausdorff.max.toFixed(1)}m ` +
        `p95=${stats.hausdorff.p95.toFixed(1)}m ` +
        `(n=${stats.measuredCount})`
    );
  }

  console.log("\n" + C.bold + "G2: Hausdorff distance at z7" + C.reset);
  const g2: HausdorffLayerStats[] = [];
  for (const layer of POLYGON_LAYERS) {
    const m = allMeasurements.get(layer)!.get(7)!;
    const stats = buildHausdorffStats(m);
    g2.push(stats);
    console.log(
      `  ${layer.padEnd(30)} mean=${stats.hausdorff.mean.toFixed(1)}m ` +
        `median=${stats.hausdorff.median.toFixed(1)}m ` +
        `max=${stats.hausdorff.max.toFixed(1)}m ` +
        `p95=${stats.hausdorff.p95.toFixed(1)}m ` +
        `(n=${stats.measuredCount})`
    );
  }

  // ── Build G3 results ──────────────────────────────────────────────────────
  console.log("\n" + C.bold + "G3: Area preservation" + C.reset);
  const g3: AreaPreservationResult[] = [];
  for (const zoom of MEASURE_ZOOMS) {
    for (const layer of POLYGON_LAYERS) {
      const m = allMeasurements.get(layer)!.get(zoom)!;
      const result = checkAreaPreservation(m);
      g3.push(result);
      console.log(
        `  ${tag(result.status)} z${zoom} ${layer.padEnd(28)} ${result.message}`
      );
    }
  }

  // ── Build G4 results ──────────────────────────────────────────────────────
  console.log("\n" + C.bold + "G4: Vertex reduction ratio" + C.reset);
  const g4: VertexReductionResult[] = [];
  for (const zoom of MEASURE_ZOOMS) {
    for (const layer of POLYGON_LAYERS) {
      const m = allMeasurements.get(layer)!.get(zoom)!;
      const result = computeVertexReduction(m);
      g4.push(result);
      console.log(
        `  z${zoom} ${layer.padEnd(30)} ` +
          `src=${result.avgSourceVertices.toFixed(1)} ` +
          `tile=${result.avgTileVertices.toFixed(1)} ` +
          `ratio=${result.reductionRatio.toFixed(3)} ` +
          `(n=${result.totalMeasured})`
      );
    }
  }

  // ── Assemble output ───────────────────────────────────────────────────────
  const g3Warns = g3.filter((r) => r.status === "WARN");
  console.log("\n" + C.dim + "─".repeat(60) + C.reset);
  if (g3Warns.length > 0) {
    console.log(
      `${tag("WARN")} G3: ${g3Warns.length} layer-zoom combination(s) exceed ±${AREA_WARN_THRESHOLD_PCT}% area tolerance:`
    );
    for (const w of g3Warns) {
      console.log(`  z${w.zoom} ${w.layer}: ${w.message}`);
    }
  } else {
    console.log(tag("PASS") + " G3: All layers within area tolerance.");
  }

  const output = {
    timestamp: new Date().toISOString(),
    config: {
      samplesPerLayer: SAMPLES_PER_LAYER,
      zooms: [...MEASURE_ZOOMS],
      layers: POLYGON_LAYERS,
      areaWarnThresholdPct: AREA_WARN_THRESHOLD_PCT,
    },
    g1_hausdorff_z10: g1,
    g2_hausdorff_z7: g2,
    g3_area_preservation: g3,
    g4_vertex_reduction: g4,
    summary: {
      g3_warns: g3Warns.length,
      g3_warn_layers: g3Warns.map((w) => `z${w.zoom}/${w.layer}`),
    },
  };

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\nResults saved to: ${OUTPUT_PATH}\n`);
}

main().catch((err: unknown) => {
  console.error(C.red + "Fatal error:" + C.reset, err);
  process.exit(1);
});
