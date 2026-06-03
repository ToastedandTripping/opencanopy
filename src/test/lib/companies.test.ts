/**
 * Logging-company registry consistency.
 *
 * The "Logging Companies" (tenure-cutblocks) layer is an accountability layer:
 * the legend, the fill colors, and the popup must all agree about which
 * licensee a polygon belongs to. These tests pin that agreement against the
 * company_id values that actually occur in the v10 tile data (verified
 * 2026-06-02: 7 named companies + "other").
 */

import { describe, it, expect } from "vitest";
import {
  COMPANY_REGISTRY,
  PRESENT_COMPANIES,
  OTHER_COMPANY_COLOR,
  companyColorExpression,
  getCompanyDisplayName,
} from "@/data/companies";
import { LAYER_REGISTRY } from "@/lib/layers/registry";

/** The company_id slugs that occur in the current preprocessed cutblock data. */
const PRESENT_IN_DATA = [
  "canfor",
  "west-fraser",
  "tolko",
  "interfor",
  "western-forest-products",
  "carrier",
  "canoe-forest",
].sort();

/** Registry entries with no features in the current data. */
const ABSENT_IN_DATA = ["bc-timber-sales", "mosaic"];

describe("company registry ↔ data consistency", () => {
  it("PRESENT_COMPANIES matches the company_ids actually in the data", () => {
    expect(PRESENT_COMPANIES.map((c) => c.id).sort()).toEqual(PRESENT_IN_DATA);
  });

  it("zero-feature companies are not marked present", () => {
    for (const id of ABSENT_IN_DATA) {
      const c = COMPANY_REGISTRY.find((x) => x.id === id);
      expect(c, `${id} missing from registry`).toBeDefined();
      expect(c?.present, `${id} should not be marked present`).toBeFalsy();
    }
  });
});

describe("companyColorExpression", () => {
  const expr = companyColorExpression();

  it("is a match expression on company_id with a gray fallback", () => {
    expect(expr[0]).toBe("match");
    expect(expr[1]).toEqual(["get", "company_id"]);
    expect(expr[expr.length - 1]).toBe(OTHER_COMPANY_COLOR);
  });

  it("includes only present companies (no dead color branches)", () => {
    const slugs = PRESENT_COMPANIES.map((c) => c.id);
    for (const slug of slugs) expect(expr).toContain(slug);
    for (const absent of ABSENT_IN_DATA) expect(expr).not.toContain(absent);
  });
});

describe("getCompanyDisplayName", () => {
  it("maps known slugs to display names", () => {
    expect(getCompanyDisplayName("west-fraser")).toBe("West Fraser");
    expect(getCompanyDisplayName("canfor")).toBe("Canfor");
  });

  it("title-cases the 'other' bucket and unknown slugs", () => {
    expect(getCompanyDisplayName("other")).toBe("Other");
    expect(getCompanyDisplayName("some-new-co")).toBe("Some New Co");
  });
});

describe("tenure-cutblocks legend reflects the real data", () => {
  const layer = LAYER_REGISTRY.find((l) => l.id === "tenure-cutblocks");
  const labels = layer?.legendItems.map((i) => i.label) ?? [];

  it("shows every present company plus an Other swatch", () => {
    for (const c of PRESENT_COMPANIES) expect(labels).toContain(c.displayName);
    expect(labels).toContain("Other");
    expect(labels).toHaveLength(PRESENT_COMPANIES.length + 1);
  });

  it("does not show zero-feature companies", () => {
    expect(labels).not.toContain("BC Timber Sales");
    expect(labels).not.toContain("Mosaic Forest Management");
  });

  it("shows the two companies the old positional slice dropped", () => {
    expect(labels).toContain("Carrier Lumber");
    expect(labels).toContain("Canoe Forest Products");
  });
});
