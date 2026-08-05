/**
 * Part B — Check 5: Opacity Visibility
 *
 * For each layer at z5, z7, z9, z12: evaluate the zoom-interpolated opacity
 * expression. Flag opacity below 0.15 at any zoom within the layer's zoomRange.
 *
 * Special handling: outline-dominant fill layers (faint fill + explicit
 * style.outline, e.g. cutblocks boundary / conservancies) are credited by their
 * outline opacity — they are seen via the boundary, not the near-zero fill.
 */

import { describe, it, expect } from "vitest";
import { LAYER_REGISTRY } from "@/lib/layers/registry";
import type { LayerDefinition } from "@/types/layers";

// ── Zoom interpolation evaluator ─────────────────────────────────────────────

/**
 * Evaluate a MapLibre zoom interpolation expression at a given zoom level.
 *
 * Handles:
 *   ["interpolate", ["linear"], ["zoom"], z1, v1, z2, v2, ...]
 *   A static number (returned as-is).
 *
 * Returns null if the expression format is unrecognized.
 */
export function evaluateZoomInterpolation(
  expr: unknown,
  zoom: number
): number | null {
  // Static number
  if (typeof expr === "number") return expr;

  if (!Array.isArray(expr)) return null;

  // ["interpolate", ["linear"], ["zoom"], z1, v1, z2, v2, ...]
  if (
    expr[0] === "interpolate" &&
    Array.isArray(expr[1]) &&
    expr[1][0] === "linear" &&
    Array.isArray(expr[2]) &&
    expr[2][0] === "zoom"
  ) {
    // Stops start at index 3, interleaved: zoom, value, zoom, value...
    const stops: Array<[number, number]> = [];
    for (let i = 3; i + 1 < expr.length; i += 2) {
      stops.push([expr[i] as number, expr[i + 1] as number]);
    }
    if (stops.length === 0) return null;

    // Below first stop: return first value
    if (zoom <= stops[0][0]) return stops[0][1];
    // Above last stop: return last value
    if (zoom >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];

    // Find surrounding stops and interpolate
    for (let i = 0; i < stops.length - 1; i++) {
      const [z0, v0] = stops[i];
      const [z1, v1] = stops[i + 1];
      if (zoom >= z0 && zoom <= z1) {
        const t = (zoom - z0) / (z1 - z0);
        return v0 + t * (v1 - v0);
      }
    }
  }

  return null;
}

// ── Effective opacity calculator ─────────────────────────────────────────────

const OPACITY_THRESHOLD = 0.15;
const AUDIT_ZOOMS = [5, 7, 9, 12];

/**
 * Get the effective opacity for a layer at a given zoom level.
 *
 * For outline-dominant fill layers — a faint fill plus an explicit
 * `style.outline` (e.g. the cutblocks boundary and conservancies) — the layer
 * is SEEN via its outline, not its near-zero fill. The effective opacity is the
 * stronger of the fill and outline opacities, so the visibility check reflects
 * what the user actually perceives rather than naively reading `fill-opacity`.
 */
function getEffectiveOpacity(layer: LayerDefinition, zoom: number): number | null {
  const paint = layer.style.paint;
  const type = layer.style.type;

  // General case: read the opacity paint property for this layer type
  const opacityKey = `${type}-opacity`;
  const opacityExpr = paint[opacityKey];

  let fillSideOpacity: number | null;
  if (opacityExpr === undefined) {
    // Some layers use a static opacity property on the style object
    fillSideOpacity =
      typeof layer.style.opacity === "number" ? layer.style.opacity : null;
  } else {
    fillSideOpacity = evaluateZoomInterpolation(opacityExpr, zoom);
  }

  // Outline-dominant fill layers are visible through their boundary line.
  if (type === "fill" && layer.style.outline) {
    return Math.max(fillSideOpacity ?? 0, layer.style.outline.opacity);
  }

  return fillSideOpacity;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Check 5: Opacity visibility", () => {
  describe("evaluateZoomInterpolation helper", () => {
    it("returns static number unchanged", () => {
      expect(evaluateZoomInterpolation(0.5, 8)).toBe(0.5);
    });

    it("clamps below first stop to first value", () => {
      const expr = ["interpolate", ["linear"], ["zoom"], 5, 0.3, 12, 0.7];
      expect(evaluateZoomInterpolation(expr, 3)).toBe(0.3);
    });

    it("clamps above last stop to last value", () => {
      const expr = ["interpolate", ["linear"], ["zoom"], 5, 0.3, 12, 0.7];
      expect(evaluateZoomInterpolation(expr, 15)).toBe(0.7);
    });

    it("interpolates correctly between stops", () => {
      const expr = ["interpolate", ["linear"], ["zoom"], 5, 0.0, 10, 1.0];
      expect(evaluateZoomInterpolation(expr, 7.5)).toBeCloseTo(0.5, 5);
    });

    it("returns null for unrecognized expression", () => {
      expect(evaluateZoomInterpolation(["match", "a", "b"], 8)).toBeNull();
    });

    it("handles 4-stop expression used in forest-age", () => {
      // forest-age opacity: z5->0.40, z7->0.48, z9->0.55, z12->0.65
      const expr = ["interpolate", ["linear"], ["zoom"], 5, 0.40, 7, 0.48, 9, 0.55, 12, 0.65];
      expect(evaluateZoomInterpolation(expr, 5)).toBeCloseTo(0.40, 5);
      expect(evaluateZoomInterpolation(expr, 7)).toBeCloseTo(0.48, 5);
      expect(evaluateZoomInterpolation(expr, 12)).toBeCloseTo(0.65, 5);
      // Midpoint between z7 and z9
      expect(evaluateZoomInterpolation(expr, 8)).toBeCloseTo(0.515, 3);
    });
  });

  describe("per-layer opacity at audit zoom levels", () => {
    for (const layer of LAYER_REGISTRY) {
      // satellite layer has no meaningful opacity (raster source, fill type is placeholder)
      if (layer.id === "satellite") continue;

      describe(`layer: ${layer.id}`, () => {
        const [minZoom, maxZoom] = layer.zoomRange;

        for (const zoom of AUDIT_ZOOMS) {
          // Only check zooms within this layer's range
          if (zoom < minZoom || zoom > maxZoom) continue;

          it(`is visible (opacity >= ${OPACITY_THRESHOLD}) at z${zoom}`, () => {
            const opacity = getEffectiveOpacity(layer, zoom);

            expect(
              opacity,
              `layer "${layer.id}": could not evaluate opacity expression at z${zoom} — ` +
                "add the expression shape to evaluateZoomInterpolation or the invariant is unenforced"
            ).not.toBeNull();

            expect(
              opacity!,
              `layer "${layer.id}" has opacity ${opacity!.toFixed(3)} at z${zoom} ` +
                `(below threshold of ${OPACITY_THRESHOLD})`
            ).toBeGreaterThanOrEqual(OPACITY_THRESHOLD);
          });
        }
      });
    }
  });

  it("parks uses a legible fill-opacity ramp + crisp outline (was a 0.1 white wash)", () => {
    // The old 0.1 rgba wash was invisible over satellite. Parks now uses a real
    // emerald fill-opacity ramp (>= threshold at every audit zoom) plus a white
    // outline. It is no longer a special case — the per-layer loop above covers it.
    const parksLayer = LAYER_REGISTRY.find((l) => l.id === "parks");
    expect(parksLayer).toBeDefined();

    for (const zoom of AUDIT_ZOOMS) {
      const opacity = getEffectiveOpacity(parksLayer!, zoom);
      expect(opacity).not.toBeNull();
      expect(
        opacity!,
        `parks opacity ${opacity?.toFixed(3)} at z${zoom} should clear ${OPACITY_THRESHOLD}`
      ).toBeGreaterThanOrEqual(OPACITY_THRESHOLD);
    }

    const fillOutline = parksLayer!.style.paint["fill-outline-color"];
    expect(fillOutline, "parks should keep a crisp outline").toBeTruthy();
  });
});
