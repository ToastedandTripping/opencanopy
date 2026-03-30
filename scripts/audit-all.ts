/**
 * OpenCanopy Unified Audit Runner
 *
 * Runs all 7 audits in sequence, streaming output in real time.
 *
 * Audit sequence:
 *   1. audit:tiles         — tile presence and layer coverage
 *   2. audit:fidelity      — source-fidelity (property/feature preservation)
 *   3. audit:spatial       — spatial/water-body checks
 *   4. audit:adversarial   — adversarial property checks
 *   5. audit:property-deep — deep per-layer property validation
 *   6. audit:precision     — geometry precision
 *   7. audit:temporal      — temporal consistency
 *
 * Flags:
 *   --ci              Exit non-zero if any audit exits with FAIL.
 *   --fail-on-warn    Also exit non-zero on WARN (requires --ci).
 *
 * Without flags the runner is informational and always exits 0.
 *
 * Usage:
 *   npx tsx scripts/audit-all.ts
 *   npx tsx scripts/audit-all.ts --ci
 *   npx tsx scripts/audit-all.ts --ci --fail-on-warn
 */

import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");

// ── CLI flags ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const CI_MODE = args.includes("--ci");
const FAIL_ON_WARN = args.includes("--fail-on-warn");

// ── ANSI colours ──────────────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
};

// ── Audit sequence ────────────────────────────────────────────────────────────

interface AuditEntry {
  label: string;
  script: string;
  reportFile?: string;
}

const AUDITS: AuditEntry[] = [
  {
    label: "Tiles",
    script: "audit:tiles",
    reportFile: "tile-check-results.json",
  },
  {
    label: "Fidelity",
    script: "audit:fidelity",
    reportFile: "source-fidelity-results.json",
  },
  {
    label: "Spatial",
    script: "audit:spatial",
    reportFile: "spatial-results.json",
  },
  {
    label: "Adversarial",
    script: "audit:adversarial",
    reportFile: "adversarial-results.json",
  },
  {
    label: "Property-Deep",
    script: "audit:property-deep",
    reportFile: "property-deep-results.json",
  },
  {
    label: "Precision",
    script: "audit:precision",
    reportFile: "geometry-precision-results.json",
  },
  {
    label: "Temporal",
    script: "audit:temporal",
    reportFile: "temporal-results.json",
  },
];

// ── Result tracking ───────────────────────────────────────────────────────────

interface RunResult {
  label: string;
  exitCode: number;
  /** Highest severity found in the report JSON, if readable. */
  worstStatus: "PASS" | "WARN" | "FAIL" | "UNKNOWN";
}

function readWorstStatus(reportFile: string): "PASS" | "WARN" | "FAIL" | "UNKNOWN" {
  const reportPath = path.resolve(PROJECT_ROOT, "data", "reports", reportFile);
  if (!existsSync(reportPath)) return "UNKNOWN";

  try {
    const payload = JSON.parse(readFileSync(reportPath, "utf-8")) as {
      summary?: { failed?: number; warned?: number };
    };
    if ((payload.summary?.failed ?? 0) > 0) return "FAIL";
    if ((payload.summary?.warned ?? 0) > 0) return "WARN";
    return "PASS";
  } catch {
    return "UNKNOWN";
  }
}

// ── Runner ────────────────────────────────────────────────────────────────────

function runAudit(audit: AuditEntry): RunResult {
  console.log(
    `\n${C.bold}${C.cyan}${"─".repeat(60)}${C.reset}`
  );
  console.log(
    `${C.bold}Running: ${audit.label} (npm run ${audit.script})${C.reset}`
  );
  console.log(`${C.cyan}${"─".repeat(60)}${C.reset}\n`);

  const result = spawnSync("npm", ["run", audit.script], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    shell: false,
  });

  const exitCode = result.status ?? 1;

  const worstStatus = audit.reportFile
    ? readWorstStatus(audit.reportFile)
    : exitCode === 0
    ? "PASS"
    : "FAIL";

  return { label: audit.label, exitCode, worstStatus };
}

// ── Summary table ─────────────────────────────────────────────────────────────

function printSummary(runResults: RunResult[]): void {
  console.log(
    `\n${C.bold}${"═".repeat(60)}${C.reset}`
  );
  console.log(`${C.bold}AUDIT SUITE SUMMARY${C.reset}`);
  console.log(`${C.bold}${"═".repeat(60)}${C.reset}\n`);

  const colWidth = 20;
  const header =
    `${"Audit".padEnd(colWidth)}${"Exit".padStart(6)}${"Status".padStart(10)}`;
  console.log(C.dim + header + C.reset);
  console.log(C.dim + "─".repeat(colWidth + 16) + C.reset);

  let anyFail = false;
  let anyWarn = false;

  for (const r of runResults) {
    let statusColor: string;
    switch (r.worstStatus) {
      case "PASS":
        statusColor = C.green;
        break;
      case "WARN":
        statusColor = C.yellow;
        anyWarn = true;
        break;
      case "FAIL":
        statusColor = C.red;
        anyFail = true;
        break;
      default:
        statusColor = C.dim;
        break;
    }

    const exitDisplay = r.exitCode === 0 ? C.green + "0" + C.reset : C.red + String(r.exitCode) + C.reset;
    const statusDisplay = `${statusColor}${r.worstStatus}${C.reset}`;

    // Strip ANSI codes before measuring, then pad with spaces to preserve column alignment.
    const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");
    const padStart = (s: string, w: number): string => {
      const plain = stripAnsi(s);
      const spaces = Math.max(0, w - plain.length);
      return " ".repeat(spaces) + s;
    };

    console.log(
      `${r.label.padEnd(colWidth)}${padStart(exitDisplay, 6)}${padStart(statusDisplay, 10)}`
    );
  }

  console.log(C.dim + "─".repeat(colWidth + 16) + C.reset);

  if (anyFail) {
    console.log(
      `\n${C.red}${C.bold}SUITE FAILED${C.reset} — one or more audits have FAIL status.\n`
    );
  } else if (anyWarn) {
    console.log(
      `\n${C.yellow}${C.bold}SUITE PASSED WITH WARNINGS${C.reset} — review WARN items.\n`
    );
  } else {
    console.log(
      `\n${C.green}${C.bold}SUITE PASSED${C.reset} — all audits clean.\n`
    );
  }

  // ── CI exit code logic ─────────────────────────────────────────────────────
  if (CI_MODE) {
    if (anyFail) {
      process.exit(1);
    }
    if (FAIL_ON_WARN && anyWarn) {
      process.exit(1);
    }
  }
  // Without --ci, always exit 0 (informational mode).
}

// ── Entry point ───────────────────────────────────────────────────────────────

function main(): void {
  console.log(
    `\n${C.bold}OpenCanopy Unified Audit Suite${C.reset}`
  );
  if (CI_MODE) {
    console.log(
      `${C.yellow}CI mode enabled.${FAIL_ON_WARN ? " Warnings treated as failures." : ""}${C.reset}`
    );
  }

  const runResults: RunResult[] = [];

  for (const audit of AUDITS) {
    const result = runAudit(audit);
    runResults.push(result);
  }

  printSummary(runResults);
}

main();
