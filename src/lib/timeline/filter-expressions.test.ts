/**
 * Unit tests for timeline filter expression builders.
 *
 * These functions produce MapLibre expression arrays.
 * Tests verify structure and composition correctness.
 */

import { describe, it, expect } from "vitest";
import {
  buildYearExpression,
  buildYearFilter,
  composeFilters,
  buildAgeGradedOpacity,
} from "./filter-expressions";

// ── buildYearExpression ───────────────────────────────────────────────────────

describe("buildYearExpression", () => {
  it("returns to-number+slice expression for DATE fields", () => {
    const expr = buildYearExpression("DISTURBANCE_START_DATE");
    expect(expr).toEqual(["to-number", ["slice", ["get", "DISTURBANCE_START_DATE"], 0, 4]]);
  });

  it("returns to-number expression for non-DATE fields (e.g. FIRE_YEAR)", () => {
    const expr = buildYearExpression("FIRE_YEAR");
    expect(expr).toEqual(["to-number", ["get", "FIRE_YEAR"]]);
  });

  it("matches DATE anywhere in the field name", () => {
    const expr = buildYearExpression("HARVEST_DATE");
    expect(expr).toEqual(["to-number", ["slice", ["get", "HARVEST_DATE"], 0, 4]]);
  });

  it("does not use slice for fields without DATE", () => {
    const expr = buildYearExpression("YEAR_LOGGED");
    expect(expr[0]).toBe("to-number");
    // Should be a 2-element array: ["to-number", ["get", field]]
    expect(expr).toHaveLength(2);
    expect(expr[1]).toEqual(["get", "YEAR_LOGGED"]);
  });
});

// ── buildYearFilter ───────────────────────────────────────────────────────────

describe("buildYearFilter", () => {
  it("returns a <= expression with year expression on left", () => {
    const filter = buildYearFilter("FIRE_YEAR", 2000);
    expect(filter[0]).toBe("<=");
    expect(filter[1]).toEqual(["to-number", ["get", "FIRE_YEAR"]]);
    expect(filter[2]).toBe(2000);
  });

  it("uses DATE field expression for date fields", () => {
    const filter = buildYearFilter("DISTURBANCE_START_DATE", 1990);
    expect(filter[0]).toBe("<=");
    expect(filter[1]).toEqual(["to-number", ["slice", ["get", "DISTURBANCE_START_DATE"], 0, 4]]);
    expect(filter[2]).toBe(1990);
  });

  it("produces a 3-element array [op, yearExpr, year]", () => {
    const filter = buildYearFilter("FIRE_YEAR", 2025);
    expect(filter).toHaveLength(3);
  });
});

// ── composeFilters ────────────────────────────────────────────────────────────

describe("composeFilters", () => {
  const base = ["<", ["to-number", ["get", "AREA"]], 2000] as unknown[];
  const classFilter = ["in", ["get", "class"], ["literal", ["old-growth"]]] as unknown[];
  const yearFilter = ["<=", ["to-number", ["get", "FIRE_YEAR"]], 2000] as unknown[];

  it("returns null when all inputs are null", () => {
    expect(composeFilters(null, null, null)).toBeNull();
  });

  it("returns the single filter directly when only one is non-null", () => {
    expect(composeFilters(base, null, null)).toEqual(base);
    expect(composeFilters(null, classFilter, null)).toEqual(classFilter);
    expect(composeFilters(null, null, yearFilter)).toEqual(yearFilter);
  });

  it("wraps two filters in ['all', ...]", () => {
    const result = composeFilters(null, classFilter, yearFilter);
    expect(result).toEqual(["all", classFilter, yearFilter]);
  });

  it("wraps three filters in ['all', ...]", () => {
    const result = composeFilters(base, classFilter, yearFilter);
    expect(result).toEqual(["all", base, classFilter, yearFilter]);
  });

  it("does not double-wrap when one argument is already an ['all', ...] expression", () => {
    // composeFilters treats inputs as opaque -- no special-casing of 'all'.
    // Each non-null input becomes one element of the composed all-expression.
    const existing = ["all", base, classFilter] as unknown[];
    const result = composeFilters(existing, null, yearFilter);
    expect(result).toEqual(["all", existing, yearFilter]);
  });
});

// ── buildAgeGradedOpacity ─────────────────────────────────────────────────────

describe("buildAgeGradedOpacity", () => {
  it("returns an interpolate expression", () => {
    const expr = buildAgeGradedOpacity("FIRE_YEAR", 2000);
    expect(expr[0]).toBe("interpolate");
    expect(expr[1]).toEqual(["linear"]);
  });

  it("uses subtraction expression (currentYear - featureYear) as the interpolation input", () => {
    const expr = buildAgeGradedOpacity("FIRE_YEAR", 2000);
    // expr[2] is the input: ["-", year, yearExpr]
    expect(expr[2]).toEqual(["-", 2000, ["to-number", ["get", "FIRE_YEAR"]]]);
  });

  it("anchors opacity at 0.8 for age 0, 0.4 for age 20, 0.15 for age 50", () => {
    const expr = buildAgeGradedOpacity("FIRE_YEAR", 2000);
    // expr is ["interpolate", ["linear"], inputExpr, 0, 0.8, 20, 0.4, 50, 0.15]
    expect(expr[3]).toBe(0);
    expect(expr[4]).toBe(0.8);
    expect(expr[5]).toBe(20);
    expect(expr[6]).toBe(0.4);
    expect(expr[7]).toBe(50);
    expect(expr[8]).toBe(0.15);
  });

  it("works correctly for DATE fields", () => {
    const expr = buildAgeGradedOpacity("DISTURBANCE_START_DATE", 1990);
    expect(expr[2]).toEqual([
      "-",
      1990,
      ["to-number", ["slice", ["get", "DISTURBANCE_START_DATE"], 0, 4]],
    ]);
  });

  it("uses the provided year in the subtraction (not a hardcoded value)", () => {
    const expr1 = buildAgeGradedOpacity("FIRE_YEAR", 2010);
    const expr2 = buildAgeGradedOpacity("FIRE_YEAR", 1980);
    // The interpolation input should reflect the year param
    expect((expr1[2] as unknown[])[1]).toBe(2010);
    expect((expr2[2] as unknown[])[1]).toBe(1980);
  });
});
