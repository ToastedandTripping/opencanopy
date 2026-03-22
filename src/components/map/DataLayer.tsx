"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Source, Layer, useMap } from "react-map-gl/maplibre";
import maplibregl from "maplibre-gl";
import type { LayerDefinition, BBox } from "@/types/layers";
import { fetchLayerData } from "@/lib/data/wfs-client";
import { useLoadingContext } from "@/contexts/LoadingContext";

interface DataLayerProps {
  layer: LayerDefinition;
  visible: boolean;
  /** When set, filter features by year for timeline animation (client-side) */
  yearFilter?: number | null;
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
  visible,
  opacity,
}: {
  layer: LayerDefinition;
  tileMaxZoom: number;
  visible: boolean;
  opacity: number;
}) {
  const { current: map } = useMap();

  // Add source and layers once the map is ready
  useEffect(() => {
    if (!map || !layer.tileSource) return;

    const mapInstance = map.getMap();
    const sourceId = `source-${layer.id}-tiles`;

    function addLayers() {
      if (!mapInstance.getSource(sourceId)) {
        mapInstance.addSource(sourceId, {
          type: "vector",
          url: layer.tileSource!.url,
          attribution: layer.source.attribution,
        });
      }

      const sourceLayer = layer.tileSource!.sourceLayer;
      const maxzoom = tileMaxZoom + 1;

      if (layer.style.type === "fill") {
        if (!mapInstance.getLayer(`layer-${layer.id}-tiles-fill`)) {
          // Extract only valid fill paint properties (no undefined values)
          const fillPaint: Record<string, unknown> = {
            "fill-antialias": false,
            "fill-opacity": opacity,
            "fill-opacity-transition": { duration: 300 },
          };
          if (layer.style.paint["fill-color"] != null) {
            fillPaint["fill-color"] = layer.style.paint["fill-color"];
          }
          if (layer.style.paint["fill-outline-color"] != null) {
            fillPaint["fill-outline-color"] = layer.style.paint["fill-outline-color"];
          }

          mapInstance.addLayer({
            id: `layer-${layer.id}-tiles-fill`,
            type: "fill",
            source: sourceId,
            "source-layer": sourceLayer,
            maxzoom,
            paint: fillPaint as maplibregl.FillLayerSpecification["paint"],
          });
        }
        if (!mapInstance.getLayer(`layer-${layer.id}-tiles-outline`)) {
          mapInstance.addLayer({
            id: `layer-${layer.id}-tiles-outline`,
            type: "line",
            source: sourceId,
            "source-layer": sourceLayer,
            maxzoom,
            paint: {
              "line-color":
                (layer.style.paint["fill-outline-color"] as string) ??
                "rgba(255,255,255,0.2)",
              "line-width": 0.5,
              "line-opacity": visible ? 0.4 : 0,
              "line-opacity-transition": { duration: 300 },
            },
          });
        }
      } else if (layer.style.type === "line") {
        if (!mapInstance.getLayer(`layer-${layer.id}-tiles-line`)) {
          mapInstance.addLayer({
            id: `layer-${layer.id}-tiles-line`,
            type: "line",
            source: sourceId,
            "source-layer": sourceLayer,
            maxzoom,
            paint: {
              ...(layer.style.paint as Record<string, unknown>),
              "line-opacity": visible
                ? (layer.style.paint["line-opacity"] as number) ?? 0.8
                : 0,
              "line-opacity-transition": { duration: 300 },
            } as maplibregl.LineLayerSpecification["paint"],
          });
        }
      }
    }

    // Wait for source to load before adding layers
    if (mapInstance.isStyleLoaded()) {
      addLayers();
    } else {
      mapInstance.on("load", addLayers);
    }

    return () => {
      mapInstance.off("load", addLayers);
      // Don't remove layers on unmount -- they persist across re-renders
    };
  }, [map, layer.id, layer.tileSource, layer.style, layer.source.attribution, tileMaxZoom]);

  // Update opacity and visibility reactively
  useEffect(() => {
    if (!map || !layer.tileSource) return;
    const mapInstance = map.getMap();

    const fillId = `layer-${layer.id}-tiles-fill`;
    const outlineId = `layer-${layer.id}-tiles-outline`;
    const lineId = `layer-${layer.id}-tiles-line`;

    if (mapInstance.getLayer(fillId)) {
      mapInstance.setPaintProperty(fillId, "fill-opacity", opacity);
    }
    if (mapInstance.getLayer(outlineId)) {
      mapInstance.setPaintProperty(outlineId, "line-opacity", visible ? 0.4 : 0);
    }
    if (mapInstance.getLayer(lineId)) {
      mapInstance.setPaintProperty(
        lineId,
        "line-opacity",
        visible ? (layer.style.paint["line-opacity"] as number) ?? 0.8 : 0
      );
    }
  }, [map, layer.id, layer.tileSource, layer.style.paint, visible, opacity]);

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
export function DataLayer({ layer, visible, yearFilter }: DataLayerProps) {
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

  // WFS GeoJSON layers (with optional PMTiles underlay)
  if (layer.source.type === "wfs") {
    return (
      <>
        {/* PMTiles vector tile source (low zoom) -- added imperatively
            because react-map-gl's declarative <Layer> fails for fill types
            when the PMTiles source loads asynchronously from a remote URL */}
        {hasTileSource && layer.tileSource && (
          <PmtilesLayers
            layer={layer}
            tileMaxZoom={tileMaxZoom}
            visible={visible && !timelineHidesTiles}
            opacity={tileTargetOpacity}
          />
        )}

        {/* WFS GeoJSON source (high zoom, or full range if no tile source) */}
        <Source
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
        </Source>
      </>
    );
  }

  return null;
}
