/**
 * Text-level guard for the 2026-06-21 reduced-motion scrollama crash fix.
 *
 * Root cause then: `.story-step { min-height: auto !important; }` inside a
 * `@media (prefers-reduced-motion: reduce)` block collapsed every scroll
 * step to 0px (their only height is the inline `${scrollHeight}vh`), so
 * scrollama computed a non-finite IntersectionObserver threshold, threw in
 * .setup(), and the whole landing story collapsed for reduced-motion users.
 *
 * The behavioural guard is e2e/reduced-motion-scrollama.spec.ts, but CI runs
 * vitest only, so re-adding that one CSS line would ship green. This test
 * reads globals.css at the wire and fails if any reduced-motion block touches
 * `.story-step` at all — reduced motion is handled by the year-counter
 * hold-then-snap (scrollytelling-raf.test.ts), never by scroll geometry.
 *
 * Mutation-verified 2026-09-01: adding `.story-step { min-height: auto
 * !important; }` inside the scrollytelling reduced-motion block fails this.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const css = readFileSync(resolve(__dirname, "../../app/globals.css"), "utf-8");

/** Bodies of every `@media (prefers-reduced-motion: reduce) { … }` block. */
function reducedMotionBlocks(source: string): string[] {
  const blocks: string[] = [];
  const re = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < source.length && depth > 0) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") depth--;
      i++;
    }
    blocks.push(source.slice(start, i - 1));
  }
  return blocks;
}

describe("reduced-motion CSS never touches scroll-step geometry", () => {
  const blocks = reducedMotionBlocks(css);

  it("globals.css has reduced-motion blocks to inspect (hero + scrollytelling)", () => {
    expect(blocks.length).toBeGreaterThanOrEqual(2);
  });

  it("no reduced-motion block selects .story-step", () => {
    // Strip comments first: the scrollytelling block deliberately carries a
    // comment explaining why .story-step must not be overridden.
    const offenders = blocks
      .map((b) => b.replace(/\/\*[\s\S]*?\*\//g, ""))
      .filter((b) => /\.story-step\b/.test(b));
    expect(
      offenders,
      "a @media (prefers-reduced-motion: reduce) block styles .story-step — this collapsed the story in 2026-06 (non-finite scrollama threshold)"
    ).toHaveLength(0);
  });

  it("the scrollytelling block still documents the constraint", () => {
    expect(css).toMatch(/Do NOT override \.story-step min-height/);
  });
});
