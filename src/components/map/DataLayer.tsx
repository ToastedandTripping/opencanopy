"use client";

import { useEffect, useState, useCallback, useMemo, useRef, memo } from "react";
import { Source, Layer, useMap } from "react-map-gl/maplibre";
import maplibregl, { GeoJSONSource, type FilterSpecification } from "maplibre-gl";
import type { LayerDefinition, BBox } from "@/types/layers";
import { fetchLayerData } from "@/lib/data/wfs-client";
import { resolveWfsStatus, shouldSurfaceWfsLoading } from "@/lib/data/wfs-status";
import { useLoadingContext } from "@/contexts/LoadingContext";
import { pipelineLog } from "@/lib/debug/pipeline-logger";
import { PMTILES_URL, PMTILES_SOURCE_ID, PMTILES_MAX_ZOOM } from "@/lib/layers/registry";
import { pickDefinedPaint } from "@/lib/layers/paint";
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

import { EMPTY_FC } from "@/lib/map/empty-fc";

// ── Imperative Raster (Satellite) Layer Manager ─────────────────────────────
//
// D1 fix: satellite must render BELOW all data overlay layers.
// Declarative react-map-gl <Source>/<Layer> appends to the top of the layer
// stack on mount, making satellite cover all data layers. This imperative
// component instead inserts the raster layer at the correct z-order anchor.
//
// Anchor logic (deterministic regardless of mount order):
//   1. First basemap layer whose id starts with "layer-" EXCLUDING this
//      component's own layer id — this places satellite below data overlays.
//   2. Else: first symbol-type layer in the basemap (firstSymbolId).
//   3. Else: append at top (fallback for empty styles).
//
// draw-* and watershed-* layers do NOT start with "layer-" so they are
// intentionally topmost — this component leaves them alone.
//
// Opacity changes use setPaintProperty in a separate effect to avoid
// unnecessary teardown/recreate cycles on every visibility toggle.

/**
 * Determine the insertion anchor for the satellite raster layer.
 *
 * Anchor logic (deterministic regardless of mount order):
 *   1. First layer whose id starts with "layer-" EXCLUDING the satellite's own
 *      layer id — places satellite below all data overlays.
 *   2. Else: first symbol-type layer (firstSymbolId).
 *   3. Else: undefined (append at top as fallback for empty styles).
 *
 * Exported for unit testing in satellite-zorder.test.ts.
 * draw-* and watershed-* layers do NOT start with "layer-" so they remain
 * intentionally topmost and are ignored by this function.
 */
export function findSatelliteAnchor(
  allLayers: { id: string; type: string }[],
  satelliteLayerId: string,
): string | undefined {
  const overlayIdx = allLayers.findIndex(
    (l) => l.id.startsWith("layer-") && l.id !== satelliteLayerId
  );
  const symbolIdx = allLayers.findIndex(
    (l) => l.type === "symbol"
  );
  // Pick whichever candidate appears earlier in the stack (lower index).
  // This ensures satellite is anchored below basemap labels even during the
  // async-source window when declarative raster overviews (layer-*-raster) are
  // the only layer-* entries and happen to sit above symbol layers.
  // Fallback chain: if one is missing (-1), use the other; if both missing → undefined.
  if (overlayIdx === -1 && symbolIdx === -1) return undefined;
  if (overlayIdx === -1) return allLayers[symbolIdx].id;
  if (symbolIdx === -1) return allLayers[overlayIdx].id;
  const earlier = overlayIdx < symbolIdx ? overlayIdx : symbolIdx;
  return allLayers[earlier].id;
}

/**
 * Find the first symbol-type (basemap label) layer in a style's layer list.
 *
 * D-fix (mobile/legibility audit, ~2026-07): the declarative raster-overview
 * <Layer> in DataLayer had no `beforeId`, so react-map-gl appended it to the
 * TOP of the style stack on mount — painting overview tiles over city/place
 * labels at z4-z9. The imperative vector paths (PmtilesLayers, WfsLayers)
 * already insert below `firstSymbolId`; this is the same computation,
 * extracted so the declarative raster <Layer> can pass it as `beforeId` too.
 *
 * Exported for unit testing.
 */
import { getFirstSymbolId } from "@/lib/map/layer-utils";

function SatelliteLayers({
  layer,
  visible,
}: {
  layer: LayerDefinition;
  visible: boolean;
}) {
  const { current: map } = useMap();

  const sourceId = `source-${layer.id}`;
  const layerId = `layer-${layer.id}`;

  // Keep a ref to `visible` that is always current. This lets addToMap() read
  // the up-to-date visibility at the time it actually runs (which may be on the
  // "load" event, after one or more renders have occurred since the effect fired).
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  // Effect 1: Add source and raster layer imperatively, once on mount.
  useEffect(() => {
    if (!map || !layer.source.url) return;
    const mapInstance = map.getMap();

    function addToMap() {
      // Register source (idempotent)
      if (!mapInstance.getSource(sourceId)) {
        mapInstance.addSource(sourceId, {
          type: "raster",
          tiles: [layer.source.url as string],
          tileSize: 256,
          attribution: layer.source.attribution,
        });
        pipelineLog("addSource", layer.id, { sourceId, action: "registered", type: "raster" });
      }

      if (mapInstance.getLayer(layerId)) return;

      // Determine insertion anchor using the exported helper.
      const allLayers = mapInstance.getStyle().layers as maplibregl.LayerSpecification[];
      const anchor = findSatelliteAnchor(allLayers as { id: string; type: string }[], layerId);

      // Use visibleRef.current so opacity is set from the current prop value
      // at addLayer time, not from the stale closure captured at effect creation.
      // This fixes a race where a visibility toggle before style-load would leave
      // the layer at the wrong opacity until the next setPaintProperty call.
      const rasterPaint = pickDefinedPaint({
        "raster-opacity": visibleRef.current ? (layer.style.opacity ?? 1) : 0,
        "raster-opacity-transition": { duration: 300 },
      });

      mapInstance.addLayer(
        {
          id: layerId,
          type: "raster",
          source: sourceId,
          paint: rasterPaint as maplibregl.RasterLayerSpecification["paint"],
        },
        anchor,
      );
      pipelineLog("addLayer", layerId, { anchor: anchor ?? "append", type: "raster" });
    }

    // Unified cleanup: removes the load listener AND layer/source regardless
    // of which path was taken. This mirrors WfsLayers' unified cleanup pattern
    // and prevents a leak on the style-pending path (WARNING-3).
    let onLoad: (() => void) | null = null;

    if (mapInstance.isStyleLoaded()) {
      addToMap();
    } else {
      onLoad = () => addToMap();
      mapInstance.on("load", onLoad);
    }

    return () => {
      if (onLoad) {
        mapInstance.off("load", onLoad);
      }
      if (mapInstance.getLayer(layerId)) {
        mapInstance.removeLayer(layerId);
      }
      if (mapInstance.getSource(sourceId)) {
        mapInstance.removeSource(sourceId);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, layer.id, layer.source.url, layer.source.attribution]);

  // Effect 2: Update opacity reactively on visibility changes.
  // Separate effect to avoid teardown/recreate on every toggle.
  useEffect(() => {
    if (!map) return;
    const mapInstance = map.getMap();
    if (!mapInstance.getLayer(layerId)) return;
    mapInstance.setPaintProperty(
      layerId,
      "raster-opacity",
      visible ? (layer.style.opacity ?? 1) : 0,
    );
    pipelineLog("setPaintProperty", layerId, { property: "raster-opacity", visible, opacity: layer.style.opacity ?? 1 });
  }, [map, layer.id, layer.style.opacity, visible, layerId]);

  return null; // No DOM output — layers managed imperatively
}

/**
 * Imperative PMTiles layer manager.
 * Adds the vector tile source and layers directly via the MapLibre API
 * after the source has loaded. This avoids the react-map-gl timing bug
 * where declarative <Layer> components fail when the PMTiles source
 * resolves asynchronously from a remote URL.
 */
function PmtilesLayers({
  layer,
  tileMinZoom,
  visible,
  classFilters,
  yearFilter,
  onError,
}: {
  layer: LayerDefinition;
  tileMinZoom?: number;
  visible: boolean;
  classFilters?: Record<string, string[]>;
  yearFilter?: number | null;
  /** Called when PMTiles source fails to load (timeout or addLayer error) */
  onError?: (layerId: string) => void;
}) {
  const { current: map } = useMap();

  // Add source and layers once the map style + PMTiles source are ready
  useEffect(() => {
    if (!map || !layer.tileSource) return;

    const mapInstance = map.getMap();
    const sourceId = PMTILES_SOURCE_ID;
    let sourcedataHandler: ((e: maplibregl.MapSourceDataEvent) => void) | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

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

        const firstSymbolId = getFirstSymbolId(mapInstance.getStyle().layers);

        if (layer.style.type === "fill") {
          if (!mapInstance.getLayer(`layer-${layer.id}-tiles-fill`)) {
            // Bug 2 fix: pass through the registry expression directly
            // (may be a scalar or a MapLibre interpolation expression array).
            // pickDefinedPaint strips any undefined-valued keys (invariant #4).
            const fillPaint = pickDefinedPaint({
              "fill-antialias": false,
              "fill-opacity-transition": { duration: 300 },
              "fill-opacity": layer.style.paint["fill-opacity"],
              "fill-color": layer.style.paint["fill-color"],
              "fill-outline-color": layer.style.paint["fill-outline-color"],
            });

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
            // A registry `style.outline` declares an explicit solid border
            // (e.g. old-growth's gold edge); otherwise fall back to the faint
            // default auto-edge. Single generic capability — no per-id casing.
            const outline = layer.style.outline;
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
                    outline?.color ??
                    (layer.style.paint["fill-outline-color"] as string) ??
                    "rgba(255,255,255,0.2)",
                  "line-width": outline
                    ? outline.width
                    : [
                        "interpolate", ["linear"], ["zoom"],
                        5, 0,
                        8, 0.3,
                        10, 0.5,
                      ],
                  "line-opacity": outline
                    ? outline.opacity
                    : [
                        "interpolate", ["linear"], ["zoom"],
                        5, 0,
                        8, 0.2,
                        10, 0.4,
                      ],
                  // Dashed boundary when the registry outline declares one
                  // (e.g. conservancies). Solid otherwise.
                  ...(outline?.dasharray
                    ? { "line-dasharray": outline.dasharray }
                    : {}),
                  "line-opacity-transition": { duration: 300 },
                } as maplibregl.LineLayerSpecification["paint"],
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
                paint: pickDefinedPaint({
                  "line-opacity": visible
                    ? (layer.style.paint["line-opacity"] as number) ?? 0.8
                    : 0,
                  "line-opacity-transition": { duration: 300 },
                  "line-color": layer.style.paint["line-color"],
                  "line-width": layer.style.paint["line-width"],
                  "line-dasharray": layer.style.paint["line-dasharray"],
                  "line-blur": layer.style.paint["line-blur"],
                  "line-gap-width": layer.style.paint["line-gap-width"],
                }) as maplibregl.LineLayerSpecification["paint"],
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
        onError?.(layer.id);
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

      // Timeout: if source doesn't load in 15s, report error status
      timeoutId = setTimeout(() => {
        if (sourcedataHandler) {
          mapInstance.off("sourcedata", sourcedataHandler);
          sourcedataHandler = null;
          pipelineLog("pmtiles-source", layer.id + " TIMEOUT", { sourceId });
          console.warn(`[OpenCanopy] PMTiles source for ${layer.id} failed to load within 15s`);
          onError?.(layer.id);
        }
        timeoutId = null;
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
        if (timeoutId) clearTimeout(timeoutId);
      };
    }

    return () => {
      if (sourcedataHandler) {
        mapInstance.off("sourcedata", sourcedataHandler);
      }
      if (timeoutId) clearTimeout(timeoutId);
      // Don't remove layers on unmount -- they persist across re-renders
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onError/tileMinZoom/visible intentionally excluded: including them would teardown+recreate MapLibre sources on every prop change
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
      if (mapInstance.getLayer(outlineId)) {
        mapInstance.setPaintProperty(outlineId, "line-opacity", [
          "interpolate",
          ["linear"],
          ["-", yearFilter, buildYearExpression(layer.timelineField)],
          0, 0.3,
          20, 0.15,
          50, 0.05,
        ]);
      }

      pipelineLog("setFilter", layer.id, { type: "pmtiles-year", year: yearFilter, classFilter: activeClassFilter ?? "none" });
    } else {
      // No timeline: class filter only, restore registry default opacity
      const composedFilter = composeFilters(baseFilter, classFilterExpr, null) as unknown as FilterSpecification | null;

      mapInstance.setFilter(fillId, composedFilter);
      if (mapInstance.getLayer(outlineId)) {
        mapInstance.setFilter(outlineId, composedFilter);
      }

      // Restore registry fill-opacity expression.
      // Always call setPaintProperty even when registry value is null/undefined
      // so any age-graded interpolation expression from the active phase is cleared.
      const restoreOpacity = layer.style.paint["fill-opacity"] ?? layer.style.opacity ?? 0.7;
      mapInstance.setPaintProperty(fillId, "fill-opacity", restoreOpacity);
      // Restore outline line-opacity: an explicit registry outline keeps its
      // solid value; otherwise the faint default ramp.
      if (mapInstance.getLayer(outlineId)) {
        mapInstance.setPaintProperty(
          outlineId,
          "line-opacity",
          layer.style.outline
            ? layer.style.outline.opacity
            : [
                "interpolate", ["linear"], ["zoom"],
                5, 0,
                8, 0.2,
                10, 0.4,
              ]
        );
      }

      pipelineLog("setFilter", layer.id, { type: "pmtiles-class", filter: activeClassFilter ?? "none" });
    }
  }, [map, layer.id, layer.tileSource, layer.style.type, layer.style.filter, layer.style.paint, layer.style.outline, layer.style.opacity, layer.timelineField, classFilters, yearFilter]);

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

  // D10 fix: this component is only mounted when !layer.tileSource (DataLayer
  // guards the render). The early return that previously lived here violated
  // rules-of-hooks (it sat above 5 hooks). By gating at the mount site instead,
  // hooks always run unconditionally whenever this component is mounted.

  // 1. Initialization: add source + layers
  useEffect(() => {
    if (!map) return;

    const mapInstance = map.getMap();
    const sourceId = `source-${layer.id}`;
    let cancelled = false;

    function addLayersToMap() {
      if (cancelled) return;

      try {
        const firstSymbolId = getFirstSymbolId(mapInstance.getStyle().layers);

        if (layer.style.type === "fill") {
          if (!mapInstance.getLayer(`layer-${layer.id}-fill`)) {
            // pickDefinedPaint strips undefined-valued keys (invariant #4),
            // preserving zoom-dependent opacity expressions from the registry.
            const fillPaint = pickDefinedPaint({
              "fill-antialias": false,
              "fill-opacity-transition": { duration: 300 },
              "fill-opacity": layer.style.paint["fill-opacity"],
              "fill-color": layer.style.paint["fill-color"],
              "fill-outline-color": layer.style.paint["fill-outline-color"],
              "fill-pattern": layer.style.paint["fill-pattern"],
            });

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
            // pickDefinedPaint strips undefined-valued keys (invariant #4).
            const linePaint = pickDefinedPaint({
              "line-opacity": visible
                ? (layer.style.paint["line-opacity"] as number) ?? 0.8
                : 0,
              "line-opacity-transition": { duration: 300 },
              "line-color": layer.style.paint["line-color"],
              "line-width": layer.style.paint["line-width"],
              "line-dasharray": layer.style.paint["line-dasharray"],
              "line-blur": layer.style.paint["line-blur"],
              "line-gap-width": layer.style.paint["line-gap-width"],
            });

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
            // pickDefinedPaint strips undefined-valued keys (invariant #4).
            const circlePaint = pickDefinedPaint({
              "circle-opacity": visible
                ? (layer.style.paint["circle-opacity"] as number) ?? 0.7
                : 0,
              "circle-stroke-opacity": visible ? 1 : 0,
              "circle-opacity-transition": { duration: 300 },
              "circle-color": layer.style.paint["circle-color"],
              "circle-radius": layer.style.paint["circle-radius"],
              "circle-stroke-color": layer.style.paint["circle-stroke-color"],
              "circle-stroke-width": layer.style.paint["circle-stroke-width"],
              "circle-blur": layer.style.paint["circle-blur"],
            });

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
    // `cancelled` prevents addLayersToMap from running after cleanup fires
    // (StrictMode double-invoke pattern).
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layer/visible excluded: source lifecycle depends only on layer.id+style.type, not visibility or full layer object
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

/** Shallow array-by-value equality, order-sensitive (class filter arrays are ordered lists). */
function classFilterArraysEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Custom React.memo comparator for DataLayer (P1a fix).
 *
 * CanopyMap's <Map> re-rendered on every zoom tick and mouse-move (Change 2's
 * MapReadout fix addresses the source of that), which re-rendered all 18-19
 * <DataLayer> instances even though DataLayer/PmtilesLayers/WfsLayers only
 * ever read a scoped slice of props: layer.id, visible, yearFilter, and
 * classFilters?.[layer.id] (see :1245, :509, :989). DataLayer's internal
 * state/effects are keyed off map/layer.id/visible/yearFilter, so skipping a
 * re-render when none of that scoped slice changed is safe by construction.
 *
 * classFilters is compared BY VALUE for this layer's slice specifically
 * (not by object reference) because the parent's classFilters state is a new
 * object on every unrelated change — comparing the whole object by reference
 * would defeat the memo for every layer whenever ANY layer's filter changed.
 */
function dataLayerPropsAreEqual(prev: DataLayerProps, next: DataLayerProps): boolean {
  return (
    prev.layer.id === next.layer.id &&
    prev.visible === next.visible &&
    prev.yearFilter === next.yearFilter &&
    classFilterArraysEqual(prev.classFilters?.[prev.layer.id], next.classFilters?.[next.layer.id])
  );
}

const DataLayer = memo(function DataLayer({ layer, visible, yearFilter, classFilters }: DataLayerProps) {
  const { current: map } = useMap();
  const [data, setData] = useState<GeoJSON.FeatureCollection>(EMPTY_FC);
  const [loading, setLoading] = useState(false);
  const { setLayerLoading, setLayerStatus, clearLayerStatus } = useLoadingContext();

  // D-fix: beforeId for the declarative raster-overview <Layer>(s) below, so
  // they render just under basemap labels instead of appending to the top of
  // the stack (which painted overview tiles over city/place names at z4-z9).
  // Kept in React state (not computed inline at render) because — unlike the
  // imperative PmtilesLayers/WfsLayers paths, which compute firstSymbolId once
  // at addLayer() time — this is a *declarative* <Layer>, so beforeId must stay
  // reactive as the style loads/changes. react-map-gl's Layer component diffs
  // beforeId and calls map.moveLayer() on change; it does NOT remove/re-add the
  // layer, so this cannot cause the raster to vanish or flash (confirmed against
  // node_modules/@vis.gl/react-maplibre/dist/components/layer.js updateLayer()).
  const [rasterBeforeId, setRasterBeforeId] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!map) return;
    const mapInstance = map.getMap();

    function updateRasterBeforeId() {
      if (!mapInstance.isStyleLoaded()) return;
      setRasterBeforeId(
        getFirstSymbolId(mapInstance.getStyle().layers as maplibregl.LayerSpecification[])
      );
    }

    updateRasterBeforeId();
    mapInstance.on("styledata", updateRasterBeforeId);
    return () => {
      mapInstance.off("styledata", updateRasterBeforeId);
    };
  }, [map]);

  // PMTiles error callback — called from initSource timeout and addLayersToMap catch
  const handlePmtilesError = useCallback((layerId: string) => {
    setLayerStatus(layerId, "error");
  }, [setLayerStatus]);

  const hasTileSource = !!layer.tileSource;
  const tileMaxZoom = layer.tileSource?.maxZoom ?? 0;
  // WFS kicks in above the tile maxZoom
  const wfsMinZoom = hasTileSource ? tileMaxZoom + 1 : layer.zoomRange[0];

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
    // D10 fix: tile-backed layers use PMTiles at all zooms; the supplemental
    // WFS render path was dead code (WfsLayers was not mounted for these layers).
    // Skip the fetch entirely — behavior-neutral by construction.
    if (!map || layer.source.type !== "wfs" || hasTileSource) return;

    // When toggled off, clear any stale status (error/empty/zoom) so StatusToast
    // doesn't keep showing an indicator for a disabled layer. DataLayer never
    // unmounts (CanopyMap always-mounts all layers), so unmount cleanup alone
    // is insufficient.
    if (!visible) {
      clearLayerStatus(layer.id);
      return;
    }

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
        // B.2: viewport too large → zoom status.
        // Clear local loading state so it can't get stuck if a prior fetch
        // was in-flight when the viewport suddenly widened. setLayerLoading is
        // intentionally skipped here: it only clears "loading" status and
        // won't overwrite the terminal "zoom" we just set via setLayerStatus.
        // (This block is only reached for WFS-only layers — see !layer.tileSource guard above.)
        setLoading(false);
        setLayerStatus(layer.id, "zoom");
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

    // Dual-source rule: for tile-backed layers (hasTileSource), PMTiles are
    // the user-visible source and always render with overzoom. The supplemental
    // WFS fetch only provides high-zoom detail / interactivity data — a WFS
    // failure does NOT mean "no data shown". So terminal status (error/empty/zoom/ok)
    // is only surfaced for WFS-only layers (!hasTileSource); tile-backed layers
    // report their status exclusively via the PMTiles path (handlePmtilesError).
    // The "loading" status is also skipped for tile-backed layers to avoid a
    // brief spinner when tiles are already rendered and the WFS is supplemental.
    // Only WFS-only layers reach here (hasTileSource was already guarded above).
    setLoading(true);
    setLayerLoading(layer.id, true);
    const fetchStart = performance.now();
    try {
      const fc = await fetchLayerData(layer.id, paddedBbox, zoom, layer.fetchPriority);
      setData(fc);
      const elapsed = (performance.now() - fetchStart).toFixed(0);
      pipelineLog("wfs-data", layer.id, { features: fc.features.length, elapsed: elapsed + "ms" });
      // B.2: success path — distinguish ok vs empty (WFS-only layers only)
      const successStatus = resolveWfsStatus(hasTileSource, fc.features.length > 0 ? "ok" : "empty");
      if (successStatus) setLayerStatus(layer.id, successStatus);
    } catch (err) {
      // Abort is not an error — it means the fetch was superseded by a newer one
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(`Failed to load layer ${layer.id}:`, err);
      // B.2: error path — clear stale features so error doesn't masquerade as data
      setData(EMPTY_FC);
      // Only surface "error" status for WFS-only layers; tile-backed layers
      // still render via PMTiles so the WFS failure is not user-visible.
      const errorStatus = resolveWfsStatus(hasTileSource, "error");
      if (errorStatus) setLayerStatus(layer.id, errorStatus);
    } finally {
      setLoading(false);
      if (shouldSurfaceWfsLoading(hasTileSource)) {
        // Back-compat: only clears "loading" state, won't overwrite terminal status
        setLayerLoading(layer.id, false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layer.fetchPriority excluded: changing priority should not re-trigger the fetch effect
  }, [map, visible, layer.id, layer.source.type, layer.zoomRange, layer.tileSource, hasTileSource, setLayerLoading, setLayerStatus, clearLayerStatus]);

  // Clear status on unmount so disabled layers don't pollute the status map
  useEffect(() => {
    return () => {
      setLayerLoading(layer.id, false);
      clearLayerStatus(layer.id);
    };
  }, [layer.id, setLayerLoading, clearLayerStatus]);

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

  // Raster layer (satellite imagery) — imperative for correct z-order.
  // D1 fix: declarative <Source>/<Layer> appended to the top of the layer
  // stack on mount, making satellite cover all data layers. SatelliteLayers
  // inserts at the first "layer-*" anchor for deterministic z-order.
  if (layer.source.type === "raster" && layer.source.url) {
    return <SatelliteLayers layer={layer} visible={visible} />;
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
            unmount/remount flash -- MapLibre lazy-loads inactive raster tiles.
            All 5 <Layer>s carry `beforeId={rasterBeforeId}` (D-fix, z-order
            legibility) so they sit below basemap labels instead of appending
            to the top of the stack. This is a prop diff, not a mount/unmount --
            react-map-gl's Layer calls map.moveLayer() when beforeId changes, so
            it does not disturb the pre-mount-to-avoid-flash strategy above. */}
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
                beforeId={rasterBeforeId}
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
                  beforeId={rasterBeforeId}
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
            tileMinZoom={hasRasterOverview ? rasterMaxZoom + 1 : layer.tileSource.minZoom}
            visible={visible}
            classFilters={classFilters}
            yearFilter={yearFilter}
            onError={handlePmtilesError}
          />
        )}

        {/* WFS GeoJSON source — WFS-only layers only.
            D10 fix: tile-backed layers use PMTiles at all zooms; mounting
            WfsLayers for them caused a rules-of-hooks violation (the early
            return sat above 5 hooks) and fired a dead-code WFS fetch.
            WfsLayers is only mounted when !hasTileSource; its hooks then
            always run unconditionally on every mount. */}
        {!hasTileSource && (
          <WfsLayers
            layer={layer}
            visible={visible}
            filteredData={filteredData}
            loading={loading}
            classFilters={classFilters}
            wfsMinZoom={wfsMinZoom}
          />
        )}
      </>
    );
  }

  return null;
}, dataLayerPropsAreEqual);

export { DataLayer };
