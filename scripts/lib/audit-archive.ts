/**
 * Audit result archiving and trend tracking for the OpenCanopy tile audit pipeline.
 *
 * Bootstrap command (one-time, run manually — 558MB file, not in npm scripts):
 *   mkdir -p data/tiles/archive
 *   [ -z "$(ls -A data/tiles/archive/ 2>/dev/null)" ] && \
 *     cp data/tiles/opencanopy.pmtiles data/tiles/archive/opencanopy-20260330.pmtiles
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import path from "path";
import { execSync } from "child_process";

// ── AuditSummary interface ────────────────────────────────────────────────────

export interface AuditSummary {
  timestamp: string;
  buildHash: string | null;
  pmtilesSizeBytes: number | null;
  totalChecks: number;
  passed: number;
  warned: number;
  failed: number;
  perLayerScores: Record<string, number>;
  keyMetrics: {
    featureFidelityPercent: number | null;
    avgHausdorffZ10: number | null;
    waterOverlapCount: number | null;
    adversarialPassRate: number | null;
  };
}

// ── Metric extraction helpers ─────────────────────────────────────────────────

function getBuildHash(): string | null {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function getPmtilesSize(reportsDir: string): number | null {
  // Walk up two levels from data/reports to find data/tiles/opencanopy.pmtiles
  const projectRoot = path.resolve(reportsDir, "../../");
  const pmtilesPath = path.join(projectRoot, "data", "tiles", "opencanopy.pmtiles");
  if (!existsSync(pmtilesPath)) return null;
  try {
    const { statSync } = require("fs");
    return statSync(pmtilesPath).size;
  } catch {
    return null;
  }
}

function extractFidelityPercent(reportsDir: string): number | null {
  const filePath = path.join(reportsDir, "source-fidelity-results.json");
  if (!existsSync(filePath)) return null;
  try {
    const data = JSON.parse(readFileSync(filePath, "utf8"));
    const rate = data?.fidelityData?.f1?.foundRate;
    if (typeof rate === "number") return Math.round(rate * 10000) / 100; // → percent, 2dp
    return null;
  } catch {
    return null;
  }
}

function extractAvgHausdorffZ10(reportsDir: string): number | null {
  const filePath = path.join(reportsDir, "geometry-precision-results.json");
  if (!existsSync(filePath)) return null;
  try {
    const data = JSON.parse(readFileSync(filePath, "utf8"));
    const g1 = data?.g1_hausdorff_z10;
    if (!Array.isArray(g1) || g1.length === 0) return null;
    const means = g1
      .map((entry: { hausdorff?: { mean?: number } }) => entry?.hausdorff?.mean)
      .filter((v): v is number => typeof v === "number");
    if (means.length === 0) return null;
    const avg = means.reduce((sum, v) => sum + v, 0) / means.length;
    return Math.round(avg * 10) / 10; // 1dp
  } catch {
    return null;
  }
}

function extractWaterOverlapCount(reportsDir: string): number | null {
  const filePath = path.join(reportsDir, "spatial-results.json");
  if (!existsSync(filePath)) return null;
  try {
    const data = JSON.parse(readFileSync(filePath, "utf8"));
    if (!Array.isArray(data?.results)) return null;
    return data.results.filter(
      (r: { status: string }) => r.status === "FAIL"
    ).length;
  } catch {
    return null;
  }
}

function extractAdversarialPassRate(reportsDir: string): number | null {
  const filePath = path.join(reportsDir, "adversarial-results.json");
  if (!existsSync(filePath)) return null;
  try {
    const data = JSON.parse(readFileSync(filePath, "utf8"));
    const passed = data?.summary?.passed;
    const total = data?.summary?.total;
    if (typeof passed === "number" && typeof total === "number" && total > 0) {
      return Math.round((passed / total) * 10000) / 100; // percent, 2dp
    }
    return null;
  } catch {
    return null;
  }
}

// ── archiveResults ────────────────────────────────────────────────────────────

/**
 * Copies all .json files from reportsDir into archiveDir/{timestamp}/ and
 * generates a summary.json with key metrics extracted from those reports.
 *
 * @param reportsDir  Path to data/reports/ (or equivalent)
 * @param archiveDir  Path to data/reports/archive/
 */
export function archiveResults(reportsDir: string, archiveDir: string): void {
  const timestamp = new Date().toISOString();
  const slug = timestamp.replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const destDir = path.join(archiveDir, slug);

  mkdirSync(destDir, { recursive: true });

  // Copy all .json files from reportsDir into the timestamped subdirectory
  const jsonFiles = readdirSync(reportsDir).filter(
    (f) => f.endsWith(".json") && !f.startsWith(".")
  );

  for (const file of jsonFiles) {
    copyFileSync(path.join(reportsDir, file), path.join(destDir, file));
  }

  // Gather totals across all copied reports
  let totalChecks = 0;
  let passed = 0;
  let warned = 0;
  let failed = 0;

  for (const file of jsonFiles) {
    try {
      const data = JSON.parse(readFileSync(path.join(destDir, file), "utf8"));
      if (data?.summary) {
        totalChecks += data.summary.total ?? 0;
        passed += data.summary.passed ?? 0;
        warned += data.summary.warned ?? 0;
        failed += data.summary.failed ?? 0;
      }
    } catch {
      // Skip unparseable files — not fatal
    }
  }

  const summary: AuditSummary = {
    timestamp,
    buildHash: getBuildHash(),
    pmtilesSizeBytes: getPmtilesSize(reportsDir),
    totalChecks,
    passed,
    warned,
    failed,
    perLayerScores: {},
    keyMetrics: {
      featureFidelityPercent: extractFidelityPercent(reportsDir),
      avgHausdorffZ10: extractAvgHausdorffZ10(reportsDir),
      waterOverlapCount: extractWaterOverlapCount(reportsDir),
      adversarialPassRate: extractAdversarialPassRate(reportsDir),
    },
  };

  writeFileSync(
    path.join(destDir, "summary.json"),
    JSON.stringify(summary, null, 2)
  );
}

// ── loadSummaryTrend ──────────────────────────────────────────────────────────

/**
 * Reads summary.json files from archive subdirectories, returns them sorted
 * by timestamp ascending.
 *
 * @param archiveDir  Path to data/reports/archive/
 * @param lastN       If provided, return only the last N entries
 */
export function loadSummaryTrend(
  archiveDir: string,
  lastN?: number
): AuditSummary[] {
  if (!existsSync(archiveDir)) return [];

  const subdirs = readdirSync(archiveDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort(); // ISO timestamp slugs sort lexicographically = chronologically

  const summaries: AuditSummary[] = [];

  for (const subdir of subdirs) {
    const summaryPath = path.join(archiveDir, subdir, "summary.json");
    if (!existsSync(summaryPath)) continue;
    try {
      const data = JSON.parse(readFileSync(summaryPath, "utf8")) as AuditSummary;
      summaries.push(data);
    } catch {
      // Skip corrupted entries — not fatal
    }
  }

  if (lastN !== undefined) {
    return summaries.slice(-lastN);
  }

  return summaries;
}
