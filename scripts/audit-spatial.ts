/**
 * OpenCanopy Spatial Audit — Part B
 *
 * Two spatial checks:
 *
 *   S1: Water body overlap — verifies that land-use polygon features do not
 *       overlap significantly with BC FWA lake polygons. Runs against all 10
 *       polygon layers (excludes forestry-roads).
 *
 *   S2: Forest-age classification consistency — at each of the 36 BC_EXTENDED_GRID
 *       points, reads forest-age tile features and verifies that the `class`
 *       property is consistent with the `age` field:
 *         "old-growth" → age ≥ 250
 *         "mature"     → 80 ≤ age < 250
 *         "young"      → 0 < age < 80
 *         "harvested"  → age is null (harvest indicator)
 *
 * Prerequisites:
 *   - PMTiles archive: data/tiles/opencanopy.pmtiles
 *   - Lakes reference: data/geojson/reference/fwa-lakes.ndjson
 *     (download with: npm run audit:download-reference)
 *
 * Usage:
 *   npx tsx scripts/audit-spatial.ts
 *   npx tsx scripts/audit-spatial.ts --output data/reports/spatial-results.json
 *   npx tsx scripts/audit-spatial.ts --layer parks
 *   npx tsx scripts/audit-spatial.ts --layer forest-age --output /tmp/out.json
 */

import path from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import { PMTiles } from "pmtiles";
import { NodeFileSource } from "./lib/node-file-source";
import { parseTile, getLayerFeatures } from "./lib/mvt-reader";
import { latLonToTile } from "./lib/tile-math";
import { AuditResult, printResults, saveResults } from "./lib/audit-types";
import { checkWaterBodyOverlap } from "./lib/spatial-checks";
import { BC_EXTENDED_GRID } from "./lib/bc-sample-grid";
import type { SamplePoint } from "./lib/bc-sample-grid";

// ── Configuration ─────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, "..");
const PMTILES_PATH = path.resolve(PROJECT_ROOT, "data", "tiles", "opencanopy.pmtiles");
const LAKES_PATH = path.resolve(PROJECT_ROOT, "data", "geojson", "reference", "fwa-lakes.ndjson");
const REPORTS_DIR = path.resolve(PROJECT_ROOT, "data", "reports");
const DEFAULT_OUTPUT = path.resolve(REPORTS_DIR, "spatial-results.json");

/** Zoom level for all spatial checks */
const CHECK_ZOOM = 10;

/**
 * All polygon layers (excludes forestry-roads which is a line layer).
 * These are checked for water-body overlap in S1.
 */
const POLYGON_LAYERS = [
  "forest-age",
  "tenure-cutblocks",
  "fire-history",
  "parks",
  "conservancies",
  "ogma",
  "wildlife-habitat-areas",
  "ungulate-winter-range",
  "community-watersheds",
  "mining-claims",
] as const;

type PolygonLayer = typeof POLYGON_LAYERS[number];

// ── CLI argument parsing ──────────────────────────────────────────────────────

function parseArgs(): { outputPath: string; filterLayer: string | null } {
  const args = process.argv.slice(2);

  let outputPath = DEFAULT_OUTPUT;
  let filterLayer: string | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--output" || arg === "-o") {
      outputPath = args[i + 1] ?? DEFAULT_OUTPUT;
      i++;
    } else if (arg.startsWith("--output=")) {
      outputPath = arg.split("=")[1] ?? DEFAULT_OUTPUT;
    } else if (arg === "--layer" || arg === "-l") {
      filterLayer = args[i + 1] ?? null;
      i++;
    } else if (arg.startsWith("--layer=")) {
      filterLayer = arg.split("=")[1] ?? null;
    }
  }

  return { outputPath, filterLayer };
}

// ── Forest-age classification consistency check (S2) ─────────────────────────

/**
 * Property names confirmed from forest-age.ndjson first line:
 *   { "class": "harvested", "age": null, "species": null }
 *
 * Classification rules:
 *   "old-growth" → age ≥ 250
 *   "mature"     → 80 ≤ age < 250
 *   "young"      → 0 < age < 80
 *   "harvested"  → age is null (null is the harvest indicator)
 */
function isClassConsistent(
  cls: unknown,
  age: unknown
): { consistent: boolean; reason?: string } {
  if (typeof cls !== "string") {
    return { consistent: false, reason: `class is not a string: ${String(cls)}` };
  }

  // age can be a number or null
  const ageNum = typeof age === "number" ? age : null;

  switch (cls) {
    case "old-growth":
      if (ageNum === null) {
        return { consistent: false, reason: `class="old-growth" but age is null` };
      }
      if (ageNum < 250) {
        return { consistent: false, reason: `class="old-growth" but age=${ageNum} < 250` };
      }
      return { consistent: true };

    case "mature":
      if (ageNum === null) {
        return { consistent: false, reason: `class="mature" but age is null` };
      }
      if (ageNum < 80 || ageNum >= 250) {
        return { consistent: false, reason: `class="mature" but age=${ageNum} not in [80, 250)` };
      }
      return { consistent: true };

    case "young":
      if (ageNum === null) {
        return { consistent: false, reason: `class="young" but age is null` };
      }
      if (ageNum <= 0 || ageNum >= 80) {
        return { consistent: false, reason: `class="young" but age=${ageNum} not in (0, 80)` };
      }
      return { consistent: true };

    case "harvested":
      // Harvest indicator: age must be null
      if (ageNum !== null) {
        return { consistent: false, reason: `class="harvested" but age=${ageNum} (expected null)` };
      }
      return { consistent: true };

    default:
      return { consistent: false, reason: `unknown class value: "${cls}"` };
  }
}

async function checkForestAgeConsistency(
  pmtilesPath: string,
  samplePoints: SamplePoint[],
  zoom: number
): Promise<AuditResult[]> {
  const results: AuditResult[] = [];

  if (!existsSync(pmtilesPath)) {
    results.push({
      check: "Forest-age classification consistency",
      status: "WARN",
      message: `PMTiles file not found: ${pmtilesPath}`,
    });
    return results;
  }

  const source = new NodeFileSource(pmtilesPath);
  const pmtiles = new PMTiles(source);

  let totalFeatures = 0;
  let totalInconsistent = 0;
  const inconsistentExamples: string[] = [];

  for (const point of samplePoints) {
    const tile = latLonToTile(point.lat, point.lon, zoom);
    let tileData: ArrayBuffer | null = null;
    try {
      const result = await pmtiles.getZxy(tile.z, tile.x, tile.y);
      tileData = result?.data ?? null;
    } catch {
      // tile not found — not an error, just no data at this location
    }

    if (!tileData) {
      results.push({
        check: `Forest-age classification — z${zoom} @ ${point.name}`,
        status: "PASS",
        message: `No tile data at z${zoom}/${tile.x}/${tile.y} — no forest-age features to check`,
      });
      continue;
    }

    const vectorTile = parseTile(tileData);
    const features = getLayerFeatures(vectorTile, "forest-age");

    if (features.length === 0) {
      results.push({
        check: `Forest-age classification — z${zoom} @ ${point.name}`,
        status: "PASS",
        message: `No forest-age features in tile z${zoom}/${tile.x}/${tile.y}`,
      });
      continue;
    }

    let pointInconsistent = 0;

    for (const rawFeature of features) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const feature = rawFeature as any;
      const props: Record<string, unknown> = feature.properties ?? {};
      const cls = props["class"];
      const age = props["age"];

      totalFeatures++;
      const { consistent, reason } = isClassConsistent(cls, age);

      if (!consistent) {
        pointInconsistent++;
        totalInconsistent++;
        if (inconsistentExamples.length < 5) {
          inconsistentExamples.push(`${point.name}: ${reason}`);
        }
      }
    }

    if (pointInconsistent > 0) {
      results.push({
        check: `Forest-age classification — z${zoom} @ ${point.name}`,
        status: "FAIL",
        message: `${pointInconsistent}/${features.length} features have inconsistent class/age`,
        details: { point: point.name, inconsistent: pointInconsistent, total: features.length },
      });
    } else {
      results.push({
        check: `Forest-age classification — z${zoom} @ ${point.name}`,
        status: "PASS",
        message: `All ${features.length} forest-age features have consistent class/age`,
      });
    }
  }

  await source.close();

  // Aggregate summary result
  const summaryStatus: "PASS" | "WARN" | "FAIL" =
    totalInconsistent === 0 ? "PASS" : "FAIL";

  results.push({
    check: "Forest-age classification consistency — summary",
    status: summaryStatus,
    message:
      totalInconsistent === 0
        ? `All ${totalFeatures} forest-age features passed class/age consistency check`
        : `${totalInconsistent}/${totalFeatures} features have inconsistent class/age. Examples: ${inconsistentExamples.join("; ")}`,
    details: {
      totalFeatures,
      totalInconsistent,
      examples: inconsistentExamples,
    },
  });

  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { outputPath, filterLayer } = parseArgs();

  console.log("=== OpenCanopy Spatial Audit ===\n");

  if (filterLayer) {
    console.log(`Single-layer mode: ${filterLayer}\n`);
  }

  mkdirSync(REPORTS_DIR, { recursive: true });

  const results: AuditResult[] = [];

  // ── Check PMTiles availability ────────────────────────────────────────────
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

  // ── Check lakes reference data ────────────────────────────────────────────
  // Skip lakes check if we're in single-layer mode for a non-water-overlap target
  const isForestAgeOnly = filterLayer === "forest-age";
  const needsLakes = !filterLayer || (POLYGON_LAYERS as readonly string[]).includes(filterLayer);

  if (!isForestAgeOnly && needsLakes) {
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
  }

  // ── S1: Water body overlap — all 10 polygon layers ────────────────────────
  // Determine which polygon layers to check
  const layersToCheck: PolygonLayer[] = filterLayer
    ? (POLYGON_LAYERS as readonly string[]).includes(filterLayer)
      ? [filterLayer as PolygonLayer]
      : []
    : [...POLYGON_LAYERS];

  // Skip S1 for forest-age-only mode? No — forest-age is a polygon layer,
  // so it IS in layersToCheck unless filterLayer is something else entirely.
  // We run S1 if layersToCheck is non-empty AND lakes exist.

  if (layersToCheck.length > 0 && existsSync(LAKES_PATH)) {
    console.log(
      `\nS1: Checking water body overlap at z${CHECK_ZOOM} for ${layersToCheck.length} layer(s)...`
    );

    // Per-layer overlap rates tracking
    const layerOverlapRates: Record<string, { overlaps: number; total: number }> = {};

    for (const layer of layersToCheck) {
      console.log(`  Layer: ${layer}`);
      const overlapResults = await checkWaterBodyOverlap(
        PMTILES_PATH,
        LAKES_PATH,
        BC_EXTENDED_GRID,
        layer,
        CHECK_ZOOM
      );
      results.push(...overlapResults);

      // Aggregate overlap rate for this layer
      const pointResults = overlapResults.filter((r) =>
        r.check.includes(`@ R`) || r.check.includes(`@ `)
      );
      const failCount = pointResults.filter((r) => r.status === "FAIL").length;
      const pointCount = pointResults.filter(
        (r) => r.status === "FAIL" || r.status === "PASS"
      ).length;
      layerOverlapRates[layer] = { overlaps: failCount, total: pointCount };
    }

    // Per-layer overlap rate summary
    console.log("\n  Per-layer overlap rates:");
    for (const [layer, { overlaps, total }] of Object.entries(layerOverlapRates)) {
      const rate = total > 0 ? ((overlaps / total) * 100).toFixed(1) : "n/a";
      const status = overlaps === 0 ? "PASS" : "WARN";
      results.push({
        check: `S1: Water body overlap rate — ${layer}`,
        status,
        message: `${overlaps}/${total} sample points flagged (${rate}%)`,
        details: { layer, flaggedPoints: overlaps, totalPoints: total, overlapRatePct: total > 0 ? (overlaps / total) * 100 : 0 },
      });
      console.log(
        `    ${layer.padEnd(30)} ${overlaps}/${total} points flagged (${rate}%)`
      );
    }
  }

  // ── S2: Forest-age classification consistency ─────────────────────────────
  const runForestAge = !filterLayer || filterLayer === "forest-age";

  if (runForestAge) {
    console.log(`\nS2: Forest-age classification consistency at z${CHECK_ZOOM} (${BC_EXTENDED_GRID.length} points)...`);
    const forestAgeResults = await checkForestAgeConsistency(
      PMTILES_PATH,
      BC_EXTENDED_GRID,
      CHECK_ZOOM
    );
    results.push(...forestAgeResults);
  }

  // ── Output ────────────────────────────────────────────────────────────────
  printResults(results);
  saveResults(results, outputPath);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
