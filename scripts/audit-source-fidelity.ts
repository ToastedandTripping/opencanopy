/**
 * OpenCanopy Source Fidelity Audit
 *
 * Verifies that features from the source NDJSON files survive the tiling
 * pipeline with their properties intact. Four checks:
 *
 *   F1: Feature existence       — 50 features/layer traced at z10
 *   F2: Property value preservation — per-property match rates for found features
 *   F3: Per-layer breakdown      — found-rate and property match rates by layer
 *   F4: Grid boundary stress     — 20 features/layer near WFS grid seams
 *
 * Usage:
 *   npx tsx scripts/audit-source-fidelity.ts
 *
 * Output:
 *   data/reports/source-fidelity-results.json
 */

import path from "path";
import { writeFileSync, mkdirSync } from "fs";
import { PMTiles } from "pmtiles";
import { NodeFileSource } from "./lib/node-file-source";
import { sampleFeatures } from "./lib/ndjson-sampler";
import { filterByBbox, type Bbox } from "./lib/ndjson-filter";
import { traceFeature } from "./lib/feature-tracer";
import {
  PATHS,
  ZOOMS,
  SAMPLING,
  THRESHOLDS,
  C,
  EXPECTED_SOURCE_LAYERS,
} from "./lib/audit-config";
import type { GeoJSON } from "geojson";

// ── Configuration ─────────────────────────────────────────────────────────────

const PMTILES_PATH = PATHS.pmtiles;
const NDJSON_DIR = PATHS.geojson;
const OUTPUT_PATH = path.join(PATHS.reports, "source-fidelity-results.json");

/** Zoom level used for all trace operations */
const TRACE_ZOOM = ZOOMS.feature;

/** Samples per layer for F1/F2/F3 */
const F1_SAMPLES_PER_LAYER = SAMPLING.fidelityPerLayer;

/** Samples per layer for F4 boundary stress */
const F4_SAMPLES_PER_LAYER = SAMPLING.boundaryPerLayer;

/**
 * F1 thresholds:
 *   >98% → PASS
 *   95–98% → WARN
 *   <95% → FAIL
 */
const F1_PASS_THRESHOLD = THRESHOLDS.fidelity.pass;
const F1_WARN_THRESHOLD = THRESHOLDS.fidelity.warn;

/**
 * WFS grid seam strip width in degrees.
 * Features within 0.05° of a grid seam boundary are "boundary-adjacent".
 */
const BOUNDARY_STRIP = THRESHOLDS.boundaryStrip;

/**
 * WFS grid cell size for BC: 8×8 grid.
 * Approximate cell width/height based on BC extent:
 *   lat 48.0–60.0 → 12° / 8 = 1.5° per row
 *   lon -140.0–-113.0 → 27° / 8 = 3.375° per column
 */
const WFS_GRID_LAT_STEP = 1.5;
const WFS_GRID_LON_STEP = 3.375;
const WFS_GRID_LAT_ORIGIN = 48.0;
const WFS_GRID_LON_ORIGIN = -140.0;
const WFS_GRID_ROWS = 8;
const WFS_GRID_COLS = 8;

function statusTag(status: "PASS" | "WARN" | "FAIL"): string {
  const col = status === "PASS" ? C.green : status === "WARN" ? C.yellow : C.red;
  return `${col}[${status}]${C.reset}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface F1Result {
  status: "PASS" | "WARN" | "FAIL";
  sampled: number;
  found: number;
  foundRate: number;
  message: string;
}

interface F2PropertyRate {
  key: string;
  matchCount: number;
  total: number;
  matchRate: number;
}

interface F2Result {
  propertyRates: F2PropertyRate[];
  message: string;
}

interface F3LayerResult {
  layer: string;
  sampled: number;
  found: number;
  foundRate: number;
  propertyRates: F2PropertyRate[];
}

interface F3Result {
  layers: F3LayerResult[];
}

interface F4LayerResult {
  layer: string;
  boundarySampled: number;
  boundaryFound: number;
  boundaryFoundRate: number;
  interiorFoundRate: number;
  degraded: boolean;
}

interface F4Result {
  layers: F4LayerResult[];
  degradedLayers: string[];
}

interface FidelityData {
  f1: F1Result;
  f2: F2Result;
  f3: F3Result;
  f4: F4Result;
}

// ── WFS boundary bbox computation ─────────────────────────────────────────────

/**
 * Generate bounding boxes covering the 0.05° strips along every WFS grid seam
 * within BC. The union of these strips defines the "boundary-adjacent" region.
 *
 * Returns a single merged bbox that tightly wraps all seam strips — we use
 * filterByBbox with individual seam bboxes so features on any seam are captured.
 */
function getSeamBboxes(): Bbox[] {
  const bboxes: Bbox[] = [];

  // Horizontal seams (latitude boundaries between rows)
  for (let r = 1; r < WFS_GRID_ROWS; r++) {
    const seamLat = WFS_GRID_LAT_ORIGIN + r * WFS_GRID_LAT_STEP;
    bboxes.push([
      WFS_GRID_LON_ORIGIN,
      seamLat - BOUNDARY_STRIP,
      WFS_GRID_LON_ORIGIN + WFS_GRID_COLS * WFS_GRID_LON_STEP,
      seamLat + BOUNDARY_STRIP,
    ]);
  }

  // Vertical seams (longitude boundaries between columns)
  for (let c = 1; c < WFS_GRID_COLS; c++) {
    const seamLon = WFS_GRID_LON_ORIGIN + c * WFS_GRID_LON_STEP;
    bboxes.push([
      seamLon - BOUNDARY_STRIP,
      WFS_GRID_LAT_ORIGIN,
      seamLon + BOUNDARY_STRIP,
      WFS_GRID_LAT_ORIGIN + WFS_GRID_ROWS * WFS_GRID_LAT_STEP,
    ]);
  }

  return bboxes;
}

/**
 * Collect up to `limit` features from any of the boundary seam strips for
 * a given NDJSON file. Streams each seam bbox until we have enough.
 */
async function sampleBoundaryFeatures(
  ndjsonPath: string,
  limit: number
): Promise<GeoJSON.Feature[]> {
  const bboxes = getSeamBboxes();
  const features: GeoJSON.Feature[] = [];
  const seen = new Set<string>();

  for (const bbox of bboxes) {
    if (features.length >= limit) break;
    for await (const line of filterByBbox(ndjsonPath, bbox)) {
      if (features.length >= limit) break;
      // Deduplicate by raw line content to avoid seam overlap duplicates
      if (seen.has(line)) continue;
      seen.add(line);
      try {
        features.push(JSON.parse(line) as GeoJSON.Feature);
      } catch {
        // skip malformed
      }
    }
  }

  return features;
}

// ── Property aggregation ──────────────────────────────────────────────────────

/**
 * Aggregate per-property match rates from an array of propertyComparison maps.
 * Only considers entries where both source and tile values are present (found features).
 */
function aggregatePropertyRates(
  comparisons: Array<Record<string, { source: unknown; tile: unknown; match: boolean }>>
): F2PropertyRate[] {
  const counts: Record<string, { match: number; total: number }> = {};

  for (const comp of comparisons) {
    for (const [key, { match }] of Object.entries(comp)) {
      if (!counts[key]) counts[key] = { match: 0, total: 0 };
      counts[key].total++;
      if (match) counts[key].match++;
    }
  }

  return Object.entries(counts)
    .map(([key, { match, total }]) => ({
      key,
      matchCount: match,
      total,
      matchRate: total > 0 ? match / total : 0,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

// ── Main audit ────────────────────────────────────────────────────────────────

async function runFidelityAudit(): Promise<void> {
  console.log(C.bold + "\nOpenCanopy Source Fidelity Audit" + C.reset);
  console.log(C.dim + "─".repeat(60) + C.reset);

  // Open a single PMTiles source + instance for the entire audit run
  const source = new NodeFileSource(PMTILES_PATH);
  const pmtiles = new PMTiles(source);

  const header = await pmtiles.getHeader();
  console.log(
    `  PMTiles: zoom z${header.minZoom}-z${header.maxZoom}, tracing at z${TRACE_ZOOM}\n`
  );

  // ── Per-layer trace data collection (used by F1/F2/F3) ────────────────────

  interface LayerTraceData {
    layer: string;
    sampled: number;
    found: number;
    comparisons: Array<Record<string, { source: unknown; tile: unknown; match: boolean }>>;
  }

  const layerData: LayerTraceData[] = [];

  console.log(`Collecting F1/F2/F3 traces (50 features × ${EXPECTED_SOURCE_LAYERS.length} layers)...`);
  for (const layer of EXPECTED_SOURCE_LAYERS) {
    const ndjsonPath = path.join(NDJSON_DIR, `${layer}.ndjson`);
    process.stdout.write(`  ${layer}... `);

    let features: GeoJSON.Feature[] = [];
    try {
      features = await sampleFeatures(ndjsonPath, F1_SAMPLES_PER_LAYER);
    } catch (err) {
      console.log(`SKIP (${(err as Error).message})`);
      layerData.push({ layer, sampled: 0, found: 0, comparisons: [] });
      continue;
    }

    let found = 0;
    const comparisons: Array<Record<string, { source: unknown; tile: unknown; match: boolean }>> = [];

    for (const feature of features) {
      const result = await traceFeature(pmtiles, feature, layer, TRACE_ZOOM);
      if (result.found) {
        found++;
        comparisons.push(result.propertyComparison);
      }
    }

    console.log(`${found}/${features.length} found`);
    layerData.push({ layer, sampled: features.length, found, comparisons });
  }

  // ── F1: Feature existence ─────────────────────────────────────────────────

  console.log("\nF1: Feature existence...");
  const totalSampled = layerData.reduce((s, d) => s + d.sampled, 0);
  const totalFound = layerData.reduce((s, d) => s + d.found, 0);
  const f1FoundRate = totalSampled > 0 ? totalFound / totalSampled : 0;

  let f1Status: "PASS" | "WARN" | "FAIL";
  if (f1FoundRate >= F1_PASS_THRESHOLD) {
    f1Status = "PASS";
  } else if (f1FoundRate >= F1_WARN_THRESHOLD) {
    f1Status = "WARN";
  } else {
    f1Status = "FAIL";
  }

  const f1Message =
    `${totalFound}/${totalSampled} features found across ${EXPECTED_SOURCE_LAYERS.length} layers ` +
    `(${(f1FoundRate * 100).toFixed(1)}%). ` +
    (f1Status === "PASS"
      ? "Meets >98% threshold."
      : f1Status === "WARN"
      ? "Below 98% — investigate missing features."
      : "Below 95% — significant feature loss detected.");

  console.log(`  ${statusTag(f1Status)} ${f1Message}`);

  const f1Result: F1Result = {
    status: f1Status,
    sampled: totalSampled,
    found: totalFound,
    foundRate: f1FoundRate,
    message: f1Message,
  };

  // ── F2: Property value preservation ──────────────────────────────────────

  console.log("\nF2: Property value preservation...");
  const allComparisons = layerData.flatMap((d) => d.comparisons);
  const f2PropertyRates = aggregatePropertyRates(allComparisons);

  const lowMatchProps = f2PropertyRates.filter((p) => p.matchRate < 0.9);
  const f2Message =
    f2PropertyRates.length === 0
      ? "No found features to compare."
      : lowMatchProps.length === 0
      ? `All ${f2PropertyRates.length} property keys match at ≥90% rate.`
      : `${lowMatchProps.length} property key(s) below 90% match rate: ` +
        lowMatchProps.map((p) => `${p.key} (${(p.matchRate * 100).toFixed(1)}%)`).join(", ");

  console.log(`  ${C.dim}${f2Message}${C.reset}`);

  const f2Result: F2Result = {
    propertyRates: f2PropertyRates,
    message: f2Message,
  };

  // ── F3: Per-layer breakdown ────────────────────────────────────────────────

  console.log("\nF3: Per-layer breakdown...");
  const f3Layers: F3LayerResult[] = layerData.map((d) => {
    const foundRate = d.sampled > 0 ? d.found / d.sampled : 0;
    const propertyRates = aggregatePropertyRates(d.comparisons);
    console.log(
      `  ${d.layer.padEnd(30)} found ${d.found}/${d.sampled} ` +
        `(${(foundRate * 100).toFixed(1)}%)` +
        (propertyRates.length > 0
          ? `, ${propertyRates.length} props tracked`
          : "")
    );
    return {
      layer: d.layer,
      sampled: d.sampled,
      found: d.found,
      foundRate,
      propertyRates,
    };
  });

  const f3Result: F3Result = { layers: f3Layers };

  // ── F4: Grid boundary stress test ─────────────────────────────────────────

  console.log(`\nF4: Grid boundary stress test (20 features × ${EXPECTED_SOURCE_LAYERS.length} layers near seams)...`);
  const f4Layers: F4LayerResult[] = [];

  for (const d of layerData) {
    const { layer } = d;
    const ndjsonPath = path.join(NDJSON_DIR, `${layer}.ndjson`);
    const interiorFoundRate = d.sampled > 0 ? d.found / d.sampled : 0;

    process.stdout.write(`  ${layer}... `);

    let boundaryFeatures: GeoJSON.Feature[] = [];
    try {
      boundaryFeatures = await sampleBoundaryFeatures(ndjsonPath, F4_SAMPLES_PER_LAYER);
    } catch {
      console.log("SKIP");
      f4Layers.push({
        layer,
        boundarySampled: 0,
        boundaryFound: 0,
        boundaryFoundRate: 0,
        interiorFoundRate,
        degraded: false,
      });
      continue;
    }

    let boundaryFound = 0;
    for (const feature of boundaryFeatures) {
      const result = await traceFeature(pmtiles, feature, layer, TRACE_ZOOM);
      if (result.found) boundaryFound++;
    }

    const boundaryFoundRate =
      boundaryFeatures.length > 0 ? boundaryFound / boundaryFeatures.length : 0;

    // Degraded: boundary rate is meaningfully lower than interior (>5% gap)
    const degraded =
      boundaryFeatures.length > 0 &&
      interiorFoundRate - boundaryFoundRate > 0.05;

    console.log(
      `${boundaryFound}/${boundaryFeatures.length} found` +
        (degraded ? ` ${C.yellow}[DEGRADED vs interior ${(interiorFoundRate * 100).toFixed(1)}%]${C.reset}` : "")
    );

    f4Layers.push({
      layer,
      boundarySampled: boundaryFeatures.length,
      boundaryFound,
      boundaryFoundRate,
      interiorFoundRate,
      degraded,
    });
  }

  const degradedLayers = f4Layers.filter((l) => l.degraded).map((l) => l.layer);
  if (degradedLayers.length > 0) {
    console.log(
      `\n  ${statusTag("WARN")} ${degradedLayers.length} layer(s) show boundary degradation: ${degradedLayers.join(", ")}`
    );
  } else {
    console.log(
      `\n  ${statusTag("PASS")} No layers show boundary degradation.`
    );
  }

  const f4Result: F4Result = { layers: f4Layers, degradedLayers };

  // ── Close PMTiles source ──────────────────────────────────────────────────

  await source.close();

  // ── Assemble and write output ─────────────────────────────────────────────

  const fidelityData: FidelityData = { f1: f1Result, f2: f2Result, f3: f3Result, f4: f4Result };

  const allResults = [
    {
      check: "F1: Feature Existence",
      status: f1Result.status,
      message: f1Result.message,
      details: { sampled: f1Result.sampled, found: f1Result.found, foundRate: f1Result.foundRate },
    },
    {
      check: "F2: Property Value Preservation",
      status: (lowMatchProps.length === 0 ? "PASS" : "WARN") as "PASS" | "WARN" | "FAIL",
      message: f2Result.message,
      details: f2Result.propertyRates,
    },
    {
      check: "F3: Per-Layer Breakdown",
      status: "PASS" as "PASS" | "WARN" | "FAIL",
      message: `Breakdown available for all ${f3Layers.length} layers.`,
      details: f3Result.layers,
    },
    {
      check: "F4: Grid Boundary Stress Test",
      status: (degradedLayers.length === 0 ? "PASS" : "WARN") as "PASS" | "WARN" | "FAIL",
      message:
        degradedLayers.length === 0
          ? "No boundary degradation detected."
          : `${degradedLayers.length} layer(s) degraded near WFS seams: ${degradedLayers.join(", ")}`,
      details: f4Result,
    },
  ];

  const payload = {
    timestamp: new Date().toISOString(),
    summary: {
      total: allResults.length,
      passed: allResults.filter((r) => r.status === "PASS").length,
      warned: allResults.filter((r) => r.status === "WARN").length,
      failed: allResults.filter((r) => r.status === "FAIL").length,
    },
    results: allResults,
    fidelityData,
  };

  // Ensure output directory exists
  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log("\n" + C.dim + "─".repeat(60) + C.reset);
  console.log(C.bold + "Summary:" + C.reset);
  for (const r of allResults) {
    console.log(`  ${statusTag(r.status)} ${r.check}: ${r.message}`);
  }
  console.log(`\nResults saved to: ${OUTPUT_PATH}\n`);

  if (allResults.some((r) => r.status === "FAIL")) {
    process.exitCode = 1;
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

runFidelityAudit().catch((err: unknown) => {
  console.error(C.red + "Fatal error:" + C.reset, err);
  process.exit(1);
});
