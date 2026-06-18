import { describe, it, expect } from "vitest";
import { yearFromProgress, type ScrubTable } from "@/lib/story/scrub";
import { YEAR_OVERLAY_RANGE, FIRE_OVERLAY_RANGE } from "@/lib/story/setup-layers";
import cutblocksScrub from "@/data/scrub/cutblocks-scrub.json";
import fireScrub from "@/data/scrub/fire-scrub.json";

const TABLES: Array<{ name: string; table: ScrubTable; range: { start: number; end: number } }> = [
  { name: "cutblocks", table: cutblocksScrub as ScrubTable, range: YEAR_OVERLAY_RANGE },
  { name: "fire", table: fireScrub as ScrubTable, range: FIRE_OVERLAY_RANGE },
];

describe("yearFromProgress — boundary behavior", () => {
  const table: ScrubTable = { start: 1950, end: 2025, cumulativeNorm: [] };
  // synthetic monotone curve, endpoints pinned
  const n = table.end - table.start + 1;
  table.cumulativeNorm = Array.from({ length: n }, (_, i) =>
    i === 0 ? 0 : i === n - 1 ? 1 : Number((i / (n - 1)).toFixed(6)),
  );

  it("progress 0 → start year", () => {
    expect(yearFromProgress(table, 0)).toBe(table.start);
  });

  it("progress 1 → end year", () => {
    expect(yearFromProgress(table, 1)).toBe(table.end);
  });

  it("clamps out-of-range progress to the endpoints", () => {
    expect(yearFromProgress(table, -0.5)).toBe(table.start);
    expect(yearFromProgress(table, 1.5)).toBe(table.end);
  });

  it("is monotonic non-decreasing across [0,1] and never indexes out of range", () => {
    let prev = table.start;
    for (let p = 0; p <= 1.0001; p += 0.01) {
      const y = yearFromProgress(table, Math.min(p, 1));
      expect(y).toBeGreaterThanOrEqual(prev);
      expect(y).toBeGreaterThanOrEqual(table.start);
      expect(y).toBeLessThanOrEqual(table.end);
      prev = y;
    }
  });

  it("handles a trailing plateau (cumulative hits 1.0 before the last year)", () => {
    const plateau: ScrubTable = {
      start: 2000,
      end: 2005,
      cumulativeNorm: [0, 0.5, 1, 1, 1, 1],
    };
    // progress 1 must still yield the declared end year, not the first 1.0 index
    expect(yearFromProgress(plateau, 1)).toBe(2005);
  });
});

describe("scrub tables match their overlay range constants (no PNG-index drift)", () => {
  for (const { name, table, range } of TABLES) {
    it(`${name}: start/end agree with the overlay range`, () => {
      expect(table.start).toBe(range.start);
      expect(table.end).toBe(range.end);
    });

    it(`${name}: one normalized entry per year, pinned 0..1`, () => {
      expect(table.cumulativeNorm.length).toBe(range.end - range.start + 1);
      expect(table.cumulativeNorm[0]).toBe(0);
      expect(table.cumulativeNorm[table.cumulativeNorm.length - 1]).toBe(1);
    });

    it(`${name}: cumulativeNorm is monotonic non-decreasing in [0,1]`, () => {
      for (let i = 1; i < table.cumulativeNorm.length; i++) {
        expect(table.cumulativeNorm[i]).toBeGreaterThanOrEqual(table.cumulativeNorm[i - 1]);
        expect(table.cumulativeNorm[i]).toBeGreaterThanOrEqual(0);
        expect(table.cumulativeNorm[i]).toBeLessThanOrEqual(1);
      }
    });
  }
});
