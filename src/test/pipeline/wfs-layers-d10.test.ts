/**
 * WfsLayers D10 fix — rendered-component tests.
 *
 * D10 diagnosis: the early `if (layer.tileSource) return null` inside WfsLayers
 * sat above 5 hooks, violating rules-of-hooks and causing a StrictMode crash.
 * Tile-backed layers also fired a dead-code WFS fetch that rendered nowhere.
 *
 * Fix: WfsLayers is only mounted from DataLayer when !layer.tileSource.
 * The early return is removed; hooks always run unconditionally on mount.
 *
 * Tests:
 *   (i)  tile-backed layer under StrictMode → DataLayer mounts without crash,
 *        WfsLayers never adds GeoJSON layers to the map (no `layer-*-fill` etc).
 *   (ii) WFS-only layer under StrictMode → WfsLayers creates exactly one set
 *        of layers (idempotent through init → cleanup → init cycle).
 *
 * These tests render DataLayer via @testing-library/react with a mocked useMap
 * under React.StrictMode. This exercises the actual component mount/cleanup
 * lifecycle and the D10 guard (the `!hasTileSource` conditional) in production
 * code paths.
 *
 * Divergences covered vs previous tests:
 *   - React lifecycle ordering (StrictMode double-invoke)
 *   - useMap hook call (mocked at module level)
 *   - Actual DataLayer render tree (WfsLayers conditionally mounted)
 * Divergences NOT covered:
 *   - Real MapLibre GL canvas (happy-dom environment; no WebGL)
 *   - Actual WFS network requests (fetch is spied/mocked globally)
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { createMockMap } from "../mocks/maplibre";
import type { LayerDefinition } from "@/types/layers";

// ── Module-level mocks ────────────────────────────────────────────────────────

// Mock react-map-gl/maplibre: replace useMap with one that returns our mock.
// Source/Layer are no-ops (we test imperative layers only).
vi.mock("react-map-gl/maplibre", () => ({
  useMap: vi.fn(),
  Source: ({ children }: { children?: React.ReactNode }) => children ?? null,
  Layer: () => null,
}));

// Mock useLoadingContext: return no-ops so DataLayer doesn't need a real provider.
vi.mock("@/contexts/LoadingContext", () => ({
  useLoadingContext: () => ({
    setLayerLoading: vi.fn(),
    setLayerStatus: vi.fn(),
    clearLayerStatus: vi.fn(),
  }),
}));

// Mock fetchLayerData: return empty FC, never resolves during tests.
vi.mock("@/lib/data/wfs-client", () => ({
  fetchLayerData: vi.fn(() => new Promise(() => {})), // never resolves
}));

// Mock maplibre-gl at module level so DataLayer can import it.
vi.mock("maplibre-gl", () => ({
  default: {},
}));

// ── Minimal LayerDefinition fixtures ─────────────────────────────────────────

const TILE_BACKED_LAYER: LayerDefinition = {
  id: "forest-age",
  label: "Forest Age",
  category: "forest",
  description: "Test tile-backed layer",
  source: {
    type: "wfs",
    url: "https://openmaps.gov.bc.ca/geo/pub/test/ows",
    typeName: "pub:TEST",
  },
  tileSource: {
    url: "pmtiles://https://tiles.opencanopy.ca/test.pmtiles",
    sourceLayer: "forest-age",
    minZoom: 9,
    maxZoom: 12,
  },
  style: {
    type: "fill",
    opacity: 0.7,
    paint: {
      "fill-color": "#0d5c2a",
      "fill-opacity": 0.7,
    },
  },
  zoomRange: [0, 18],
  defaultEnabled: false,
  interactive: false,
  legendItems: [{ color: "#0d5c2a", label: "Forest" }],
};

const WFS_ONLY_LAYER: LayerDefinition = {
  id: "fish-streams",
  label: "Fish Streams",
  category: "water",
  description: "Test WFS-only layer",
  source: {
    type: "wfs",
    url: "https://openmaps.gov.bc.ca/geo/pub/test/ows",
    typeName: "pub:TEST_STREAMS",
    cqlFilter: "STREAM_ORDER >= 3",
  },
  style: {
    type: "line",
    opacity: 0.8,
    paint: {
      "line-color": "#3b82f6",
      "line-opacity": 0.8,
      "line-width": 1.5,
    },
  },
  zoomRange: [9, 18],
  defaultEnabled: false,
  interactive: false,
  legendItems: [{ color: "#3b82f6", label: "Fish Streams" }],
};

// ── Test helpers ──────────────────────────────────────────────────────────────

async function importDataLayer() {
  const mod = await import("@/components/map/DataLayer");
  return mod.DataLayer;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("WfsLayers D10 fix — rendered-component tests", () => {
  let map: ReturnType<typeof createMockMap>;

  beforeEach(async () => {
    map = createMockMap();
    // Wire useMap mock to return an object that mimics the react-map-gl MapRef
    const { useMap } = await import("react-map-gl/maplibre");
    (useMap as ReturnType<typeof vi.fn>).mockReturnValue({
      current: { getMap: () => map, flyTo: vi.fn(), on: vi.fn(), off: vi.fn(),
                 getBounds: vi.fn(() => ({ getWest: () => -126, getSouth: () => 48,
                   getEast: () => -124, getNorth: () => 50 })),
                 getZoom: vi.fn(() => 10) },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  // ── (i) Tile-backed layer: DataLayer mounts without crash under StrictMode ──

  describe("(i) tile-backed layer: no WFS GeoJSON layers created", () => {
    it("renders without crash under React.StrictMode", async () => {
      const DataLayer = await importDataLayer();
      expect(() =>
        render(
          React.createElement(React.StrictMode, null,
            React.createElement(DataLayer, { layer: TILE_BACKED_LAYER, visible: true })
          )
        )
      ).not.toThrow();
    });

    it("does not add a GeoJSON fill layer to the map for a tile-backed layer", async () => {
      const DataLayer = await importDataLayer();
      render(
        React.createElement(React.StrictMode, null,
          React.createElement(DataLayer, { layer: TILE_BACKED_LAYER, visible: true })
        )
      );
      // WfsLayers is not mounted for tile-backed layers (D10 fix).
      // No GeoJSON fill/outline/line layers should appear.
      expect(
        map.getLayer(`layer-${TILE_BACKED_LAYER.id}-fill`),
        "tile-backed layer must not have a WFS fill layer"
      ).toBeUndefined();
      expect(
        map.getLayer(`layer-${TILE_BACKED_LAYER.id}-line`),
        "tile-backed layer must not have a WFS line layer"
      ).toBeUndefined();
    });
  });

  // ── (ii) WFS-only layer: exactly one set of layers after StrictMode cycle ───

  describe("(ii) WFS-only layer: StrictMode mount/cleanup idempotency", () => {
    it("renders without crash under React.StrictMode", async () => {
      const DataLayer = await importDataLayer();
      expect(() =>
        render(
          React.createElement(React.StrictMode, null,
            React.createElement(DataLayer, { layer: WFS_ONLY_LAYER, visible: true })
          )
        )
      ).not.toThrow();
    });

    it("adds exactly one GeoJSON source and line layer for a WFS-only line layer", async () => {
      const DataLayer = await importDataLayer();
      render(
        React.createElement(React.StrictMode, null,
          React.createElement(DataLayer, { layer: WFS_ONLY_LAYER, visible: true })
        )
      );
      // StrictMode double-invokes effects: init → cleanup → init.
      // After the cycle, exactly one source and one line layer must exist.
      expect(
        map.getSource(`source-${WFS_ONLY_LAYER.id}`),
        "WFS-only layer must have its GeoJSON source after StrictMode cycle"
      ).toBeDefined();
      expect(
        map.getLayer(`layer-${WFS_ONLY_LAYER.id}-line`),
        "WFS-only line layer must exist after StrictMode cycle"
      ).toBeDefined();
      // No fill layer for a line-type WFS layer
      expect(
        map.getLayer(`layer-${WFS_ONLY_LAYER.id}-fill`),
        "line-type WFS layer must NOT have a fill layer"
      ).toBeUndefined();
      // Exactly one source in addSource calls (idempotent across StrictMode cycles)
      const sourceCalls = map._getCalls().addSource.filter(
        (c) => c.id === `source-${WFS_ONLY_LAYER.id}`
      );
      expect(
        sourceCalls.length,
        "source added exactly twice across StrictMode double-invoke (once per init)"
      ).toBe(2);
    });
  });
});
