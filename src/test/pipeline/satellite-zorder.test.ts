/**
 * Satellite z-order unit tests — D1 fix.
 *
 * CI gate: asserts that in getStyle().layers order, satellite's layer index
 * is less than the index of every other "layer-*" entry, covering BOTH
 * mount orders:
 *   (A) satellite mounted first, then overlays
 *   (B) overlays mounted first, then satellite
 *
 * These tests exercise the anchor logic in SatelliteLayers directly via the
 * maplibre mock — the same mock used by all other imperative layer tests.
 *
 * Production-path-match disclosure:
 *   The SatelliteLayers component is a React component using useEffect/useMap.
 *   These tests call the underlying anchor logic directly on the mock map to
 *   avoid React component test infrastructure (renderHook + MapProvider setup).
 *   The anchor logic is extracted into a testable helper: findSatelliteAnchor().
 *   Divergences NOT covered: React lifecycle ordering, useMap hook behavior,
 *   isStyleLoaded timing, and actual basemap style layer IDs on production.
 *   Visual verification deferred to Wave 4 / deploy verification.
 *   MapTiler key unavailable locally — production basemap layer ID collision
 *   check is a deploy-verification item (OpenFreeMap dark fallback verified
 *   collision-free: no basemap layers starting with "layer-").
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createMockMap } from "../mocks/maplibre";
import { findSatelliteAnchor } from "@/components/map/DataLayer";

// Simulates adding a raster source + layer using the satellite anchor logic.
// Uses the real exported findSatelliteAnchor from DataLayer.tsx — same function
// that SatelliteLayers.addToMap() calls — so reverting the component breaks
// this test (WARNING-2 CI gate requirement).
function addSatelliteLayer(
  mockMap: ReturnType<typeof createMockMap>,
  satelliteLayerId: string,
): void {
  const sourceId = `source-${satelliteLayerId.replace("layer-", "")}`;
  if (!mockMap.getSource(sourceId)) {
    mockMap.addSource(sourceId, {
      type: "raster",
      tiles: ["https://example.com/{z}/{x}/{y}.jpg"],
      tileSize: 256,
    });
  }
  if (mockMap.getLayer(satelliteLayerId)) return;
  const allLayers = mockMap.getStyle().layers;
  const anchor = findSatelliteAnchor(allLayers, satelliteLayerId);
  mockMap.addLayer(
    {
      id: satelliteLayerId,
      type: "raster",
      source: sourceId,
      paint: { "raster-opacity": 1 },
    } as Record<string, unknown>,
    anchor,
  );
}

// Simulates adding a generic data overlay layer (e.g. a WFS fill layer).
function addOverlayLayer(
  mockMap: ReturnType<typeof createMockMap>,
  layerId: string,
): void {
  const sourceId = `source-${layerId.replace("layer-", "").replace(/-fill$/, "")}`;
  if (!mockMap.getSource(sourceId)) {
    mockMap.addSource(sourceId, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  }
  if (mockMap.getLayer(layerId)) return;
  // Data overlay layers insert before the first symbol layer (PmtilesLayers / WfsLayers pattern)
  const firstSymbolId = (mockMap.getStyle().layers as Array<{ id: string; type: string }>)
    .find((l) => l.type === "symbol")?.id;
  mockMap.addLayer(
    {
      id: layerId,
      type: "fill",
      source: sourceId,
      paint: { "fill-opacity": 0.7 },
    } as Record<string, unknown>,
    firstSymbolId,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SatelliteLayers anchor logic — D1 z-order fix", () => {
  let map: ReturnType<typeof createMockMap>;

  // The mock starts with getStyle().layers = [{ id: "basemap-label", type: "symbol" }]
  // This simulates the basemap having at least one symbol layer.

  beforeEach(() => {
    map = createMockMap();
  });

  // ── Mount order A: satellite first, then overlays ─────────────────────────

  describe("mount order A: satellite before overlays", () => {
    it("satellite index < first data overlay index", () => {
      const SATELLITE_ID = "layer-satellite";
      const OVERLAY_ID = "layer-forest-age-tiles-fill";

      // Mount satellite first (no "layer-*" layers exist yet → falls back to firstSymbolId)
      addSatelliteLayer(map, SATELLITE_ID);
      // Then mount a data overlay
      addOverlayLayer(map, OVERLAY_ID);

      const order = map._getLayerOrder();
      const satIdx = order.indexOf(SATELLITE_ID);
      const overlayIdx = order.indexOf(OVERLAY_ID);

      expect(satIdx, "satellite must be added to the layer order").toBeGreaterThanOrEqual(0);
      expect(overlayIdx, "overlay must be added to the layer order").toBeGreaterThanOrEqual(0);
      expect(satIdx, "satellite index must be below (less than) overlay index").toBeLessThan(overlayIdx);
    });

    it("satellite index < multiple overlay layer indices", () => {
      const SATELLITE_ID = "layer-satellite";
      const OVERLAYS = [
        "layer-forest-age-tiles-fill",
        "layer-cutblocks-fill",
        "layer-fish-streams-line",
      ];

      addSatelliteLayer(map, SATELLITE_ID);
      for (const id of OVERLAYS) {
        addOverlayLayer(map, id);
      }

      const order = map._getLayerOrder();
      const satIdx = order.indexOf(SATELLITE_ID);
      expect(satIdx).toBeGreaterThanOrEqual(0);

      for (const id of OVERLAYS) {
        const overlayIdx = order.indexOf(id);
        expect(overlayIdx, `${id} must be in layer order`).toBeGreaterThanOrEqual(0);
        expect(satIdx, `satellite (${satIdx}) must be below ${id} (${overlayIdx})`).toBeLessThan(overlayIdx);
      }
    });
  });

  // ── Mount order B: overlays first, then satellite ─────────────────────────

  describe("mount order B: overlays before satellite", () => {
    it("satellite index < first data overlay index when mounted after overlays", () => {
      const SATELLITE_ID = "layer-satellite";
      const OVERLAY_ID = "layer-forest-age-tiles-fill";

      // Mount overlay first
      addOverlayLayer(map, OVERLAY_ID);
      // Then mount satellite — anchor should find "layer-forest-age-tiles-fill" as first "layer-*"
      addSatelliteLayer(map, SATELLITE_ID);

      const order = map._getLayerOrder();
      const satIdx = order.indexOf(SATELLITE_ID);
      const overlayIdx = order.indexOf(OVERLAY_ID);

      expect(satIdx).toBeGreaterThanOrEqual(0);
      expect(overlayIdx).toBeGreaterThanOrEqual(0);
      expect(satIdx, "satellite must be inserted below existing overlay").toBeLessThan(overlayIdx);
    });

    it("satellite index < all overlay indices when mounted last", () => {
      const SATELLITE_ID = "layer-satellite";
      const OVERLAYS = [
        "layer-forest-age-tiles-fill",
        "layer-cutblocks-fill",
        "layer-tap-deferrals-line",
      ];

      // Mount all overlays first
      for (const id of OVERLAYS) {
        addOverlayLayer(map, id);
      }
      // Mount satellite last
      addSatelliteLayer(map, SATELLITE_ID);

      const order = map._getLayerOrder();
      const satIdx = order.indexOf(SATELLITE_ID);
      expect(satIdx).toBeGreaterThanOrEqual(0);

      for (const id of OVERLAYS) {
        const overlayIdx = order.indexOf(id);
        expect(overlayIdx, `${id} must be in layer order`).toBeGreaterThanOrEqual(0);
        expect(satIdx, `satellite (${satIdx}) must be below ${id} (${overlayIdx})`).toBeLessThan(overlayIdx);
      }
    });
  });

  // ── Anchor selection: draw-* and watershed-* layers are NOT touched ───────

  describe("draw-* and watershed-* layers are not used as anchors", () => {
    it("satellite does not insert before a draw-* layer", () => {
      const SATELLITE_ID = "layer-satellite";
      const DRAW_LAYER = "draw-polygon-fill";

      // Add a draw layer directly (no "layer-" prefix)
      map.addSource("draw-source", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: DRAW_LAYER, type: "fill", source: "draw-source" } as Record<string, unknown>);

      // Add satellite
      addSatelliteLayer(map, SATELLITE_ID);

      // Satellite should NOT use draw-polygon-fill as an anchor
      // (draw-* doesn't start with "layer-")
      const addLayerCalls = map._getCalls().addLayer;
      const satelliteCall = addLayerCalls.find((c) => c.config.id === SATELLITE_ID);
      expect(satelliteCall, "satellite addLayer call must exist").toBeDefined();
      expect(
        satelliteCall!.beforeId,
        "satellite anchor must not be a draw-* layer"
      ).not.toBe(DRAW_LAYER);
    });
  });

  // ── Re-enable after overlays: anchor persists on repeated calls ───────────

  describe("idempotency: adding satellite twice does not crash", () => {
    it("second addSatelliteLayer call is a no-op (layer already exists)", () => {
      const SATELLITE_ID = "layer-satellite";

      addSatelliteLayer(map, SATELLITE_ID);
      // Second call should not throw
      expect(() => addSatelliteLayer(map, SATELLITE_ID)).not.toThrow();

      // Only one satellite layer should exist
      const addLayerCalls = map._getCalls().addLayer.filter(
        (c) => c.config.id === SATELLITE_ID
      );
      expect(addLayerCalls.length).toBe(1);
    });
  });
});
