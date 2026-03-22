"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  useImperativeHandle,
  forwardRef,
} from "react";
import Map, {
  NavigationControl,
  ScaleControl,
  GeolocateControl,
  type MapRef,
  type MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import { MAP_STYLES, INITIAL_VIEW_STATE, TERRAIN_SOURCE } from "@/lib/mapConfig";
import { LAYER_REGISTRY, getLayer } from "@/lib/layers";
import { initPMTiles } from "@/lib/layers/pmtiles-source";
import { DataLayer } from "./DataLayer";
import { MapPopup } from "./MapPopup";

// Register PMTiles protocol globally (idempotent, runs once)
initPMTiles();

interface CanopyMapProps {
  className?: string;
  enabledLayers: string[];
  /** When set, filter timeline-enabled layers by year (client-side) */
  yearFilter?: number | null;
  children?: React.ReactNode;
  /** Optional click interceptor. Return true to suppress the default popup behavior. */
  onMapClick?: (lng: number, lat: number) => boolean;
  /** Override cursor style (e.g. "pointer" for watershed selection mode) */
  cursor?: string;
}

interface PopupInfo {
  longitude: number;
  latitude: number;
  properties: Record<string, unknown>;
}

/**
 * Main map component for OpenCanopy.
 * Full-screen MapLibre GL map with navigation controls, terrain,
 * and dynamic data layers driven by the registry.
 */
const CanopyMap = forwardRef<MapRef, CanopyMapProps>(function CanopyMap(
  { className, enabledLayers, yearFilter, children, onMapClick, cursor },
  ref
) {
  const mapRef = useRef<MapRef>(null);
  const [popup, setPopup] = useState<PopupInfo | null>(null);
  const [zoom, setZoom] = useState(INITIAL_VIEW_STATE.zoom);

  useImperativeHandle(ref, () => mapRef.current!);

  const onLoad = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;

    // Add terrain source for 3D hillshade
    if (TERRAIN_SOURCE.enabled && !map.getSource("terrain-rgb")) {
      map.addSource("terrain-rgb", {
        type: "raster-dem",
        url: TERRAIN_SOURCE.url,
        tileSize: TERRAIN_SOURCE.tileSize,
      });
      map.setTerrain({ source: "terrain-rgb", exaggeration: 1.2 });
    }
  }, []);

  // Handle click on interactive layers (or delegate to parent interceptor)
  const onClick = useCallback(
    (event: MapLayerMouseEvent) => {
      // If the parent interceptor handles the click, skip popup logic
      if (onMapClick?.(event.lngLat.lng, event.lngLat.lat)) {
        setPopup(null);
        return;
      }

      if (!event.features || event.features.length === 0) {
        setPopup(null);
        return;
      }

      const feature = event.features[0];
      if (feature.properties) {
        setPopup({
          longitude: event.lngLat.lng,
          latitude: event.lngLat.lat,
          properties: feature.properties as Record<string, unknown>,
        });
      }
    },
    [onMapClick]
  );

  // Build the list of interactive layer IDs for the click handler.
  // Includes both WFS GeoJSON and PMTiles vector tile layer IDs.
  const interactiveLayerIds = useMemo(
    () =>
      enabledLayers
        .map((id) => getLayer(id))
        .filter((l) => l?.interactive)
        .flatMap((l) => {
          if (!l) return [];
          const ids: string[] = [];
          // WFS GeoJSON layers
          switch (l.style.type) {
            case "fill":
              ids.push(`layer-${l.id}-fill`);
              break;
            case "line":
              ids.push(`layer-${l.id}-line`);
              break;
            case "circle":
              ids.push(`layer-${l.id}-circle`);
              break;
          }
          // PMTiles vector tile layers
          if (l.tileSource) {
            switch (l.style.type) {
              case "fill":
                ids.push(`layer-${l.id}-tiles-fill`);
                break;
              case "line":
                ids.push(`layer-${l.id}-tiles-line`);
                break;
              case "circle":
                ids.push(`layer-${l.id}-tiles-circle`);
                break;
            }
          }
          return ids;
        }),
    [enabledLayers]
  );

  return (
    <div className={className} style={{ width: "100%", height: "100%" }}>
      <Map
        ref={mapRef}
        initialViewState={INITIAL_VIEW_STATE}
        mapStyle={MAP_STYLES.dark}
        onLoad={onLoad}
        onClick={onClick}
        interactiveLayerIds={interactiveLayerIds}
        cursor={cursor}
        onZoom={(e) => setZoom(e.viewState.zoom)}
        canvasContextAttributes={{ preserveDrawingBuffer: true }}
        maxPitch={70}
        minZoom={4}
        maxZoom={18}
        style={{ width: "100%", height: "100%" }}
      >
        <NavigationControl position="top-right" showCompass visualizePitch />
        <ScaleControl position="bottom-left" unit="metric" />
        <GeolocateControl
          position="top-right"
          trackUserLocation
          showAccuracyCircle={false}
        />
        {/* Attribution collapsed by default to reduce bottom clutter */}

        {/* Render each registered layer */}
        {LAYER_REGISTRY.map((layer) => (
          <DataLayer
            key={layer.id}
            layer={layer}
            visible={enabledLayers.includes(layer.id)}
            yearFilter={yearFilter}
          />
        ))}

        {/* Feature info popup */}
        {popup && (
          <MapPopup
            longitude={popup.longitude}
            latitude={popup.latitude}
            properties={popup.properties}
            onClose={() => setPopup(null)}
          />
        )}

        {/* Child components (DrawTool, etc.) that need useMap() context */}
        {children}
      </Map>
      <div
        style={{
          position: "absolute",
          bottom: 8,
          right: 8,
          background: "rgba(0,0,0,0.6)",
          color: "rgba(255,255,255,0.7)",
          padding: "2px 6px",
          borderRadius: 4,
          fontSize: 11,
          fontFamily: "monospace",
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        z{zoom.toFixed(1)}
      </div>
    </div>
  );
});

export { CanopyMap };
