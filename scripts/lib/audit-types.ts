/**
 * Shared types and output utilities for the OpenCanopy tile audit pipeline.
 */

import { existsSync, writeFileSync, readFileSync } from "fs";
import path from "path";

export interface AuditResult {
  check: string;
  status: "PASS" | "WARN" | "FAIL";
  message: string;
  details?: unknown;
  layerName?: string;
}

/**
 * Groups results by layerName and returns a pass-rate score (0–1) per layer.
 * Results without a layerName are grouped under the key "__unassigned__".
 */
export function computePerLayerScore(
  results: AuditResult[]
): Record<string, number> {
  const grouped: Record<string, AuditResult[]> = {};

  for (const result of results) {
    const key = result.layerName ?? "__unassigned__";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(result);
  }

  const scores: Record<string, number> = {};
  for (const [layer, layerResults] of Object.entries(grouped)) {
    const passed = layerResults.filter((r) => r.status === "PASS").length;
    scores[layer] = layerResults.length > 0 ? passed / layerResults.length : 0;
  }

  return scores;
}

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

function statusColor(status: AuditResult["status"]): string {
  switch (status) {
    case "PASS":
      return COLORS.green;
    case "WARN":
      return COLORS.yellow;
    case "FAIL":
      return COLORS.red;
  }
}

export function printResults(results: AuditResult[]): void {
  const passes = results.filter((r) => r.status === "PASS").length;
  const warns = results.filter((r) => r.status === "WARN").length;
  const fails = results.filter((r) => r.status === "FAIL").length;

  console.log("\n" + COLORS.bold + "OpenCanopy Tile Audit Results" + COLORS.reset);
  console.log(COLORS.dim + "─".repeat(60) + COLORS.reset);

  for (const result of results) {
    const color = statusColor(result.status);
    const badge = `${color}[${result.status}]${COLORS.reset}`;
    console.log(`${badge} ${result.check}`);
    console.log(`     ${COLORS.dim}${result.message}${COLORS.reset}`);
    if (result.details !== undefined) {
      const detail =
        typeof result.details === "string"
          ? result.details
          : JSON.stringify(result.details, null, 2);
      // Indent multi-line details
      const indented = detail
        .split("\n")
        .map((l) => "     " + COLORS.dim + l + COLORS.reset)
        .join("\n");
      console.log(indented);
    }
  }

  console.log(COLORS.dim + "─".repeat(60) + COLORS.reset);
  console.log(
    `${COLORS.bold}Summary:${COLORS.reset} ` +
      `${COLORS.green}${passes} passed${COLORS.reset}, ` +
      `${COLORS.yellow}${warns} warned${COLORS.reset}, ` +
      `${COLORS.red}${fails} failed${COLORS.reset}`
  );

  if (fails > 0) {
    console.log(
      `\n${COLORS.red}${COLORS.bold}AUDIT FAILED${COLORS.reset} -- ${fails} check(s) require attention.\n`
    );
    process.exitCode = 1;
  } else if (warns > 0) {
    console.log(
      `\n${COLORS.yellow}${COLORS.bold}AUDIT PASSED WITH WARNINGS${COLORS.reset} -- review ${warns} item(s).\n`
    );
  } else {
    console.log(
      `\n${COLORS.green}${COLORS.bold}AUDIT PASSED${COLORS.reset} -- all checks clean.\n`
    );
  }
}

// ── Layer Dashboard ───────────────────────────────────────────────────────────

/**
 * Per-report file mappings used by printLayerDashboard.
 * Each entry maps a report filename to the metric type it contributes.
 */
interface ReportSlot {
  file: string;
  metric: "fidelity" | "precision" | "spatial" | "properties";
}

const DASHBOARD_REPORTS: ReportSlot[] = [
  { file: "source-fidelity-results.json", metric: "fidelity" },
  { file: "geometry-precision-results.json", metric: "precision" },
  { file: "spatial-results.json", metric: "spatial" },
  { file: "property-deep-results.json", metric: "properties" },
];

interface LayerMetrics {
  fidelityPct: string;
  precisionM: string;
  spatialStatus: string;
  propertiesStatus: string;
  overall: string;
}

/** All recognised source layer names — must stay in sync with bc-sample-grid.ts. */
const DASHBOARD_LAYERS = [
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
  "forestry-roads",
  "conservation-priority",
] as const;

type DashboardLayer = typeof DASHBOARD_LAYERS[number];

/**
 * Read a report JSON file and return its results array.
 * Returns [] if the file is missing or malformed.
 */
function readReportResults(reportPath: string): AuditResult[] {
  if (!existsSync(reportPath)) return [];
  try {
    const payload = JSON.parse(readFileSync(reportPath, "utf-8")) as {
      results?: AuditResult[];
    };
    return payload.results ?? [];
  } catch {
    return [];
  }
}

/**
 * Compute worst status for a set of results that match a given layer.
 * Returns "-" when no matching results exist.
 */
function worstStatusForLayer(
  results: AuditResult[],
  layer: string
): "PASS" | "WARN" | "FAIL" | "-" {
  const matching = results.filter((r) => r.layerName === layer);
  if (matching.length === 0) return "-";
  if (matching.some((r) => r.status === "FAIL")) return "FAIL";
  if (matching.some((r) => r.status === "WARN")) return "WARN";
  return "PASS";
}

/**
 * Compute pass rate (0–100) for a set of results that match a given layer.
 * Returns null when no matching results exist.
 */
function passRateForLayer(results: AuditResult[], layer: string): number | null {
  const matching = results.filter((r) => r.layerName === layer);
  if (matching.length === 0) return null;
  const passed = matching.filter((r) => r.status === "PASS").length;
  return (passed / matching.length) * 100;
}

/**
 * Extract the median precision in metres for a layer from a geometry-precision
 * report. Falls back to "-" when data is unavailable.
 *
 * The precision report stores `details` objects with a `median` numeric field.
 */
function precisionMedianForLayer(
  results: AuditResult[],
  layer: string
): string {
  const matching = results.filter(
    (r) =>
      r.layerName === layer &&
      r.details !== undefined &&
      typeof (r.details as { median?: unknown }).median === "number"
  );
  if (matching.length === 0) return "-";

  const medians = matching.map(
    (r) => (r.details as { median: number }).median
  );
  const avg = medians.reduce((s, v) => s + v, 0) / medians.length;
  return `${avg.toFixed(1)}m`;
}

/**
 * Convert status to a short ANSI-coloured badge.
 */
function statusBadge(status: "PASS" | "WARN" | "FAIL" | "-"): string {
  const RESET = "\x1b[0m";
  switch (status) {
    case "PASS": return "\x1b[32mPASS\x1b[0m";
    case "WARN": return "\x1b[33mWARN" + RESET;
    case "FAIL": return "\x1b[31mFAIL" + RESET;
    default: return "\x1b[2m-" + RESET;
  }
}

/**
 * Compute an overall numeric score (0–100) for a layer from all available
 * metrics.  Each metric contributes equally.  A missing metric is excluded
 * from the average (not counted as 0).
 */
function overallScore(metrics: LayerMetrics): string {
  const contributions: number[] = [];

  // Fidelity %
  if (metrics.fidelityPct !== "-") {
    const n = parseFloat(metrics.fidelityPct);
    if (!isNaN(n)) contributions.push(n);
  }

  // Spatial (PASS=100, WARN=50, FAIL=0)
  if (metrics.spatialStatus !== "-") {
    contributions.push(
      metrics.spatialStatus === "PASS" ? 100 :
      metrics.spatialStatus === "WARN" ? 50 : 0
    );
  }

  // Properties (PASS=100, WARN=50, FAIL=0)
  if (metrics.propertiesStatus !== "-") {
    contributions.push(
      metrics.propertiesStatus === "PASS" ? 100 :
      metrics.propertiesStatus === "WARN" ? 50 : 0
    );
  }

  if (contributions.length === 0) return "-";
  const avg = contributions.reduce((s, v) => s + v, 0) / contributions.length;
  return avg.toFixed(0);
}

/**
 * Print a per-layer dashboard table reading from report JSONs in `reportsDir`.
 *
 * Output format:
 *   Layer                  Fidelity  Precision  Spatial   Properties  Overall
 *   forest-age             98.0%     12.4m      PASS      PASS        94
 *
 * Missing report files display "-" for that column.
 */
export function printLayerDashboard(reportsDir: string): void {
  const RESET = "\x1b[0m";
  const BOLD = "\x1b[1m";
  const DIM = "\x1b[2m";

  // Load each report
  const loaded: Record<ReportSlot["metric"], AuditResult[]> = {
    fidelity: [],
    precision: [],
    spatial: [],
    properties: [],
  };

  for (const slot of DASHBOARD_REPORTS) {
    const p = path.join(reportsDir, slot.file);
    loaded[slot.metric] = readReportResults(p);
  }

  // Column widths
  const COL_LAYER = 26;
  const COL_FIDELITY = 10;
  const COL_PRECISION = 11;
  const COL_SPATIAL = 10;
  const COL_PROPERTIES = 12;
  const COL_OVERALL = 8;

  function pad(s: string, w: number): string {
    // Strip ANSI codes for width calculation
    const plain = s.replace(/\x1b\[[0-9;]*m/g, "");
    const pad = Math.max(0, w - plain.length);
    return s + " ".repeat(pad);
  }

  console.log("\n" + BOLD + "Layer Dashboard" + RESET);
  console.log(DIM + "─".repeat(COL_LAYER + COL_FIDELITY + COL_PRECISION + COL_SPATIAL + COL_PROPERTIES + COL_OVERALL + 2) + RESET);

  // Header
  console.log(
    BOLD +
    pad("Layer", COL_LAYER) +
    pad("Fidelity", COL_FIDELITY) +
    pad("Precision", COL_PRECISION) +
    pad("Spatial", COL_SPATIAL) +
    pad("Properties", COL_PROPERTIES) +
    pad("Overall", COL_OVERALL) +
    RESET
  );
  console.log(DIM + "─".repeat(COL_LAYER + COL_FIDELITY + COL_PRECISION + COL_SPATIAL + COL_PROPERTIES + COL_OVERALL + 2) + RESET);

  for (const layer of DASHBOARD_LAYERS) {
    const fidelityRate = passRateForLayer(loaded.fidelity, layer);
    const fidelityPct = fidelityRate !== null ? `${fidelityRate.toFixed(1)}%` : "-";

    const precisionM = precisionMedianForLayer(loaded.precision, layer);

    const spatialRaw = worstStatusForLayer(loaded.spatial, layer);
    const propertiesRaw = worstStatusForLayer(loaded.properties, layer);

    const metrics: LayerMetrics = {
      fidelityPct,
      precisionM,
      spatialStatus: spatialRaw,
      propertiesStatus: propertiesRaw,
      overall: "", // filled below
    };
    metrics.overall = overallScore(metrics);

    console.log(
      pad(layer, COL_LAYER) +
      pad(fidelityPct, COL_FIDELITY) +
      pad(precisionM, COL_PRECISION) +
      pad(statusBadge(spatialRaw), COL_SPATIAL) +
      pad(statusBadge(propertiesRaw), COL_PROPERTIES) +
      metrics.overall
    );
  }

  console.log(DIM + "─".repeat(COL_LAYER + COL_FIDELITY + COL_PRECISION + COL_SPATIAL + COL_PROPERTIES + COL_OVERALL + 2) + RESET + "\n");
}

export function saveResults(results: AuditResult[], outputPath: string): void {
  const payload = {
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      passed: results.filter((r) => r.status === "PASS").length,
      warned: results.filter((r) => r.status === "WARN").length,
      failed: results.filter((r) => r.status === "FAIL").length,
    },
    results,
  };
  try {
    writeFileSync(outputPath, JSON.stringify(payload, null, 2));
    console.log(`Results saved to ${outputPath}`);
  } catch (err) {
    console.error(
      `Warning: could not write audit results to "${outputPath}": ${(err as Error).message}. ` +
      "Results were printed to stdout above."
    );
  }

  // Archive results synchronously when archive directory exists.
  // Non-fatal — errors are logged but do not throw.
  const reportsDir = path.dirname(outputPath);
  const archiveDir = path.join(reportsDir, "archive");
  try {
    if (existsSync(archiveDir)) {
      const { archiveResults } = require("./audit-archive");
      archiveResults(reportsDir, archiveDir);
    }
  } catch (err) {
    console.error("Archive failed (non-fatal):", err);
  }
}
