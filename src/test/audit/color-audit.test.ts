/**
 * Part B — Check 11: Raster-to-Vector Color Consistency
 *
 * When zooming in on the forest-age layer, MapLibre transitions from:
 *   - Raster overview tiles (built by build-raster-tiles.py) at z4-z8
 *   - PMTiles vector fill layer at z9+ (with registry paint colors)
 *
 * Single source of truth: src/lib/layers/forest-age-palette.json
 *   - build-raster-tiles.py reads this file at runtime (forest-age theme +
 *     per-class isolation themes derive all hex values from it)
 *   - registry.ts imports this file and uses the values in fill-color expressions
 *
 * If either side diverges from the palette, this audit catches it.
 *
 * Cross-language guard:
 *   The palette JSON is the authority for BOTH sides. The audit:
 *   1. Verifies registry vector colors match palette exactly (distance == 0)
 *   2. Parses build-raster-tiles.py to confirm it imports/reads the palette
 *      file (not hardcoded colors) and has four isolation themes
 *   3. Asserts actual RGBA tuples from build_themes() (via --dump-themes) match
 *      the palette exactly — per-channel equality, alpha included; isolation
 *      themes: target class = canonical RGBA at alpha 200, all others = [0,0,0,0]
 *
 * This is NOT a tautology: the registry's fill-color expression is derived
 * independently by TypeScript's module resolution; if someone replaces the
 * palette import with a hardcoded value, tests 1 + 3 will catch the drift.
 * The Python dump (test 3) catches drift on the script side by executing the
 * real build_themes() function rather than parsing string literals.
 */

import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { LAYER_REGISTRY } from "@/lib/layers/registry";
import FOREST_AGE_PALETTE from "@/lib/layers/forest-age-palette.json";

// ── Color utilities ───────────────────────────────────────────────────────────

interface RGB {
  r: number;
  g: number;
  b: number;
}

/** Parse a 6-character hex color string (#rrggbb) into {r, g, b} (0-255). */
function parseHex(hex: string): RGB {
  const h = hex.replace("#", "");
  if (h.length !== 6) throw new Error(`Invalid hex color: ${hex}`);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

/**
 * Euclidean RGB distance (0-441.7 max).
 * Simple but sufficient for detecting large color divergences.
 * A distance > 50 is perceptually noticeable; > 100 is jarring.
 */
function rgbDistance(a: RGB, b: RGB): number {
  return Math.sqrt(
    Math.pow(a.r - b.r, 2) +
      Math.pow(a.g - b.g, 2) +
      Math.pow(a.b - b.b, 2)
  );
}

/**
 * Relative luminance (WCAG 2.1 formula).
 * Returns a value in [0, 1] where 0 = black, 1 = white.
 */
function relativeLuminance(c: RGB): number {
  const linearize = (v: number) => {
    const sRGB = v / 255;
    return sRGB <= 0.04045 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * linearize(c.r) + 0.7152 * linearize(c.g) + 0.0722 * linearize(c.b);
}

/** Luminance delta (absolute difference, 0-1). */
function luminanceDelta(a: RGB, b: RGB): number {
  return Math.abs(relativeLuminance(a) - relativeLuminance(b));
}

// ── Palette (single source of truth for all four tests) ──────────────────────

const PALETTE_CLASSES = ["old-growth", "mature", "young", "harvested"] as const;
type PaletteClass = (typeof PALETTE_CLASSES)[number];

// Canonical palette loaded from the shared JSON file.
// build-raster-tiles.py and registry.ts both derive their colors from this.
const PALETTE = FOREST_AGE_PALETTE as Record<PaletteClass, string>;

// ── Python availability + --dump-themes output ────────────────────────────────

/** True when python3 is available in PATH. Used to skip the dump-themes tests. */
const python3Available = (() => {
  try {
    execSync("python3 --version", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
})();

/**
 * RGBA tuple from --dump-themes output, keyed by theme name then class name.
 * Shape: { "forest-age": { "old-growth": [13, 92, 42, 200], ... }, "old-growth": {...}, ... }
 * Loaded once at module level; null if python3 is unavailable.
 */
type DumpedThemes = Record<string, Record<string, [number, number, number, number]>>;
const dumpedThemes: DumpedThemes | null = (() => {
  if (!python3Available) return null;
  try {
    const scriptPath = resolve(__dirname, "../../../scripts/build-raster-tiles.py");
    const raw = execSync(`python3 ${scriptPath} --dump-themes`, { encoding: "utf8" });
    return JSON.parse(raw) as DumpedThemes;
  } catch {
    return null;
  }
})();

// ── Extract vector colors from registry ───────────────────────────────────────

/**
 * Extract the per-class colors from a MapLibre match expression.
 *
 * Handles the pattern:
 *   ["match", ["get", "class"],
 *     "old-growth", "#color1",
 *     "mature", "#color2",
 *     ...,
 *     "#fallback"
 *   ]
 *
 * Returns a map of class -> color hex string.
 */
function extractMatchColors(expr: unknown): Record<string, string> | null {
  if (!Array.isArray(expr)) return null;

  // Handle ["case", condition, matchExpr, fallback] wrapping
  if (expr[0] === "case" && expr.length >= 4) {
    // Try to extract from the match expression inside the case
    return extractMatchColors(expr[2]);
  }

  if (expr[0] !== "match") return null;
  if (!Array.isArray(expr[1]) || expr[1][0] !== "get") return null;

  const result: Record<string, string> = {};

  // Pairs start at index 2: label, value, label, value, ..., fallback
  // Last element is the fallback (no corresponding label)
  for (let i = 2; i < expr.length - 2; i += 2) {
    const label = expr[i];
    const color = expr[i + 1];
    if (typeof label === "string" && typeof color === "string") {
      result[label] = color;
    }
  }

  return result;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

// Thresholds for flagging color mismatches
const RGB_DISTANCE_WARN = 50; // Perceptually noticeable
const RGB_DISTANCE_FAIL = 120; // Jarring during zoom transition
const LUMINANCE_DELTA_WARN = 0.10; // 10% luminance shift

describe("Check 11: Raster-to-vector color consistency (forest-age)", () => {
  const forestAgeLayer = LAYER_REGISTRY.find((l) => l.id === "forest-age");

  it("forest-age layer exists in registry", () => {
    expect(forestAgeLayer).toBeDefined();
  });

  it("forest-age has a rasterOverview (is the raster/vector transition layer)", () => {
    expect(forestAgeLayer?.rasterOverview).toBeDefined();
  });

  // ── Part 1: Palette JSON ↔ Registry vector colors ──────────────────────────
  //
  // This is the primary cross-language guard. Because registry.ts now imports
  // forest-age-palette.json directly, any drift from the palette is caught by
  // TypeScript's module resolution failing — but we also assert equality here
  // so a deliberate change to one side without the other is caught at test time.

  describe("palette JSON ↔ registry vector colors (Part 1)", () => {
    const vectorColors = forestAgeLayer
      ? extractMatchColors(forestAgeLayer.style.paint["fill-color"])
      : null;

    it("can extract per-class colors from forest-age fill-color expression", () => {
      expect(vectorColors).not.toBeNull();
      expect(Object.keys(vectorColors ?? {})).toContain("old-growth");
      expect(Object.keys(vectorColors ?? {})).toContain("mature");
    });

    for (const className of PALETTE_CLASSES) {
      it(`registry ${className} matches palette (distance == 0)`, () => {
        const paletteHex = PALETTE[className];
        const vectorHex = vectorColors?.[className];

        expect(paletteHex).toBeDefined();
        expect(vectorHex).toBeDefined();
        expect(() => parseHex(paletteHex)).not.toThrow();

        if (!vectorHex) return;

        const paletteRGB = parseHex(paletteHex);
        const vectorRGB = parseHex(vectorHex);
        const distance = rgbDistance(paletteRGB, vectorRGB);

        expect(
          distance,
          `registry ${className} (${vectorHex}) diverged from palette (${paletteHex}). ` +
          `RGB distance=${distance.toFixed(1)}. Update registry.ts to match forest-age-palette.json.`
        ).toBe(0);
      });
    }

    // Regression guard: warn if any registry color has a large raster/vector delta
    // (this catches someone adding a new class with mismatched colors)
    for (const className of PALETTE_CLASSES) {
      it(`${className} palette ↔ vector delta is below jarring threshold (${RGB_DISTANCE_FAIL})`, () => {
        const paletteHex = PALETTE[className];
        const vectorHex = vectorColors?.[className];
        if (!vectorHex) return;

        const distance = rgbDistance(parseHex(paletteHex), parseHex(vectorHex));
        const lumDelta = luminanceDelta(parseHex(paletteHex), parseHex(vectorHex));

        if (distance > RGB_DISTANCE_WARN) {
          console.warn(
            `[color-audit] ${className}: palette=${paletteHex} vs vector=${vectorHex}, ` +
            `RGB distance=${distance.toFixed(1)} (warn threshold: ${RGB_DISTANCE_WARN})`
          );
        }
        if (lumDelta > LUMINANCE_DELTA_WARN) {
          console.warn(
            `[color-audit] ${className}: luminance delta ${lumDelta.toFixed(3)} ` +
            `(warn threshold: ${LUMINANCE_DELTA_WARN})`
          );
        }

        expect(distance).toBeLessThan(RGB_DISTANCE_FAIL);
      });
    }
  });

  // ── Part 2: Python script reads palette file (cross-language guard) ─────────
  //
  // We parse build-raster-tiles.py as text to verify it does NOT hardcode the
  // hex values that were previously in THEMES (risk: someone converts it back
  // to hardcoded values and the palette JSON diverges silently). The guard
  // checks that the script reads _PALETTE_PATH and calls load_palette() —
  // it does NOT assert the JSON equals the JSON (that would be a tautology).

  describe("build-raster-tiles.py structural guard (Part 2)", () => {
    const scriptPath = resolve(__dirname, "../../../scripts/build-raster-tiles.py");
    const scriptSource = readFileSync(scriptPath, "utf8");

    it("script reads forest-age-palette.json (not hardcoded hex values)", () => {
      // Must reference the palette file path
      expect(scriptSource).toContain("forest-age-palette.json");
      // Must define a load_palette function
      expect(scriptSource).toContain("def load_palette()");
      // Must NOT hardcode the old diverging old-growth color
      expect(scriptSource).not.toContain("#15803d");
    });

    it("script calls load_palette() to build themes (not hardcoded THEMES dict)", () => {
      expect(scriptSource).toContain("palette = load_palette()");
      expect(scriptSource).toContain("themes = build_themes(palette)");
    });

    it("script defines four per-class isolation themes via build_themes loop", () => {
      expect(scriptSource).toContain("def build_themes(palette: dict)");
      expect(scriptSource).toContain(
        'for cls in ("old-growth", "mature", "young", "harvested")'
      );
    });

    it("script has --input and --output-dir CLI flags", () => {
      expect(scriptSource).toContain("--input");
      expect(scriptSource).toContain("--output-dir");
    });

    it("default input path points at data/checkpoint/preprocessed/ (not data/geojson/)", () => {
      expect(scriptSource).toContain("data/checkpoint/preprocessed/forest-age.ndjson");
      expect(scriptSource).not.toContain('"data/geojson/forest-age.ndjson"');
      expect(scriptSource).not.toContain("'data/geojson/forest-age.ndjson'");
    });

    it("gold old-growth theme (#eab308) is deleted", () => {
      expect(scriptSource).not.toContain("#eab308");
      expect(scriptSource).not.toContain("eab308");
    });
  });

  // ── Part 3: Isolation theme structure via --dump-themes (runtime guard) ──────
  //
  // Executes build-raster-tiles.py --dump-themes (lightweight path; no heavy
  // imports needed) and asserts the actual RGBA tuples produced by build_themes()
  // match the palette exactly — per-channel equality, alpha included.
  //
  // This supersedes string-containment checks because it catches any runtime
  // deviation: additive overrides, RGBA-tuple literals, channel swaps inside
  // hex_to_rgba, etc. String parsing cannot catch those.
  //
  // The tests are SKIPPED EXPLICITLY when python3 is not available in PATH.

  describe("per-class isolation theme structure via --dump-themes (Part 3)", () => {
    it("palette JSON contains all four class hex colors (parseable)", () => {
      for (const cls of PALETTE_CLASSES) {
        expect(PALETTE[cls]).toBeDefined();
        expect(typeof PALETTE[cls]).toBe("string");
        expect(() => parseHex(PALETTE[cls])).not.toThrow();
      }
    });

    it.skipIf(!python3Available)(
      "SKIP: python3 not available — skipping --dump-themes runtime checks",
      () => {
        // This case is only reached if python3Available is true; the skipIf
        // guard above prevents execution otherwise. If somehow reached when
        // unavailable, provide a clear diagnostic.
        expect(python3Available).toBe(true);
      }
    );

    it.skipIf(!python3Available)(
      "--dump-themes executes without error and returns valid JSON",
      () => {
        expect(dumpedThemes).not.toBeNull();
        expect(typeof dumpedThemes).toBe("object");
      }
    );

    // forest-age theme: each class RGBA must match palette exactly at alpha 200
    for (const cls of PALETTE_CLASSES) {
      it.skipIf(!python3Available)(
        `forest-age theme: ${cls} RGBA matches palette at alpha 200`,
        () => {
          expect(dumpedThemes).not.toBeNull();
          const rgba = dumpedThemes!["forest-age"][cls];
          expect(rgba).toBeDefined();
          const { r, g, b } = parseHex(PALETTE[cls]);
          expect(rgba[0], `${cls} R channel`).toBe(r);
          expect(rgba[1], `${cls} G channel`).toBe(g);
          expect(rgba[2], `${cls} B channel`).toBe(b);
          expect(rgba[3], `${cls} alpha`).toBe(200);
        }
      );
    }

    // Isolation themes: target class = palette RGBA at alpha 200;
    // all other classes + background = [0, 0, 0, 0]
    for (const cls of PALETTE_CLASSES) {
      it.skipIf(!python3Available)(
        `isolation theme "${cls}": target class is canonical RGBA, all others transparent`,
        () => {
          expect(dumpedThemes).not.toBeNull();
          const theme = dumpedThemes![cls];
          expect(theme).toBeDefined();

          // Target class must match palette exactly at alpha 200
          const { r, g, b } = parseHex(PALETTE[cls]);
          expect(theme[cls][0], `${cls} R`).toBe(r);
          expect(theme[cls][1], `${cls} G`).toBe(g);
          expect(theme[cls][2], `${cls} B`).toBe(b);
          expect(theme[cls][3], `${cls} alpha`).toBe(200);

          // All other palette classes must be fully transparent
          for (const other of PALETTE_CLASSES) {
            if (other === cls) continue;
            expect(theme[other], `${other} must be transparent in ${cls} isolation`).toEqual([0, 0, 0, 0]);
          }
          // Background must also be transparent
          expect(theme["background"], "background must be transparent").toEqual([0, 0, 0, 0]);
        }
      );
    }

    // Each palette class must exist as a theme name in the dump (slug-match check).
    // This replaces the dead loop that previously asserted a fixed string four times.
    for (const cls of PALETTE_CLASSES) {
      it.skipIf(!python3Available)(
        `isolation theme name "${cls}" exists in dump (matches client {class} URL slug)`,
        () => {
          expect(dumpedThemes).not.toBeNull();
          expect(Object.keys(dumpedThemes!)).toContain(cls);
        }
      );
    }
  });

  // ── Part 4: palette JSON ↔ old hardcoded values (regression sentinel) ────────
  //
  // Verify the palette values are the canonical ones Lee confirmed (2026-06-11).
  // If someone updates the palette JSON to wrong values this test bites.

  describe("palette hex values match confirmed registry canonical (Part 4)", () => {
    it("old-growth is #0d5c2a (canonical dark green, not the former raster #15803d)", () => {
      expect(PALETTE["old-growth"]).toBe("#0d5c2a");
    });

    it("mature is #4ade80", () => {
      expect(PALETTE["mature"]).toBe("#4ade80");
    });

    it("young is #f97316", () => {
      expect(PALETTE["young"]).toBe("#f97316");
    });

    it("harvested is #ef4444", () => {
      expect(PALETTE["harvested"]).toBe("#ef4444");
    });
  });

  // ── Part 5: Binary end-reveal theme colors (Jen visual spec guard) ───────────
  //
  // The binary theme (#0d5c2a old-growth / #ef4444 everything-else) is eyeball-gate
  // locked per the Jen visual spec (Phase 1b). These assertions prevent silent drift
  // if someone edits the binary dict in build-raster-tiles.py. They must match the
  // exact RGB values in the spec: old-growth luminance 0.095, red luminance 0.244.
  //
  // Pixel alpha is 255 (fully opaque); the 0.85 visual opacity is the MapLibre
  // raster-opacity set in setup-layers.ts — do not assert alpha == 217 here.

  describe("binary theme colors locked to Jen visual spec (Part 5)", () => {
    // Binary old-growth: #0d5c2a → R=13, G=92, B=42
    const BINARY_OLD_GROWTH_HEX = "#0d5c2a";
    // Binary red (everything else): #ef4444 → R=239, G=68, B=68
    const BINARY_RED_HEX = "#ef4444";

    it("binary old-growth hex matches Jen spec (#0d5c2a)", () => {
      // SSOT guard: if the spec is updated, update both the test and the script.
      const { r, g, b } = parseHex(BINARY_OLD_GROWTH_HEX);
      expect(r).toBe(13);
      expect(g).toBe(92);
      expect(b).toBe(42);
    });

    it("binary red hex matches Jen spec (#ef4444)", () => {
      const { r, g, b } = parseHex(BINARY_RED_HEX);
      expect(r).toBe(239);
      expect(g).toBe(68);
      expect(b).toBe(68);
    });

    it.skipIf(!python3Available)(
      "--dump-themes: binary theme exists",
      () => {
        expect(dumpedThemes).not.toBeNull();
        expect(Object.keys(dumpedThemes!)).toContain("binary");
      }
    );

    it.skipIf(!python3Available)(
      "--dump-themes: binary old-growth is #0d5c2a at alpha 255",
      () => {
        expect(dumpedThemes).not.toBeNull();
        const theme = dumpedThemes!["binary"];
        expect(theme).toBeDefined();
        const og = theme["old-growth"];
        expect(og).toBeDefined();
        expect(og[0], "R").toBe(13);   // #0d
        expect(og[1], "G").toBe(92);   // #5c
        expect(og[2], "B").toBe(42);   // #2a
        expect(og[3], "alpha").toBe(255);
      }
    );

    it.skipIf(!python3Available)(
      "--dump-themes: binary harvested is #ef4444 at alpha 255",
      () => {
        expect(dumpedThemes).not.toBeNull();
        const theme = dumpedThemes!["binary"];
        expect(theme).toBeDefined();
        const harvested = theme["harvested"];
        expect(harvested).toBeDefined();
        expect(harvested[0], "R").toBe(239);  // #ef
        expect(harvested[1], "G").toBe(68);   // #44
        expect(harvested[2], "B").toBe(68);   // #44
        expect(harvested[3], "alpha").toBe(255);
      }
    );

    it.skipIf(!python3Available)(
      "--dump-themes: binary mature and young are also #ef4444 at alpha 255",
      () => {
        expect(dumpedThemes).not.toBeNull();
        const theme = dumpedThemes!["binary"];
        for (const cls of ["mature", "young"] as const) {
          const rgba = theme[cls];
          expect(rgba, `${cls} must be defined`).toBeDefined();
          expect(rgba[0], `${cls} R`).toBe(239);
          expect(rgba[1], `${cls} G`).toBe(68);
          expect(rgba[2], `${cls} B`).toBe(68);
          expect(rgba[3], `${cls} alpha`).toBe(255);
        }
      }
    );
  });
});
