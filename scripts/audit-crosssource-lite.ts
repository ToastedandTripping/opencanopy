/**
 * Cross-source consistency audit (lite, internal).
 *
 * Checks internal consistency between forest-age, fire-history, and
 * tenure-cutblocks layers using the BC_EXTENDED_GRID (36 points) at z10.
 *
 * Rules:
 *   R1 - If fire-history shows FIRE_YEAR >= 2000, forest-age should NOT
 *        be classified as "old-growth" or "mature" (age class 7, 8, 9).
 *
 *   R2 - If tenure-cutblocks exist, forest-age should show "harvested"
 *        or "young" classification (age class 1-3, or descriptive strings).
 *
 * Output: data/reports/crosssource-lite-results.json
 *
 * Usage:
 *   npx tsx scripts/audit-crosssource-lite.ts
 */

import path from "path";
import { mkdirSync, writeFileSync } from "fs";
import { PMTiles } from "pmtiles";
import { NodeFileSource } from "./lib/node-file-source";
import { latLonToTile } from "./lib/tile-math";
import { parseTile, getLayerFeatures } from "./lib/mvt-reader";
import { BC_EXTENDED_GRID, type SamplePoint } from "./lib/bc-sample-grid";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PRODUCTION_PMTILES = path.resolve(PROJECT_ROOT, "data/tiles/opencanopy.pmtiles");
const REPORTS_DIR = path.resolve(PROJECT_ROOT, "data/reports");
const OUTPUT_PATH = path.resolve(REPORTS_DIR, "crosssource-lite-results.json");

const AUDIT_ZOOM = 10;

// ── Types ─────────────────────────────────────────────────────────────────────

interface ConflictEntry {
  point: string;
  lat: number;
  lon: number;
  rule: "R1" | "R2";
  description: string;
  details: Record<string, unknown>;
}

interface PointResult {
  point: string;
  lat: number;
  lon: number;
  tileExists: boolean;
  /** undefined if the tile didn't exist */
  r1Conflict?: boolean;
  r2Conflict?: boolean;
  /** Summary of what was found at this point */
  layerSummary: {
    forestAgeFeatures: number;
    forestAgeClasses: string[];
    fireHistoryFeatures: number;
    recentFireYears: number[];
    cutblockFeatures: number;
  };
}

// ── Helper: fetch tile ────────────────────────────────────────────────────────

async function fetchTile(
  pmtiles: PMTiles,
  z: number,
  x: number,
  y: number
): Promise<ArrayBuffer | null> {
  try {
    const result = await pmtiles.getZxy(z, x, y);
    if (!result || !result.data) return null;
    return result.data;
  } catch {
    return null;
  }
}

// ── Helper: get features from a layer at a lat/lon ────────────────────────────

async function getFeaturesAtPoint(
  pmtiles: PMTiles,
  lat: number,
  lon: number,
  layerName: string,
  zoom = AUDIT_ZOOM
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ features: any[]; tileExists: boolean }> {
  const { x, y, z } = latLonToTile(lat, lon, zoom);
  const data = await fetchTile(pmtiles, z, x, y);
  if (!data) return { features: [], tileExists: false };
  const tile = parseTile(data);
  return { features: getLayerFeatures(tile, layerName), tileExists: true };
}

// ── Helper: is this a "mature/old-growth" age class? ─────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isMatureOrOldGrowth(feature: any): boolean {
  // Tile stores `class` as a descriptive string emitted by the VRI extractor:
  // "old-growth" | "mature" | "young" | "harvested"
  const raw = String(feature.properties?.class ?? "").toLowerCase().trim();
  return raw === "old-growth" || raw === "mature";
}

// ── Helper: is this a "harvested/young" age class? ───────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isHarvestedOrYoung(feature: any): boolean {
  // Tile stores `class` as a descriptive string emitted by the VRI extractor:
  // "old-growth" | "mature" | "young" | "harvested"
  const raw = String(feature.properties?.class ?? "").toLowerCase().trim();
  return raw === "harvested" || raw === "young";
}

// ── Check one grid point ──────────────────────────────────────────────────────

async function checkPoint(
  pmtiles: PMTiles,
  point: SamplePoint
): Promise<{ result: PointResult; conflicts: ConflictEntry[] }> {
  const conflicts: ConflictEntry[] = [];

  // Fetch all three layers at this tile
  // Use a single tile fetch for efficiency: all three layers live in the same PMTiles tile
  const { x, y, z } = latLonToTile(point.lat, point.lon, AUDIT_ZOOM);
  const tileData = await fetchTile(pmtiles, z, x, y);

  if (!tileData) {
    return {
      result: {
        point: point.name,
        lat: point.lat,
        lon: point.lon,
        tileExists: false,
        layerSummary: {
          forestAgeFeatures: 0,
          forestAgeClasses: [],
          fireHistoryFeatures: 0,
          recentFireYears: [],
          cutblockFeatures: 0,
        },
      },
      conflicts: [],
    };
  }

  const tile = parseTile(tileData);
  const forestAgeFeatures = getLayerFeatures(tile, "forest-age");
  const fireHistoryFeatures = getLayerFeatures(tile, "fire-history");
  const cutblockFeatures = getLayerFeatures(tile, "tenure-cutblocks");

  // Collect forest age classes for summary
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const forestAgeClasses = [
    ...new Set(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      forestAgeFeatures.map((f: any) =>
        String(f.properties?.class ?? "unknown")
      )
    ),
  ] as string[];

  // Collect recent fire years
  const recentFireYears = fireHistoryFeatures
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((f: any) => Number(f.properties?.FIRE_YEAR))
    .filter((y: number) => !isNaN(y) && y >= 2000);

  // ── R1: Recent fire + mature/old-growth ──
  let r1Conflict = false;
  if (recentFireYears.length > 0 && forestAgeFeatures.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const matureFeatures = forestAgeFeatures.filter(isMatureOrOldGrowth);
    if (matureFeatures.length > 0) {
      r1Conflict = true;
      conflicts.push({
        point: point.name,
        lat: point.lat,
        lon: point.lon,
        rule: "R1",
        description: `Fire history FIRE_YEAR >= 2000 (${recentFireYears.join(", ")}) but forest-age shows mature/old-growth`,
        details: {
          recentFireYears,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          matureAgeClasses: matureFeatures.map((f: any) => f.properties?.class),
          matureFeatureCount: matureFeatures.length,
        },
      });
    }
  }

  // ── R2: Cutblocks present + not harvested/young ──
  let r2Conflict = false;
  if (cutblockFeatures.length > 0 && forestAgeFeatures.length > 0) {
    // If cutblocks exist, we expect forest age to show harvested or young for at least
    // SOME features. If ALL forest-age features are mature/old-growth, that's a conflict.
    const hasHarvestedOrYoung = forestAgeFeatures.some(isHarvestedOrYoung);

    if (!hasHarvestedOrYoung) {
      // Additional check: if all forest-age features are mature/old-growth, flag it
      const allMature = forestAgeFeatures.every(isMatureOrOldGrowth);
      if (allMature) {
        r2Conflict = true;
        conflicts.push({
          point: point.name,
          lat: point.lat,
          lon: point.lon,
          rule: "R2",
          description: `Tenure-cutblocks present but ALL forest-age features are mature/old-growth (no harvested/young)`,
          details: {
            cutblockCount: cutblockFeatures.length,
            forestAgeClasses,
            forestAgeFeatureCount: forestAgeFeatures.length,
          },
        });
      }
    }
  }

  return {
    result: {
      point: point.name,
      lat: point.lat,
      lon: point.lon,
      tileExists: true,
      r1Conflict,
      r2Conflict,
      layerSummary: {
        forestAgeFeatures: forestAgeFeatures.length,
        forestAgeClasses,
        fireHistoryFeatures: fireHistoryFeatures.length,
        recentFireYears,
        cutblockFeatures: cutblockFeatures.length,
      },
    },
    conflicts,
  };
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\nOpenCanopy Cross-Source Consistency Audit (Lite)");
  console.log("─".repeat(60));
  console.log(`  Archive: ${PRODUCTION_PMTILES}`);
  console.log(`  Grid:    BC_EXTENDED_GRID (${BC_EXTENDED_GRID.length} points)`);
  console.log(`  Zoom:    z${AUDIT_ZOOM}`);
  console.log(`  Rules:   R1 (fire+mature), R2 (cutblocks+not-harvested)`);

  const source = new NodeFileSource(PRODUCTION_PMTILES);
  const pmtiles = new PMTiles(source);

  const allPointResults: PointResult[] = [];
  const allConflicts: ConflictEntry[] = [];

  let tilesChecked = 0;
  let tilesMissing = 0;
  let consistentPoints = 0;
  let conflictPoints = 0;

  for (let i = 0; i < BC_EXTENDED_GRID.length; i++) {
    const point = BC_EXTENDED_GRID[i];
    process.stdout.write(`  [${i + 1}/${BC_EXTENDED_GRID.length}] ${point.name}...`);

    const { result, conflicts } = await checkPoint(pmtiles, point);

    allPointResults.push(result);
    allConflicts.push(...conflicts);

    if (!result.tileExists) {
      tilesMissing++;
      process.stdout.write(" (no tile)\n");
    } else {
      tilesChecked++;
      const hasConflict = (result.r1Conflict ?? false) || (result.r2Conflict ?? false);
      if (hasConflict) {
        conflictPoints++;
        process.stdout.write(` CONFLICT (R1:${result.r1Conflict}, R2:${result.r2Conflict})\n`);
      } else {
        consistentPoints++;
        process.stdout.write(" ok\n");
      }
    }
  }

  await source.close();

  // ── Compute consistency rate ──
  // Rate is based on tiles that actually exist (can't evaluate missing tiles)
  const internalConsistencyRate =
    tilesChecked > 0 ? consistentPoints / tilesChecked : 1.0;

  // ── Print summary ──
  console.log("\n" + "─".repeat(60));
  console.log(`  Tiles checked:          ${tilesChecked}`);
  console.log(`  Tiles missing:          ${tilesMissing}`);
  console.log(`  Consistent points:      ${consistentPoints}`);
  console.log(`  Conflict points:        ${conflictPoints}`);
  console.log(`  Internal consistency:   ${(internalConsistencyRate * 100).toFixed(1)}%`);
  console.log(`  Total conflicts:        ${allConflicts.length}`);

  if (allConflicts.length > 0) {
    console.log("\n  Conflicts:");
    for (const c of allConflicts) {
      console.log(`    [${c.rule}] ${c.point}: ${c.description}`);
    }
  }

  // ── Save results ──
  mkdirSync(REPORTS_DIR, { recursive: true });

  const output = {
    timestamp: new Date().toISOString(),
    auditType: "crosssource-lite",
    zoom: AUDIT_ZOOM,
    gridSize: BC_EXTENDED_GRID.length,
    tilesChecked,
    tilesMissing,
    consistentPoints,
    conflictPoints,
    internalConsistencyRate,
    rules: {
      R1: "fire-history FIRE_YEAR >= 2000 should not coexist with old-growth/mature forest-age",
      R2: "tenure-cutblocks should not coexist with exclusively mature/old-growth forest-age",
    },
    conflicts: allConflicts,
    pointResults: allPointResults,
  };

  try {
    writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    console.log(`\nResults saved to ${OUTPUT_PATH}`);
  } catch (err) {
    console.error(
      `Warning: could not write crosssource-lite results to "${OUTPUT_PATH}": ${(err as Error).message}. ` +
        "Results were printed to stdout above."
    );
  }

  // Exit with non-zero if consistency rate is below 90%
  if (internalConsistencyRate < 0.9) {
    console.error(
      `\nConsistency rate ${(internalConsistencyRate * 100).toFixed(1)}% is below 90% threshold.`
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
