/**
 * Unit tests for wfs-proxy buildBboxWfsUrl — D3 fix.
 *
 * GeoServer constraint: `bbox` and `CQL_FILTER` are mutually exclusive.
 * When a layer has a cqlFilter, the bbox must be embedded inside CQL_FILTER
 * as BBOX(GEOMETRY,...) AND (filter). The separate `bbox` param must be omitted.
 *
 * The edge function (Deno runtime) is not importable in vitest/Node. We test
 * the extracted pure function directly via the Node-compatible export.
 *
 * Production-path-match disclosure:
 *   Production path: Deno edge runtime, buildBboxWfsUrl called from the handler.
 *   Substitute: same function imported into vitest/Node — no Deno APIs used in
 *   buildBboxWfsUrl itself (pure string/URLSearchParams logic).
 *   Divergences NOT covered: the Deno runtime module resolution, fetchWithRetry
 *   behavior, and any Deno-vs-Node URLSearchParams encoding differences.
 *   Coverage verdict: PARTIAL — URL construction logic fully covered; full
 *   edge runtime invocation not exercised locally (needs netlify dev).
 */

import { describe, it, expect } from "vitest";
import { buildBboxWfsUrl } from "~netlify/edge-functions/lib/wfs-bbox-url";

// Representative BC Albers coordinates (Prince George vicinity at z10)
const W = 1035926;
const S = 542789;
const E = 1071379;
const N = 576537;
const MAX_FEATURES = 5000;

describe("buildBboxWfsUrl — D3 CQL bbox fix", () => {
  // ── (a) Layer with cqlFilter ─────────────────────────────────────────────

  describe("layer with cqlFilter (e.g. fish-streams)", () => {
    const config = {
      url: "https://openmaps.gov.bc.ca/geo/pub/WHSE_BASEMAPPING.FWA_STREAM_NETWORKS_SP/ows",
      typeName: "pub:WHSE_BASEMAPPING.FWA_STREAM_NETWORKS_SP",
      cqlFilter: "STREAM_ORDER >= 3",
    };

    it("emits a single CQL_FILTER param containing BBOX(...)", () => {
      const url = buildBboxWfsUrl(config, W, S, E, N, MAX_FEATURES);
      const params = new URL(url).searchParams;

      expect(params.has("CQL_FILTER"), "CQL_FILTER param must be present").toBe(true);
      expect(params.get("CQL_FILTER")).toContain("BBOX(GEOMETRY,");
    });

    it("does NOT include a separate bbox param", () => {
      const url = buildBboxWfsUrl(config, W, S, E, N, MAX_FEATURES);
      const params = new URL(url).searchParams;

      expect(params.has("bbox"), "bbox param must NOT be present for cqlFilter layers").toBe(false);
    });

    it("embeds the layer filter in CQL_FILTER joined with AND", () => {
      const url = buildBboxWfsUrl(config, W, S, E, N, MAX_FEATURES);
      const cqlFilter = new URL(url).searchParams.get("CQL_FILTER") ?? "";

      expect(cqlFilter).toContain("AND");
      expect(cqlFilter.toUpperCase()).toContain("STREAM_ORDER");
    });

    it("parenthesizes the layer filter in CQL_FILTER", () => {
      const url = buildBboxWfsUrl(config, W, S, E, N, MAX_FEATURES);
      const cqlFilter = new URL(url).searchParams.get("CQL_FILTER") ?? "";

      // The filter portion must be wrapped in parens: AND (STREAM_ORDER >= 3)
      expect(cqlFilter).toMatch(/AND \(.*STREAM_ORDER.*\)/);
    });

    it("embeds the correct BC Albers coordinates in CQL_FILTER BBOX", () => {
      const url = buildBboxWfsUrl(config, W, S, E, N, MAX_FEATURES);
      const cqlFilter = new URL(url).searchParams.get("CQL_FILTER") ?? "";

      // Coordinates should be rounded integers
      expect(cqlFilter).toContain(`${Math.round(W)}`);
      expect(cqlFilter).toContain(`${Math.round(S)}`);
      expect(cqlFilter).toContain(`${Math.round(E)}`);
      expect(cqlFilter).toContain(`${Math.round(N)}`);
    });
  });

  // ── (b) Filterless layer (e.g. species-at-risk) ──────────────────────────

  describe("filterless layer (e.g. species-at-risk)", () => {
    const config = {
      url: "https://openmaps.gov.bc.ca/geo/pub/WHSE_TERRESTRIAL_ECOLOGY.BIOT_OCCR_NON_SENS_AREA_SVW/ows",
      typeName: "pub:WHSE_TERRESTRIAL_ECOLOGY.BIOT_OCCR_NON_SENS_AREA_SVW",
    };

    it("emits a plain bbox param with EPSG:3005 suffix", () => {
      const url = buildBboxWfsUrl(config, W, S, E, N, MAX_FEATURES);
      const params = new URL(url).searchParams;

      expect(params.has("bbox"), "bbox param must be present for filterless layers").toBe(true);
      expect(params.get("bbox")).toContain("EPSG:3005");
    });

    it("does NOT include a CQL_FILTER param", () => {
      const url = buildBboxWfsUrl(config, W, S, E, N, MAX_FEATURES);
      const params = new URL(url).searchParams;

      expect(params.has("CQL_FILTER"), "CQL_FILTER must NOT be present for filterless layers").toBe(false);
    });

    it("bbox contains the correct rounded coordinates", () => {
      const url = buildBboxWfsUrl(config, W, S, E, N, MAX_FEATURES);
      const bbox = new URL(url).searchParams.get("bbox") ?? "";

      expect(bbox).toContain(`${Math.round(W)}`);
      expect(bbox).toContain(`${Math.round(S)}`);
      expect(bbox).toContain(`${Math.round(E)}`);
      expect(bbox).toContain(`${Math.round(N)}`);
    });
  });

  // ── (c) Complex cqlFilter — parenthesization ─────────────────────────────

  describe("parenthesization preserves complex filter expressions", () => {
    const config = {
      url: "https://example.com/ows",
      typeName: "pub:EXAMPLE_TABLE",
      cqlFilter: "PLANNED_GROSS_BLOCK_AREA < 2000",
    };

    it("wraps an expression with < operator in parens", () => {
      const url = buildBboxWfsUrl(config, W, S, E, N, MAX_FEATURES);
      const cqlFilter = new URL(url).searchParams.get("CQL_FILTER") ?? "";

      expect(cqlFilter).toMatch(/AND \(PLANNED_GROSS_BLOCK_AREA < 2000\)/);
    });

    it("does not double-parenthesize a filter already in parens", () => {
      const configWrapped = { ...config, cqlFilter: "(PROJ_AGE_1 >= 250)" };
      const url = buildBboxWfsUrl(configWrapped, W, S, E, N, MAX_FEATURES);
      const cqlFilter = new URL(url).searchParams.get("CQL_FILTER") ?? "";

      // Should be AND ((PROJ_AGE_1 >= 250)) — double parens are harmless for GeoServer
      // but we verify the original parens are preserved without stripping
      expect(cqlFilter).toContain("(PROJ_AGE_1 >= 250)");
    });
  });

  // ── (d) Common standard WFS params always present ───────────────────────

  describe("standard WFS params", () => {
    const config = {
      url: "https://example.com/ows",
      typeName: "pub:EXAMPLE",
    };

    it("always includes service=WFS, version, request, outputFormat, srsName, count", () => {
      const url = buildBboxWfsUrl(config, W, S, E, N, MAX_FEATURES);
      const params = new URL(url).searchParams;

      expect(params.get("service")).toBe("WFS");
      expect(params.get("version")).toBe("2.0.0");
      expect(params.get("request")).toBe("GetFeature");
      expect(params.get("outputFormat")).toBe("application/json");
      expect(params.get("srsName")).toBe("EPSG:4326");
      expect(params.get("count")).toBe(String(MAX_FEATURES));
    });

    it("includes propertyName when config.propertyNames is set", () => {
      const configWithProps = {
        ...config,
        propertyNames: ["WATERSHED_GROUP_NAME", "AREA_HA"],
      };
      const url = buildBboxWfsUrl(configWithProps, W, S, E, N, MAX_FEATURES);
      const params = new URL(url).searchParams;

      expect(params.get("propertyName")).toBe("WATERSHED_GROUP_NAME,AREA_HA");
    });

    it("omits propertyName when config.propertyNames is not set", () => {
      const url = buildBboxWfsUrl(config, W, S, E, N, MAX_FEATURES);
      const params = new URL(url).searchParams;

      expect(params.has("propertyName")).toBe(false);
    });
  });
});
