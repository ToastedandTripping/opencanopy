/**
 * Shared types and output utilities for the OpenCanopy tile audit pipeline.
 */

import { writeFileSync } from "fs";

export interface AuditResult {
  check: string;
  status: "PASS" | "WARN" | "FAIL";
  message: string;
  details?: unknown;
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

export function saveResults(results: AuditResult[], path: string): void {
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
  writeFileSync(path, JSON.stringify(payload, null, 2));
  console.log(`Results saved to ${path}`);
}
