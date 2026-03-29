/**
 * Part B — Check 11: Raster-to-Vector Color Consistency
 *
 * When zooming in on the forest-age layer, MapLibre transitions from:
 *   - Raster overview tiles (built by build-raster-tiles.py) at z4-z8
 *   - PMTiles vector fill layer at z9+ (with registry paint colors)
 *
 * If the raster and vector colors for the same forest class differ too much,
 * the zoom transition produces a visible color flash. This check computes the
 * perceptual color distance between each pair.
 *
 * Raster colors (from build-raster-tiles.py):
 *   old-growth: #15803d   (Tailwind green-700)
 *   mature:     #4ade80   (Tailwind green-400)
 *   young:      #f97316   (Tailwind orange-500)
 *   harvested:  #ef4444   (Tailwind red-500)
 *
 * Registry vector colors (from forest-age fill-color match expression):
 *   old-growth: #0d5c2a   (custom dark green)
 *   mature:     #4ade80   (same as raster)
 *   young:      #f97316   (same as raster)
 *   harvested:  #ef4444   (same as raster)
 *
 * Known mismatch: old-growth raster (#15803d) vs vector (#0d5c2a).
 * RGB distance ~41.5 (perceptible but below the 50-unit WARN threshold).
 * Luminance: raster=0.159, vector=0.079 (raster is ~2x brighter).
 * This is a documented intentional divergence -- the raster uses a lighter
 * green (better visible at province scale) while the vector uses a darker
 * green (better at detail scale). The transition is acceptable but worth
 * tracking to prevent additional divergences from accumulating.
 */

import { describe, it, expect } from "vitest";
import { LAYER_REGISTRY } from "@/lib/layers/registry";

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

// ── Raster colors (from build-raster-tiles.py) ───────────────────────────────

const RASTER_COLORS: Record<string, string> = {
  "old-growth": "#15803d", // Tailwind green-700
  mature: "#4ade80", // Tailwind green-400
  young: "#f97316", // Tailwind orange-500
  harvested: "#ef4444", // Tailwind red-500
};

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

  describe("per-class raster vs vector color comparison", () => {
    // Extract vector colors from registry at test time
    const vectorColors = forestAgeLayer
      ? extractMatchColors(forestAgeLayer.style.paint["fill-color"])
      : null;

    it("can extract per-class colors from forest-age fill-color expression", () => {
      expect(vectorColors).not.toBeNull();
      expect(Object.keys(vectorColors ?? {})).toContain("old-growth");
      expect(Object.keys(vectorColors ?? {})).toContain("mature");
    });

    for (const className of Object.keys(RASTER_COLORS)) {
      describe(`class: ${className}`, () => {
        it(`raster and vector colors are both valid hex strings`, () => {
          const rasterHex = RASTER_COLORS[className];
          const vectorHex = vectorColors?.[className];

          expect(rasterHex).toBeDefined();
          expect(vectorHex).toBeDefined();

          // Verify they're parseable
          expect(() => parseHex(rasterHex)).not.toThrow();
          if (vectorHex) {
            expect(() => parseHex(vectorHex)).not.toThrow();
          }
        });

        it(`raster (#${RASTER_COLORS[className]}) vs vector color delta is within acceptable range`, () => {
          const rasterHex = RASTER_COLORS[className];
          const vectorHex = vectorColors?.[className];

          if (!vectorHex) {
            // No vector color for this class -- it uses the fallback
            console.warn(
              `[color-audit] class "${className}" has no vector color in match expression. ` +
                "Using registry fallback color."
            );
            return;
          }

          const rasterRGB = parseHex(rasterHex);
          const vectorRGB = parseHex(vectorHex);
          const distance = rgbDistance(rasterRGB, vectorRGB);
          const lumDelta = luminanceDelta(rasterRGB, vectorRGB);

          // Known exception: old-growth intentionally diverges
          // Raster #15803d is lighter green (province scale visibility)
          // Vector #0d5c2a is darker green (detail scale richness)
          // RGB distance ~41.5 (below the warn threshold of 50, but luminance
          // delta is significant: raster is ~2x brighter than vector).
          // This transition is acceptable but documented here.
          if (className === "old-growth") {
            // Document the known mismatch values
            expect(rasterHex).toBe("#15803d");
            expect(vectorHex).toBe("#0d5c2a");

            // Distance should be in the moderate range (regression test)
            // If either color changes, this test will catch it.
            // RGB distance is ~41.5 -- below the 50 WARN threshold but
            // luminance delta is 0.08 (above the 0.10 warn threshold at 2dp).
            expect(distance).toBeGreaterThan(20); // detect accidental convergence
            expect(distance).toBeLessThan(RGB_DISTANCE_FAIL); // detect divergence
            return;
          }

          // All other classes should have close raster/vector colors
          if (distance > RGB_DISTANCE_FAIL) {
            throw new Error(
              `class "${className}" has jarring color mismatch: ` +
                `raster=${rasterHex} vs vector=${vectorHex}, ` +
                `RGB distance=${distance.toFixed(1)} (threshold: ${RGB_DISTANCE_FAIL}). ` +
                "The zoom transition from raster to vector will produce a visible flash."
            );
          }

          if (distance > RGB_DISTANCE_WARN) {
            console.warn(
              `[color-audit] class "${className}" has noticeable color mismatch: ` +
                `raster=${rasterHex} vs vector=${vectorHex}, ` +
                `RGB distance=${distance.toFixed(1)} (warn threshold: ${RGB_DISTANCE_WARN}).`
            );
          }

          if (lumDelta > LUMINANCE_DELTA_WARN) {
            console.warn(
              `[color-audit] class "${className}" has luminance delta ${lumDelta.toFixed(3)} ` +
                `(warn threshold: ${LUMINANCE_DELTA_WARN}): ` +
                `raster luminance=${relativeLuminance(rasterRGB).toFixed(3)}, ` +
                `vector luminance=${relativeLuminance(vectorRGB).toFixed(3)}.`
            );
          }

          // mature, young, harvested should have distance 0 (identical colors)
          expect(
            distance,
            `class "${className}" raster (${rasterHex}) vs vector (${vectorHex}) ` +
              `RGB distance=${distance.toFixed(1)}: colors diverged unexpectedly. ` +
              `Expected them to be identical.`
          ).toBeLessThanOrEqual(RGB_DISTANCE_WARN);
        });
      });
    }
  });

  it("documents old-growth raster/vector mismatch as known issue", () => {
    /**
     * KNOWN ISSUE: old-growth raster (#15803d) vs vector (#0d5c2a)
     *
     * RGB distance: ~41.5 (perceptible but below the 50-unit warn threshold)
     * Luminance: raster=0.159, vector=0.079 (raster is ~2x brighter)
     *
     * The raster was built with green-700 for province-scale legibility
     * against the basemap. The vector uses a deeper forest green for
     * detail-scale richness. The zoom crossfade at z9 partially masks
     * the transition via opacity interpolation (both layers fade together).
     *
     * To fix: align either the raster color or the vector color.
     * Recommended: change vector to #15803d and rebuild.
     * Impact: minor -- the current mismatch is acceptable for a v1 launch.
     */
    const rasterRGB = parseHex("#15803d");
    const vectorRGB = parseHex("#0d5c2a");
    const distance = rgbDistance(rasterRGB, vectorRGB);

    // Document the current state (regression detection)
    // RGB distance: ~41.5 (perceptible but not jarring)
    // Luminance: raster=0.159, vector=0.079 (raster is ~2x brighter)
    expect(distance).toBeCloseTo(41.5, 0); // ~41.5 RGB units
    expect(relativeLuminance(rasterRGB)).toBeCloseTo(0.159, 2);
    expect(relativeLuminance(vectorRGB)).toBeCloseTo(0.079, 2);
  });
});
