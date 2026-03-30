/**
 * Adversarial audit for the OpenCanopy tile pipeline.
 *
 * Runs four classes of checks against the production PMTiles archive:
 *
 *   V1 - Feature presence at z10
 *        Point must have at least one feature in the expected layer.
 *
 *   V2 - Property value matching
 *        A specific property on the found feature must match the expected
 *        value (exact string, RegExp pattern, or { gt: number } range).
 *
 *   V3 - Feature absence
 *        Okanagan Lake should have NO forest-age features (it's a water body).
 *        Missing tile also passes -- absence of tile data is acceptable.
 *
 *   V4 - Layer contradiction
 *        - Cutblocks inside parks = WARN
 *        - Old-growth/mature forest where FIRE_YEAR >= 2000 = WARN
 *
 * Output: data/reports/adversarial-results.json
 *
 * Usage:
 *   npx tsx scripts/audit-adversarial.ts
 */

import path from "path";
import { mkdirSync } from "fs";
import { PMTiles } from "pmtiles";
import { NodeFileSource } from "./lib/node-file-source";
import { latLonToTile } from "./lib/tile-math";
import { parseTile, getLayerFeatures } from "./lib/mvt-reader";
import { AuditResult, printResults, saveResults } from "./lib/audit-types";
import {
  ADVERSARIAL_POINTS,
  type AdversarialPoint,
  type ExpectedValue,
} from "./lib/adversarial-points";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const PRODUCTION_PMTILES = path.resolve(PROJECT_ROOT, "data/tiles/opencanopy.pmtiles");
const REPORTS_DIR = path.resolve(PROJECT_ROOT, "data/reports");
const OUTPUT_PATH = path.resolve(REPORTS_DIR, "adversarial-results.json");

const AUDIT_ZOOM = 10;

// ── Helper: fetch a tile ───────────────────────────────────────────────────────

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

// ── Helper: get all features from a layer at a lat/lon ────────────────────────

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
  const features = getLayerFeatures(tile, layerName);
  return { features, tileExists: true };
}

// ── Helper: test a single property value against an ExpectedValue ─────────────

function matchesExpected(
  value: unknown,
  expected: ExpectedValue
): boolean {
  if (expected === null) {
    // Absence -- this helper is not called in absence checks, but guard anyway
    return value === null || value === undefined;
  }

  if (typeof expected === "string") {
    return String(value) === expected;
  }

  if (expected instanceof RegExp) {
    return expected.test(String(value ?? ""));
  }

  if (typeof expected === "object" && "gt" in expected) {
    const num = Number(value);
    return !isNaN(num) && num > expected.gt;
  }

  return false;
}

// ── V1: Feature presence ──────────────────────────────────────────────────────

async function checkV1Presence(
  pmtiles: PMTiles,
  point: AdversarialPoint
): Promise<AuditResult> {
  const { features, tileExists } = await getFeaturesAtPoint(
    pmtiles, point.lat, point.lon, point.layer
  );

  const check = `V1:Presence | ${point.name} | ${point.layer}`;

  if (!tileExists) {
    return {
      check,
      status: "FAIL",
      message: `Tile missing at z${AUDIT_ZOOM} for ${point.name} (${point.lat}, ${point.lon})`,
      details: { lat: point.lat, lon: point.lon, layer: point.layer },
    };
  }

  if (features.length === 0) {
    return {
      check,
      status: "FAIL",
      message: `No features found in layer '${point.layer}' at ${point.name}`,
      details: { lat: point.lat, lon: point.lon, featureCount: 0 },
    };
  }

  return {
    check,
    status: "PASS",
    message: `${features.length} feature(s) found in '${point.layer}' at ${point.name}`,
    details: { lat: point.lat, lon: point.lon, featureCount: features.length },
  };
}

// ── V2: Property value matching ───────────────────────────────────────────────

async function checkV2PropertyValue(
  pmtiles: PMTiles,
  point: AdversarialPoint
): Promise<AuditResult | null> {
  // V2 only applies to points with a non-null expectedValue and a propertyKey
  if (point.expectedValue === null || !point.propertyKey) return null;

  const { features, tileExists } = await getFeaturesAtPoint(
    pmtiles, point.lat, point.lon, point.layer
  );

  const check = `V2:Property | ${point.name} | ${point.layer}.${point.propertyKey}`;

  if (!tileExists) {
    return {
      check,
      status: "FAIL",
      message: `Tile missing at z${AUDIT_ZOOM} -- cannot verify property`,
      details: { lat: point.lat, lon: point.lon, layer: point.layer },
    };
  }

  if (features.length === 0) {
    return {
      check,
      status: "FAIL",
      message: `No features in '${point.layer}' at ${point.name} -- cannot verify property`,
      details: { lat: point.lat, lon: point.lon, layer: point.layer },
    };
  }

  // Check if any feature has the expected property value
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matchingFeature = features.find((f: any) => {
    const val = f.properties?.[point.propertyKey!];
    return matchesExpected(val, point.expectedValue);
  });

  if (!matchingFeature) {
    // Collect sample values for diagnostics
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sampleValues = features.slice(0, 5).map((f: any) => f.properties?.[point.propertyKey!]);
    const expectedDesc =
      point.expectedValue instanceof RegExp
        ? point.expectedValue.toString()
        : typeof point.expectedValue === "object"
        ? JSON.stringify(point.expectedValue)
        : String(point.expectedValue);

    return {
      check,
      status: "FAIL",
      message: `No feature matched expected value ${expectedDesc} for '${point.propertyKey}'`,
      details: {
        lat: point.lat,
        lon: point.lon,
        expectedValue: expectedDesc,
        sampleValues,
        featureCount: features.length,
      },
    };
  }

  const actualValue = (matchingFeature as any).properties?.[point.propertyKey!];
  return {
    check,
    status: "PASS",
    message: `Property '${point.propertyKey}' = ${JSON.stringify(actualValue)} matches expected`,
    details: { lat: point.lat, lon: point.lon, actualValue },
  };
}

// ── V3: Feature absence ───────────────────────────────────────────────────────

async function checkV3Absence(
  pmtiles: PMTiles,
  point: AdversarialPoint
): Promise<AuditResult | null> {
  // V3 only applies to absence checks
  if (point.expectedValue !== null) return null;

  const { features, tileExists } = await getFeaturesAtPoint(
    pmtiles, point.lat, point.lon, point.layer
  );

  const check = `V3:Absence | ${point.name} | ${point.layer}`;

  // Missing tile is acceptable for absence checks -- if the tile doesn't exist,
  // there definitely aren't features there
  if (!tileExists) {
    return {
      check,
      status: "PASS",
      message: `Tile missing at z${AUDIT_ZOOM} -- absence confirmed (no tile = no features)`,
      details: { lat: point.lat, lon: point.lon, layer: point.layer },
    };
  }

  if (features.length > 0) {
    return {
      check,
      status: "FAIL",
      message: `Expected NO features in '${point.layer}' at ${point.name}, but found ${features.length}`,
      details: {
        lat: point.lat,
        lon: point.lon,
        featureCount: features.length,
        description: point.description,
      },
    };
  }

  return {
    check,
    status: "PASS",
    message: `Confirmed: no features in '${point.layer}' at ${point.name} (expected absence)`,
    details: { lat: point.lat, lon: point.lon },
  };
}

// ── V4: Layer contradictions ───────────────────────────────────────────────────

/**
 * V4a: Cutblocks inside parks.
 * Checks each adversarial point -- if there are tenure-cutblocks AND parks features
 * at the same location, that's a contradiction worth flagging.
 */
async function checkV4CutblocksInParks(
  pmtiles: PMTiles,
  lat: number,
  lon: number,
  label: string
): Promise<AuditResult | null> {
  const [parksResult, cutblocksResult] = await Promise.all([
    getFeaturesAtPoint(pmtiles, lat, lon, "parks"),
    getFeaturesAtPoint(pmtiles, lat, lon, "tenure-cutblocks"),
  ]);

  if (!parksResult.tileExists) return null;

  const hasPark = parksResult.features.length > 0;
  const hasCutblock = cutblocksResult.features.length > 0;

  if (!hasPark || !hasCutblock) return null;

  return {
    check: `V4:Contradiction | CutblocksInPark | ${label}`,
    status: "WARN",
    message: `Cutblocks detected inside a park boundary at ${label} -- verify this is intentional`,
    details: {
      lat,
      lon,
      parkFeatureCount: parksResult.features.length,
      cutblockFeatureCount: cutblocksResult.features.length,
    },
  };
}

/**
 * V4b: Old-growth/mature forest where FIRE_YEAR >= 2000.
 * Post-fire areas should not be classified as old-growth or mature.
 */
async function checkV4OldGrowthPostFire(
  pmtiles: PMTiles,
  lat: number,
  lon: number,
  label: string
): Promise<AuditResult | null> {
  const [forestResult, fireResult] = await Promise.all([
    getFeaturesAtPoint(pmtiles, lat, lon, "forest-age"),
    getFeaturesAtPoint(pmtiles, lat, lon, "fire-history"),
  ]);

  if (!forestResult.tileExists || !fireResult.tileExists) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasRecentFire = fireResult.features.some((f: any) => {
    const year = Number(f.properties?.FIRE_YEAR);
    return !isNaN(year) && year >= 2000;
  });

  if (!hasRecentFire) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matureOrOldGrowth = forestResult.features.filter((f: any) => {
    // Tile stores `class` as a descriptive string emitted by the VRI extractor
    const ageClass = String(f.properties?.class ?? "").toLowerCase();
    return ageClass === "old-growth" || ageClass === "mature";
  });

  if (matureOrOldGrowth.length === 0) return null;

  return {
    check: `V4:Contradiction | OldGrowthPostFire | ${label}`,
    status: "WARN",
    message: `Old-growth/mature forest classification found where FIRE_YEAR >= 2000 at ${label}`,
    details: {
      lat,
      lon,
      matureOrOldGrowthCount: matureOrOldGrowth.length,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recentFireYears: fireResult.features
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((f: any) => f.properties?.FIRE_YEAR)
        .filter((y: unknown) => Number(y) >= 2000),
    },
  };
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\nOpenCanopy Adversarial Audit");
  console.log("─".repeat(60));
  console.log(`  Archive: ${PRODUCTION_PMTILES}`);
  console.log(`  Points:  ${ADVERSARIAL_POINTS.length}`);
  console.log(`  Zoom:    z${AUDIT_ZOOM}`);

  const source = new NodeFileSource(PRODUCTION_PMTILES);
  const pmtiles = new PMTiles(source);

  const results: AuditResult[] = [];

  // ── V1, V2, V3 per adversarial point ──
  for (const point of ADVERSARIAL_POINTS) {
    console.log(`\n  Checking: ${point.name}`);

    if (point.expectedValue === null) {
      // V3: absence check
      const v3 = await checkV3Absence(pmtiles, point);
      if (v3) results.push(v3);
    } else {
      // V1: presence check
      const v1 = await checkV1Presence(pmtiles, point);
      results.push(v1);

      // V2: property value check (only if V1 passed)
      if (v1.status === "PASS") {
        const v2 = await checkV2PropertyValue(pmtiles, point);
        if (v2) results.push(v2);
      }
    }
  }

  // ── V4: Contradiction checks across all adversarial point locations ──
  console.log("\n  Running V4 contradiction checks...");

  for (const point of ADVERSARIAL_POINTS) {
    const cutblockConflict = await checkV4CutblocksInParks(
      pmtiles, point.lat, point.lon, point.name
    );
    if (cutblockConflict) results.push(cutblockConflict);

    const fireConflict = await checkV4OldGrowthPostFire(
      pmtiles, point.lat, point.lon, point.name
    );
    if (fireConflict) results.push(fireConflict);
  }

  // ── Close file handle ──
  await source.close();

  // ── Print and save ──
  printResults(results);

  mkdirSync(REPORTS_DIR, { recursive: true });

  // Extend the saveResults payload with adversarial-specific metadata
  const adversarialPayload = {
    timestamp: new Date().toISOString(),
    auditType: "adversarial",
    zoom: AUDIT_ZOOM,
    pointsTested: ADVERSARIAL_POINTS.length,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.status === "PASS").length,
      warned: results.filter((r) => r.status === "WARN").length,
      failed: results.filter((r) => r.status === "FAIL").length,
    },
    checks: {
      v1Presence: results.filter((r) => r.check.startsWith("V1:")).length,
      v2Property: results.filter((r) => r.check.startsWith("V2:")).length,
      v3Absence: results.filter((r) => r.check.startsWith("V3:")).length,
      v4Contradiction: results.filter((r) => r.check.startsWith("V4:")).length,
    },
    results,
  };

  const { writeFileSync } = await import("fs");
  try {
    writeFileSync(OUTPUT_PATH, JSON.stringify(adversarialPayload, null, 2));
    console.log(`\nResults saved to ${OUTPUT_PATH}`);
  } catch (err) {
    console.error(
      `Warning: could not write adversarial results to "${OUTPUT_PATH}": ${(err as Error).message}. ` +
        "Results were printed to stdout above."
    );
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
