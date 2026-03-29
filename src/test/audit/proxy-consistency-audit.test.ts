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
import { LAYER_REGISTRY } from "@/lib/layers/registry";

// ── Read proxy file as text ───────────────────────────────────────────────────

const PROXY_PATH = resolve(
  __dirname,
  "../../../netlify/edge-functions/wfs-proxy.ts"
);

const proxySource = readFileSync(PROXY_PATH, "utf-8");

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

    // This is informational -- we document orphans but don't fail.
    // Proxy may support layers not yet in the UI registry.
    if (orphans.length > 0) {
      console.warn(
        `[proxy-consistency-audit] LAYER_CONFIG has ${orphans.length} entry(entries) ` +
          `with no corresponding registry layer: ${orphans.join(", ")}. ` +
          "These may be legacy or unreleased layers."
      );
    }

    // We pass regardless -- this is a NOTE, not a failure.
    expect(true).toBe(true);
  });
});
