"use client";

import { useLoadingContext } from "@/contexts/LoadingContext";
import { getLayer } from "@/lib/layers";

/**
 * Indeterminate loading bar shown at the top of the map viewport
 * when WFS layers are fetching data. Displays layer names as chips
 * beneath the bar.
 */
export function LoadingBar() {
  const { loadingLayers } = useLoadingContext();
  const isLoading = loadingLayers.size > 0;

  const layerLabels = Array.from(loadingLayers)
    .map((id) => getLayer(id)?.label ?? id)
    .sort();

  return (
    <div
      className="absolute top-0 left-0 right-0 z-30 pointer-events-none"
      role="status"
      aria-live="polite"
      style={{
        opacity: isLoading ? 1 : 0,
        transition: "opacity 300ms ease",
      }}
    >
      {/* Visually hidden status for screen readers */}
      <span className="sr-only">
        {isLoading ? `Loading ${layerLabels.join(", ")}` : ""}
      </span>
      {/* Animated indeterminate bar */}
      <div className="relative h-[2px] w-full overflow-hidden bg-transparent">
        <div
          className="absolute h-full bg-[#2dd4bf]"
          style={{
            animation: "loading-slide 1.4s ease-in-out infinite",
            width: "40%",
          }}
        />
      </div>

      {/* Layer name chips */}
      {layerLabels.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pt-1.5 pb-1">
          {layerLabels.map((label) => (
            <span
              key={label}
              className="inline-block px-2 py-0.5 text-[10px] font-medium text-teal-300/90 bg-black/70 backdrop-blur-md border border-white/10 rounded-full"
            >
              {label}
            </span>
          ))}
        </div>
      )}

      <style>{`
        @keyframes loading-slide {
          0% { left: -40%; }
          100% { left: 100%; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes loading-slide {
            0% { opacity: 0.4; left: 0; width: 100%; }
            50% { opacity: 1; }
            100% { opacity: 0.4; left: 0; width: 100%; }
          }
        }
      `}</style>
    </div>
  );
}
