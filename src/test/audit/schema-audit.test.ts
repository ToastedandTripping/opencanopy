/**
 * Part B — Check 7: Property Schema Source of Truth
 *          Check 12: Popup Property References
 *
 * Check 7: Derives a canonical LAYER_PROPERTY_SCHEMAS map from what
 * build-tiles.ts actually extracts per source layer. Verifies that
 * registry paint expressions, filter expressions, and timelineField
 * values only reference properties present in the schema.
 *
 * Check 12: The MapPopup component uses PRIORITY_KEYS to render feature
 * properties. Verifies each key in PRIORITY_KEYS exists in the schema
 * for at least one source layer (i.e., the popup won't silently show
 * nothing for any of its defined property labels).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { LAYER_REGISTRY } from "@/lib/layers/registry";
import { POPUP_PRIORITY_KEYS } from "@/lib/map/popup-keys";
import { LAYER_PROPERTIES } from "../../../scripts/lib/property-schema";
import { derivePropertySchemas } from "./schema-helpers";

// ── Canonical property schemas per source layer ──────────────────────────────
// Derived programmatically from the pipeline extractors. See schema-helpers.ts.

export const LAYER_PROPERTY_SCHEMAS = derivePropertySchemas();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract ["get", "propName"] references from any nested expression. */
function extractGetReferences(expr: unknown): string[] {
  if (!Array.isArray(expr)) return [];
  const refs: string[] = [];
  if (expr[0] === "get" && typeof expr[1] === "string") {
    refs.push(expr[1]);
  }
  for (const child of expr) {
    refs.push(...extractGetReferences(child));
  }
  return refs;
}

/** Extract ["has", "propName"] references from any nested expression. */
function extractHasReferences(expr: unknown): string[] {
  if (!Array.isArray(expr)) return [];
  const refs: string[] = [];
  if (expr[0] === "has" && typeof expr[1] === "string") {
    refs.push(expr[1]);
  }
  for (const child of expr) {
    refs.push(...extractHasReferences(child));
  }
  return refs;
}

/** All property references (get + has) from an expression. */
function extractAllPropertyRefs(expr: unknown): string[] {
  return [...new Set([...extractGetReferences(expr), ...extractHasReferences(expr)])];
}

// ── Check 7: Paint expression property references ─────────────────────────────

describe("Check 7: Property schema — paint expression references", () => {
  it("all fill-color / line-color / circle-color expressions reference known schema properties", () => {
    const violations: string[] = [];

    for (const layer of LAYER_REGISTRY) {
      if (!layer.tileSource) continue;
      const sourceLayer = layer.tileSource.sourceLayer;
      const schema = LAYER_PROPERTY_SCHEMAS[sourceLayer];
      if (!schema) continue;

      const paint = layer.style.paint;
      const colorKeys = ["fill-color", "line-color", "circle-color"];

      for (const colorKey of colorKeys) {
        if (!(colorKey in paint)) continue;
        const refs = extractAllPropertyRefs(paint[colorKey]);
        for (const ref of refs) {
          if (!schema.has(ref)) {
            violations.push(
              `layer "${layer.id}" paint["${colorKey}"] references "${ref}" ` +
                `which is not in schema for source layer "${sourceLayer}". ` +
                `Known: [${[...schema].join(", ")}]`
            );
          }
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Paint expressions reference properties outside schema:\n${violations.join("\n")}`
      );
    }

    expect(violations).toHaveLength(0);
  });
});

// ── Check 7: Filter expression property references ────────────────────────────

describe("Check 7: Property schema — filter expression references", () => {
  it("all filter expressions reference known schema properties", () => {
    const violations: string[] = [];

    for (const layer of LAYER_REGISTRY) {
      if (!layer.tileSource) continue;
      const sourceLayer = layer.tileSource.sourceLayer;
      const schema = LAYER_PROPERTY_SCHEMAS[sourceLayer];
      if (!schema) continue;
      if (!layer.style.filter) continue;

      const refs = extractAllPropertyRefs(layer.style.filter);
      for (const ref of refs) {
        if (!schema.has(ref)) {
          violations.push(
            `layer "${layer.id}" filter references "${ref}" ` +
              `which is not in schema for source layer "${sourceLayer}". ` +
              `Known: [${[...schema].join(", ")}]`
          );
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `Filter expressions reference properties outside schema:\n${violations.join("\n")}`
      );
    }

    expect(violations).toHaveLength(0);
  });
});

// ── Check 7: timelineField schema validation ──────────────────────────────────

describe("Check 7: Property schema — timelineField values", () => {
  it("timelineField values are present in the source layer schema", () => {
    const violations: string[] = [];

    for (const layer of LAYER_REGISTRY) {
      if (!layer.timelineField) continue;
      if (!layer.tileSource) {
        violations.push(
          `layer "${layer.id}" has timelineField "${layer.timelineField}" but no tileSource. ` +
            "Timeline field filtering requires PMTiles data."
        );
        continue;
      }

      const sourceLayer = layer.tileSource.sourceLayer;
      const schema = LAYER_PROPERTY_SCHEMAS[sourceLayer];
      if (!schema) continue;

      if (!schema.has(layer.timelineField)) {
        violations.push(
          `layer "${layer.id}" timelineField "${layer.timelineField}" ` +
            `is not in schema for source layer "${sourceLayer}". ` +
            `Known: [${[...schema].join(", ")}]`
        );
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `timelineField values outside schema:\n${violations.join("\n")}`
      );
    }

    expect(violations).toHaveLength(0);
  });

  it("exactly these layers carry timelineField (pinned; edit deliberately when timeline support changes)", () => {
    // The timeline UI, the scented track, and the story scrub tables all
    // assume this set. Adding or dropping timeline support on a layer is a
    // product change, so it must show up here, not slip through.
    const timelineLayers = LAYER_REGISTRY.filter((l) => l.timelineField).map((l) => l.id).sort();
    expect(timelineLayers).toEqual(["cutblocks", "fire-history", "tenure-cutblocks"]);
  });
});

// ── Check 7: timelineRange must be set when timelineField is set ──────────────

describe("Check 7: Property schema — timelineRange presence and validity", () => {
  it("every layer with timelineField also has timelineRange", () => {
    const violations: string[] = [];

    for (const layer of LAYER_REGISTRY) {
      if (!layer.timelineField) continue;

      if (!layer.timelineRange) {
        violations.push(
          `layer "${layer.id}" has timelineField "${layer.timelineField}" ` +
            `but is missing timelineRange. Add timelineRange: [startYear, endYear].`
        );
        continue;
      }

      const [start, end] = layer.timelineRange;

      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        violations.push(
          `layer "${layer.id}" timelineRange [${start}, ${end}] must contain integers.`
        );
      }
      if (start >= end) {
        violations.push(
          `layer "${layer.id}" timelineRange [${start}, ${end}] is invalid: start must be < end.`
        );
      }
      if (start < 1800 || end > 2100) {
        violations.push(
          `layer "${layer.id}" timelineRange [${start}, ${end}] looks unreasonable. ` +
            "Expected year values between 1800 and 2100."
        );
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `timelineRange validation failures:\n${violations.join("\n")}`
      );
    }

    expect(violations).toHaveLength(0);
  });

  it("timelineRange values are consistent with known data extents", () => {
    // Spot-check the specific values defined for each timeline layer.
    // These come from the data source documentation and must be updated
    // if the upstream data changes.
    const fireHistory = LAYER_REGISTRY.find((l) => l.id === "fire-history");
    expect(fireHistory?.timelineRange).toEqual([1917, 2025]);

    const cutblocks = LAYER_REGISTRY.find((l) => l.id === "cutblocks");
    expect(cutblocks?.timelineRange).toEqual([1950, 2025]);

    const tenureCutblocks = LAYER_REGISTRY.find((l) => l.id === "tenure-cutblocks");
    expect(tenureCutblocks?.timelineRange).toEqual([1950, 2025]);
  });
});

// ── Check 12: Popup PRIORITY_KEYS property references ────────────────────────

describe("Check 12: Popup property references", () => {
  /**
   * MapPopup's PRIORITY_KEYS define what properties the popup renders
   * in priority order. Each key should either:
   *   a) Exist in at least one source layer's schema, OR
   *   b) Be a WFS-only property (layers without tiles, e.g., fish-streams,
   *      species-at-risk) -- these aren't in LAYER_PROPERTY_SCHEMAS since
   *      they come directly from WFS and aren't tile-built.
   *
   * The popup is generic (renders whatever feature.properties contains),
   * but PRIORITY_KEYS determines display order. A key that exists nowhere
   * in any schema AND nowhere in WFS whitelists is dead weight.
   *
   * Source of PRIORITY_KEYS: src/lib/map/popup-keys.ts — the SAME list
   * MapPopup renders from (a hand-copy here drifted silently before 2026-09).
   * The WFS-side set is parsed from the proxy's PROPERTY_WHITELIST rather
   * than hand-listed; the only hand-list left is for layers the proxy does
   * not whitelist at all (their WFS properties pass through unfiltered).
   */
  // Every property the proxy can return for any layer: parsed from the
  // PROPERTY_WHITELIST literal in wfs-proxy.ts (Deno, not importable here).
  const proxySource = readFileSync(
    resolve(__dirname, "../../../netlify/edge-functions/wfs-proxy.ts"),
    "utf-8"
  );
  const whitelistStart = proxySource.indexOf("const PROPERTY_WHITELIST");
  const whitelistBlock = proxySource.slice(
    whitelistStart,
    proxySource.indexOf("\n};", whitelistStart)
  );
  const PROXY_WHITELISTED_PROPERTIES = new Set(
    [...whitelistBlock.matchAll(/"([A-Za-z0-9_]+)"/g)].map((m) => m[1])
  );
  const PROXY_WHITELISTED_LAYERS = new Set(
    [...whitelistBlock.matchAll(/^\s{2}"?([a-z0-9-]+)"?:/gm)].map((m) => m[1])
  );

  // Layers with NO whitelist entry return every upstream property. Popup keys
  // that only exist there cannot be derived from anything in the repo, so
  // they are listed by hand — and the test below checks that each such layer
  // really has no whitelist (if one is added, this list must be revisited).
  const PASS_THROUGH_LAYER_KEYS: Record<string, string[]> = {
    parks: ["PROTECTED_LANDS_NAME", "PARK_CLASS"],
    conservancies: ["CONSERVANCY_AREA_NAME"],
  };

  const allSchemaProperties = new Set<string>();
  for (const props of Object.values(LAYER_PROPERTY_SCHEMAS)) {
    for (const p of props) allSchemaProperties.add(p);
  }

  it("the proxy whitelist parsed from source is non-trivial", () => {
    expect(whitelistStart).toBeGreaterThan(0);
    expect(PROXY_WHITELISTED_PROPERTIES.size).toBeGreaterThan(20);
    expect(PROXY_WHITELISTED_LAYERS.has("forest-age")).toBe(true);
  });

  it("pass-through layers really have no proxy whitelist entry", () => {
    for (const layerId of Object.keys(PASS_THROUGH_LAYER_KEYS)) {
      expect(
        PROXY_WHITELISTED_LAYERS.has(layerId),
        `layer "${layerId}" now has a PROPERTY_WHITELIST entry — move its popup keys out of PASS_THROUGH_LAYER_KEYS`
      ).toBe(false);
    }
  });

  it("every popup PRIORITY_KEY is a tile schema property, a proxy-whitelisted property, or a documented pass-through key", () => {
    const passThrough = new Set(Object.values(PASS_THROUGH_LAYER_KEYS).flat());
    const unmatched = POPUP_PRIORITY_KEYS.filter(
      (key) =>
        !allSchemaProperties.has(key) &&
        !PROXY_WHITELISTED_PROPERTIES.has(key) &&
        !passThrough.has(key)
    );
    expect(
      unmatched,
      `MapPopup PRIORITY_KEYS reference properties no tile schema, proxy whitelist, or pass-through layer provides:\n` +
        unmatched.join("\n") +
        "\nThese keys will never render meaningful data."
    ).toHaveLength(0);
  });

  it("no PRIORITY_KEY is duplicated", () => {
    expect(new Set(POPUP_PRIORITY_KEYS).size).toBe(POPUP_PRIORITY_KEYS.length);
  });
});

// ── Check 13: scripts/lib/property-schema.ts keys are a subset of what the extractors emit ──

describe("Check 13: tile-audit property rules name properties the extractors actually emit", () => {
  // scripts/lib/property-schema.ts is the hand-maintained VALUE-rule set used by
  // the tile audits (audit-tiles A3, audit-property-deep P1). Its keys must be a
  // subset of the extractor output (schema-helpers derives that), or the tile
  // audit validates a property that no longer exists — loudly as 'missing' if
  // required, silently as 'not required' otherwise.
  for (const [layerName, rules] of Object.entries(LAYER_PROPERTIES)) {
    it(`${layerName}: every rule key is emitted by the extractor`, () => {
      const emitted = LAYER_PROPERTY_SCHEMAS[layerName];
      expect(emitted, `no derived schema for source layer "${layerName}"`).toBeDefined();
      const stale = Object.keys(rules).filter((k) => !emitted.has(k));
      expect(
        stale,
        `property-schema.ts rules for "${layerName}" name keys the extractor does not emit: ${stale.join(", ")}`
      ).toHaveLength(0);
    });
  }
});
