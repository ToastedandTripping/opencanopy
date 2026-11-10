/**
 * Source-text guards for the `currentYear` global state (R1-02).
 *
 * 18. Exactly one non-test file under src/ names `setGlobalStateProperty`:
 *     src/hooks/useGlobalStateYear.ts. Two writers for one value is how the
 *     onLoad default overwrote a year chosen before load. Matching the bare
 *     identifier (not `.setGlobalStateProperty(`) catches optional calls,
 *     bracket access and aliases; an identifier followed by `:` (a type or
 *     object key) does not count.
 * 19. Inside CanopyMap's `onLoad` body, `onStyleLoad()` comes before the
 *     terrain block (`TERRAIN_SOURCE`), so a throw there cannot skip the only
 *     write of the year on load. The rendered tests cannot see this ordering:
 *     the terrain block never runs without the MapTiler key.
 *
 * Both guards strip // and block comments before matching. "Non-test"
 * excludes src/test/** and any *.test.* file.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative, resolve } from "path";

const SRC = resolve(__dirname, "../..");
const REPO = resolve(SRC, "..");

/**
 * Strip block and line comments, leaving string literals intact. A small
 * scanner rather than a regex so `"https://..."` inside a string is not taken
 * for a line comment.
 */
function stripComments(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      out += " ";
      continue;
    }
    if (c === "/" && next === "/") {
      const end = source.indexOf("\n", i + 2);
      i = end === -1 ? n : end;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i++;
      while (i < n && source[i] !== quote) {
        if (source[i] === "\\") {
          out += source[i] + (source[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += source[i];
        i++;
      }
      if (i < n) out += source[i];
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(name)) acc.push(full);
  }
  return acc;
}

function isNonTest(file: string): boolean {
  const rel = relative(SRC, file).split("\\").join("/");
  if (rel.startsWith("test/")) return false;
  if (/\.test\./.test(rel)) return false;
  return true;
}

const WRITER_RE = /\bsetGlobalStateProperty\b(?!\s*:)/;

describe("currentYear global state has one writer", () => {
  it("stripComments removes comments but keeps strings", () => {
    const src = 'a(); // setGlobalStateProperty\n/* setGlobalStateProperty */ b("//x");';
    const stripped = stripComments(src);
    expect(stripped).not.toMatch(WRITER_RE);
    expect(stripped).toContain('b("//x")');
    expect(stripComments("map.setGlobalStateProperty?.(1)")).toMatch(WRITER_RE);
    expect(stripComments("{ setGlobalStateProperty: fn }")).not.toMatch(WRITER_RE);
  });

  it("18: only src/hooks/useGlobalStateYear.ts names setGlobalStateProperty", () => {
    const files = walk(SRC).filter(isNonTest);
    // The scan must have something to find: the hook itself is a non-test file.
    expect(files.length).toBeGreaterThan(50);
    const writers = files
      .filter((f) => WRITER_RE.test(stripComments(readFileSync(f, "utf-8"))))
      .map((f) => relative(REPO, f).split("\\").join("/"));
    expect(writers).toEqual(["src/hooks/useGlobalStateYear.ts"]);
  });

  it("19: CanopyMap's onLoad calls onStyleLoad() before the terrain block", () => {
    const source = stripComments(
      readFileSync(resolve(SRC, "components/map/CanopyMap.tsx"), "utf-8"),
    );
    const start = source.indexOf("const onLoad = useCallback(");
    expect(start).toBeGreaterThan(-1);
    // The body runs to the useCallback's closing `}, [` deps list.
    const end = source.indexOf("}, [", start);
    expect(end).toBeGreaterThan(start);
    const body = source.slice(start, end);
    const call = body.indexOf("onStyleLoad()");
    const terrain = body.indexOf("TERRAIN_SOURCE");
    expect(call).toBeGreaterThan(-1);
    expect(terrain).toBeGreaterThan(-1);
    expect(call).toBeLessThan(terrain);
  });
});
