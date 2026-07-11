"use client";

import { useEffect, useState } from "react";
import { useMap } from "react-map-gl/maplibre";
import { INITIAL_VIEW_STATE } from "@/lib/mapConfig";

/**
 * z/coord readout overlay — shows current zoom level and cursor lng/lat.
 *
 * P1a fix: this used to be CanopyMap's own onZoom/onMouseMove/onMouseOut
 * props wired straight to setState, which re-rendered CanopyMap (and every
 * unmemoized <DataLayer>) on every zoom tick and every mouse pixel. DataLayer
 * never consumed zoom/cursor, so that cascade was pure waste.
 *
 * Rendered as a child of <Map> (see CanopyMap.tsx), so it gets useMap()
 * context the same way DrawTool does. It owns its own zoom/cursorPos state,
 * so re-rendering it on mouse move only re-renders THIS tiny overlay —
 * the rest of the map tree (DataLayer, etc.) is untouched.
 *
 * Listener wiring mirrors DrawTool.tsx's effect exactly: handlers are plain
 * functions attached once map is available, cleanup calls .off with the
 * SAME references. A dropped .off here would leak listeners across
 * HMR/remount, same as DrawTool.
 */
export function MapReadout() {
  const { current: map } = useMap();
  const [zoom, setZoom] = useState(INITIAL_VIEW_STATE.zoom);
  const [cursorPos, setCursorPos] = useState<{ lng: number; lat: number } | null>(null);

  useEffect(() => {
    if (!map) return;
    const m = map.getMap();

    const onZoom = () => setZoom(m.getZoom());
    const onMouseMove = (e: maplibregl.MapMouseEvent) =>
      setCursorPos({ lng: e.lngLat.lng, lat: e.lngLat.lat });
    const onMouseOut = () => setCursorPos(null);

    m.on("zoom", onZoom);
    m.on("mousemove", onMouseMove);
    m.on("mouseout", onMouseOut);

    return () => {
      m.off("zoom", onZoom);
      m.off("mousemove", onMouseMove);
      m.off("mouseout", onMouseOut);
    };
  }, [map]);

  // Overlay JSX moved verbatim from CanopyMap.tsx — same inline styles,
  // top:8/right:8, pointerEvents:none, zIndex:1. Now renders as a child of
  // <Map> instead of a sibling div outside it; the position/zIndex are
  // unchanged so it lands in the same visual spot (top-right, above the
  // map canvas, not under NavigationControl which is also top-right but at
  // a small inset — this overlay sits flush at top:8/right:8, same as
  // before the move).
  return (
    <div
      style={{
        position: "absolute",
        top: 8,
        right: 8,
        background: "rgba(0,0,0,0.6)",
        color: "rgba(255,255,255,0.7)",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontFamily: "monospace",
        pointerEvents: "none",
        zIndex: 1,
        display: "flex",
        gap: 10,
      }}
    >
      <span>z{zoom.toFixed(1)}</span>
      {cursorPos && (
        <span>{cursorPos.lat.toFixed(4)}, {cursorPos.lng.toFixed(4)}</span>
      )}
    </div>
  );
}
