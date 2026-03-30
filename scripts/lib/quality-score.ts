/**
 * Quality scoring and comparison utilities for the tippecanoe parameter sweep.
 *
 * Provides:
 *   - ConfigMetrics: raw measurements per tile config
 *   - computeQualityScore: weighted 0-100 score
 *   - findParetoOptimal: Pareto-front detection across configs
 *   - formatComparisonTable: ASCII side-by-side comparison (current vs test)
 *   - formatSweepTable: full ranked sweep results table
 */

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ConfigMetrics {
  /** % of polygon edges aligned with tile boundaries at z7 (artifact indicator) */
  artifactPercentZ7: number;
  /** % of polygon edges aligned with tile boundaries at z9 (artifact indicator) */
  artifactPercentZ9: number;
  /**
   * % of source NDJSON features that appear in test tiles.
   * Measured as: (features in tile area at z10) / (NDJSON features in same bbox) * 100
   */
  featurePreservationPercent: number;
  /** Size of the largest single tile in MB */
  maxTileSizeMB: number;
  /** Total PMTiles archive size in MB */
  totalSizeMB: number;
}

export interface ScoredConfig {
  name: string;
  metrics: ConfigMetrics;
  score: number;
  pareto: boolean;
}

// ── Scoring ────────────────────────────────────────────────────────────────────

/**
 * Size normalization context for relative scoring.
 * When provided, size scores are computed relative to the sweep set rather
 * than against fixed absolute thresholds (which are too large for test-region files).
 */
export interface SizeRange {
  minTotalSizeMB: number;
  maxTotalSizeMB: number;
  minMaxTileSizeMB: number;
  maxMaxTileSizeMB: number;
}

/**
 * Compute a weighted quality score (0-100) from ConfigMetrics.
 *
 * Higher is better. Weights:
 *   - Boundary artifacts (z7+z9 average): 0.35 (lower % = better)
 *   - Feature preservation:               0.25 (higher % = better)
 *   - Inverse max tile size:              0.20 (smaller tile = better)
 *   - Inverse total archive size:         0.20 (smaller archive = better)
 *
 * Without sizeRange: absolute thresholds (50 MB tile / 500 MB total).
 * With sizeRange: relative scoring across the sweep set — avoids all configs
 * scoring ~1.0 on size when test-region files are 5-50 MB (far below 500 MB ceiling).
 *
 * sizeScore = 1 - (thisSize - minSize) / (maxSize - minSize)
 * When all configs are the same size, scores 0.5 for all (neutral).
 */
export function computeQualityScore(metrics: ConfigMetrics, sizeRange?: SizeRange): number {
  const avgArtifact = (metrics.artifactPercentZ7 + metrics.artifactPercentZ9) / 2;

  // Artifact: 0% artifact → score 1.0, 20% artifact → score 0.0
  const artifactScore = Math.max(0, 1 - avgArtifact / 20);

  // Feature preservation: 100% → score 1.0, 0% → score 0.0
  const preservationScore = Math.min(100, Math.max(0, metrics.featurePreservationPercent)) / 100;

  let tileScore: number;
  let totalScore: number;

  if (sizeRange) {
    // Relative scoring: normalize within the sweep set
    const tileRange = sizeRange.maxMaxTileSizeMB - sizeRange.minMaxTileSizeMB;
    tileScore = Math.max(0, Math.min(1, tileRange > 0
      ? 1 - (metrics.maxTileSizeMB - sizeRange.minMaxTileSizeMB) / tileRange
      : 0.5));

    const totalRange = sizeRange.maxTotalSizeMB - sizeRange.minTotalSizeMB;
    totalScore = Math.max(0, Math.min(1, totalRange > 0
      ? 1 - (metrics.totalSizeMB - sizeRange.minTotalSizeMB) / totalRange
      : 0.5));
  } else {
    // Absolute fallback thresholds (suitable for full-dataset production builds)
    // Max tile size: 0 MB → score 1.0, 50 MB → score 0.0
    tileScore = Math.max(0, 1 - metrics.maxTileSizeMB / 50);
    // Total archive size: 0 MB → score 1.0, 500 MB → score 0.0
    totalScore = Math.max(0, 1 - metrics.totalSizeMB / 500);
  }

  const raw =
    artifactScore * 0.35 +
    preservationScore * 0.25 +
    tileScore * 0.20 +
    totalScore * 0.20;

  return Math.round(raw * 100);
}

/**
 * Build a SizeRange from an array of ConfigMetrics for use in relative scoring.
 */
export function buildSizeRange(metrics: ConfigMetrics[]): SizeRange {
  if (metrics.length === 0) {
    return { minTotalSizeMB: 0, maxTotalSizeMB: 0, minMaxTileSizeMB: 0, maxMaxTileSizeMB: 0 };
  }
  return {
    minTotalSizeMB: Math.min(...metrics.map((m) => m.totalSizeMB)),
    maxTotalSizeMB: Math.max(...metrics.map((m) => m.totalSizeMB)),
    minMaxTileSizeMB: Math.min(...metrics.map((m) => m.maxTileSizeMB)),
    maxMaxTileSizeMB: Math.max(...metrics.map((m) => m.maxTileSizeMB)),
  };
}

// ── Pareto ─────────────────────────────────────────────────────────────────────

/**
 * "Better" means: lower artifact%, higher preservation%, smaller maxTile, smaller total.
 * Config A dominates B if A is >= B on ALL metrics (i.e. no worse on any).
 * The Pareto-optimal set = configs not dominated by any other.
 */
function dominates(a: ConfigMetrics, b: ConfigMetrics): boolean {
  // Lower artifact% is better → a dominates if a's artifact <= b's artifact
  const aAvg = (a.artifactPercentZ7 + a.artifactPercentZ9) / 2;
  const bAvg = (b.artifactPercentZ7 + b.artifactPercentZ9) / 2;

  return (
    aAvg <= bAvg &&
    a.featurePreservationPercent >= b.featurePreservationPercent &&
    a.maxTileSizeMB <= b.maxTileSizeMB &&
    a.totalSizeMB <= b.totalSizeMB
  );
}

/**
 * Given an array of named configs, return the names of those in the Pareto-optimal set.
 * A config is Pareto-optimal if no other config dominates it strictly
 * (i.e., is better on at least one metric and no worse on the others).
 */
export function findParetoOptimal(
  configs: Array<{ name: string; metrics: ConfigMetrics }>
): string[] {
  const pareto: string[] = [];

  for (let i = 0; i < configs.length; i++) {
    let dominated = false;
    for (let j = 0; j < configs.length; j++) {
      if (i === j) continue;
      // j dominates i if j is at least as good on ALL metrics AND strictly better on at least one
      if (dominates(configs[j].metrics, configs[i].metrics)) {
        // Check strict dominance: at least one metric where j is strictly better
        const jAvg = (configs[j].metrics.artifactPercentZ7 + configs[j].metrics.artifactPercentZ9) / 2;
        const iAvg = (configs[i].metrics.artifactPercentZ7 + configs[i].metrics.artifactPercentZ9) / 2;
        const strictlyBetter =
          jAvg < iAvg ||
          configs[j].metrics.featurePreservationPercent > configs[i].metrics.featurePreservationPercent ||
          configs[j].metrics.maxTileSizeMB < configs[i].metrics.maxTileSizeMB ||
          configs[j].metrics.totalSizeMB < configs[i].metrics.totalSizeMB;

        if (strictlyBetter) {
          dominated = true;
          break;
        }
      }
    }
    if (!dominated) {
      pareto.push(configs[i].name);
    }
  }

  return pareto;
}

// ── Table Formatting ───────────────────────────────────────────────────────────

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
};

function pad(s: string, width: number, align: "left" | "right" = "left"): string {
  const plain = s.replace(/\x1b\[[0-9;]*m/g, ""); // strip ANSI for length calc
  const padding = Math.max(0, width - plain.length);
  return align === "right"
    ? " ".repeat(padding) + s
    : s + " ".repeat(padding);
}

function fmt(n: number, decimals = 1): string {
  return n.toFixed(decimals);
}

function delta(current: number, test: number, lowerIsBetter: boolean): string {
  const diff = test - current;
  if (Math.abs(diff) < 0.01) return ANSI.dim + "(=)" + ANSI.reset;
  const better = lowerIsBetter ? diff < 0 : diff > 0;
  const arrow = diff > 0 ? "+" : "";
  const color = better ? ANSI.green : ANSI.yellow;
  return color + arrow + fmt(diff) + ANSI.reset;
}

/**
 * Format a side-by-side ASCII comparison table.
 *
 * @param current  Metrics for current production config
 * @param test     Metrics for the test config
 * @param params   Human-readable param string for the test config (e.g. "sO=6 sD=4 buf=16")
 */
export function formatComparisonTable(
  current: ConfigMetrics,
  test: ConfigMetrics,
  params: string
): string {
  const W = 60;
  const divider = "─".repeat(W);
  const cols = [28, 12, 12, 8];

  function row(label: string, cur: string, tst: string, chg: string): string {
    return (
      "│ " +
      pad(label, cols[0]) +
      pad(cur, cols[1], "right") +
      pad(tst, cols[2], "right") +
      pad(chg, cols[3], "right") +
      " │"
    );
  }

  const lines: string[] = [
    "",
    ANSI.bold + "Tile Config Comparison" + ANSI.reset,
    "  Test params: " + ANSI.cyan + params + ANSI.reset,
    "┌" + "─".repeat(W) + "┐",
    row("Metric", "Current", "Test", "Delta"),
    "├" + divider + "┤",
    row(
      "Artifact % z7",
      fmt(current.artifactPercentZ7) + "%",
      fmt(test.artifactPercentZ7) + "%",
      delta(current.artifactPercentZ7, test.artifactPercentZ7, true)
    ),
    row(
      "Artifact % z9",
      fmt(current.artifactPercentZ9) + "%",
      fmt(test.artifactPercentZ9) + "%",
      delta(current.artifactPercentZ9, test.artifactPercentZ9, true)
    ),
    row(
      "Feature preservation",
      fmt(current.featurePreservationPercent) + "%",
      fmt(test.featurePreservationPercent) + "%",
      delta(current.featurePreservationPercent, test.featurePreservationPercent, false)
    ),
    row(
      "Max tile size",
      fmt(current.maxTileSizeMB) + " MB",
      fmt(test.maxTileSizeMB) + " MB",
      delta(current.maxTileSizeMB, test.maxTileSizeMB, true)
    ),
    row(
      "Total archive size",
      fmt(current.totalSizeMB) + " MB",
      fmt(test.totalSizeMB) + " MB",
      delta(current.totalSizeMB, test.totalSizeMB, true)
    ),
    "├" + divider + "┤",
    row(
      "Quality score",
      String(computeQualityScore(current)),
      String(computeQualityScore(test)),
      delta(computeQualityScore(current), computeQualityScore(test), false)
    ),
    "└" + "─".repeat(W) + "┘",
    "",
  ];

  return lines.join("\n");
}

/**
 * Format the full ranked sweep results table.
 * Configs are expected to be pre-sorted (best score first).
 * Pareto-optimal configs are marked with ★ PARETO.
 */
export function formatSweepTable(configs: ScoredConfig[]): string {
  const W = 88;
  const divider = "─".repeat(W);

  const cols = [22, 8, 9, 9, 14, 12, 12, 8];

  function row(
    name: string,
    score: string,
    artZ7: string,
    artZ9: string,
    preserve: string,
    maxTile: string,
    total: string,
    pareto: string
  ): string {
    return (
      "│ " +
      pad(name, cols[0]) +
      pad(score, cols[1], "right") +
      pad(artZ7, cols[2], "right") +
      pad(artZ9, cols[3], "right") +
      pad(preserve, cols[4], "right") +
      pad(maxTile, cols[5], "right") +
      pad(total, cols[6], "right") +
      pad(pareto, cols[7], "right") +
      " │"
    );
  }

  const lines: string[] = [
    "",
    ANSI.bold + "Tippecanoe Parameter Sweep Results" + ANSI.reset,
    `  ${configs.length} configurations tested, ranked by quality score`,
    "┌" + "─".repeat(W) + "┐",
    row("Config", "Score", "Art%Z7", "Art%Z9", "Preserve%", "MaxTile", "Total", "Pareto"),
    "├" + divider + "┤",
  ];

  for (const c of configs) {
    const paretoStr = c.pareto
      ? ANSI.green + "★ PARETO" + ANSI.reset
      : "";

    const scoreStr = c.score >= 80
      ? ANSI.green + String(c.score) + ANSI.reset
      : c.score >= 60
      ? ANSI.yellow + String(c.score) + ANSI.reset
      : String(c.score);

    const nameStr = c.pareto
      ? ANSI.bold + c.name + ANSI.reset
      : c.name;

    lines.push(
      row(
        nameStr,
        scoreStr,
        fmt(c.metrics.artifactPercentZ7) + "%",
        fmt(c.metrics.artifactPercentZ9) + "%",
        fmt(c.metrics.featurePreservationPercent) + "%",
        fmt(c.metrics.maxTileSizeMB) + " MB",
        fmt(c.metrics.totalSizeMB) + " MB",
        paretoStr
      )
    );
  }

  lines.push("└" + "─".repeat(W) + "┘");
  lines.push("");

  const paretoCount = configs.filter((c) => c.pareto).length;
  if (paretoCount > 0) {
    lines.push(
      ANSI.green + `★ ${paretoCount} Pareto-optimal config(s) — not dominated by any other tested configuration.` + ANSI.reset
    );
    lines.push("");
  }

  return lines.join("\n");
}
