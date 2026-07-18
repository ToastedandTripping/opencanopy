import { describe, it, expect } from "vitest";
import { getScentedTrack, cumulativeHectares } from "./scented-track";
import fireScrub from "@/data/scrub/fire-scrub.json";
import type { ScrubTable } from "@/lib/story/scrub";

const FIRE_TABLE = fireScrub as ScrubTable;

describe("getScentedTrack — v1 scope gate (fire-history sole-active only)", () => {
  it("returns the track when fire-history is the sole active layer", () => {
    const track = getScentedTrack(["fire-history"]);
    expect(track).not.toBeNull();
    expect(track!.start).toBe(FIRE_TABLE.start);
    expect(track!.end).toBe(FIRE_TABLE.end);
  });

  it("returns null for zero active layers", () => {
    expect(getScentedTrack([])).toBeNull();
  });

  it("returns null when any OTHER layer is active alongside fire-history", () => {
    expect(getScentedTrack(["fire-history", "cutblocks"])).toBeNull();
  });

  it("returns null for cutblocks alone (base-filter mismatch -- X3)", () => {
    expect(getScentedTrack(["cutblocks"])).toBeNull();
  });

  it("returns null for tenure-cutblocks alone (out of v1 scope per the plan's pinned decision)", () => {
    expect(getScentedTrack(["tenure-cutblocks"])).toBeNull();
  });

  it("returns null for more than one active layer even if fire-history is among them", () => {
    expect(getScentedTrack(["cutblocks", "fire-history", "tenure-cutblocks"])).toBeNull();
  });
});

describe("getScentedTrack — deltas", () => {
  const track = getScentedTrack(["fire-history"])!;

  it("has one delta per year in [start, end]", () => {
    expect(track.deltas.length).toBe(track.end - track.start + 1);
  });

  it("every delta is non-negative (cumulativeNorm is monotonic non-decreasing)", () => {
    for (const d of track.deltas) {
      expect(d).toBeGreaterThanOrEqual(0);
    }
  });

  it("deltas sum to ~1 (cumulativeNorm is pinned 0 -> 1 across the full range)", () => {
    const sum = track.deltas.reduce((acc, d) => acc + d, 0);
    expect(sum).toBeCloseTo(1, 3);
  });

  it("delta[0] is 0 -- no fires attributed before `start`", () => {
    expect(track.deltas[0]).toBe(0);
  });
});

describe("cumulativeHectares — boundary-exact lookup", () => {
  const track = getScentedTrack(["fire-history"])!;

  it("year <= start -> 0 ha", () => {
    expect(cumulativeHectares(track, track.start)).toBe(0);
    expect(cumulativeHectares(track, track.start - 50)).toBe(0);
  });

  it("year >= end -> the full total", () => {
    expect(cumulativeHectares(track, track.end)).toBeCloseTo(track.total, 5);
    expect(cumulativeHectares(track, track.end + 50)).toBeCloseTo(track.total, 5);
  });

  it("an interior year matches total * cumulativeNorm[year - start] exactly", () => {
    const probeYear = track.start + 50;
    const expected = track.total * track.cumulativeNorm[50];
    expect(cumulativeHectares(track, probeYear)).toBeCloseTo(expected, 5);
  });

  it("is monotonic non-decreasing across the full range", () => {
    let prev = 0;
    for (let y = track.start; y <= track.end; y++) {
      const ha = cumulativeHectares(track, y);
      expect(ha).toBeGreaterThanOrEqual(prev);
      prev = ha;
    }
  });
});
