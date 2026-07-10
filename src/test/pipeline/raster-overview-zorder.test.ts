/**
 * Raster-overview z-order unit tests — mobile/legibility audit fix.
 *
 * Bug: the declarative raster-overview <Layer> in DataLayer.tsx (the
 * pre-rendered PNG overview tiles shown at z4-z9) had no `beforeId`, so
 * react-map-gl appended it to the TOP of the style stack on mount. That
 * painted the raster tiles over basemap place-name labels, making city
 * names illegible at low zoom.
 *
 * Fix: DataLayer now computes `rasterBeforeId` via the exported
 * `getFirstSymbolId()` helper and passes it as `beforeId` on all 5 raster
 * <Layer>s (1 default all-class + 4 per-class), matching the existing
 * imperative vector pattern (PmtilesLayers / WfsLayers both insert before
 * `firstSymbolId`).
 *
 * These tests exercise `getFirstSymbolId()` directly (the same pure
 * function DataLayer's effect calls) plus an addLayer-time simulation using
 * the shared maplibre mock, mirroring the pattern established in
 * satellite-zorder.test.ts.
 *
 * Production-path-match disclosure:
 *   DataLayer is a React component computing `rasterBeforeId` in a
 *   useEffect + `styledata` listener, then passing it as a prop to a
 *   declarative react-map-gl <Layer>. These tests do NOT exercise React
 *   rendering, the styledata listener timing, or react-map-gl's internal
 *   `updateLayer()` (which calls `map.moveLayer()` when `beforeId` changes —
 *   verified by reading node_modules/@vis.gl/react-maplibre/dist/components/
 *   layer.js directly, not covered by an automated test here). Visual
 *   verification (labels legible at z4-z9 with the raster overview on) is a
 *   deploy-verification item — no MapTiler key / no live map render in this
 *   environment.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createMockMap } from "../mocks/maplibre";
import { getFirstSymbolId } from "@/components/map/DataLayer";

describe("getFirstSymbolId — raster-overview z-order fix", () => {
  it("returns the id of the first symbol-type layer", () => {
    const layers = [
      { id: "background", type: "fill" },
      { id: "basemap-label", type: "symbol" },
      { id: "another-symbol", type: "symbol" },
    ];
    expect(getFirstSymbolId(layers)).toBe("basemap-label");
  });

  it("returns undefined when no symbol layer exists", () => {
    const layers = [
      { id: "background", type: "fill" },
      { id: "layer-forest-age-raster", type: "raster" },
    ];
    expect(getFirstSymbolId(layers)).toBeUndefined();
  });

  it("returns undefined for an empty style", () => {
    expect(getFirstSymbolId([])).toBeUndefined();
  });

  it("picks the FIRST symbol layer, not just any symbol layer", () => {
    const layers = [
      { id: "raster-below", type: "raster" },
      { id: "place-labels", type: "symbol" },
      { id: "poi-labels", type: "symbol" },
      { id: "road-labels", type: "symbol" },
    ];
    expect(getFirstSymbolId(layers)).toBe("place-labels");
  });
});

describe("raster-overview <Layer> addLayer-time anchor — mock map simulation", () => {
  let map: ReturnType<typeof createMockMap>;

  // The mock starts with getStyle().layers = [{ id: "basemap-label", type: "symbol" }]

  beforeEach(() => {
    map = createMockMap();
  });

  // Simulates what DataLayer's declarative <Layer beforeId={rasterBeforeId}>
  // resolves to at the moment react-map-gl's createLayer() calls
  // map.addLayer(options, beforeId) — using the same getFirstSymbolId() the
  // production useEffect calls.
  function addRasterOverviewLayer(layerId: string): void {
    const sourceId = `source-${layerId.replace("layer-", "").replace(/-raster.*$/, "-raster")}`;
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "raster",
        tiles: ["https://example.com/{z}/{x}/{y}.png"],
        tileSize: 256,
      });
    }
    if (map.getLayer(layerId)) return;
    const beforeId = getFirstSymbolId(
      map.getStyle().layers as { id: string; type: string }[]
    );
    map.addLayer(
      {
        id: layerId,
        type: "raster",
        source: sourceId,
        paint: { "raster-opacity": 0.85 },
      } as Record<string, unknown>,
      beforeId,
    );
  }

  it("default all-class raster layer inserts below the symbol layer", () => {
    addRasterOverviewLayer("layer-forest-age-raster");

    const styleLayers = map.getStyle().layers as { id: string; type: string }[];
    const symbolIdx = styleLayers.findIndex((l) => l.type === "symbol");
    const rasterIdx = styleLayers.findIndex((l) => l.id === "layer-forest-age-raster");

    expect(symbolIdx, "symbol layer must exist").toBeGreaterThanOrEqual(0);
    expect(rasterIdx, "raster layer must be in the stack").toBeGreaterThanOrEqual(0);
    expect(rasterIdx, "raster must render below (lower index than) the symbol/label layer")
      .toBeLessThan(symbolIdx);
  });

  it("all 4 per-class raster layers insert below the symbol layer", () => {
    const classes = ["old-growth", "mature", "harvested", "young"];
    for (const cls of classes) {
      addRasterOverviewLayer(`layer-forest-age-raster-${cls}`);
    }

    const styleLayers = map.getStyle().layers as { id: string; type: string }[];
    const symbolIdx = styleLayers.findIndex((l) => l.type === "symbol");
    expect(symbolIdx).toBeGreaterThanOrEqual(0);

    for (const cls of classes) {
      const rasterIdx = styleLayers.findIndex((l) => l.id === `layer-forest-age-raster-${cls}`);
      expect(rasterIdx, `${cls} raster must be in the stack`).toBeGreaterThanOrEqual(0);
      expect(rasterIdx, `${cls} raster must render below the symbol/label layer`)
        .toBeLessThan(symbolIdx);
    }
  });

  it("addLayer receives the symbol layer id as beforeId (not undefined / not top-of-stack)", () => {
    addRasterOverviewLayer("layer-forest-age-raster");

    const addLayerCalls = map._getCalls().addLayer;
    const rasterCall = addLayerCalls.find((c) => c.config.id === "layer-forest-age-raster");
    expect(rasterCall, "raster addLayer call must exist").toBeDefined();
    expect(rasterCall!.beforeId, "beforeId must point at the basemap symbol layer")
      .toBe("basemap-label");
  });
});
