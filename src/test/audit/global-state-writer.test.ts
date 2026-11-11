/**
 * Source-text guards for the `currentYear` global state (R1-02).
 *
 * 18. Exactly one non-test file under src/ names `setGlobalStateProperty`:
 *     src/hooks/useGlobalStateYear.ts. Two writers for one value is how the
 *     onLoad default overwrote a year chosen before load. Matching the bare
 *     identifier (not `.setGlobalStateProperty(`) catches optional calls,
 *     bracket access and aliases; an identifier followed by `:` (a type or
 *     object key) does not count.
 * 19. No `on("load"`, `once("load"`, `onLoad=` or `isStyleLoaded(` in
 *     src/components/map/** or src/app/map/** (Amendment A): readiness is
 *     `onStyleReady` (style JSON parsed). `isStyleLoaded()` is false whenever
 *     a tile is in flight; `load` did not fire on production until the
 *     visitor interacted. StoryMap (src/components/story) is lane S, parked.
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

  it("19: no load-based or isStyleLoaded() readiness under /map", () => {
    const READINESS_RE = [
      /\.on\(\s*["'`]load["'`]/,
      /\.once\(\s*["'`]load["'`]/,
      /\bonLoad=/,
      /\bisStyleLoaded\(/,
    ];
    // The patterns must be able to fire.
    expect(READINESS_RE[0].test('map.on("load", go)')).toBe(true);
    expect(READINESS_RE[1].test("map.once('load', go)")).toBe(true);
    expect(READINESS_RE[2].test("<Map onLoad={x}>")).toBe(true);
    expect(READINESS_RE[3].test("if (map.isStyleLoaded()) go()")).toBe(true);
    expect(READINESS_RE[0].test('map.on("style.load", go)')).toBe(false);

    const files = [
      ...walk(resolve(SRC, "components/map")),
      ...walk(resolve(SRC, "app/map")),
    ].filter(isNonTest);
    expect(files.map((f) => relative(REPO, f).split("\\").join("/"))).toContain(
      "src/components/map/DataLayer.tsx",
    );
    const offenders: string[] = [];
    for (const f of files) {
      const text = stripComments(readFileSync(f, "utf-8"));
      for (const re of READINESS_RE) {
        if (re.test(text)) offenders.push(`${relative(REPO, f).split("\\").join("/")} ${re}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
