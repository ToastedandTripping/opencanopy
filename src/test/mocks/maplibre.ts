/**
 * Full MapLibre GL mock for unit testing.
 *
 * Tracks all addSource/addLayer/setPaintProperty/setFilter calls
 * so tests can assert on the exact sequence of imperative map operations.
 */

import { vi } from "vitest";

export interface MockSource {
  id: string;
  config: Record<string, unknown>;
}

export interface MockLayer {
  id: string;
  config: Record<string, unknown>;
  beforeId?: string;
}

export interface PaintCall {
  layerId: string;
  property: string;
  value: unknown;
}

export interface FilterCall {
  layerId: string;
  filter: unknown;
}

export interface LayoutCall {
  layerId: string;
  property: string;
  value: unknown;
}

export function createMockMap() {
  const sources = new Map<string, Record<string, unknown>>();
  const layers = new Map<string, Record<string, unknown>>();
  const layerOrder: string[] = [];
  const paintValues = new Map<string, Map<string, unknown>>();
  const filterValues = new Map<string, unknown>();
  const layoutValues = new Map<string, Map<string, unknown>>();
  const eventListeners = new Map<string, Set<(...args: unknown[]) => void>>();

  // Track calls for assertions
  const calls = {
    addSource: [] as { id: string; config: Record<string, unknown> }[],
    addLayer: [] as { config: Record<string, unknown>; beforeId?: string }[],
    removeSource: [] as string[],
    removeLayer: [] as string[],
    setPaintProperty: [] as PaintCall[],
    setFilter: [] as FilterCall[],
    setLayoutProperty: [] as LayoutCall[],
    setTerrain: [] as unknown[],
    setSky: [] as unknown[],
    easeTo: [] as unknown[],
  };

  let styleLoaded = true;

  const map = {
    // ── Source management ──────────────────────────────────────────
    addSource: vi.fn((id: string, config: Record<string, unknown>) => {
      if (sources.has(id)) {
        throw new Error(`Source "${id}" already exists.`);
      }
      sources.set(id, config);
      calls.addSource.push({ id, config });
    }),

    getSource: vi.fn((id: string) => {
      const src = sources.get(id);
      if (!src) return undefined;
      return {
        ...src,
        setData: vi.fn(),
      };
    }),

    removeSource: vi.fn((id: string) => {
      sources.delete(id);
      calls.removeSource.push(id);
    }),

    isSourceLoaded: vi.fn((id: string) => sources.has(id)),

    // ── Layer management ──────────────────────────────────────────
    addLayer: vi.fn(
      (config: Record<string, unknown>, beforeId?: string) => {
        const id = config.id as string;
        if (layers.has(id)) {
          throw new Error(`Layer "${id}" already exists.`);
        }
        layers.set(id, config);
        calls.addLayer.push({ config, beforeId });

        // Initialize paint values from the layer config
        const paint = config.paint as Record<string, unknown> | undefined;
        if (paint) {
          const layerPaint = new Map<string, unknown>();
          for (const [key, value] of Object.entries(paint)) {
            layerPaint.set(key, value);
          }
          paintValues.set(id, layerPaint);
        }

        if (beforeId) {
          const idx = layerOrder.indexOf(beforeId);
          if (idx >= 0) {
            layerOrder.splice(idx, 0, id);
          } else {
            layerOrder.push(id);
          }
        } else {
          layerOrder.push(id);
        }
      }
    ),

    getLayer: vi.fn((id: string) => {
      const layer = layers.get(id);
      if (!layer) return undefined;
      return { ...layer };
    }),

    removeLayer: vi.fn((id: string) => {
      layers.delete(id);
      paintValues.delete(id);
      filterValues.delete(id);
      layoutValues.delete(id);
      const idx = layerOrder.indexOf(id);
      if (idx >= 0) layerOrder.splice(idx, 1);
      calls.removeLayer.push(id);
    }),

    // ── Style queries ─────────────────────────────────────────────
    isStyleLoaded: vi.fn(() => styleLoaded),

    getStyle: vi.fn(() => ({
      layers: [{ id: "basemap-label", type: "symbol" }],
    })),

    // ── Paint / Filter / Layout ───────────────────────────────────
    setPaintProperty: vi.fn(
      (layerId: string, property: string, value: unknown) => {
        let layerPaint = paintValues.get(layerId);
        if (!layerPaint) {
          layerPaint = new Map();
          paintValues.set(layerId, layerPaint);
        }
        layerPaint.set(property, value);
        calls.setPaintProperty.push({ layerId, property, value });
      }
    ),

    getPaintProperty: vi.fn((layerId: string, property: string) => {
      const layerPaint = paintValues.get(layerId);
      if (!layerPaint) return undefined;
      return layerPaint.get(property);
    }),

    setFilter: vi.fn((layerId: string, filter: unknown) => {
      filterValues.set(layerId, filter);
      calls.setFilter.push({ layerId, filter });
    }),

    setLayoutProperty: vi.fn(
      (layerId: string, property: string, value: unknown) => {
        let layerLayout = layoutValues.get(layerId);
        if (!layerLayout) {
          layerLayout = new Map();
          layoutValues.set(layerId, layerLayout);
        }
        layerLayout.set(property, value);
        calls.setLayoutProperty.push({ layerId, property, value });
      }
    ),

    // ── Terrain / Sky ─────────────────────────────────────────────
    setTerrain: vi.fn((config: unknown) => {
      calls.setTerrain.push(config);
    }),

    setSky: vi.fn((config: unknown) => {
      calls.setSky.push(config);
    }),

    // ── Camera ────────────────────────────────────────────────────
    easeTo: vi.fn((options: unknown) => {
      calls.easeTo.push(options);
    }),

    getBounds: vi.fn(() => ({
      getWest: () => -126,
      getSouth: () => 48,
      getEast: () => -124,
      getNorth: () => 50,
      toArray: () => [
        [-126, 48],
        [-124, 50],
      ],
    })),

    getZoom: vi.fn(() => 5),

    // ── Events ────────────────────────────────────────────────────
    on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
      if (!eventListeners.has(event)) {
        eventListeners.set(event, new Set());
      }
      eventListeners.get(event)!.add(callback);
    }),

    off: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
      eventListeners.get(event)?.delete(callback);
    }),

    // ── Image management ──────────────────────────────────────────
    addImage: vi.fn(),
    hasImage: vi.fn(() => false),
    removeImage: vi.fn(),

    // ── Test helpers (not part of real MapLibre API) ───────────────
    _emit: (event: string, ...args: unknown[]) => {
      const listeners = eventListeners.get(event);
      if (listeners) {
        for (const cb of listeners) {
          cb(...args);
        }
      }
    },

    _setStyleLoaded: (loaded: boolean) => {
      styleLoaded = loaded;
    },

    _getSources: () => new Map(sources),
    _getLayers: () => new Map(layers),
    _getLayerOrder: () => [...layerOrder],
    _getCalls: () => calls,
    _getPaintValues: () => paintValues,
    _getFilterValues: () => filterValues,

    _reset: () => {
      sources.clear();
      layers.clear();
      layerOrder.length = 0;
      paintValues.clear();
      filterValues.clear();
      layoutValues.clear();
      eventListeners.clear();
      calls.addSource.length = 0;
      calls.addLayer.length = 0;
      calls.removeSource.length = 0;
      calls.removeLayer.length = 0;
      calls.setPaintProperty.length = 0;
      calls.setFilter.length = 0;
      calls.setLayoutProperty.length = 0;
      calls.setTerrain.length = 0;
      calls.setSky.length = 0;
      calls.easeTo.length = 0;
      styleLoaded = true;
    },
  };

  return map;
}

export type MockMap = ReturnType<typeof createMockMap>;
