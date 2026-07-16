import { describe, it, expect } from "vitest";
import { roundToSigFigs, presentCo2Tonnes, presentDollars } from "@/lib/carbon/calculator";

describe("roundToSigFigs", () => {
  it("rounds a large number to 3 significant figures", () => {
    expect(roundToSigFigs(1234567, 3)).toBe(1230000);
  });

  it("rounds a mid-size number to 3 significant figures", () => {
    expect(roundToSigFigs(45678, 3)).toBe(45700);
  });

  it("leaves an already-coarse number unchanged", () => {
    expect(roundToSigFigs(45, 3)).toBe(45);
  });

  it("handles exact powers of 10 without floating-point magnitude errors", () => {
    // log10(1000) can evaluate to 2.9999999999996 in floating point, which
    // (without an epsilon guard) knocks the result off by one order of
    // magnitude -- this is the classic bug in naive sig-fig rounding.
    expect(roundToSigFigs(1000, 3)).toBe(1000);
    expect(roundToSigFigs(100, 3)).toBe(100);
    expect(roundToSigFigs(10000, 2)).toBe(10000);
  });

  it("returns 0 for 0", () => {
    expect(roundToSigFigs(0, 3)).toBe(0);
  });

  it("preserves sign", () => {
    expect(roundToSigFigs(-1234567, 3)).toBe(-1230000);
  });
});

describe("presentCo2Tonnes", () => {
  it("rounds the headline to ~3 sig figs and never returns a full-precision float", () => {
    const pres = presentCo2Tonnes(1234567.891);
    expect(pres.rounded).toBe(1230000);
    // Not the raw value -- this is the whole point of the fix.
    expect(pres.rounded).not.toBe(1234567.891);
  });

  it("band is ONE-SIDED downward (model's own caveat is 'may overestimate', never 'may underestimate')", () => {
    const pres = presentCo2Tonnes(1000000);
    expect(pres.bandLow).toBeLessThan(pres.rounded);
    // Exactly 80% of the rounded figure (rounded again to 3 sig figs), not a
    // symmetric +/- band.
    expect(pres.bandLow).toBe(roundToSigFigs(pres.rounded * 0.8, 3));
  });

  it("real-zero (a genuine calc of 0 tonnes) still presents as 0, not NaN or a crash", () => {
    const pres = presentCo2Tonnes(0);
    expect(pres.rounded).toBe(0);
    expect(pres.bandLow).toBe(0);
  });
});

describe("presentDollars", () => {
  it("rounds a dollar figure to 2 significant figures", () => {
    expect(presentDollars(123456)).toBe(120000);
  });

  it("does not emit to-the-dollar precision for a large figure", () => {
    const rounded = presentDollars(9876543.21);
    expect(rounded).not.toBe(9876543.21);
    expect(rounded).toBe(9900000);
  });
});
