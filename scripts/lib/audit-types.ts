/**
 * Shared types and output utilities for the OpenCanopy tile audit pipeline.
 */

import { existsSync, writeFileSync } from "fs";
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

  // Fire-and-forget: archive results when archive directory exists.
  // Non-fatal — errors are logged but do not throw.
  const reportsDir = path.dirname(outputPath);
  const archiveDir = path.join(reportsDir, "archive");
  if (existsSync(archiveDir)) {
    // Dynamic import keeps this synchronous for callers while deferring
    // the heavier archiving work to the next event loop tick.
    Promise.resolve().then(async () => {
      try {
        const { archiveResults } = await import("./audit-archive");
        archiveResults(reportsDir, archiveDir);
      } catch (err) {
        console.error(
          `Warning: archive step failed: ${(err as Error).message}`
        );
      }
    });
  }
}
