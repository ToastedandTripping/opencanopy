"use client";

import { useState, useEffect, useCallback } from "react";
import { useMap } from "react-map-gl/maplibre";

interface TileProgressProps {
  enabledLayers: string[];
}

export function TileProgress({ enabledLayers }: TileProgressProps) {
  const { current: map } = useMap();
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [visible, setVisible] = useState(false);

  const checkProgress = useCallback(() => {
    if (!map) return;
    const mapInstance = map.getMap();

    // Find all PMTiles sources for enabled layers
    const sourceIds = enabledLayers
      .map(id => `source-${id}-tiles`)
      .filter(id => {
        try { return !!mapInstance.getSource(id); }
        catch { return false; }
      });

    if (sourceIds.length === 0) {
      setVisible(false);
      return;
    }

    const loaded = sourceIds.filter(id => mapInstance.isSourceLoaded(id)).length;
    const total = sourceIds.length;

    setProgress({ loaded, total });
    setVisible(loaded < total);
  }, [map, enabledLayers]);

  useEffect(() => {
    if (!map) return;
    const mapInstance = map.getMap();

    const onSourceData = () => checkProgress();
    const onSourceDataLoading = () => {
      setVisible(true);
      checkProgress();
    };

    mapInstance.on("sourcedata", onSourceData);
    mapInstance.on("sourcedataloading", onSourceDataLoading);

    // Initial check
    checkProgress();

    return () => {
      mapInstance.off("sourcedata", onSourceData);
      mapInstance.off("sourcedataloading", onSourceDataLoading);
    };
  }, [map, checkProgress]);

  if (!visible || progress.total === 0) return null;

  const pct = (progress.loaded / progress.total) * 100;

  return (
    <div
      className="absolute top-0 left-0 right-0 z-30 pointer-events-none"
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Loading map tiles"
    >
      {/* Determinate bar */}
      <div className="relative h-[2px] w-full bg-white/5">
        <div
          className="h-full bg-teal-400/80 transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* Status text */}
      <div className="px-3 pt-1">
        <span className="text-[10px] text-teal-300/60">
          Loading map data{progress.total > 1 ? ` (${progress.loaded}/${progress.total})` : "..."}
        </span>
      </div>
    </div>
  );
}
