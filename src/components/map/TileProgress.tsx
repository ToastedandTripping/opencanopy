"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useMap } from "react-map-gl/maplibre";

interface TileProgressProps {
  enabledLayers: string[];
}

export function TileProgress({ enabledLayers }: TileProgressProps) {
  const { current: map } = useMap();
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);
  const hideTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Fade transition: keep rendered=true while fading out, then remove from DOM
  useEffect(() => {
    if (visible) {
      if (hideTimeout.current) {
        clearTimeout(hideTimeout.current);
        hideTimeout.current = null;
      }
      setRendered(true);
    } else {
      // Delay removal to allow opacity transition to complete
      hideTimeout.current = setTimeout(() => {
        setRendered(false);
        hideTimeout.current = null;
      }, 400);
    }
    return () => {
      if (hideTimeout.current) {
        clearTimeout(hideTimeout.current);
      }
    };
  }, [visible]);

  if (!rendered || progress.total === 0) return null;

  const pct = (progress.loaded / progress.total) * 100;

  return (
    <div
      className="absolute bottom-16 md:bottom-14 left-3 right-3 z-30 pointer-events-none transition-opacity duration-300"
      style={{ opacity: visible ? 1 : 0 }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Loading map tiles"
    >
      <div className="h-[3px] w-full rounded-full overflow-hidden bg-white/5">
        <div
          className="h-full bg-teal-400/80 transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
