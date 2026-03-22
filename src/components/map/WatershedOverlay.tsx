"use client";

import { useMemo } from "react";
import { Source, Layer } from "react-map-gl/maplibre";

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

interface WatershedOverlayProps {
  /** The watershed polygon feature to render, or null to hide */
  polygon: GeoJSON.Feature | null;
}

/**
 * Renders a watershed boundary on the map as a blue dashed outline
 * with a subtle fill. Uses a GeoJSON source + two layers (fill + line).
 */
export function WatershedOverlay({ polygon }: WatershedOverlayProps) {
  const data: GeoJSON.FeatureCollection = useMemo(
    () =>
      polygon
        ? { type: "FeatureCollection", features: [polygon] }
        : EMPTY_FC,
    [polygon]
  );

  return (
    <Source id="watershed-boundary" type="geojson" data={data}>
      <Layer
        id="watershed-boundary-fill"
        type="fill"
        paint={{
          "fill-color": "#3b82f6",
          "fill-opacity": 0.08,
        }}
      />
      <Layer
        id="watershed-boundary-line"
        type="line"
        paint={{
          "line-color": "#3b82f6",
          "line-width": 2,
          "line-dasharray": [4, 2],
          "line-opacity": 0.9,
        }}
      />
    </Source>
  );
}
