"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Source, Layer, useMap } from "react-map-gl/maplibre";
import maplibregl, { type FilterSpecification } from "maplibre-gl";
import type { LayerDefinition, BBox } from "@/types/layers";
import { fetchLayerData } from "@/lib/data/wfs-client";
import { useLoadingContext } from "@/contexts/LoadingContext";

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

function buildClassFilter(enabledLabels: string[]): unknown[] | undefined {
  const values = enabledLabels.map(l => CLASS_LABEL_MAP[l]).filter(Boolean);
  if (values.length === 0) return undefined;
  return ["in", ["get", "class"], ["literal", values]];
}

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
}: {
  layer: LayerDefinition;
  tileMaxZoom: number;
  tileMinZoom?: number;
  visible: boolean;
  opacity: number;
  classFilters?: Record<string, string[]>;
}) {
  const { current: map } = useMap();

  // Add source and layers once the map style + PMTiles source are ready
  useEffect(() => {
    if (!map || !layer.tileSource) return;

    const mapInstance = map.getMap();
    const sourceId = `source-${layer.id}-tiles`;
    let sourcedataHandler: ((e: maplibregl.MapSourceDataEvent) => void) | null = null;

    /** Register the vector tile source (idempotent). */
    function addSource() {
      if (!mapInstance.getSource(sourceId)) {
        mapInstance.addSource(sourceId, {
          type: "vector",
          url: layer.tileSource!.url,
          attribution: layer.source.attribution,
        });
      }
    }

    /**
     * Add map layers for this data source.
     * Called only after the source has confirmed loaded (header resolved).
     */
    function addLayersToMap() {
      try {
        const sourceLayer = layer.tileSource!.sourceLayer;
        const maxzoom = tileMaxZoom + 1;
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
              },
              firstSymbolId,
            );
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
              },
              firstSymbolId,
            );
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
              },
              firstSymbolId,
            );
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
        addLayersToMap();
        return;
      }

      // Otherwise, listen for the sourcedata event to confirm the source is ready
      sourcedataHandler = (e: maplibregl.MapSourceDataEvent) => {
        if (e.sourceId === sourceId && mapInstance.isSourceLoaded(sourceId)) {
          mapInstance.off("sourcedata", sourcedataHandler!);
          sourcedataHandler = null;
          if (timeoutId) clearTimeout(timeoutId);
          addLayersToMap();
        }
      };
      mapInstance.on("sourcedata", sourcedataHandler);

      // Timeout: if source doesn't load in 15s, give up and log a warning
      const timeoutId = setTimeout(() => {
        if (sourcedataHandler) {
          mapInstance.off("sourcedata", sourcedataHandler);
          sourcedataHandler = null;
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
  }, [map, layer.id, layer.tileSource, layer.style, layer.source.attribution, tileMaxZoom]);

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
    }
    if (mapInstance.getLayer(outlineId)) {
      mapInstance.setLayoutProperty(outlineId, "visibility", visible ? "visible" : "none");
    }
    // Line layers still use paint opacity (no expression to preserve)
    if (mapInstance.getLayer(lineId)) {
      mapInstance.setPaintProperty(
        lineId,
        "line-opacity",
        visible ? (layer.style.paint["line-opacity"] as number) ?? 0.8 : 0
      );
    }
  }, [map, layer.id, layer.tileSource, layer.style.paint, visible]);

  // Apply class filters to PMTiles layers
  useEffect(() => {
    if (!map || !layer.tileSource) return;
    const mapInstance = map.getMap();
    const fillId = `layer-${layer.id}-tiles-fill`;
    const outlineId = `layer-${layer.id}-tiles-outline`;

    const activeFilter = classFilters?.[layer.id];
    if (activeFilter && mapInstance.getLayer(fillId)) {
      const values = activeFilter.map(label => CLASS_LABEL_MAP[label]).filter(Boolean);
      const filter = ["in", ["get", "class"], ["literal", values]] as unknown as FilterSpecification;
      mapInstance.setFilter(fillId, filter);
      if (mapInstance.getLayer(outlineId)) mapInstance.setFilter(outlineId, filter);
    } else {
      if (mapInstance.getLayer(fillId)) mapInstance.setFilter(fillId, null);
      if (mapInstance.getLayer(outlineId)) mapInstance.setFilter(outlineId, null);
    }
  }, [map, layer.id, layer.tileSource, classFilters]);

  return null; // No DOM output -- layers managed imperatively
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
          year = new Date(String(raw)).getFullYear();
        }
        return !isNaN(year) && year <= yearFilter;
      }),
    };
  }, [data, layer.timelineField, yearFilter]);

  // When timeline is active and layer has a tileSource, hide PMTiles
  // so only the filtered WFS data shows
  const timelineHidesTiles = !!layer.timelineField && yearFilter != null;
  const tileTargetOpacity = timelineHidesTiles ? 0 : targetOpacity;

  // Fetch WFS data when viewport changes
  const loadData = useCallback(async () => {
    if (!map || !visible || layer.source.type !== "wfs") return;

    const bounds = map.getBounds();
    if (!bounds) return;

    const zoom = map.getZoom();

    // Don't fetch WFS if we're in the PMTiles zoom range
    if (zoom < wfsMinZoom || zoom > layer.zoomRange[1]) return;

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

    setLoading(true);
    setLayerLoading(layer.id, true);
    try {
      const fc = await fetchLayerData(layer.id, paddedBbox, zoom, layer.fetchPriority);
      setData(fc);
    } catch (err) {
      console.error(`Failed to load layer ${layer.id}:`, err);
    } finally {
      setLoading(false);
      setLayerLoading(layer.id, false);
    }
  }, [map, visible, layer.id, layer.source.type, layer.zoomRange, wfsMinZoom, setLayerLoading]);

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
    const wfsClassFilter = classFilters?.[layer.id]
      ? buildClassFilter(classFilters[layer.id])
      : undefined;

    // Raster overview: pre-rendered PNG tiles at z4-z7 for layers too dense
    // for vector rendering at province scale (avoids Chrome crashes).
    const hasRasterOverview = !!layer.rasterOverview;
    const rasterMaxZoom = layer.rasterOverview?.maxZoom ?? 0;

    return (
      <>
        {/* Raster overview tiles (z4-z7) -- pre-rendered PNGs, zero geometry parsing */}
        {hasRasterOverview && layer.rasterOverview && (
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
                "raster-opacity": visible ? 0.85 : 0,
                "raster-opacity-transition": { duration: 300 },
              }}
            />
          </Source>
        )}

        {/* PMTiles vector tile source (low zoom) -- added imperatively
            because react-map-gl's declarative <Layer> fails for fill types
            when the PMTiles source loads asynchronously from a remote URL */}
        {hasTileSource && layer.tileSource && (
          <PmtilesLayers
            layer={layer}
            tileMaxZoom={tileMaxZoom}
            tileMinZoom={hasRasterOverview ? rasterMaxZoom + 1 : undefined}
            visible={visible && !timelineHidesTiles}
            opacity={tileTargetOpacity}
            classFilters={classFilters}
          />
        )}

        {/* WFS GeoJSON source (high zoom, or full range if no tile source).
            Only mount when visible to avoid react-map-gl "missing source" errors
            that spam the console for all 19 layers on page load. PMTiles and
            raster sources above are always-mounted (they handle their own lifecycle). */}
        {visible && <Source
          id={`source-${layer.id}`}
          type="geojson"
          data={filteredData}
          attribution={layer.source.attribution}
          cluster={layer.style.type === "circle"}
          clusterMaxZoom={12}
          clusterRadius={50}
        >
          {layer.style.type === "fill" && (
            <>
              <Layer
                id={`layer-${layer.id}-fill`}
                type="fill"
                minzoom={hasTileSource ? wfsMinZoom : undefined}
                {...(wfsClassFilter ? { filter: wfsClassFilter as FilterSpecification } : {})}
                paint={{
                  ...(layer.style.paint as Record<string, unknown>),
                  "fill-antialias": false,
                  "fill-opacity": targetOpacity,
                  "fill-opacity-transition": { duration: 300 },
                }}
              />
              <Layer
                id={`layer-${layer.id}-outline`}
                type="line"
                minzoom={hasTileSource ? wfsMinZoom : undefined}
                {...(wfsClassFilter ? { filter: wfsClassFilter as FilterSpecification } : {})}
                paint={{
                  "line-color":
                    (layer.style.paint["fill-outline-color"] as string) ??
                    "rgba(255,255,255,0.2)",
                  "line-width": 0.5,
                  "line-opacity": visible ? 0.4 : 0,
                  "line-opacity-transition": { duration: 300 },
                }}
              />
            </>
          )}
          {layer.style.type === "line" && (
            <Layer
              id={`layer-${layer.id}-line`}
              type="line"
              minzoom={hasTileSource ? wfsMinZoom : undefined}
              paint={{
                ...(layer.style.paint as Record<string, unknown>),
                "line-opacity": visible
                  ? (layer.style.paint["line-opacity"] as number) ?? 0.8
                  : 0,
                "line-opacity-transition": { duration: 300 },
              }}
            />
          )}
          {layer.style.type === "circle" && (
            <>
              {/* Cluster circles */}
              <Layer
                id={`layer-${layer.id}-cluster`}
                type="circle"
                filter={["has", "point_count"]}
                paint={{
                  "circle-color": "#2dd4bf",
                  "circle-radius": [
                    "step",
                    ["get", "point_count"],
                    15,
                    20, 20,
                    50, 25,
                    100, 35,
                  ],
                  "circle-opacity": targetOpacity,
                  "circle-stroke-width": 1,
                  "circle-stroke-color": "rgba(255,255,255,0.3)",
                }}
              />
              {/* Cluster count labels */}
              <Layer
                id={`layer-${layer.id}-cluster-count`}
                type="symbol"
                filter={["has", "point_count"]}
                layout={{
                  "text-field": "{point_count_abbreviated}",
                  "text-size": 11,
                  "text-font": ["Open Sans Regular"],
                }}
                paint={{ "text-color": "#ffffff" }}
              />
              {/* Unclustered individual points */}
              <Layer
                id={`layer-${layer.id}-circle`}
                type="circle"
                filter={["!", ["has", "point_count"]]}
                minzoom={hasTileSource ? wfsMinZoom : undefined}
                paint={{
                  ...(layer.style.paint as Record<string, unknown>),
                  "circle-opacity": visible
                    ? (layer.style.paint["circle-opacity"] as number) ?? 0.7
                    : 0,
                  "circle-stroke-opacity": visible ? 1 : 0,
                  "circle-opacity-transition": { duration: 300 },
                }}
              />
            </>
          )}
          {loading && visible && (
            <Layer
              id={`layer-${layer.id}-loading`}
              type="fill"
              paint={{
                "fill-color": "#ffffff",
                "fill-opacity": 0,
              }}
            />
          )}
        </Source>}
      </>
    );
  }

  return null;
}
