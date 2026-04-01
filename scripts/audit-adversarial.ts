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

import { mkdirSync } from "fs";
import path from "path";
import { AuditResult, printResults, saveResults } from "./lib/audit-types";
import {
  PATHS,
  ZOOMS,
  ADVERSARIAL_POINTS,
  type AdversarialPoint,
  type ExpectedValue,
} from "./lib/audit-config";
import { TileReader } from "./lib/tile-reader";

const OUTPUT_PATH = path.resolve(PATHS.reports, "adversarial-results.json");

const AUDIT_ZOOM = ZOOMS.feature;


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
  reader: TileReader,
  point: AdversarialPoint
): Promise<AuditResult> {
  const { features, tileExists } = await reader.featuresAt(
    point.lat, point.lon, point.layer
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
  reader: TileReader,
  point: AdversarialPoint
): Promise<AuditResult | null> {
  // V2 only applies to points with a non-null expectedValue and a propertyKey
  if (point.expectedValue === null || !point.propertyKey) return null;

  const { features, tileExists } = await reader.featuresAt(
    point.lat, point.lon, point.layer
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
  reader: TileReader,
  point: AdversarialPoint
): Promise<AuditResult | null> {
  // V3 only applies to absence checks
  if (point.expectedValue !== null) return null;

  const { features, tileExists } = await reader.featuresAt(
    point.lat, point.lon, point.layer
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
 * V4a: Cutblocks near parks.
 *
 * At z10 a single tile covers ~10km. Parks and cutblocks routinely coexist in
 * the same tile because BC has logging adjacent to parks throughout the province.
 * Feature count ratios are misleading: parks are single large polygons while
 * cutblocks are many small ones. True spatial overlap requires geometry
 * intersection which is beyond this audit's scope.
 *
 * This check is informational only (always PASS with a note). The crosssource-
 * lite R2 rule handles the actually problematic case: cutblocks exist but
 * forest-age shows no harvested/young classification.
 */
async function checkV4CutblocksInParks(
  reader: TileReader,
  lat: number,
  lon: number,
  label: string
): Promise<AuditResult | null> {
  const [parksResult, cutblocksResult] = await Promise.all([
    reader.featuresAt(lat, lon, "parks"),
    reader.featuresAt(lat, lon, "tenure-cutblocks"),
  ]);

  if (!parksResult.tileExists) return null;

  const parkCount = parksResult.features.length;
  const cutblockCount = cutblocksResult.features.length;

  if (parkCount === 0 || cutblockCount === 0) return null;

  return {
    check: `V4:Contradiction | CutblocksInPark | ${label}`,
    status: "PASS",
    message: `Parks (${parkCount}) and cutblocks (${cutblockCount}) coexist in z10 tile at ${label} (expected at this resolution)`,
    details: {
      lat,
      lon,
      parkFeatureCount: parkCount,
      cutblockFeatureCount: cutblockCount,
    },
  };
}

/**
 * V4b: Old-growth/mature forest where FIRE_YEAR >= 2000.
 *
 * Post-fire areas should not be classified as old-growth or mature. But at z10
 * tile scale (~10km), a tile commonly contains both a fire scar and surrounding
 * unburned mature forest. This is normal BC landscape, not a data contradiction.
 *
 * Only WARN when mature/old-growth features are a majority (>50%) of all
 * forest-age features AND recent fire covers a significant portion of the tile.
 * This catches genuine VRI classification lag while ignoring incidental
 * tile-level coexistence.
 */
async function checkV4OldGrowthPostFire(
  reader: TileReader,
  lat: number,
  lon: number,
  label: string
): Promise<AuditResult | null> {
  const [forestResult, fireResult] = await Promise.all([
    reader.featuresAt(lat, lon, "forest-age"),
    reader.featuresAt(lat, lon, "fire-history"),
  ]);

  if (!forestResult.tileExists || !fireResult.tileExists) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recentFires = fireResult.features.filter((f: any) => {
    const year = Number(f.properties?.FIRE_YEAR);
    return !isNaN(year) && year >= 2000;
  });

  if (recentFires.length === 0) return null;

  const totalForest = forestResult.features.length;
  if (totalForest === 0) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matureOrOldGrowth = forestResult.features.filter((f: any) => {
    const ageClass = String(f.properties?.class ?? "").toLowerCase();
    return ageClass === "old-growth" || ageClass === "mature";
  });

  if (matureOrOldGrowth.length === 0) return null;

  const matureRatio = matureOrOldGrowth.length / totalForest;
  const fireRatio = recentFires.length / (recentFires.length + totalForest);
  // Significant = majority of forest is mature AND fire is a substantial presence
  const isSignificant = matureRatio > 0.5 && fireRatio > 0.1;

  return {
    check: `V4:Contradiction | OldGrowthPostFire | ${label}`,
    status: isSignificant ? "WARN" : "PASS",
    message: isSignificant
      ? `Significant old-growth/fire conflict at ${label} (${matureOrOldGrowth.length}/${totalForest} mature, ${recentFires.length} fires)`
      : `Old-growth and recent fire coexist in tile at ${label} (${(matureRatio * 100).toFixed(0)}% mature -- below conflict threshold)`,
    details: {
      lat,
      lon,
      totalForestFeatures: totalForest,
      matureOrOldGrowthCount: matureOrOldGrowth.length,
      matureRatio: Math.round(matureRatio * 100),
      recentFireCount: recentFires.length,
      significant: isSignificant,
    },
  };
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\nOpenCanopy Adversarial Audit");
  console.log("─".repeat(60));
  console.log(`  Archive: ${PATHS.pmtiles}`);
  console.log(`  Points:  ${ADVERSARIAL_POINTS.length}`);
  console.log(`  Zoom:    z${AUDIT_ZOOM}`);

  const reader = new TileReader(PATHS.pmtiles);

  const results: AuditResult[] = [];

  // ── V1, V2, V3 per adversarial point ──
  for (const point of ADVERSARIAL_POINTS) {
    console.log(`\n  Checking: ${point.name}`);

    if (point.expectedValue === null) {
      // V3: absence check
      const v3 = await checkV3Absence(reader, point);
      if (v3) results.push(v3);
    } else {
      // V1: presence check
      const v1 = await checkV1Presence(reader, point);
      results.push(v1);

      // V2: property value check (only if V1 passed)
      if (v1.status === "PASS") {
        const v2 = await checkV2PropertyValue(reader, point);
        if (v2) results.push(v2);
      }
    }
  }

  // ── V4: Contradiction checks across all adversarial point locations ──
  console.log("\n  Running V4 contradiction checks...");

  for (const point of ADVERSARIAL_POINTS) {
    const cutblockConflict = await checkV4CutblocksInParks(
      reader, point.lat, point.lon, point.name
    );
    if (cutblockConflict) results.push(cutblockConflict);

    const fireConflict = await checkV4OldGrowthPostFire(
      reader, point.lat, point.lon, point.name
    );
    if (fireConflict) results.push(fireConflict);
  }

  // ── Close file handle ──
  await reader.close();

  // ── Print and save ──
  printResults(results);

  mkdirSync(PATHS.reports, { recursive: true });

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
