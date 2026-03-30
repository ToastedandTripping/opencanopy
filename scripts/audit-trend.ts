/**
 * OpenCanopy Audit Trend Report
 *
 * Reads archived audit summaries and prints a columnar trend table showing
 * key metrics over time.
 *
 * Usage:
 *   npx tsx scripts/audit-trend.ts
 *   npm run audit:trend
 *
 * Example output:
 *   Date        Fidelity%  Hausdorff(m)  WaterOverlap  Adversarial  Score
 *   2026-03-30  99.2%      12.4m         0             9/9          96
 */

import path from "path";
import { loadSummaryTrend } from "./lib/audit-archive";
import type { AuditSummary } from "./lib/audit-archive";

// ── Configuration ─────────────────────────────────────────────────────────────

const ARCHIVE_DIR = path.resolve(__dirname, "../data/reports/archive");

// ── Formatting helpers ────────────────────────────────────────────────────────

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

function formatDate(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 10); // YYYY-MM-DD
}

function formatFidelity(v: number | null): string {
  if (v === null) return "--";
  return `${v.toFixed(1)}%`;
}

function formatHausdorff(v: number | null): string {
  if (v === null) return "--";
  return `${v.toFixed(1)}m`;
}

function formatWaterOverlap(v: number | null): string {
  if (v === null) return "--";
  return String(v);
}

function formatAdversarial(summary: AuditSummary): string {
  // Reconstruct passed/total from passRate if we have it, otherwise use totals
  const rate = summary.keyMetrics.adversarialPassRate;
  if (rate === null) return "--";
  // passRate is stored as a percent; reconstruct approximate fraction from totals
  // We show the raw percent as a fraction of total checks for adversarial checks.
  // Since we don't store the raw passed/total for adversarial separately in AuditSummary,
  // display as "XX.X%"
  return `${rate.toFixed(1)}%`;
}

function computeOverallScore(summary: AuditSummary): string {
  if (summary.totalChecks === 0) return "--";
  const score = Math.round((summary.passed / summary.totalChecks) * 100);
  return String(score);
}

function colorScore(score: string): string {
  const n = parseInt(score, 10);
  if (isNaN(n)) return score;
  if (n >= 90) return COLORS.green + score + COLORS.reset;
  if (n >= 70) return COLORS.yellow + score + COLORS.reset;
  return COLORS.red + score + COLORS.reset;
}

function pad(str: string, width: number): string {
  // Strip ANSI codes for length measurement
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, "");
  const extra = str.length - stripped.length; // ANSI bytes don't count toward visible width
  return str.padEnd(width + extra);
}

// ── Main ──────────────────────────────────────────────────────────────────────

const summaries = loadSummaryTrend(ARCHIVE_DIR);

if (summaries.length === 0) {
  console.log(
    `\nNo archived audit summaries found in ${ARCHIVE_DIR}.\n` +
      "Run the audit pipeline first to generate data.\n"
  );
  process.exit(0);
}

// Column widths
const COL = {
  date: 12,
  fidelity: 11,
  hausdorff: 14,
  water: 14,
  adversarial: 13,
  score: 6,
};

const header =
  COLORS.bold +
  "Date".padEnd(COL.date) +
  "Fidelity%".padEnd(COL.fidelity) +
  "Hausdorff(m)".padEnd(COL.hausdorff) +
  "WaterOverlap".padEnd(COL.water) +
  "Adversarial".padEnd(COL.adversarial) +
  "Score" +
  COLORS.reset;

const divider =
  COLORS.dim + "─".repeat(COL.date + COL.fidelity + COL.hausdorff + COL.water + COL.adversarial + COL.score) + COLORS.reset;

console.log("\n" + COLORS.bold + "OpenCanopy Audit Trend" + COLORS.reset);
console.log(divider);
console.log(header);
console.log(divider);

for (const summary of summaries) {
  const date = formatDate(summary.timestamp);
  const fidelity = formatFidelity(summary.keyMetrics.featureFidelityPercent);
  const hausdorff = formatHausdorff(summary.keyMetrics.avgHausdorffZ10);
  const water = formatWaterOverlap(summary.keyMetrics.waterOverlapCount);
  const adversarial = formatAdversarial(summary);
  const score = computeOverallScore(summary);
  const coloredScore = colorScore(score);

  const line =
    pad(date, COL.date) +
    pad(fidelity, COL.fidelity) +
    pad(hausdorff, COL.hausdorff) +
    pad(water, COL.water) +
    pad(adversarial, COL.adversarial) +
    coloredScore;

  console.log(line);
}

console.log(divider);
console.log(
  COLORS.dim +
    `${summaries.length} audit run(s) archived. Latest: ${formatDate(summaries[summaries.length - 1].timestamp)}` +
    COLORS.reset +
    "\n"
);
