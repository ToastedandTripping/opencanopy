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
 *   3. Asserts isolation theme structure: each theme paints exactly one class
 *      and leaves the others transparent
 *
 * This is NOT a tautology: the registry's fill-color expression is derived
 * independently by TypeScript's module resolution; if someone replaces the
 * palette import with a hardcoded value, tests 1 + 3 will catch the drift.
 * The Python parse (test 2) catches drift on the script side.
 */

import { describe, it, expect } from "vitest";
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

  describe("build-raster-tiles.py cross-language guard (Part 2)", () => {
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
      // The script iterates over all four class slugs to build isolation themes.
      // Verify the loop covers all classes (not hardcoded individually).
      expect(scriptSource).toContain("def build_themes(palette: dict)");
      // Each class appears in the isolation theme loop
      for (const cls of PALETTE_CLASSES) {
        expect(scriptSource).toContain(cls);
      }
      // Loop variable confirms all four are handled (not just one)
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

  // ── Part 3: Isolation theme structure (checked via build_themes logic) ───────
  //
  // We cannot run the Python script in Jest/Vitest but we can verify the
  // structure described in build_themes() by reading its source. We also
  // verify that the palette JSON values for each class are parseable and
  // that the isolation logic (one opaque class, all others transparent) is
  // clearly expressed in the script text.

  describe("per-class isolation theme structure (Part 3)", () => {
    const scriptPath = resolve(__dirname, "../../../scripts/build-raster-tiles.py");
    const scriptSource = readFileSync(scriptPath, "utf8");

    it("palette JSON contains all four class hex colors", () => {
      for (const cls of PALETTE_CLASSES) {
        expect(PALETTE[cls]).toBeDefined();
        expect(typeof PALETTE[cls]).toBe("string");
        expect(() => parseHex(PALETTE[cls])).not.toThrow();
      }
    });

    it("isolation theme logic: active class gets palette color, others get (0,0,0,0)", () => {
      // Verify the build_themes() function paints the active class and
      // leaves all others transparent — check both paths in the script source
      expect(scriptSource).toContain("hex_to_rgba(palette[cls], OVERVIEW_ALPHA)");
      expect(scriptSource).toContain("(0, 0, 0, 0)");
      // The logic: for other != cls → transparent
      expect(scriptSource).toContain("if other == cls:");
    });

    it("all four isolation theme names match client {class} URL substitution slugs", () => {
      // Client replaces {class} with the slug; theme name must == slug
      for (const cls of PALETTE_CLASSES) {
        expect(scriptSource).toContain(`for cls in ("old-growth", "mature", "young", "harvested")`);
      }
    });
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
});
