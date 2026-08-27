"use client";

import {
  useCallback,
  useEffect,
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
import { DEFAULT_RANGE } from "@/hooks/useTimeline";
import { LAYER_REGISTRY_AVAILABLE, getLayer } from "@/lib/layers";
import { initPMTiles } from "@/lib/layers/pmtiles-source";
import { DataLayer } from "./DataLayer";
import { MapPopup } from "./MapPopup";
import { MapReadout } from "./MapReadout";
// TileProgress removed: it referenced per-layer sources `source-${id}-tiles`
// but all PMTiles share one source (PMTILES_SOURCE_ID = "opencanopy"), so it
// rendered null for every tiled layer and never fired. PMTiles errors are now
// reported via setLayerStatus in DataLayer → LoadingContext → StatusToast.
import { pipelineLog, pipelineHealthReport, isEnabled } from "@/lib/debug/pipeline-logger";

// Register PMTiles protocol globally (idempotent, runs once)
initPMTiles();

interface CanopyMapProps {
  className?: string;
  enabledLayers: string[];
  /** When set, filter timeline-enabled layers by year (client-side) */
  yearFilter?: number | null;
  /** When set, filter individual classes within layers (e.g. forest age classes) */
  classFilters?: Record<string, string[]>;
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
  { className, enabledLayers, yearFilter, classFilters, children, onMapClick, cursor },
  ref
) {
  const mapRef = useRef<MapRef>(null);
  const [popup, setPopup] = useState<PopupInfo | null>(null);

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

    map.setGlobalStateProperty("currentYear", DEFAULT_RANGE[0]);

    pipelineLog("map-load", "CanopyMap ready");
  }, []);

  // Expose map instance on window for e2e testing (Playwright screenshot regression).
  // Dev-only (D-fix): this previously shipped ungated to production window scope.
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const map = mapRef.current?.getMap();
    if (typeof window !== "undefined" && map) {
      (window as unknown as Record<string, unknown>).__opencanopy_map = map;
    }
    return () => {
      if (typeof window !== "undefined") {
        delete (window as unknown as Record<string, unknown>).__opencanopy_map;
      }
    };
  });

  // Expose health report function on window when debug mode is active
  useEffect(() => {
    if (typeof window !== "undefined" && isEnabled()) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).__OC_HEALTH_REPORT = () => {
        const map = mapRef.current?.getMap();
        if (map) pipelineHealthReport(map, LAYER_REGISTRY_AVAILABLE, enabledLayers);
      };
    }
    return () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).__OC_HEALTH_REPORT;
    };
  }, [enabledLayers]);

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
        {LAYER_REGISTRY_AVAILABLE.map((layer) => (
          <DataLayer
            key={layer.id}
            layer={layer}
            visible={enabledLayers.includes(layer.id)}
            yearFilter={yearFilter}
            classFilters={classFilters}
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

        {/* z/coord readout — owns its own zoom/cursor state so mouse-move
            re-renders stay scoped to this tiny overlay instead of cascading
            through DataLayer (P1a fix). Child of <Map> for useMap() context,
            same pattern as DrawTool/WatershedOverlay below. */}
        <MapReadout />

        {/* Child components (DrawTool, etc.) that need useMap() context */}
        {children}
      </Map>
    </div>
  );
});

export { CanopyMap };
