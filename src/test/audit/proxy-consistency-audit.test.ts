/**
 * Part B — Check 8: WFS Proxy ↔ Registry Consistency
 *
 * The WFS proxy (netlify/edge-functions/wfs-proxy.ts) must have a LAYER_CONFIG
 * entry for every registry layer with source.type === "wfs". This check:
 *
 *   - Verifies every WFS registry layer has a matching LAYER_CONFIG entry
 *   - Verifies typeName matches between proxy and registry
 *   - Verifies CQL filters match where both define them
 *   - Verifies PROPERTY_WHITELIST covers properties referenced in paint/filter
 *     expressions for layers that have a whitelist entry
 *
 * The proxy is a Deno edge function -- not importable in Node/vitest. We read
 * it as text and extract config with regex/string matching. This is intentionally
 * brittle: if the proxy format changes, this test breaks loudly.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { LAYER_REGISTRY, CUTBLOCK_AREA_CAP_HA } from "@/lib/layers/registry";
import {
  FOREST_AGE_CLASSES,
  AGE_THRESHOLDS,
} from "@/lib/taxonomy/forest-age";
import { COMPANY_REGISTRY } from "@/data/companies";

// ── Read proxy file as text ───────────────────────────────────────────────────

const PROXY_PATH = resolve(
  __dirname,
  "../../../netlify/edge-functions/wfs-proxy.ts"
);

const proxySource = readFileSync(PROXY_PATH, "utf-8");

const EXTRACTORS_PATH = resolve(
  __dirname,
  "../../../scripts/lib/extractors.ts"
);

const extractorsSource = readFileSync(EXTRACTORS_PATH, "utf-8");

// ── Parse LAYER_CONFIG from proxy source ─────────────────────────────────────
//
// The LAYER_CONFIG block looks like:
//   const LAYER_CONFIG: Record<string, WFSLayerConfig> = {
//     "forest-age": {
//       url: "https://...",
//       typeName: "pub:...",
//       cqlFilter: "...",
//     },
//     ...
//   };
//
// Strategy: extract the block, then match each layer entry.

interface ParsedLayerConfig {
  id: string;
  url: string | null;
  typeName: string | null;
  cqlFilter: string | null;
}

function parseProxyLayerConfig(source: string): Map<string, ParsedLayerConfig> {
  const result = new Map<string, ParsedLayerConfig>();

  // Find the LAYER_CONFIG block start
  const blockStart = source.indexOf("const LAYER_CONFIG:");
  if (blockStart === -1) {
    throw new Error(
      "Could not find LAYER_CONFIG in wfs-proxy.ts. Has the proxy format changed?"
    );
  }

  // Find the matching closing brace for the LAYER_CONFIG object
  // Count brace depth starting from the first { after LAYER_CONFIG:
  const openBrace = source.indexOf("{", blockStart);
  if (openBrace === -1) {
    throw new Error("Could not find opening brace of LAYER_CONFIG");
  }

  let depth = 0;
  let closeBrace = openBrace;
  for (let i = openBrace; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) {
        closeBrace = i;
        break;
      }
    }
  }

  const block = source.slice(openBrace, closeBrace + 1);

  // Match each layer entry: "layer-id": { ... } or unquoted: layerId: { ... }
  // The LAYER_CONFIG uses both quoted keys (for hyphenated IDs like "forest-age")
  // and unquoted keys (for simple IDs like parks, conservancies, cutblocks).
  const layerPattern = /(?:"([^"]+)"|([a-zA-Z][\w-]*))\s*:\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g;
  let match: RegExpExecArray | null;

  while ((match = layerPattern.exec(block)) !== null) {
    const id = match[1] ?? match[2]; // quoted or unquoted key
    const body = match[3];

    // Extract url
    const urlMatch = body.match(/url:\s*"([^"]+)"/);
    const url = urlMatch ? urlMatch[1] : null;

    // Extract typeName
    const typeNameMatch = body.match(/typeName:\s*"([^"]+)"/);
    const typeName = typeNameMatch ? typeNameMatch[1] : null;

    // Extract cqlFilter
    const cqlMatch = body.match(/cqlFilter:\s*"([^"]+)"/);
    const cqlFilter = cqlMatch ? cqlMatch[1] : null;

    result.set(id, { id, url, typeName, cqlFilter });
  }

  return result;
}

// ── Parse PROPERTY_WHITELIST from proxy source ────────────────────────────────

type ProxyWhitelist = Map<string, Set<string>>;

function parseProxyWhitelist(source: string): ProxyWhitelist {
  const result: ProxyWhitelist = new Map();

  const blockStart = source.indexOf("const PROPERTY_WHITELIST:");
  if (blockStart === -1) return result; // No whitelist section

  const openBrace = source.indexOf("{", blockStart);
  if (openBrace === -1) return result;

  let depth = 0;
  let closeBrace = openBrace;
  for (let i = openBrace; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) {
        closeBrace = i;
        break;
      }
    }
  }

  const block = source.slice(openBrace, closeBrace + 1);

  // Match each entry: "layer-id": ["prop1", "prop2", ...]
  const entryPattern = /"([^"]+)":\s*\[([\s\S]*?)\]/g;
  let match: RegExpExecArray | null;

  while ((match = entryPattern.exec(block)) !== null) {
    const layerId = match[1];
    const arrayContent = match[2];
    // Extract all quoted strings from the array
    const props = new Set<string>();
    const propPattern = /"([^"]+)"/g;
    let propMatch: RegExpExecArray | null;
    while ((propMatch = propPattern.exec(arrayContent)) !== null) {
      props.add(propMatch[1]);
    }
    result.set(layerId, props);
  }

  return result;
}

// ── Helper: extract property references from paint/filter expressions ─────────

function extractGetReferences(expr: unknown): string[] {
  if (!Array.isArray(expr)) return [];
  const refs: string[] = [];
  if (expr[0] === "get" && typeof expr[1] === "string") refs.push(expr[1]);
  for (const child of expr) refs.push(...extractGetReferences(child));
  return refs;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Check 8: WFS Proxy ↔ Registry Consistency", () => {
  let layerConfig: Map<string, ParsedLayerConfig>;
  let propertyWhitelist: ProxyWhitelist;

  try {
    layerConfig = parseProxyLayerConfig(proxySource);
    propertyWhitelist = parseProxyWhitelist(proxySource);
  } catch (err) {
    it("proxy file is parseable", () => {
      throw new Error(`Failed to parse wfs-proxy.ts: ${(err as Error).message}`);
    });
    // Can't continue if parsing fails
    layerConfig = new Map();
    propertyWhitelist = new Map();
  }

  it("LAYER_CONFIG block is present and non-empty in wfs-proxy.ts", () => {
    expect(proxySource).toContain("const LAYER_CONFIG:");
    expect(layerConfig.size).toBeGreaterThan(0);
  });

  it("PROPERTY_WHITELIST block is present and non-empty in wfs-proxy.ts", () => {
    expect(proxySource).toContain("const PROPERTY_WHITELIST:");
    expect(propertyWhitelist.size).toBeGreaterThan(0);
  });

  describe("every WFS registry layer has a LAYER_CONFIG entry", () => {
    const wfsLayers = LAYER_REGISTRY.filter((l) => l.source.type === "wfs");

    for (const layer of wfsLayers) {
      it(`layer "${layer.id}" has a LAYER_CONFIG entry`, () => {
        expect(
          layerConfig.has(layer.id),
          `Registry layer "${layer.id}" (source.type === "wfs") has no LAYER_CONFIG ` +
            `entry in wfs-proxy.ts. The proxy will reject requests for this layer.`
        ).toBe(true);
      });
    }
  });

  describe("LAYER_CONFIG typeName matches registry source.typeName", () => {
    const wfsLayers = LAYER_REGISTRY.filter(
      (l) => l.source.type === "wfs" && "typeName" in l.source && l.source.typeName
    );

    for (const layer of wfsLayers) {
      it(`layer "${layer.id}" typeName matches`, () => {
        const config = layerConfig.get(layer.id);
        if (!config) return; // Covered by previous test

        const registryTypeName = (l: typeof layer) =>
          "typeName" in l.source ? l.source.typeName : null;
        const expected = registryTypeName(layer);
        if (!expected) return;

        expect(
          config.typeName,
          `layer "${layer.id}" proxy typeName "${config.typeName}" ` +
            `does not match registry typeName "${expected}"`
        ).toBe(expected);
      });
    }
  });

  describe("CQL filters match where both proxy and registry define them", () => {
    const wfsLayersWithCql = LAYER_REGISTRY.filter(
      (l) =>
        l.source.type === "wfs" &&
        "cqlFilter" in l.source &&
        l.source.cqlFilter
    );

    for (const layer of wfsLayersWithCql) {
      it(`layer "${layer.id}" CQL filter matches proxy`, () => {
        const config = layerConfig.get(layer.id);
        if (!config) return;

        const registryCql =
          "cqlFilter" in layer.source ? layer.source.cqlFilter : null;
        if (!registryCql) return;

        expect(
          config.cqlFilter,
          `layer "${layer.id}" proxy cqlFilter "${config.cqlFilter}" ` +
            `does not match registry cqlFilter "${registryCql}". ` +
            "The WFS query will fetch different data than the registry expects."
        ).toBe(registryCql);
      });
    }
  });

  describe("PROPERTY_WHITELIST covers registry paint/filter property references", () => {
    // For layers that have a PROPERTY_WHITELIST entry, verify the whitelist
    // includes all properties referenced by the registry's paint and filter expressions.
    // Missing whitelist entries mean the proxy strips properties the renderer needs.
    const violations: string[] = [];

    for (const layer of LAYER_REGISTRY) {
      const whitelist = propertyWhitelist.get(layer.id);
      if (!whitelist) continue; // No whitelist for this layer is fine

      // Collect all property references from paint expressions
      const paintRefs = new Set<string>();
      for (const val of Object.values(layer.style.paint)) {
        for (const ref of extractGetReferences(val)) {
          paintRefs.add(ref);
        }
      }

      // Collect references from filter
      if (layer.style.filter) {
        for (const ref of extractGetReferences(layer.style.filter)) {
          paintRefs.add(ref);
        }
      }

      // Check each referenced property is in the whitelist
      for (const ref of paintRefs) {
        if (!whitelist.has(ref)) {
          violations.push(
            `layer "${layer.id}" paint/filter references "${ref}" but ` +
              `PROPERTY_WHITELIST["${layer.id}"] does not include it. ` +
              `The proxy will strip this property before the renderer sees it.`
          );
        }
      }
    }

    it("PROPERTY_WHITELIST includes all paint/filter property references", () => {
      if (violations.length > 0) {
        throw new Error(
          `PROPERTY_WHITELIST gaps found:\n${violations.join("\n")}`
        );
      }
      expect(violations).toHaveLength(0);
    });
  });

  it("no LAYER_CONFIG orphans (proxy entries not in registry)", () => {
    // Warn (not fail) about proxy entries that have no corresponding registry layer.
    // These may be legacy layers or unreleased layers. Document them.
    const registryIds = new Set(LAYER_REGISTRY.map((l) => l.id));
    const orphans: string[] = [];

    for (const [id] of layerConfig) {
      if (!registryIds.has(id)) {
        orphans.push(id);
      }
    }

    const sanctionedOrphans = new Set([
      "watershed-boundaries",
      "operating-territories",
      "planned-cutblocks",
    ]);

    const unsanctioned = orphans.filter((id) => !sanctionedOrphans.has(id));
    expect(
      unsanctioned,
      `Unexpected proxy LAYER_CONFIG orphan(s): ${unsanctioned.join(", ")}. ` +
        "Add to the registry, remove from the proxy, or add to sanctionedOrphans with a reason."
    ).toHaveLength(0);
  });
});

// ── Check 9: Forest age taxonomy consistency ──────────────────────────────────
//
// The proxy and extractors keep local copies of the forest age classification
// (Deno edge fn / Node tooling can't import from src/). These tests verify
// the copies match the canonical taxonomy in src/lib/taxonomy/forest-age.ts.

describe("Check 9: Forest Age Taxonomy Consistency", () => {
  // --- Helper: extract the 4 class string values from a ForestClass type ---
  function extractClassValues(source: string): string[] {
    // Match: type ForestClass = "old-growth" | "mature" | "young" | "harvested";
    const typeMatch = source.match(
      /type\s+ForestClass\s*=\s*([^;]+);/
    );
    if (!typeMatch) return [];
    const values: string[] = [];
    const strPattern = /"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = strPattern.exec(typeMatch[1])) !== null) {
      values.push(m[1]);
    }
    return values;
  }

  // --- Helper: extract threshold numbers from classify function ---
  function extractThresholds(source: string): { oldGrowth: number | null; mature: number | null } {
    // Match: age >= 250 and age >= 80 patterns
    const ogMatch = source.match(/age\s*>=\s*(\d+)\s*\)\s*return\s*"old-growth"/);
    const matMatch = source.match(/age\s*>=\s*(\d+)\s*\)\s*return\s*"mature"/);
    return {
      oldGrowth: ogMatch ? Number(ogMatch[1]) : null,
      mature: matMatch ? Number(matMatch[1]) : null,
    };
  }

  // --- Helper: check HARVEST_DATE-wins precedence ---
  function harvestDateWins(source: string): boolean {
    // In both proxy and extractors, the classify function checks harvest date
    // BEFORE age. If harvest date check comes first → harvest wins.
    const classifyBlock = source.match(
      /function\s+(?:classifyVRIFeature|classify)\s*\([^)]*\)[^{]*\{([\s\S]*?\n\})/
    );
    if (!classifyBlock) return false;
    const body = classifyBlock[1];
    const hdIndex = body.indexOf("harvested");
    const ageIndex = body.indexOf("old-growth");
    return hdIndex >= 0 && ageIndex >= 0 && hdIndex < ageIndex;
  }

  const canonicalClasses = [...FOREST_AGE_CLASSES];

  describe("proxy (wfs-proxy.ts)", () => {
    it("ForestClass type values match canonical taxonomy", () => {
      const proxyClasses = extractClassValues(proxySource);
      expect(proxyClasses.sort()).toEqual([...canonicalClasses].sort());
    });

    it("age thresholds match canonical values", () => {
      const t = extractThresholds(proxySource);
      expect(t.oldGrowth).toBe(AGE_THRESHOLDS.oldGrowth);
      expect(t.mature).toBe(AGE_THRESHOLDS.mature);
    });

    it("HARVEST_DATE wins over age (correct precedence)", () => {
      expect(harvestDateWins(proxySource)).toBe(true);
    });
  });

  describe("extractors (scripts/lib/extractors.ts)", () => {
    it("ForestClass type values match canonical taxonomy", () => {
      const extractorClasses = extractClassValues(extractorsSource);
      expect(extractorClasses.sort()).toEqual([...canonicalClasses].sort());
    });

    it("age thresholds match canonical values", () => {
      const t = extractThresholds(extractorsSource);
      expect(t.oldGrowth).toBe(AGE_THRESHOLDS.oldGrowth);
      expect(t.mature).toBe(AGE_THRESHOLDS.mature);
    });

    it("HARVEST_DATE wins over age (correct precedence)", () => {
      expect(harvestDateWins(extractorsSource)).toBe(true);
    });
  });
});

// ── Check 10: Company Map Consistency ─────────────────────────────────────────
//
// The proxy keeps its own COMPANY_MAP copy (Deno can't import from src/).
// Verify every entry matches src/data/companies.ts.

describe("Check 10: Company Map Consistency", () => {
  // Parse COMPANY_MAP from proxy source
  function parseCompanyMap(source: string): Map<string, string> {
    const result = new Map<string, string>();
    const blockStart = source.indexOf("const COMPANY_MAP:");
    if (blockStart === -1) return result;

    const openBrace = source.indexOf("{", blockStart);
    if (openBrace === -1) return result;

    let depth = 0;
    let closeBrace = openBrace;
    for (let i = openBrace; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") {
        depth--;
        if (depth === 0) { closeBrace = i; break; }
      }
    }

    const block = source.slice(openBrace, closeBrace + 1);
    const entryPattern = /"(\d+)":\s*"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = entryPattern.exec(block)) !== null) {
      result.set(m[1], m[2]);
    }
    return result;
  }

  // Build canonical map from COMPANY_REGISTRY
  const canonical = new Map<string, string>();
  for (const c of COMPANY_REGISTRY) {
    for (const cn of c.clientNumbers) {
      canonical.set(cn, c.id);
    }
  }

  it("proxy COMPANY_MAP entries match src/data/companies.ts", () => {
    const proxyMap = parseCompanyMap(proxySource);
    expect(proxyMap.size).toBeGreaterThan(0);
    for (const [clientNum, slug] of proxyMap) {
      expect(
        canonical.get(clientNum),
        `Proxy maps CLIENT_NUMBER "${clientNum}" → "${slug}" but companies.ts ` +
          `maps it to "${canonical.get(clientNum) ?? "(missing)"}"`
      ).toBe(slug);
    }
    // Also check no canonical entries are missing from the proxy
    for (const [clientNum, slug] of canonical) {
      expect(
        proxyMap.get(clientNum),
        `companies.ts maps CLIENT_NUMBER "${clientNum}" → "${slug}" but ` +
          `proxy COMPANY_MAP is missing this entry`
      ).toBe(slug);
    }
  });

  it("extractors imports lookupCompany from src/data/companies.ts (no local copy)", () => {
    // Extractors should import from companies.ts, not maintain a local COMPANY_MAP
    expect(extractorsSource).toContain("lookupCompany");
    expect(extractorsSource).not.toMatch(/^export const COMPANY_MAP/m);
  });
});

// ── Check 11: the cutblock area cap is the same number in the registry filter and the proxy CQL ──
//
// The registry `cutblocks` entry has no source.cqlFilter (the cap is a MapLibre
// style.filter), so the "CQL filters match" check above never visits it, and
// the proxy's `PLANNED_GROSS_BLOCK_AREA < 2000` was guarded by nothing. Both
// sides now read CUTBLOCK_AREA_CAP_HA; this pins the proxy literal to it.
//
// Mutation-verified: changing the proxy CQL to `< 1500` fails this.

describe("Check 11: cutblock area cap (registry filter == proxy CQL)", () => {
  it("proxy LAYER_CONFIG.cutblocks.cqlFilter uses CUTBLOCK_AREA_CAP_HA", () => {
    const config = parseProxyLayerConfig(proxySource).get("cutblocks");
    expect(config, "proxy has no LAYER_CONFIG entry for cutblocks").toBeDefined();
    expect(config!.cqlFilter).toBe(`PLANNED_GROSS_BLOCK_AREA < ${CUTBLOCK_AREA_CAP_HA}`);
  });

  it("registry cutblocks style.filter embeds CUTBLOCK_AREA_CAP_HA", () => {
    const cutblocks = LAYER_REGISTRY.find((l) => l.id === "cutblocks")!;
    expect(JSON.stringify(cutblocks.style.filter)).toContain(`,${CUTBLOCK_AREA_CAP_HA}]`);
  });
});
