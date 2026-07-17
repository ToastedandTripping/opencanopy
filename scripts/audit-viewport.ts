/**
 * Viewport / pinch-zoom build-output assertion (P2 a11y relay, part E,
 * WCAG 1.4.4/1.4.10).
 *
 * `maximumScale: 1` blocks pinch-zoom. It's intentional on the full-screen
 * map (prevents iOS auto-zoom from disrupting pan/gesture handling) but
 * must NOT apply to the text landing page or privacy page, where a
 * low-vision user genuinely needs to zoom.
 *
 * This is deliberately a BUILD-OUTPUT assertion, not a unit test: the
 * bundled Next.js docs for this version have no documented nesting/merge
 * section for a root vs. nested-layout `viewport` export, so an
 * export-object unit test would be tautological (it would only prove the
 * export objects look the way we wrote them, not what Next actually
 * renders). This grep is the actual empirical check.
 *
 * Usage (build first -- this reads the static export output):
 *   npm run build
 *   npx tsx scripts/audit-viewport.ts
 */

import { existsSync, readFileSync } from "fs";
import path from "path";

const OUT_DIR = path.resolve(__dirname, "..", "out");

interface Expectation {
  /** Path relative to out/, e.g. "index.html" for "/". */
  file: string;
  /** Human label for output. */
  route: string;
  expectMaximumScale: boolean;
}

const EXPECTATIONS: Expectation[] = [
  { file: "index.html", route: "/", expectMaximumScale: false },
  { file: "privacy.html", route: "/privacy", expectMaximumScale: false },
  { file: "map.html", route: "/map", expectMaximumScale: true },
];

const VIEWPORT_META_RE = /<meta name="viewport"[^>]*content="([^"]*)"[^>]*\/?>/;

function main(): void {
  if (!existsSync(OUT_DIR)) {
    console.error(
      `✗ ${OUT_DIR} does not exist. Run \`npm run build\` first (static export), then re-run this script.`
    );
    process.exit(1);
  }

  let failures = 0;

  for (const { file, route, expectMaximumScale } of EXPECTATIONS) {
    const filePath = path.join(OUT_DIR, file);
    if (!existsSync(filePath)) {
      console.error(`✗ ${route}: expected build output ${file} not found`);
      failures++;
      continue;
    }

    const html = readFileSync(filePath, "utf-8");
    const match = html.match(VIEWPORT_META_RE);
    if (!match) {
      console.error(`✗ ${route}: no <meta name="viewport"> tag found in ${file}`);
      failures++;
      continue;
    }

    const content = match[1];
    const hasMaximumScale = /maximum-scale/.test(content);

    if (hasMaximumScale !== expectMaximumScale) {
      console.error(
        `✗ ${route}: expected maximum-scale ${expectMaximumScale ? "PRESENT" : "ABSENT"}, ` +
          `got content="${content}"`
      );
      failures++;
      continue;
    }

    console.log(
      `✓ ${route}: maximum-scale ${expectMaximumScale ? "present" : "absent"} as expected (content="${content}")`
    );
  }

  if (failures > 0) {
    console.error(`\n${failures} viewport expectation(s) failed.`);
    process.exit(1);
  }

  console.log("\nAll viewport expectations passed.");
}

main();
