/**
 * OpenCanopy Deep Property Audit
 *
 * P1-P4 property checks at 36 BC_EXTENDED_GRID points at z10.
 *
 *   P1: Per-layer property validation using TILE_PROPERTY_RULES.
 *       Validates type, presence of required fields, enum values, ranges.
 *
 *   P2: tenure-cutblocks company_id must be from KNOWN_COMPANY_IDS.
 *       (Subset of P1, surfaced separately for reporting clarity.)
 *
 *   P3: Date fields not in the future and within [1900, currentYear].
 *       Applies to: DISTURBANCE_START_DATE (tenure-cutblocks), FIRE_YEAR (fire-history).
 *
 *   P4: Numeric fields must be non-negative and within declared bounds.
 *       Applies to: PLANNED_GROSS_BLOCK_AREA, FIRE_SIZE_HECTARES, AREA_HA, FEATURE_AREA_SQM.
 *
 * Usage:
 *   npx tsx scripts/audit-property-deep.ts
 *
 * Output:
 *   data/reports/property-deep-results.json
 *
 * Exit codes:
 *   0 — all checks PASS or WARN
 *   1 — one or more checks FAIL
 */

import path from "path";
import { existsSync, mkdirSync } from "fs";
import { AuditResult, printResults, saveResults } from "./lib/audit-types";
import {
  PATHS,
  ZOOMS,
  BC_EXTENDED_GRID,
  EXPECTED_SOURCE_LAYERS,
  type SourceLayerName,
} from "./lib/audit-config";
import {
  LAYER_PROPERTIES,
  KNOWN_COMPANY_IDS,
  validateDeep,
} from "./lib/property-schema";
import { TileReader, getLayerFeatures } from "./lib/tile-reader";
import { latLonToTile } from "./lib/tile-math";

// ── Configuration ─────────────────────────────────────────────────────────────

const OUTPUT_PATH = path.resolve(PATHS.reports, "property-deep-results.json");

/** Current year ceiling for date validation. */
const CURRENT_YEAR = new Date().getFullYear();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Decode a numeric year from a raw property value.
 * Handles numbers directly, or strings starting with 4 digits.
 */
function extractYear(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.floor(value) : null;
  }
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})/);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

// ── Main audit ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const results: AuditResult[] = [];

  // -- PMTiles availability check -----------------------------------------------
  if (!existsSync(PATHS.pmtiles)) {
    results.push({
      check: "Property deep audit — PMTiles availability",
      status: "WARN",
      message: `PMTiles archive not found: ${PATHS.pmtiles}. Skipping property checks.`,
    });
    mkdirSync(PATHS.reports, { recursive: true });
    printResults(results);
    saveResults(results, OUTPUT_PATH);
    return;
  }

  results.push({
    check: "Property deep audit — PMTiles availability",
    status: "PASS",
    message: `PMTiles archive found: ${PATHS.pmtiles}`,
  });

  const reader = new TileReader(PATHS.pmtiles);

  // Per-layer tallies for P1 summary results
  const p1Tallies: Record<
    SourceLayerName,
    { features: number; violations: number }
  > = {} as Record<SourceLayerName, { features: number; violations: number }>;

  for (const layer of EXPECTED_SOURCE_LAYERS) {
    p1Tallies[layer] = { features: 0, violations: 0 };
  }

  // Dedicated tallies for P2-P4
  const p2Tallies = { features: 0, violations: 0 };
  const p3Tallies: Record<string, { checks: number; violations: number }> = {
    DISTURBANCE_START_DATE: { checks: 0, violations: 0 },
    FIRE_YEAR: { checks: 0, violations: 0 },
  };
  const p4Tallies: Record<string, { checks: number; violations: number }> = {
    PLANNED_GROSS_BLOCK_AREA: { checks: 0, violations: 0 },
    FIRE_SIZE_HECTARES: { checks: 0, violations: 0 },
    AREA_HA: { checks: 0, violations: 0 },
    FEATURE_AREA_SQM: { checks: 0, violations: 0 },
  };

  // ── Iterate 36 grid points ──────────────────────────────────────────────────
  for (const point of BC_EXTENDED_GRID) {
    const { x, y, z } = latLonToTile(point.lat, point.lon, ZOOMS.feature);
    const tile = await reader.getTile(z, x, y);

    if (!tile) continue; // tile not in archive — skip gracefully

    for (const layer of EXPECTED_SOURCE_LAYERS) {
      const rawFeatures = getLayerFeatures(tile, layer);
      if (rawFeatures.length === 0) continue;

      for (let fi = 0; fi < rawFeatures.length; fi++) {
        const feat = rawFeatures[fi] as {
          properties?: Record<string, unknown>;
        };
        const props: Record<string, unknown> = feat.properties ?? {};

        // ── P1: Full property validation ────────────────────────────────────
        const vResult = validateDeep(layer as SourceLayerName, props, fi);
        if (vResult) {
          p1Tallies[layer].features++;
          const violated = vResult.findings.some((f) => f.status !== "ok");
          if (violated) {
            p1Tallies[layer].violations++;
          }
        }

        // ── P2: company_id enum check (tenure-cutblocks) ────────────────────
        if (layer === "tenure-cutblocks") {
          p2Tallies.features++;
          const cid = props["company_id"];
          if (
            typeof cid !== "string" ||
            !(KNOWN_COMPANY_IDS as readonly string[]).includes(cid)
          ) {
            p2Tallies.violations++;
          }
        }

        // ── P3: Date fields not in future, within [1900, currentYear] ────────
        if (layer === "tenure-cutblocks" && props["DISTURBANCE_START_DATE"] !== null && props["DISTURBANCE_START_DATE"] !== undefined) {
          const yr = extractYear(props["DISTURBANCE_START_DATE"]);
          if (yr !== null) {
            p3Tallies["DISTURBANCE_START_DATE"].checks++;
            if (yr < 1900 || yr > CURRENT_YEAR) {
              p3Tallies["DISTURBANCE_START_DATE"].violations++;
            }
          }
        }

        if (layer === "fire-history" && props["FIRE_YEAR"] !== null && props["FIRE_YEAR"] !== undefined) {
          const yr = extractYear(props["FIRE_YEAR"]);
          if (yr !== null) {
            p3Tallies["FIRE_YEAR"].checks++;
            if (yr < 1900 || yr > CURRENT_YEAR) {
              p3Tallies["FIRE_YEAR"].violations++;
            }
          }
        }

        // ── P4: Numeric non-negative / in-bounds checks ───────────────────────
        const numericChecks: Array<{
          field: string;
          layer: SourceLayerName;
          min: number;
          max: number;
        }> = [
          { field: "PLANNED_GROSS_BLOCK_AREA", layer: "tenure-cutblocks", min: 0.01, max: 100000 },
          { field: "FIRE_SIZE_HECTARES", layer: "fire-history", min: 0, max: 10000000 },
          { field: "AREA_HA", layer: "community-watersheds", min: 0, max: 1000000 },
          { field: "FEATURE_AREA_SQM", layer: "conservation-priority", min: 0, max: 100000000000 },
        ];

        for (const nc of numericChecks) {
          if (layer !== nc.layer) continue;
          const val = props[nc.field];
          if (val === null || val === undefined) continue;
          if (typeof val !== "number") continue;

          p4Tallies[nc.field].checks++;
          if (val < nc.min || val > nc.max) {
            p4Tallies[nc.field].violations++;
          }
        }
      }
    }
  }

  // ── Emit P1 results per layer ──────────────────────────────────────────────
  for (const layer of EXPECTED_SOURCE_LAYERS) {
    const { features, violations } = p1Tallies[layer];

    if (features === 0) {
      // No features encountered — could mean empty tiles in the grid. WARN.
      results.push({
        check: `P1 Property validation — ${layer}`,
        status: "WARN",
        message: `No ${layer} features found at any of the 36 grid points (z${ZOOMS.feature}).`,
        layerName: layer,
      });
      continue;
    }

    const violationRate = violations / features;
    const status: AuditResult["status"] =
      violationRate === 0 ? "PASS" : violationRate <= 0.05 ? "WARN" : "FAIL";

    results.push({
      check: `P1 Property validation — ${layer}`,
      status,
      message: `${features} features checked; ${violations} had violations (${(violationRate * 100).toFixed(1)}%).`,
      layerName: layer,
      details: {
        requiredProperties: Object.keys(LAYER_PROPERTIES[layer] || {}),
        featuresChecked: features,
        violations,
      },
    });
  }

  // ── Emit P2 result ─────────────────────────────────────────────────────────
  if (p2Tallies.features === 0) {
    results.push({
      check: "P2 company_id enum — tenure-cutblocks",
      status: "WARN",
      message: "No tenure-cutblocks features found to check company_id.",
      layerName: "tenure-cutblocks",
    });
  } else {
    const violationRate = p2Tallies.violations / p2Tallies.features;
    const status: AuditResult["status"] =
      violationRate === 0 ? "PASS" : violationRate <= 0.02 ? "WARN" : "FAIL";
    results.push({
      check: "P2 company_id enum — tenure-cutblocks",
      status,
      message: `${p2Tallies.features} company_id values checked; ${p2Tallies.violations} not in known set (${(violationRate * 100).toFixed(1)}%).`,
      layerName: "tenure-cutblocks",
      details: {
        knownValues: KNOWN_COMPANY_IDS,
        featuresChecked: p2Tallies.features,
        violations: p2Tallies.violations,
      },
    });
  }

  // ── Emit P3 results ────────────────────────────────────────────────────────
  for (const [field, tally] of Object.entries(p3Tallies)) {
    const layerName: SourceLayerName =
      field === "DISTURBANCE_START_DATE" ? "tenure-cutblocks" : "fire-history";

    if (tally.checks === 0) {
      results.push({
        check: `P3 Date validity — ${field}`,
        status: "WARN",
        message: `No non-null ${field} values found to validate.`,
        layerName,
      });
      continue;
    }

    const violationRate = tally.violations / tally.checks;
    const status: AuditResult["status"] =
      violationRate === 0 ? "PASS" : violationRate <= 0.01 ? "WARN" : "FAIL";

    results.push({
      check: `P3 Date validity — ${field}`,
      status,
      message: `${tally.checks} date values checked; ${tally.violations} outside [1900, ${CURRENT_YEAR}] (${(violationRate * 100).toFixed(1)}%).`,
      layerName,
    });
  }

  // ── Emit P4 results ────────────────────────────────────────────────────────
  for (const [field, tally] of Object.entries(p4Tallies)) {
    const layerName: SourceLayerName =
      field === "PLANNED_GROSS_BLOCK_AREA"
        ? "tenure-cutblocks"
        : field === "FIRE_SIZE_HECTARES"
        ? "fire-history"
        : field === "AREA_HA"
        ? "community-watersheds"
        : "conservation-priority";

    if (tally.checks === 0) {
      results.push({
        check: `P4 Numeric range — ${field}`,
        status: "WARN",
        message: `No non-null ${field} values found to validate.`,
        layerName,
      });
      continue;
    }

    const violationRate = tally.violations / tally.checks;
    const status: AuditResult["status"] =
      violationRate === 0 ? "PASS" : violationRate <= 0.01 ? "WARN" : "FAIL";

    results.push({
      check: `P4 Numeric range — ${field}`,
      status,
      message: `${tally.checks} values checked; ${tally.violations} out of declared range (${(violationRate * 100).toFixed(1)}%).`,
      layerName,
    });
  }

  // ── Close reader ───────────────────────────────────────────────────────────
  await reader.close();

  // ── Print and save ─────────────────────────────────────────────────────────
  mkdirSync(PATHS.reports, { recursive: true });
  printResults(results);
  saveResults(results, OUTPUT_PATH);

  const hasFail = results.some((r) => r.status === "FAIL");
  if (hasFail) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Audit error:", err);
  process.exit(1);
});
