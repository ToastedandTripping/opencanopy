/**
 * Contrast audit (WCAG 1.4.3) — text-zinc-500 census guard.
 *
 * text-zinc-500 on #0a0a0c is ~4.1:1, below the 4.5:1 body-text threshold.
 * The P2 a11y relay promoted every MEANINGFUL text usage to text-zinc-400
 * (~7.5:1). What's left is a short, deliberate KEEP allowlist:
 *   - icon-only controls (the zinc-500 applies to an SVG via currentColor,
 *     or to a button/link whose only content is an icon) — these meet the
 *     3:1 non-text contrast threshold, not the 4.5:1 text threshold.
 *   - a loading-spinner border (not text at all).
 *   - src/lib/layers/registry.ts's "#71717a" map paint color (not UI text).
 *   - three sites explicitly left UNSURE for Jen's call (see the relay
 *     report): MapLegend's "+N" overflow count, HeroSection's "Scroll"
 *     cue, and SearchBar's input placeholder.
 *
 * This test regenerates the census on every run (walks src/, greps for
 * "zinc-500") rather than trusting a hardcoded count, and matches KEEP
 * entries by a stable substring of the surrounding class list/line — NOT by
 * line number, which drifts as the file is edited. Any text-zinc-500 usage
 * that isn't in the allowlist fails the test — including a reverted
 * promotion (the line reappears verbatim and won't match any allowlist
 * substring for that file).
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const SRC_DIR = join(ROOT, "src");

// file path (relative to repo root, forward-slash) -> allowlisted substrings.
// A zinc-500 line in that file is permitted only if it contains at least one
// of these substrings verbatim.
const KEEP_ALLOWLIST: Record<string, string[]> = {
  "src/lib/layers/registry.ts": [
    // Map paint color, not UI text.
    '"#71717a", // zinc-500 -- unknown',
  ],
  "src/components/map/TimelineControl.tsx": [
    // Icon-only close button (X icon via currentColor).
    "rounded text-zinc-500 hover:text-white hover:bg-white/10",
  ],
  "src/components/map/MapLegend.tsx": [
    // UNSURE (left for Jen): "+N" overflow count.
    "text-[9px] text-zinc-500 leading-none",
    // Icon-only expand/collapse chevron.
    "text-zinc-500 shrink-0 transition-transform duration-200 motion-reduce:transition-none",
    // Icon-only per-layer dismiss button.
    "w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-white transition-colors shrink-0",
  ],
  "src/components/ui/StatusToast.tsx": [
    // Icon-only toast dismiss button.
    "w-4 h-4 flex items-center justify-center text-zinc-500 hover:text-white transition-colors shrink-0",
  ],
  "src/components/panels/CalculatorPanel.tsx": [
    // Icon-only equivalence-row icon container.
    "w-5 h-5 flex items-center justify-center text-zinc-500 shrink-0",
    // Icon-only close button ("Close panel").
    "w-11 h-11 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors",
  ],
  "src/components/panels/LayerPanel.tsx": [
    // Icon-only category icon.
    "w-3.5 h-3.5 shrink-0 text-zinc-500",
    // Icon-only expand/collapse chevron.
    "w-3 h-3 text-zinc-500 transition-transform duration-200",
  ],
  "src/components/ui/SearchBar.tsx": [
    // UNSURE (left for Jen): input placeholder.
    "placeholder:text-zinc-500",
    // Loading spinner border — not text.
    "border-zinc-500 border-t-zinc-300",
    // Icon-only clear-search button.
    "w-8 h-8 text-zinc-500 hover:text-zinc-300 transition-colors shrink-0",
    // Icon-only result-row marker icon.
    'className="w-4 h-4 text-zinc-500"',
  ],
  "src/components/story/HeroSection.tsx": [
    // UNSURE (left for Jen): "Scroll" cue.
    "text-[10px] text-zinc-500 uppercase tracking-[0.25em]",
  ],
  "src/app/map/page.tsx": [
    // Icon-only copy-link button (text content, when present, is emerald-400
    // "Copied", not zinc-500).
    "text-zinc-500 hover:text-white hover:bg-white/5 transition-all text-xs shrink-0",
    // Icon-only bug-report button.
    "text-zinc-500 hover:text-zinc-200 hover:bg-black/80 transition-colors",
  ],
};

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      listSourceFiles(full, out);
    } else if (/\.(tsx|ts|jsx|js)$/.test(entry) && !/\.test\.(tsx|ts|jsx|js)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function toRelPath(absPath: string): string {
  return relative(ROOT, absPath).split(sep).join("/");
}

describe("contrast audit (WCAG 1.4.3): text-zinc-500 census", () => {
  it("appears only where allowlisted (icon-only controls, map paint, or an explicit UNSURE site)", () => {
    const files = listSourceFiles(SRC_DIR);
    const violations: string[] = [];

    for (const absPath of files) {
      const relPath = toRelPath(absPath);
      if (relPath === "src/test/audit/contrast-audit.test.ts") continue; // this file
      const content = readFileSync(absPath, "utf-8");
      if (!content.includes("zinc-500")) continue;

      const allowed = KEEP_ALLOWLIST[relPath] ?? [];
      const lines = content.split("\n");
      lines.forEach((line, i) => {
        if (!line.includes("zinc-500")) return;
        const isAllowed = allowed.some((snippet) => line.includes(snippet));
        if (!isAllowed) {
          violations.push(`${relPath}:${i + 1}: ${line.trim()}`);
        }
      });
    }

    expect(
      violations,
      "Found text-zinc-500 outside the KEEP allowlist. Promote meaningful text to " +
        "text-zinc-400 (~7.5:1 on #0a0a0c), or if this is a genuine icon-only/non-text " +
        "usage, add a justified entry to KEEP_ALLOWLIST in this test:\n" +
        violations.join("\n")
    ).toEqual([]);
  });

  it("every allowlist entry still matches real code (guards the allowlist itself against drift)", () => {
    const stale: string[] = [];
    for (const [relPath, snippets] of Object.entries(KEEP_ALLOWLIST)) {
      const content = readFileSync(join(ROOT, relPath), "utf-8");
      for (const snippet of snippets) {
        if (!content.includes(snippet)) {
          stale.push(`${relPath}: allowlisted snippet no longer found -- ${snippet}`);
        }
      }
    }
    expect(stale, stale.join("\n")).toEqual([]);
  });

  it("the three explicitly-UNSURE sites are still zinc-500 (documents the open decision for Jen)", () => {
    const unsure: Array<{ file: string; snippet: string }> = [
      { file: "src/components/map/MapLegend.tsx", snippet: "text-[9px] text-zinc-500 leading-none" },
      { file: "src/components/story/HeroSection.tsx", snippet: "text-[10px] text-zinc-500 uppercase tracking-[0.25em]" },
      { file: "src/components/ui/SearchBar.tsx", snippet: "placeholder:text-zinc-500" },
    ];
    for (const { file, snippet } of unsure) {
      const content = readFileSync(join(ROOT, file), "utf-8");
      expect(content.includes(snippet), `${file}: expected UNSURE snippet -- ${snippet}`).toBe(true);
    }
  });
});
