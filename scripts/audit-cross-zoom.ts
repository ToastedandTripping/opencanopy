/**
 * Cross-Zoom Classification Audit
 *
 * Validates that classification attributes survive the tippecanoe pipeline
 * across zoom levels. The core verification for the --drop-densest-as-needed
 * switch: features present at both z6 (overview) and z12 (detail) must have
 * identical classification values.
 *
 * For layers without classification fields (parks, conservancies, etc.),
 * this reduces to a presence-only check at both zoom levels.
 *
 * Usage:
 *   npx tsx scripts/audit-cross-zoom.ts
 */

import { existsSync } from "fs";
import path from "path";
import { PMTiles } from "pmtiles";
import { NodeFileSource } from "./lib/node-file-source";
import { traceFeature, clearTileCache } from "./lib/feature-tracer";
import { sampleFeatures } from "./lib/ndjson-sampler";
import {
  PATHS,
  SAMPLING,
  EXPECTED_SOURCE_LAYERS,
  C,
} from "./lib/audit-config";
import { type AuditResult, printResults, saveResults } from "./lib/audit-types";

const OVERVIEW_ZOOM = 6;
const DETAIL_ZOOM = 12;

const CLASSIFICATION_FIELDS: Record<string, string> = {
  "forest-age": "class",
  "tenure-cutblocks": "company_id",
  "fire-history": "FIRE_YEAR",
};

interface CrossZoomStats {
  sampled: number;
  foundBoth: number;
  foundDetailOnly: number;
  foundOverviewOnly: number;
  foundNeither: number;
  classMatch: number;
  classMismatch: number;
}

async function auditLayer(
  pmtiles: PMTiles,
  layer: string,
): Promise<{ results: AuditResult[]; stats: CrossZoomStats }> {
  const results: AuditResult[] = [];
  const stats: CrossZoomStats = {
    sampled: 0,
    foundBoth: 0,
    foundDetailOnly: 0,
    foundOverviewOnly: 0,
    foundNeither: 0,
    classMatch: 0,
    classMismatch: 0,
  };

  const preprocessedPath = path.resolve(PATHS.preprocessed, `${layer}.ndjson`);
  const rawPath = path.resolve(PATHS.geojson, `${layer}.ndjson`);
  const inputPath = existsSync(preprocessedPath) ? preprocessedPath : rawPath;

  if (!existsSync(inputPath)) {
    results.push({
      check: `CZ-${layer}: data availability`,
      status: "WARN",
      message: `No NDJSON found for ${layer} — skipping`,
      layerName: layer,
    });
    return { results, stats };
  }

  const features = await sampleFeatures(inputPath, SAMPLING.fidelityPerLayer);
  stats.sampled = features.length;

  if (features.length === 0) {
    results.push({
      check: `CZ-${layer}: sample size`,
      status: "WARN",
      message: `No features sampled from ${layer}`,
      layerName: layer,
    });
    return { results, stats };
  }

  const classField = CLASSIFICATION_FIELDS[layer] ?? null;
  const mismatches: Array<{
    detailValue: unknown;
    overviewValue: unknown;
    centroid: { lat: number; lon: number };
  }> = [];

  for (const feature of features) {
    const detailResult = await traceFeature(pmtiles, feature, layer, DETAIL_ZOOM);
    const overviewResult = await traceFeature(pmtiles, feature, layer, OVERVIEW_ZOOM);

    if (detailResult.found && overviewResult.found) {
      stats.foundBoth++;

      if (classField) {
        const detailValue = detailResult.propertyComparison[classField]?.tile;
        const overviewValue = overviewResult.propertyComparison[classField]?.tile;

        if (detailValue === overviewValue) {
          stats.classMatch++;
        } else {
          stats.classMismatch++;
          mismatches.push({
            detailValue,
            overviewValue,
            centroid: detailResult.centroid,
          });
        }
      } else {
        stats.classMatch++;
      }
    } else if (detailResult.found && !overviewResult.found) {
      stats.foundDetailOnly++;
    } else if (!detailResult.found && overviewResult.found) {
      stats.foundOverviewOnly++;
    } else {
      stats.foundNeither++;
    }
  }

  // Classification consistency check
  if (classField && stats.foundBoth > 0) {
    const mismatchRate = stats.classMismatch / stats.foundBoth;

    if (mismatchRate > 0.01) {
      results.push({
        check: `CZ-${layer}: classification consistency (${classField})`,
        status: "FAIL",
        message: `${stats.classMismatch}/${stats.foundBoth} features have different ${classField} at z${OVERVIEW_ZOOM} vs z${DETAIL_ZOOM} (${(mismatchRate * 100).toFixed(1)}%)`,
        layerName: layer,
        details: mismatches.slice(0, 5),
      });
    } else if (stats.classMismatch > 0) {
      results.push({
        check: `CZ-${layer}: classification consistency (${classField})`,
        status: "WARN",
        message: `${stats.classMismatch}/${stats.foundBoth} features have different ${classField} at z${OVERVIEW_ZOOM} vs z${DETAIL_ZOOM}`,
        layerName: layer,
        details: mismatches.slice(0, 3),
      });
    } else {
      results.push({
        check: `CZ-${layer}: classification consistency (${classField})`,
        status: "PASS",
        message: `All ${stats.foundBoth} features found at both zooms have matching ${classField}`,
        layerName: layer,
      });
    }
  }

  // Presence check (all layers)
  if (stats.foundNeither > stats.sampled * 0.5) {
    results.push({
      check: `CZ-${layer}: cross-zoom presence`,
      status: "WARN",
      message: `${stats.foundNeither}/${stats.sampled} features not found at either zoom — possible pipeline issue`,
      layerName: layer,
    });
  } else {
    results.push({
      check: `CZ-${layer}: cross-zoom presence`,
      status: "PASS",
      message: `${stats.foundBoth} both, ${stats.foundDetailOnly} detail-only, ${stats.foundOverviewOnly} overview-only, ${stats.foundNeither} neither (of ${stats.sampled})`,
      layerName: layer,
    });
  }

  return { results, stats };
}

async function main() {
  console.log(`\n${C.bold}OpenCanopy Cross-Zoom Classification Audit${C.reset}`);
  console.log(`${C.dim}${"─".repeat(60)}${C.reset}`);
  console.log(`  Overview zoom: z${OVERVIEW_ZOOM}`);
  console.log(`  Detail zoom:   z${DETAIL_ZOOM}`);
  console.log(`  Sample size:   ${SAMPLING.fidelityPerLayer} per layer`);
  console.log();

  if (!existsSync(PATHS.pmtiles)) {
    console.error(`PMTiles not found at ${PATHS.pmtiles}`);
    process.exit(1);
  }

  const source = new NodeFileSource(PATHS.pmtiles);
  const pmtiles = new PMTiles(source);

  const allResults: AuditResult[] = [];

  for (const layer of EXPECTED_SOURCE_LAYERS) {
    console.log(`  Auditing ${layer}...`);
    clearTileCache();
    const { results } = await auditLayer(pmtiles, layer);
    allResults.push(...results);
  }

  await source.close();

  printResults(allResults);

  const reportPath = path.resolve(PATHS.reports, "cross-zoom-results.json");
  saveResults(allResults, reportPath);
}

main().catch((err) => {
  console.error("Cross-zoom audit error:", err);
  process.exit(1);
});
