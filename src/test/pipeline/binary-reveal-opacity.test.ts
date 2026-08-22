import { describe, it, expect } from "vitest";
import { computeBinaryRevealOpacity } from "@/lib/story/binary-opacity";

/**
 * Unit tests for computeBinaryRevealOpacity.
 *
 * This function is the SOLE authority on per-frame binary reveal opacity and
 * is consumed by useScrollytelling's updateCamera callback. It must handle:
 *   - Non-reveal chapters → 0
 *   - revealBinary + fadeIn window → scroll-coupled ramp
 *   - revealBinary + no fadeIn → immediate 0.85
 *   - prefers-reduced-motion → immediate 0.85 regardless of fadeIn
 */

describe("computeBinaryRevealOpacity", () => {
  // ── Non-reveal chapters ─────────────────────────────────────────────────────

  describe("non-reveal chapter", () => {
    it("returns 0 when revealBinary is false", () => {
      expect(computeBinaryRevealOpacity(false, undefined, 0.5, false)).toBe(0);
    });

    it("returns 0 when revealBinary is undefined", () => {
      expect(computeBinaryRevealOpacity(undefined, undefined, 0.5, false)).toBe(0);
    });

    it("returns 0 even if fadeIn window provided but revealBinary is false", () => {
      expect(computeBinaryRevealOpacity(false, [0.4, 0.6], 0.55, false)).toBe(0);
    });
  });

  // ── Degenerate fadeIn window (start === end): no divide-by-zero / NaN ───────

  describe("degenerate fadeIn window (start === end)", () => {
    it("steps to 0.85 at/after the boundary, never NaN", () => {
      expect(computeBinaryRevealOpacity(true, [0.5, 0.5], 0.5, false)).toBe(0.85);
      expect(computeBinaryRevealOpacity(true, [0.5, 0.5], 0.7, false)).toBe(0.85);
    });
    it("returns 0 before the boundary, never NaN", () => {
      const v = computeBinaryRevealOpacity(true, [0.5, 0.5], 0.3, false);
      expect(v).toBe(0);
      expect(Number.isNaN(v)).toBe(false);
    });
  });

  // ── ending chapter: revealBinary=true, fadeIn=[0.4, 0.6] ──────────────────

  describe("ending chapter: fadeIn=[0.4, 0.6]", () => {
    const fadeIn: [number, number] = [0.4, 0.6];

    it("returns 0 before fadeIn window (prog=0.3)", () => {
      expect(computeBinaryRevealOpacity(true, fadeIn, 0.3, false)).toBe(0);
    });

    it("returns 0 at fadeIn start (prog=0.4)", () => {
      expect(computeBinaryRevealOpacity(true, fadeIn, 0.4, false)).toBe(0);
    });

    it("returns ~0.425 at midpoint of window (prog=0.5)", () => {
      // prog=0.5 → t=(0.5-0.4)/(0.6-0.4)=0.5 → 0.85*0.5=0.425
      const result = computeBinaryRevealOpacity(true, fadeIn, 0.5, false);
      expect(result).toBeCloseTo(0.425, 5);
    });

    it("returns 0.85 at end of window (prog=0.6)", () => {
      expect(computeBinaryRevealOpacity(true, fadeIn, 0.6, false)).toBeCloseTo(0.85, 5);
    });

    it("returns 0.85 after fadeIn window (prog=0.8)", () => {
      // clamped to 1 beyond the window
      expect(computeBinaryRevealOpacity(true, fadeIn, 0.8, false)).toBeCloseTo(0.85, 5);
    });

    it("returns 0.85 at prog=1.0 (fully scrolled)", () => {
      expect(computeBinaryRevealOpacity(true, fadeIn, 1.0, false)).toBeCloseTo(0.85, 5);
    });
  });

  // ── revealBinary=true, no fadeIn (no chapter uses this today; pure-function contract) ─────────────────────────

  describe("revealBinary=true, no fadeIn", () => {
    it("returns 0.85 immediately at prog=0 (no fadeIn window)", () => {
      expect(computeBinaryRevealOpacity(true, undefined, 0, false)).toBe(0.85);
    });

    it("returns 0.85 at any progress (prog=0.5)", () => {
      expect(computeBinaryRevealOpacity(true, undefined, 0.5, false)).toBe(0.85);
    });
  });

  // ── prefers-reduced-motion ─────────────────────────────────────────────────

  describe("prefers-reduced-motion", () => {
    it("returns 0.85 immediately even with fadeIn window when reducedMotion=true", () => {
      // Under reduced motion the ramp is skipped; the reveal still happens,
      // just without animation.
      expect(computeBinaryRevealOpacity(true, [0.4, 0.6], 0, true)).toBe(0.85);
    });

    it("returns 0.85 at prog=0 with fadeIn window under reduced motion", () => {
      expect(computeBinaryRevealOpacity(true, [0.4, 0.6], 0.3, true)).toBe(0.85);
    });

    it("returns 0 for non-reveal chapter even under reduced motion", () => {
      expect(computeBinaryRevealOpacity(false, undefined, 0.5, true)).toBe(0);
    });
  });
});
