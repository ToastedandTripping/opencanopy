"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Source, Layer, useMap } from "react-map-gl/maplibre";
import maplibregl, { GeoJSONSource, type FilterSpecification } from "maplibre-gl";
import type { LayerDefinition, BBox } from "@/types/layers";
import { fetchLayerData } from "@/lib/data/wfs-client";
import { useLoadingContext } from "@/contexts/LoadingContext";
import { pipelineLog } from "@/lib/debug/pipeline-logger";
import { PMTILES_URL, PMTILES_SOURCE_ID, PMTILES_MAX_ZOOM } from "@/lib/layers/registry";
import {
  buildYearExpression,
  buildYearFilter,
  buildAgeGradedOpacity,
  composeFilters,
} from "@/lib/timeline/filter-expressions";

interface DataLayerProps {
  layer: LayerDefinition;
  visible: boolean;
  /** When set, filter features by year for timeline animation (client-side) */
  yearFilter?: number | null;
  /** When set, filter individual classes within layers (e.g. forest age classes) */
  classFilters?: Record<string, string[]>;
}

// ── Class filter helpers ────────────────────────────────────────────

const CLASS_LABEL_MAP: Record<string, string> = {
  "Old Growth (250+ yr)": "old-growth",
  "Mature (80-250 yr)": "mature",
  "Young (<80 yr)": "young",
  "Harvested": "harvested",
  "High (Old Growth)": "old-growth",
  "Moderate (Mature)": "mature",
  "Low (Young)": "young",
  "Logged": "harvested",
};

/** Canonical class slugs for per-class raster tile sources. */
const CLASS_NAMES = ["old-growth", "mature", "harvested", "young"];

/** Raster theme colors for vector fill-color overrides.
 *  When a single class is filtered and its raster tiles use a distinctive color,
 *  the vector PMTiles fill-color must match to avoid a jarring color jump at
 *  the raster-to-vector zoom transition (e.g. gold old-growth raster -> green vector). */
const RASTER_THEME_COLORS: Record<string, string> = {
  "old-growth": "#eab308",  // gold (default vector color is #0d5c2a green)
};

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

/**
 * Imperative PMTiles layer manager.
 * Adds the vector tile source and layers directly via the MapLibre API
 * after the source has loaded. This avoids the react-map-gl timing bug
 * where declarative <Layer> components fail when the PMTiles source
 * resolves asynchronously from a remote URL.
 */
function PmtilesLayers({
  layer,
  tileMaxZoom,
  tileMinZoom,
  visible,
  opacity,
  classFilters,
  yearFilter,
}: {
  layer: LayerDefinition;
  tileMaxZoom: number;
  tileMinZoom?: number;
  visible: boolean;
  opacity: number;
  classFilters?: Record<string, string[]>;
  yearFilter?: number | null;
}) {
  const { current: map } = useMap();

  // Add source and layers once the map style + PMTiles source are ready
  useEffect(() => {
    if (!map || !layer.tileSource) return;

    const mapInstance = map.getMap();
    const sourceId = PMTILES_SOURCE_ID;
    let sourcedataHandler: ((e: maplibregl.MapSourceDataEvent) => void) | null = null;

    /** Register the shared vector tile source (idempotent). */
    function addSource() {
      if (!mapInstance.getSource(sourceId)) {
        mapInstance.addSource(sourceId, {
          type: "vector",
          url: PMTILES_URL,
          maxzoom: PMTILES_MAX_ZOOM,
        });
        pipelineLog("pmtiles-source", layer.id, { sourceId, action: "registered" });
      }
    }

    /**
     * Add map layers for this data source.
     * Called only after the source has confirmed loaded (header resolved).
     */
    function addLayersToMap() {
      try {
        const sourceLayer = layer.tileSource!.sourceLayer;
        const maxzoom = 22;
        const minzoom = tileMinZoom ?? 0;

        // Bug 4 fix: insert data layers below basemap labels
        const firstSymbolId = mapInstance.getStyle().layers.find(
          (l: maplibregl.LayerSpecification) => l.type === "symbol"
        )?.id;

        if (layer.style.type === "fill") {
          if (!mapInstance.getLayer(`layer-${layer.id}-tiles-fill`)) {
            // Extract only valid fill paint properties (no undefined values)
            const fillPaint: Record<string, unknown> = {
              "fill-antialias": false,
              "fill-opacity-transition": { duration: 300 },
            };
            // Bug 2 fix: pass through the registry expression directly
            // (may be a scalar or a MapLibre interpolation expression array)
            if (layer.style.paint["fill-opacity"] != null) {
              fillPaint["fill-opacity"] = layer.style.paint["fill-opacity"];
            }
            if (layer.style.paint["fill-color"] != null) {
              fillPaint["fill-color"] = layer.style.paint["fill-color"];
            }
            if (layer.style.paint["fill-outline-color"] != null) {
              fillPaint["fill-outline-color"] = layer.style.paint["fill-outline-color"];
            }

            mapInstance.addLayer(
              {
                id: `layer-${layer.id}-tiles-fill`,
                type: "fill",
                source: sourceId,
                "source-layer": sourceLayer,
                minzoom,
                maxzoom,
                layout: { visibility: visible ? "visible" : "none" },
                paint: fillPaint as maplibregl.FillLayerSpecification["paint"],
                ...(layer.style.filter ? { filter: layer.style.filter as maplibregl.FilterSpecification } : {}),
              },
              firstSymbolId,
            );
            pipelineLog("pmtiles-layer", `layer-${layer.id}-tiles-fill`, { type: "fill", minzoom, maxzoom });
          }
          if (!mapInstance.getLayer(`layer-${layer.id}-tiles-outline`)) {
            mapInstance.addLayer(
              {
                id: `layer-${layer.id}-tiles-outline`,
                type: "line",
                source: sourceId,
                "source-layer": sourceLayer,
                minzoom,
                maxzoom,
                layout: { visibility: visible ? "visible" : "none" },
                paint: {
                  "line-color":
                    (layer.style.paint["fill-outline-color"] as string) ??
                    "rgba(255,255,255,0.2)",
                  "line-width": [
                    "interpolate", ["linear"], ["zoom"],
                    5, 0,
                    8, 0.3,
                    10, 0.5,
                  ],
                  "line-opacity": [
                    "interpolate", ["linear"], ["zoom"],
                    5, 0,
                    8, 0.2,
                    10, 0.4,
                  ],
                  "line-opacity-transition": { duration: 300 },
                },
                ...(layer.style.filter ? { filter: layer.style.filter as maplibregl.FilterSpecification } : {}),
              },
              firstSymbolId,
            );
            pipelineLog("pmtiles-layer", `layer-${layer.id}-tiles-outline`, { type: "line", minzoom, maxzoom });
          }
        } else if (layer.style.type === "line") {
          if (!mapInstance.getLayer(`layer-${layer.id}-tiles-line`)) {
            mapInstance.addLayer(
              {
                id: `layer-${layer.id}-tiles-line`,
                type: "line",
                source: sourceId,
                "source-layer": sourceLayer,
                minzoom,
                maxzoom,
                paint: {
                  ...(layer.style.paint as Record<string, unknown>),
                  "line-opacity": visible
                    ? (layer.style.paint["line-opacity"] as number) ?? 0.8
                    : 0,
                  "line-opacity-transition": { duration: 300 },
                } as maplibregl.LineLayerSpecification["paint"],
                ...(layer.style.filter ? { filter: layer.style.filter as maplibregl.FilterSpecification } : {}),
              },
              firstSymbolId,
            );
            pipelineLog("pmtiles-layer", `layer-${layer.id}-tiles-line`, { type: "line", minzoom, maxzoom });
          }
        }
      } catch (err) {
        // Bug 3 fix: surface errors instead of crashing silently
        console.error(`[OpenCanopy] Failed to add PMTiles layers for ${layer.id}:`, err);
      }
    }

    /**
     * Bug 1 fix: after registering the source, wait for the PMTiles header
     * to resolve before adding layers. `isStyleLoaded()` only confirms the
     * map style, not that an async PMTiles source has its metadata ready.
     */
    function initSource() {
      addSource();

      // If the source is already loaded (e.g. re-render), add layers immediately
      if (mapInstance.isSourceLoaded(sourceId)) {
        pipelineLog("pmtiles-source", layer.id, { sourceId, action: "loaded" });
        addLayersToMap();
        return;
      }

      // Otherwise, listen for the sourcedata event to confirm the source is ready
      sourcedataHandler = (e: maplibregl.MapSourceDataEvent) => {
        if (e.sourceId === sourceId && mapInstance.isSourceLoaded(sourceId)) {
          mapInstance.off("sourcedata", sourcedataHandler!);
          sourcedataHandler = null;
          if (timeoutId) clearTimeout(timeoutId);
          pipelineLog("pmtiles-source", layer.id, { sourceId, action: "loaded" });
          addLayersToMap();
        }
      };
      mapInstance.on("sourcedata", sourcedataHandler);

      // Timeout: if source doesn't load in 15s, give up and log a warning
      const timeoutId = setTimeout(() => {
        if (sourcedataHandler) {
          mapInstance.off("sourcedata", sourcedataHandler);
          sourcedataHandler = null;
          pipelineLog("pmtiles-source", layer.id + " TIMEOUT", { sourceId });
          console.warn(`[OpenCanopy] PMTiles source for ${layer.id} failed to load within 15s`);
        }
      }, 15_000);
    }

    // Wait for map style to load before registering the source
    if (mapInstance.isStyleLoaded()) {
      initSource();
    } else {
      const onLoad = () => initSource();
      mapInstance.on("load", onLoad);
      // Store for cleanup
      return () => {
        mapInstance.off("load", onLoad);
        if (sourcedataHandler) {
          mapInstance.off("sourcedata", sourcedataHandler);
        }
      };
    }

    return () => {
      if (sourcedataHandler) {
        mapInstance.off("sourcedata", sourcedataHandler);
      }
      // Don't remove layers on unmount -- they persist across re-renders
    };
  }, [map, layer.id, layer.tileSource, layer.style]);

  // Update visibility reactively
  useEffect(() => {
    if (!map || !layer.tileSource) return;
    const mapInstance = map.getMap();

    const fillId = `layer-${layer.id}-tiles-fill`;
    const outlineId = `layer-${layer.id}-tiles-outline`;
    const lineId = `layer-${layer.id}-tiles-line`;

    // Bug 2 fix: use layout visibility for fill/outline show/hide
    // instead of overriding the paint opacity expression with a scalar
    if (mapInstance.getLayer(fillId)) {
      mapInstance.setLayoutProperty(fillId, "visibility", visible ? "visible" : "none");
      pipelineLog("visibility-effect", fillId, { property: "visibility", value: visible });
    }
    if (mapInstance.getLayer(outlineId)) {
      mapInstance.setLayoutProperty(outlineId, "visibility", visible ? "visible" : "none");
      pipelineLog("visibility-effect", outlineId, { property: "visibility", value: visible });
    }
    // Line layers still use paint opacity (no expression to preserve)
    if (mapInstance.getLayer(lineId)) {
      mapInstance.setPaintProperty(
        lineId,
        "line-opacity",
        visible ? (layer.style.paint["line-opacity"] as number) ?? 0.8 : 0
      );
      pipelineLog("setPaintProperty", lineId, { property: "line-opacity", value: visible });
    }
  }, [map, layer.id, layer.tileSource, layer.style.paint, visible]);

  /**
   * Merged filter + opacity effect for PMTiles layers.
   *
   * This is the SINGLE AUTHORITY for all filter state on fill + outline layers.
   * Handles class filters, year filters, and age-graded opacity in one effect
   * to prevent filter-clobbering race conditions between separate effects.
   *
   * When yearFilter is active:
   *   - Fill: composed filter (base + class + year) + age-graded opacity
   *   - Outline: same composed filter + proportionally reduced line-opacity
   *     (avoids Razor W4: ghost rings with invisible fill at -50yr age-grading)
   *
   * When yearFilter is null:
   *   - Restores class-only filter + registry default opacity
   */
  useEffect(() => {
    if (!map || !layer.tileSource || layer.style.type !== "fill") return;
    const mapInstance = map.getMap();
    const fillId = `layer-${layer.id}-tiles-fill`;
    const outlineId = `layer-${layer.id}-tiles-outline`;
    if (!mapInstance.getLayer(fillId)) return;

    // Build class filter expression
    const activeClassFilter = classFilters?.[layer.id];
    const classFilterExpr: unknown[] | null = activeClassFilter
      ? ["in", ["get", "class"], ["literal", activeClassFilter.map(label => CLASS_LABEL_MAP[label]).filter(Boolean)]] as unknown[]
      : null;

    // Build base registry filter (e.g. cutblocks area guard)
    const baseFilter = (layer.style.filter ?? null) as unknown[] | null;

    if (yearFilter != null && layer.timelineField) {
      // Timeline active: compose all filters and apply age-graded opacity
      const yearFilterExpr = buildYearFilter(layer.timelineField, yearFilter) as unknown[];
      const composedFilter = composeFilters(baseFilter, classFilterExpr, yearFilterExpr) as unknown as FilterSpecification | null;

      mapInstance.setFilter(fillId, composedFilter);
      if (mapInstance.getLayer(outlineId)) {
        mapInstance.setFilter(outlineId, composedFilter);
      }

      // Age-graded fill opacity: bright at 0yr, fade to 0.15 at 50yr+
      const ageOpacity = buildAgeGradedOpacity(layer.timelineField, yearFilter);
      mapInstance.setPaintProperty(fillId, "fill-opacity", ageOpacity);

      // Outline opacity: scale proportionally to fill so rings disappear
      // when fill is nearly invisible (avoids Razor W4 ghost rings).
      // Fill range: 0.15-0.8 -> outline range: 0.05-0.3
      mapInstance.setPaintProperty(outlineId, "line-opacity", [
        "interpolate",
        ["linear"],
        ["-", yearFilter, buildYearExpression(layer.timelineField)],
        0, 0.3,
        20, 0.15,
        50, 0.05,
      ]);

      pipelineLog("setFilter", layer.id, { type: "pmtiles-year", year: yearFilter, classFilter: activeClassFilter ?? "none" });
    } else {
      // No timeline: class filter only, restore registry default opacity
      const composedFilter = composeFilters(baseFilter, classFilterExpr, null) as unknown as FilterSpecification | null;

      mapInstance.setFilter(fillId, composedFilter);
      if (mapInstance.getLayer(outlineId)) {
        mapInstance.setFilter(outlineId, composedFilter);
      }

      // Restore registry fill-opacity expression
      if (layer.style.paint["fill-opacity"] != null) {
        mapInstance.setPaintProperty(fillId, "fill-opacity", layer.style.paint["fill-opacity"]);
      }
      // Restore default outline line-opacity expression
      mapInstance.setPaintProperty(outlineId, "line-opacity", [
        "interpolate", ["linear"], ["zoom"],
        5, 0,
        8, 0.2,
        10, 0.4,
      ]);

      pipelineLog("setFilter", layer.id, { type: "pmtiles-class", filter: activeClassFilter ?? "none" });
    }
  }, [map, layer.id, layer.tileSource, layer.style.type, layer.style.filter, layer.style.paint, layer.timelineField, classFilters, yearFilter]);

  // Override fill-color when a single class is filtered to match raster theme.
  // Prevents jarring color jump at raster->vector zoom transition
  // (e.g. gold old-growth raster at z10 -> green vector at z11).
  useEffect(() => {
    if (!map || !layer.tileSource || layer.style.type !== "fill" || !layer.rasterOverviewClassUrl) return;
    const mapInstance = map.getMap();
    const fillId = `layer-${layer.id}-tiles-fill`;
    if (!mapInstance.getLayer(fillId)) return;

    const activeFilter = classFilters?.[layer.id];
    if (activeFilter && activeFilter.length === 1) {
      const cls = CLASS_LABEL_MAP[activeFilter[0]];
      const themeColor = RASTER_THEME_COLORS[cls];
      if (themeColor) {
        mapInstance.setPaintProperty(fillId, "fill-color", themeColor);
        pipelineLog("setPaintProperty", fillId, { property: "fill-color", value: themeColor, reason: "class-theme-override" });
        return;
      }
    }
    // Reset to registry default when no single-class filter active
    if (layer.style.paint["fill-color"] != null) {
      mapInstance.setPaintProperty(fillId, "fill-color", layer.style.paint["fill-color"]);
      pipelineLog("setPaintProperty", fillId, { property: "fill-color", value: "registry-default" });
    }
  }, [map, layer.id, layer.tileSource, layer.style.type, layer.style.paint, classFilters]);

  return null; // No DOM output -- layers managed imperatively
}

// ── WFS Imperative Layer Manager ────────────────────────────────────

interface WfsLayersProps {
  layer: LayerDefinition;
  visible: boolean;
  filteredData: GeoJSON.FeatureCollection;
  loading: boolean;
  classFilters?: Record<string, string[]>;
  wfsMinZoom: number;
}

/**
 * Returns all MapLibre layer IDs that WfsLayers creates for a given layer.
 * Used for cleanup and visibility checks.
 */
function getWfsLayerIds(layer: LayerDefinition): string[] {
  const ids: string[] = [];
  switch (layer.style.type) {
    case "fill":
      ids.push(`layer-${layer.id}-fill`, `layer-${layer.id}-outline`);
      break;
    case "line":
      ids.push(`layer-${layer.id}-line`);
      break;
    case "circle":
      ids.push(`layer-${layer.id}-cluster`, `layer-${layer.id}-cluster-count`, `layer-${layer.id}-circle`);
      break;
  }
  ids.push(`layer-${layer.id}-loading`);
  return ids;
}

/**
 * Imperative WFS GeoJSON layer manager.
 * Adds a GeoJSON source and layers directly via the MapLibre API,
 * bypassing react-map-gl's declarative <Source> + <Layer> which
 * permanently fail to register WFS layers at z11+ ("missing required
 * property source" errors on every render cycle).
 *
 * Follows the proven PmtilesLayers pattern: renderless component with
 * useEffect hooks for initialization, data updates, visibility, and
 * class filters.
 *
 * Key difference from PmtilesLayers: GeoJSON sources are synchronous
 * (no sourcedata wait needed), but data updates via setData() on every
 * viewport pan and timeline slider change.
 */
function WfsLayers({
  layer,
  visible,
  filteredData,
  loading,
  classFilters,
  wfsMinZoom,
}: WfsLayersProps) {
  const { current: map } = useMap();

  // Tiled layers use PMTiles at all zooms -- no WFS needed
  if (layer.tileSource) return null;

  // 1. Initialization: add source + layers
  useEffect(() => {
    if (!map) return;

    const mapInstance = map.getMap();
    const sourceId = `source-${layer.id}`;
    let cancelled = false;

    function addLayersToMap() {
      if (cancelled) return;

      try {
        // Insert data layers below first basemap symbol
        const firstSymbolId = mapInstance.getStyle().layers.find(
          (l: maplibregl.LayerSpecification) => l.type === "symbol"
        )?.id;

        if (layer.style.type === "fill") {
          if (!mapInstance.getLayer(`layer-${layer.id}-fill`)) {
            // Cherry-pick valid fill paint properties (no undefined values).
            // Matches PmtilesLayers guard pattern -- preserves zoom-dependent
            // opacity expressions without passing through undefined keys.
            const fillPaint: Record<string, unknown> = {
              "fill-antialias": false,
              "fill-opacity-transition": { duration: 300 },
            };
            if (layer.style.paint["fill-opacity"] != null) {
              fillPaint["fill-opacity"] = layer.style.paint["fill-opacity"];
            }
            if (layer.style.paint["fill-color"] != null) {
              fillPaint["fill-color"] = layer.style.paint["fill-color"];
            }
            if (layer.style.paint["fill-outline-color"] != null) {
              fillPaint["fill-outline-color"] = layer.style.paint["fill-outline-color"];
            }
            if (layer.style.paint["fill-pattern"] != null) {
              fillPaint["fill-pattern"] = layer.style.paint["fill-pattern"];
            }

            mapInstance.addLayer(
              {
                id: `layer-${layer.id}-fill`,
                type: "fill",
                source: sourceId,
                minzoom: wfsMinZoom,
                layout: { visibility: visible ? "visible" : "none" },
                paint: fillPaint as maplibregl.FillLayerSpecification["paint"],
                ...(layer.style.filter ? { filter: layer.style.filter as maplibregl.FilterSpecification } : {}),
              },
              firstSymbolId,
            );
            pipelineLog("addLayer", `layer-${layer.id}-fill`, { type: "fill", minzoom: wfsMinZoom });
          }
          if (!mapInstance.getLayer(`layer-${layer.id}-outline`)) {
            mapInstance.addLayer(
              {
                id: `layer-${layer.id}-outline`,
                type: "line",
                source: sourceId,
                minzoom: wfsMinZoom,
                layout: { visibility: visible ? "visible" : "none" },
                paint: {
                  "line-color":
                    (layer.style.paint["fill-outline-color"] as string) ??
                    "rgba(255,255,255,0.2)",
                  "line-width": 0.5,
                  "line-opacity": 0.4,
                  "line-opacity-transition": { duration: 300 },
                },
                ...(layer.style.filter ? { filter: layer.style.filter as maplibregl.FilterSpecification } : {}),
              },
              firstSymbolId,
            );
            pipelineLog("addLayer", `layer-${layer.id}-outline`, { type: "line", minzoom: wfsMinZoom });
          }
        } else if (layer.style.type === "line") {
          if (!mapInstance.getLayer(`layer-${layer.id}-line`)) {
            // Cherry-pick valid line paint properties (no undefined values)
            const linePaint: Record<string, unknown> = {
              "line-opacity": visible
                ? (layer.style.paint["line-opacity"] as number) ?? 0.8
                : 0,
              "line-opacity-transition": { duration: 300 },
            };
            if (layer.style.paint["line-color"] != null) {
              linePaint["line-color"] = layer.style.paint["line-color"];
            }
            if (layer.style.paint["line-width"] != null) {
              linePaint["line-width"] = layer.style.paint["line-width"];
            }
            if (layer.style.paint["line-dasharray"] != null) {
              linePaint["line-dasharray"] = layer.style.paint["line-dasharray"];
            }
            if (layer.style.paint["line-blur"] != null) {
              linePaint["line-blur"] = layer.style.paint["line-blur"];
            }
            if (layer.style.paint["line-gap-width"] != null) {
              linePaint["line-gap-width"] = layer.style.paint["line-gap-width"];
            }

            mapInstance.addLayer(
              {
                id: `layer-${layer.id}-line`,
                type: "line",
                source: sourceId,
                minzoom: wfsMinZoom,
                paint: linePaint as maplibregl.LineLayerSpecification["paint"],
              },
              firstSymbolId,
            );
            pipelineLog("addLayer", `layer-${layer.id}-line`, { type: "line", minzoom: wfsMinZoom });
          }
        } else if (layer.style.type === "circle") {
          // Cluster circles
          if (!mapInstance.getLayer(`layer-${layer.id}-cluster`)) {
            mapInstance.addLayer(
              {
                id: `layer-${layer.id}-cluster`,
                type: "circle",
                source: sourceId,
                filter: ["has", "point_count"],
                paint: {
                  "circle-color": "#2dd4bf",
                  "circle-radius": [
                    "step",
                    ["get", "point_count"],
                    15,
                    20, 20,
                    50, 25,
                    100, 35,
                  ],
                  "circle-opacity": visible
                    ? (layer.style.opacity ?? 0.7)
                    : 0,
                  "circle-stroke-width": 1,
                  "circle-stroke-color": "rgba(255,255,255,0.3)",
                },
              },
              firstSymbolId,
            );
            pipelineLog("addLayer", `layer-${layer.id}-cluster`, { type: "circle", cluster: true });
          }
          // Cluster count labels
          if (!mapInstance.getLayer(`layer-${layer.id}-cluster-count`)) {
            mapInstance.addLayer(
              {
                id: `layer-${layer.id}-cluster-count`,
                type: "symbol",
                source: sourceId,
                filter: ["has", "point_count"],
                layout: {
                  "text-field": "{point_count_abbreviated}",
                  "text-size": 11,
                  "text-font": ["Open Sans Regular"],
                },
                paint: { "text-color": "#ffffff" },
              },
              firstSymbolId,
            );
            pipelineLog("addLayer", `layer-${layer.id}-cluster-count`, { type: "symbol" });
          }
          // Unclustered individual points
          if (!mapInstance.getLayer(`layer-${layer.id}-circle`)) {
            // Cherry-pick valid circle paint properties (no undefined values)
            const circlePaint: Record<string, unknown> = {
              "circle-opacity": visible
                ? (layer.style.paint["circle-opacity"] as number) ?? 0.7
                : 0,
              "circle-stroke-opacity": visible ? 1 : 0,
              "circle-opacity-transition": { duration: 300 },
            };
            if (layer.style.paint["circle-color"] != null) {
              circlePaint["circle-color"] = layer.style.paint["circle-color"];
            }
            if (layer.style.paint["circle-radius"] != null) {
              circlePaint["circle-radius"] = layer.style.paint["circle-radius"];
            }
            if (layer.style.paint["circle-stroke-color"] != null) {
              circlePaint["circle-stroke-color"] = layer.style.paint["circle-stroke-color"];
            }
            if (layer.style.paint["circle-stroke-width"] != null) {
              circlePaint["circle-stroke-width"] = layer.style.paint["circle-stroke-width"];
            }
            if (layer.style.paint["circle-blur"] != null) {
              circlePaint["circle-blur"] = layer.style.paint["circle-blur"];
            }

            mapInstance.addLayer(
              {
                id: `layer-${layer.id}-circle`,
                type: "circle",
                source: sourceId,
                minzoom: wfsMinZoom,
                filter: ["!", ["has", "point_count"]],
                paint: circlePaint as maplibregl.CircleLayerSpecification["paint"],
              },
              firstSymbolId,
            );
            pipelineLog("addLayer", `layer-${layer.id}-circle`, { type: "circle", minzoom: wfsMinZoom });
          }
        }

        // Loading indicator layer (invisible fill, used as a signal)
        if (!mapInstance.getLayer(`layer-${layer.id}-loading`)) {
          mapInstance.addLayer({
            id: `layer-${layer.id}-loading`,
            type: "fill",
            source: sourceId,
            layout: { visibility: "none" },
            paint: {
              "fill-color": "#ffffff",
              "fill-opacity": 0,
            },
          });
        }
      } catch (err) {
        console.error(`[OpenCanopy] Failed to add WFS layers for ${layer.id}:`, err);
      }
    }

    function init() {
      if (cancelled) return;

      // Add GeoJSON source (synchronous -- no sourcedata wait needed)
      if (!mapInstance.getSource(sourceId)) {
        const sourceOpts: maplibregl.GeoJSONSourceSpecification = {
          type: "geojson",
          data: EMPTY_FC,
          attribution: layer.source.attribution,
        };
        // Circle layers need clustering
        if (layer.style.type === "circle") {
          sourceOpts.cluster = true;
          sourceOpts.clusterMaxZoom = 12;
          sourceOpts.clusterRadius = 50;
        }
        mapInstance.addSource(sourceId, sourceOpts);
        pipelineLog("addSource", layer.id, { type: "geojson", cluster: layer.style.type === "circle" });
      }

      addLayersToMap();
    }

    // Wait for map style to load before registering the source
    let onLoad: (() => void) | null = null;
    if (mapInstance.isStyleLoaded()) {
      init();
    } else {
      onLoad = () => init();
      mapInstance.on("load", onLoad);
    }

    // Unified cleanup: handles both the "load" listener AND layer/source
    // removal regardless of which code path was taken during setup.
    return () => {
      cancelled = true;
      if (onLoad) {
        mapInstance.off("load", onLoad);
      }
      const layerIds = getWfsLayerIds(layer);
      for (const id of layerIds) {
        if (mapInstance.getLayer(id)) {
          mapInstance.removeLayer(id);
        }
      }
      if (mapInstance.getSource(sourceId)) {
        mapInstance.removeSource(sourceId);
      }
    };
  }, [map, layer.id, layer.style.type, layer.source.attribution, wfsMinZoom]);

  // 2. Data update: push new GeoJSON data on viewport/timeline changes
  useEffect(() => {
    if (!map) return;

    const mapInstance = map.getMap();
    const sourceId = `source-${layer.id}`;
    const source = mapInstance.getSource(sourceId) as GeoJSONSource | undefined;
    if (source) {
      source.setData(filteredData);
      pipelineLog("wfs-data", layer.id, { features: filteredData.features.length });
    }
  }, [map, layer.id, filteredData]);

  // 3. Visibility toggle
  useEffect(() => {
    if (!map) return;

    const mapInstance = map.getMap();

    if (layer.style.type === "fill") {
      const fillId = `layer-${layer.id}-fill`;
      const outlineId = `layer-${layer.id}-outline`;
      // Use layout visibility for fill layers -- preserves zoom-dependent
      // opacity expressions (same approach as PmtilesLayers)
      if (mapInstance.getLayer(fillId)) {
        mapInstance.setLayoutProperty(fillId, "visibility", visible ? "visible" : "none");
        pipelineLog("visibility-effect", fillId, { property: "visibility", value: visible });
      }
      if (mapInstance.getLayer(outlineId)) {
        mapInstance.setLayoutProperty(outlineId, "visibility", visible ? "visible" : "none");
        pipelineLog("visibility-effect", outlineId, { property: "visibility", value: visible });
      }
    } else if (layer.style.type === "line") {
      const lineId = `layer-${layer.id}-line`;
      // Line layers use paint opacity for fade transitions
      if (mapInstance.getLayer(lineId)) {
        mapInstance.setPaintProperty(
          lineId,
          "line-opacity",
          visible ? (layer.style.paint["line-opacity"] as number) ?? 0.8 : 0
        );
        pipelineLog("setPaintProperty", lineId, { property: "line-opacity", value: visible });
      }
    } else if (layer.style.type === "circle") {
      const clusterId = `layer-${layer.id}-cluster`;
      const countId = `layer-${layer.id}-cluster-count`;
      const circleId = `layer-${layer.id}-circle`;
      // Circle layers use paint opacity for fade transitions
      if (mapInstance.getLayer(clusterId)) {
        mapInstance.setPaintProperty(
          clusterId,
          "circle-opacity",
          visible ? (layer.style.opacity ?? 0.7) : 0
        );
        pipelineLog("setPaintProperty", clusterId, { property: "circle-opacity", value: visible });
      }
      if (mapInstance.getLayer(countId)) {
        mapInstance.setLayoutProperty(countId, "visibility", visible ? "visible" : "none");
        pipelineLog("visibility-effect", countId, { property: "visibility", value: visible });
      }
      if (mapInstance.getLayer(circleId)) {
        mapInstance.setPaintProperty(
          circleId,
          "circle-opacity",
          visible ? (layer.style.paint["circle-opacity"] as number) ?? 0.7 : 0
        );
        mapInstance.setPaintProperty(
          circleId,
          "circle-stroke-opacity",
          visible ? 1 : 0
        );
        pipelineLog("setPaintProperty", circleId, { property: "circle-opacity", value: visible });
      }
    }
  }, [map, layer.id, layer.style.type, layer.style.paint, layer.style.opacity, visible]);

  // 4. Loading indicator visibility
  useEffect(() => {
    if (!map) return;

    const mapInstance = map.getMap();
    const loadingId = `layer-${layer.id}-loading`;
    if (mapInstance.getLayer(loadingId)) {
      mapInstance.setLayoutProperty(
        loadingId,
        "visibility",
        loading && visible ? "visible" : "none"
      );
    }
  }, [map, layer.id, loading, visible]);

  // 5. Class filters
  useEffect(() => {
    if (!map) return;

    const mapInstance = map.getMap();
    const fillId = `layer-${layer.id}-fill`;
    const outlineId = `layer-${layer.id}-outline`;

    const activeFilter = classFilters?.[layer.id];
    if (activeFilter) {
      const values = activeFilter.map(label => CLASS_LABEL_MAP[label]).filter(Boolean);
      const filter = ["in", ["get", "class"], ["literal", values]] as unknown as FilterSpecification;
      if (mapInstance.getLayer(fillId)) mapInstance.setFilter(fillId, filter);
      if (mapInstance.getLayer(outlineId)) mapInstance.setFilter(outlineId, filter);
    } else {
      if (mapInstance.getLayer(fillId)) mapInstance.setFilter(fillId, null);
      if (mapInstance.getLayer(outlineId)) mapInstance.setFilter(outlineId, null);
    }
    pipelineLog("setFilter", layer.id, { type: "wfs", filter: activeFilter ?? "none" });
  }, [map, layer.id, classFilters]);

  return null; // No DOM output -- layers managed imperatively
}

/**
 * Raster overview mount logger.
 * Logs when a raster overview source is mounted in the DOM.
 */
function RasterMountLogger({ layerId }: { layerId: string }) {
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      pipelineLog("raster-mount", layerId);
    }
  }, [layerId]);
  return null;
}

/**
 * Generic data layer component.
 * Renders any layer from the registry using the appropriate
 * react-map-gl Source + Layer combination.
 *
 * Dual-source support: when a layer has both `tileSource` and WFS `source`,
 * PMTiles render at low zoom (0 to tileSource.maxZoom) and WFS GeoJSON
 * renders at high zoom (tileSource.maxZoom+1 and up). This avoids
 * redundant data at the transition point.
 *
 * For WFS sources: loads GeoJSON from the proxy edge function.
 * For raster sources: uses MapLibre raster source directly.
 * Includes opacity transitions and loading states.
 */
export function DataLayer({ layer, visible, yearFilter, classFilters }: DataLayerProps) {
  const { current: map } = useMap();
  const [data, setData] = useState<GeoJSON.FeatureCollection>(EMPTY_FC);
  const [loading, setLoading] = useState(false);
  const { setLayerLoading } = useLoadingContext();

  const hasTileSource = !!layer.tileSource;
  const tileMaxZoom = layer.tileSource?.maxZoom ?? 0;
  // WFS kicks in above the tile maxZoom
  const wfsMinZoom = hasTileSource ? tileMaxZoom + 1 : layer.zoomRange[0];

  const targetOpacity = visible ? (layer.style.opacity ?? 0.7) : 0;

  // When timeline is active, filter WFS features client-side by year.
  // This avoids refetching during animation -- instant and smooth.
  const filteredData = useMemo(() => {
    if (!layer.timelineField || yearFilter == null) return data;
    return {
      ...data,
      features: data.features.filter((f) => {
        const raw = f.properties?.[layer.timelineField!];
        if (raw == null) return false;
        let year: number;
        if (typeof raw === "number") {
          year = raw;
        } else {
          // Extract year via string slice (consistent with story map
          // visibility.ts — works for both "2015" and "2015-06-01")
          year = parseInt(String(raw).slice(0, 4), 10);
        }
        return !isNaN(year) && year <= yearFilter;
      }),
    };
  }, [data, layer.timelineField, yearFilter]);

  // PMTiles stay visible during timeline -- filtered on the GPU, not hidden.
  // The merged filter+opacity effect in PmtilesLayers handles all state.

  // Fetch WFS data when viewport changes
  const loadData = useCallback(async () => {
    if (!map || !visible || layer.source.type !== "wfs") return;

    const bounds = map.getBounds();
    if (!bounds) return;

    const zoom = map.getZoom();

    // Don't fetch WFS outside the layer's zoom range
    if (zoom < layer.zoomRange[0] || zoom > layer.zoomRange[1]) return;

    const bbox: BBox = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ];

    // Viewport area guard: skip WFS for large viewports (~50k km^2, roughly zoom 7)
    // unless the layer has a tileSource (PMTiles handle wide views efficiently)
    if (!layer.tileSource) {
      const lngSpan = bbox[2] - bbox[0];
      const latSpan = bbox[3] - bbox[1];
      const approxAreaKm2 =
        lngSpan * latSpan * 111 * 111 * Math.cos(((bbox[1] + bbox[3]) / 2) * Math.PI / 180);
      const MAX_WFS_AREA = 50000; // km^2
      if (approxAreaKm2 > MAX_WFS_AREA) {
        setData(EMPTY_FC);
        return;
      }
    }

    // Pad bbox by 20% for smoother panning (pre-fetch surrounding area)
    const lngSpan = bbox[2] - bbox[0];
    const latSpan = bbox[3] - bbox[1];
    const paddedBbox: BBox = [
      bbox[0] - lngSpan * 0.2,
      bbox[1] - latSpan * 0.2,
      bbox[2] + lngSpan * 0.2,
      bbox[3] + latSpan * 0.2,
    ];

    pipelineLog("wfs-fetch", layer.id, { bbox: paddedBbox, zoom });

    setLoading(true);
    setLayerLoading(layer.id, true);
    const fetchStart = performance.now();
    try {
      const fc = await fetchLayerData(layer.id, paddedBbox, zoom, layer.fetchPriority);
      setData(fc);
      const elapsed = (performance.now() - fetchStart).toFixed(0);
      pipelineLog("wfs-data", layer.id, { features: fc.features.length, elapsed: elapsed + "ms" });
    } catch (err) {
      console.error(`Failed to load layer ${layer.id}:`, err);
    } finally {
      setLoading(false);
      setLayerLoading(layer.id, false);
    }
  }, [map, visible, layer.id, layer.source.type, layer.zoomRange, setLayerLoading]);

  // Clear loading state on unmount
  useEffect(() => {
    return () => {
      setLayerLoading(layer.id, false);
    };
  }, [layer.id, setLayerLoading]);

  // Load data on mount and viewport changes
  useEffect(() => {
    if (!map || layer.source.type !== "wfs") return;

    loadData();

    const handleMoveEnd = () => loadData();
    map.on("moveend", handleMoveEnd);

    return () => {
      map.off("moveend", handleMoveEnd);
    };
  }, [map, loadData, layer.source.type]);

  // Trigger reload when visibility changes
  useEffect(() => {
    if (visible && layer.source.type === "wfs") {
      loadData();
    }
  }, [visible, loadData, layer.source.type]);

  // Raster layer (satellite imagery)
  if (layer.source.type === "raster" && layer.source.url) {
    return (
      <Source
        id={`source-${layer.id}`}
        type="raster"
        tiles={[layer.source.url]}
        tileSize={256}
        attribution={layer.source.attribution}
      >
        <Layer
          id={`layer-${layer.id}`}
          type="raster"
          paint={{
            "raster-opacity": targetOpacity,
            "raster-opacity-transition": { duration: 300 },
          }}
        />
      </Source>
    );
  }

  // WFS GeoJSON layers (with optional PMTiles underlay + raster overview)
  if (layer.source.type === "wfs") {
    // Raster overview: pre-rendered PNG tiles at z4-z7 for layers too dense
    // for vector rendering at province scale (avoids Chrome crashes).
    const hasRasterOverview = !!layer.rasterOverview;
    const rasterMaxZoom = layer.rasterOverview?.maxZoom ?? 0;

    // Determine which per-class rasters to show based on class filter state
    const activeClasses = classFilters?.[layer.id]
      ? classFilters[layer.id].map(label => CLASS_LABEL_MAP[label]).filter(Boolean)
      : null;
    const allClassesSelected = !activeClasses || activeClasses.length === CLASS_NAMES.length || activeClasses.length === 0;
    const showDefault = allClassesSelected;

    return (
      <>
        {/* Raster overview tiles -- pre-rendered PNGs, zero geometry parsing.
            5 sources for forest-age: 1 default (all-class) + 4 per-class.
            Only one set has non-zero opacity at a time. Pre-mounted to avoid
            unmount/remount flash -- MapLibre lazy-loads inactive raster tiles. */}
        {hasRasterOverview && layer.rasterOverview && (
          <>
            {/* Default all-class raster (always mounted) */}
            <Source
              id={`source-${layer.id}-raster`}
              type="raster"
              tiles={[layer.rasterOverview.urlTemplate]}
              tileSize={256}
              minzoom={layer.rasterOverview.minZoom}
              maxzoom={layer.rasterOverview.maxZoom + 1}
              attribution={layer.source.attribution}
            >
              <Layer
                id={`layer-${layer.id}-raster`}
                type="raster"
                maxzoom={layer.rasterOverview.maxZoom + 1}
                paint={{
                  "raster-opacity": visible && showDefault ? 0.85 : 0,
                  "raster-opacity-transition": { duration: 300 },
                }}
              />
              <RasterMountLogger layerId={layer.id} />
            </Source>

            {/* Per-class raster sources (only when rasterOverviewClassUrl configured) */}
            {layer.rasterOverviewClassUrl && CLASS_NAMES.map(cls => (
              <Source
                key={cls}
                id={`source-${layer.id}-raster-${cls}`}
                type="raster"
                tiles={[layer.rasterOverviewClassUrl!.replace("{class}", cls)]}
                tileSize={256}
                minzoom={layer.rasterOverview!.minZoom}
                maxzoom={layer.rasterOverview!.maxZoom + 1}
                attribution={layer.source.attribution}
              >
                <Layer
                  id={`layer-${layer.id}-raster-${cls}`}
                  type="raster"
                  maxzoom={layer.rasterOverview!.maxZoom + 1}
                  paint={{
                    "raster-opacity": visible && !showDefault && activeClasses?.includes(cls) ? 0.85 : 0,
                    "raster-opacity-transition": { duration: 300 },
                  }}
                />
              </Source>
            ))}
          </>
        )}

        {/* PMTiles vector tile source (low zoom) -- added imperatively
            because react-map-gl's declarative <Layer> fails for fill types
            when the PMTiles source loads asynchronously from a remote URL */}
        {hasTileSource && layer.tileSource && (
          <PmtilesLayers
            layer={layer}
            tileMaxZoom={tileMaxZoom}
            tileMinZoom={hasRasterOverview ? rasterMaxZoom + 1 : undefined}
            visible={visible}
            opacity={targetOpacity}
            classFilters={classFilters}
            yearFilter={yearFilter}
          />
        )}

        {/* WFS GeoJSON source (high zoom, or full range if no tile source).
            Managed imperatively via MapLibre API -- always mounted, handles
            visibility internally. Eliminates react-map-gl "missing source"
            errors that spam the console with declarative <Source> + <Layer>. */}
        <WfsLayers
          layer={layer}
          visible={visible}
          filteredData={filteredData}
          loading={loading}
          classFilters={classFilters}
          wfsMinZoom={wfsMinZoom}
        />
      </>
    );
  }

  return null;
}
