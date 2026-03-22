"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Source, Layer, useMap } from "react-map-gl/maplibre";
import type {
  MapLayerMouseEvent,
  MapLayerTouchEvent,
} from "react-map-gl/maplibre";

export interface SelectionBBox {
  bbox: [number, number, number, number]; // [west, south, east, north]
  polygon: GeoJSON.Feature<GeoJSON.Polygon>;
}

interface DrawToolProps {
  /** Whether draw mode is active (crosshair cursor, event capture) */
  active: boolean;
  /** Current selection, controlled by parent. null = no selection visible */
  selection: SelectionBBox | null;
  /** Fired when user completes a draw or when selection should change */
  onSelectionChange: (selection: SelectionBBox | null) => void;
}

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

/** Build a GeoJSON polygon from two corner points (lng/lat) */
function bboxPolygon(
  lng1: number,
  lat1: number,
  lng2: number,
  lat2: number
): GeoJSON.Feature<GeoJSON.Polygon> {
  const west = Math.min(lng1, lng2);
  const east = Math.max(lng1, lng2);
  const south = Math.min(lat1, lat2);
  const north = Math.max(lat1, lat2);

  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ],
      ],
    },
  };
}

/**
 * Draw-a-box tool for selecting an area on the map.
 *
 * When active, the user can click-drag to draw a rectangle.
 * The selection is rendered as a GeoJSON layer so it tracks the map.
 * Touch: two-tap (tap corner 1, tap corner 2).
 */
export function DrawTool({
  active,
  selection,
  onSelectionChange,
}: DrawToolProps) {
  const { current: map } = useMap();
  const [previewData, setPreviewData] =
    useState<GeoJSON.FeatureCollection>(EMPTY_FC);

  // Refs for drawing state (avoid stale closures in map event handlers)
  const drawingRef = useRef(false);
  const startPointRef = useRef<{ lng: number; lat: number } | null>(null);
  const activeRef = useRef(active);
  const touchFirstTapRef = useRef<{ lng: number; lat: number } | null>(null);

  // Derive the finalized selection visual from the parent-controlled prop
  const selectionData: GeoJSON.FeatureCollection = selection
    ? { type: "FeatureCollection", features: [selection.polygon] }
    : EMPTY_FC;

  // Keep activeRef in sync
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  // Set cursor when draw mode changes
  useEffect(() => {
    if (!map) return;
    const canvas = map.getCanvas();
    if (active) {
      canvas.style.cursor = "crosshair";
    } else {
      canvas.style.cursor = "";
    }
    return () => {
      canvas.style.cursor = "";
    };
  }, [map, active]);

  // When active changes to false, event handlers are unregistered (see effect below),
  // so stale refs (drawingRef, startPointRef, touchFirstTapRef) are harmless.
  // The preview data is guarded at render time: active ? previewData : EMPTY_FC.

  // ── Mouse handlers ───────────────────────────────────────────────

  const handleMouseDown = useCallback(
    (e: MapLayerMouseEvent) => {
      if (!activeRef.current || !map) return;
      if (e.originalEvent.button !== 0) return; // left-click only

      e.preventDefault();

      drawingRef.current = true;
      startPointRef.current = { lng: e.lngLat.lng, lat: e.lngLat.lat };

      // Disable map panning while drawing
      map.getMap().dragPan.disable();

      // Clear preview
      setPreviewData(EMPTY_FC);
    },
    [map]
  );

  const handleMouseMove = useCallback(
    (e: MapLayerMouseEvent) => {
      if (!drawingRef.current || !startPointRef.current) return;

      const start = startPointRef.current;
      const poly = bboxPolygon(
        start.lng,
        start.lat,
        e.lngLat.lng,
        e.lngLat.lat
      );
      setPreviewData({ type: "FeatureCollection", features: [poly] });
    },
    []
  );

  const handleMouseUp = useCallback(
    (e: MapLayerMouseEvent) => {
      if (!drawingRef.current || !startPointRef.current || !map) return;

      const start = startPointRef.current;
      drawingRef.current = false;
      startPointRef.current = null;

      // Re-enable map panning
      map.getMap().dragPan.enable();

      // Require minimum drag distance (5px) to avoid accidental clicks
      const startScreen = map.project([start.lng, start.lat]);
      const endScreen = map.project([e.lngLat.lng, e.lngLat.lat]);
      const dx = Math.abs(startScreen.x - endScreen.x);
      const dy = Math.abs(startScreen.y - endScreen.y);
      if (dx < 5 && dy < 5) {
        setPreviewData(EMPTY_FC);
        return;
      }

      const poly = bboxPolygon(
        start.lng,
        start.lat,
        e.lngLat.lng,
        e.lngLat.lat
      );

      const west = Math.min(start.lng, e.lngLat.lng);
      const east = Math.max(start.lng, e.lngLat.lng);
      const south = Math.min(start.lat, e.lngLat.lat);
      const north = Math.max(start.lat, e.lngLat.lat);

      setPreviewData(EMPTY_FC);
      onSelectionChange({ bbox: [west, south, east, north], polygon: poly });
    },
    [map, onSelectionChange]
  );

  // ── Touch handlers (two-tap) ─────────────────────────────────────

  const handleTouchEnd = useCallback(
    (e: MapLayerTouchEvent) => {
      if (!activeRef.current || !map) return;

      const touch = e.lngLat;

      if (!touchFirstTapRef.current) {
        // First tap: record corner 1, show small indicator
        touchFirstTapRef.current = { lng: touch.lng, lat: touch.lat };
        const indicator = bboxPolygon(
          touch.lng - 0.0005,
          touch.lat - 0.0005,
          touch.lng + 0.0005,
          touch.lat + 0.0005
        );
        setPreviewData({ type: "FeatureCollection", features: [indicator] });
      } else {
        // Second tap: finalize selection
        const start = touchFirstTapRef.current;
        touchFirstTapRef.current = null;

        const poly = bboxPolygon(start.lng, start.lat, touch.lng, touch.lat);
        const west = Math.min(start.lng, touch.lng);
        const east = Math.max(start.lng, touch.lng);
        const south = Math.min(start.lat, touch.lat);
        const north = Math.max(start.lat, touch.lat);

        setPreviewData(EMPTY_FC);
        onSelectionChange({ bbox: [west, south, east, north], polygon: poly });
      }
    },
    [map, onSelectionChange]
  );

  // ── Register map event handlers ──────────────────────────────────

  useEffect(() => {
    if (!map) return;
    const m = map.getMap();

    // We cast through unknown because react-map-gl wraps native events
    // and the type signatures don't perfectly align, but the shape is the same.
    const onDown = (e: maplibregl.MapMouseEvent) =>
      handleMouseDown(e as unknown as MapLayerMouseEvent);
    const onMove = (e: maplibregl.MapMouseEvent) =>
      handleMouseMove(e as unknown as MapLayerMouseEvent);
    const onUp = (e: maplibregl.MapMouseEvent) =>
      handleMouseUp(e as unknown as MapLayerMouseEvent);
    const onTouch = (e: maplibregl.MapTouchEvent) =>
      handleTouchEnd(e as unknown as MapLayerTouchEvent);

    if (active) {
      m.on("mousedown", onDown);
      m.on("mousemove", onMove);
      m.on("mouseup", onUp);
      m.on("touchend", onTouch);
    }

    return () => {
      m.off("mousedown", onDown);
      m.off("mousemove", onMove);
      m.off("mouseup", onUp);
      m.off("touchend", onTouch);
    };
  }, [
    map,
    active,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleTouchEnd,
  ]);

  return (
    <>
      {/* Preview rectangle (visible while dragging / first touch tap) */}
      <Source id="draw-preview" type="geojson" data={active ? previewData : EMPTY_FC}>
        <Layer
          id="draw-preview-fill"
          type="fill"
          paint={{
            "fill-color": "#3b82f6",
            "fill-opacity": 0.15,
          }}
        />
        <Layer
          id="draw-preview-line"
          type="line"
          paint={{
            "line-color": "#3b82f6",
            "line-width": 2,
            "line-dasharray": [6, 4],
            "line-opacity": 0.8,
          }}
        />
      </Source>

      {/* Finalized selection rectangle */}
      <Source id="draw-selection" type="geojson" data={selectionData}>
        <Layer
          id="draw-selection-fill"
          type="fill"
          paint={{
            "fill-color": "#3b82f6",
            "fill-opacity": 0.1,
          }}
        />
        <Layer
          id="draw-selection-line"
          type="line"
          paint={{
            "line-color": "#60a5fa",
            "line-width": 2,
            "line-dasharray": [8, 4],
            "line-opacity": 0.9,
          }}
        />
      </Source>
    </>
  );
}
