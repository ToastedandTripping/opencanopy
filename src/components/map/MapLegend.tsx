"use client";

import { useState } from "react";
import { getLayer } from "@/lib/layers";
import type { LayerDefinition, LegendItem } from "@/types/layers";

// ── Types ───────────────────────────────────────────────────

interface MapLegendProps {
  enabledLayers: string[];
  onToggleLayer: (id: string) => void;
  layerPanelOpen: boolean;
}

// ── Color dot rendering ─────────────────────────────────────

function ColorDot({
  item,
  styleType,
}: {
  item: LegendItem;
  styleType: "fill" | "line" | "circle" | "symbol";
}) {
  if (styleType === "line") {
    return (
      <span
        className="w-3 h-0.5 rounded-full shrink-0"
        style={{ backgroundColor: item.color }}
      />
    );
  }

  if (styleType === "circle") {
    return (
      <span
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: item.color }}
      />
    );
  }

  // fill (default)
  return (
    <span
      className="w-2.5 h-2.5 rounded-sm shrink-0"
      style={{ backgroundColor: item.color }}
    />
  );
}

// ── Compact color dots row ──────────────────────────────────

const MAX_COMPACT_DOTS = 4;

function CompactDots({ layer }: { layer: LayerDefinition }) {
  const items = layer.legendItems;
  const visible = items.slice(0, MAX_COMPACT_DOTS);
  const overflow = items.length - MAX_COMPACT_DOTS;

  return (
    <span className="flex items-center gap-1 shrink-0">
      {visible.map((item, i) => (
        <ColorDot key={i} item={item} styleType={layer.style.type} />
      ))}
      {overflow > 0 && (
        <span className="text-[9px] text-zinc-500 leading-none">
          +{overflow}
        </span>
      )}
    </span>
  );
}

// ── Expanded legend items list ──────────────────────────────

function ExpandedItems({ layer }: { layer: LayerDefinition }) {
  return (
    <div className="mt-1.5 ml-0.5 space-y-1">
      {layer.legendItems.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <ColorDot item={item} styleType={layer.style.type} />
          <span className="text-[10px] text-zinc-400 leading-tight">
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Legend row (compact + expandable) ───────────────────────

function LegendRow({
  layer,
  expanded,
  onToggleExpand,
  onDismiss,
}: {
  layer: LayerDefinition;
  expanded: boolean;
  onToggleExpand: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="px-2 py-1.5">
      {/* Compact row */}
      <div className="flex items-center gap-2 min-h-[24px]">
        {/* Clickable name area with chevron */}
        <button
          onClick={onToggleExpand}
          aria-expanded={expanded}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-sm"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className={`w-2.5 h-2.5 text-zinc-500 shrink-0 transition-transform duration-200 motion-reduce:transition-none ${
              expanded ? "rotate-180" : ""
            }`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
          <span className="text-[11px] font-medium text-zinc-300 truncate group-hover:text-white transition-colors">
            {layer.label}
          </span>
        </button>

        {/* Compact dots */}
        {!expanded && <CompactDots layer={layer} />}

        {/* Dismiss button */}
        <button
          onClick={onDismiss}
          className="w-5 h-5 flex items-center justify-center text-zinc-500 hover:text-white transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 rounded-sm"
          aria-label={`Remove ${layer.label}`}
          title={`Remove ${layer.label}`}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            className="w-3 h-3"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Expanded items with CSS grid animation */}
      <div
        className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
        style={{
          gridTemplateRows: expanded ? "1fr" : "0fr",
        }}
      >
        <div className="overflow-hidden">
          <ExpandedItems layer={layer} />
        </div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────

/**
 * Floating on-map legend that doubles as an active layer indicator.
 * Shows compact color dots for each active layer with dismiss buttons.
 * Tap a layer name to expand its full legend items.
 */
export function MapLegend({
  enabledLayers,
  onToggleLayer,
  layerPanelOpen,
}: MapLegendProps) {
  const [expandedLayer, setExpandedLayer] = useState<string | null>(null);

  // Resolve enabled IDs to full definitions, filter out satellite and empty legends
  const legendLayers = enabledLayers
    .map((id) => getLayer(id))
    .filter(
      (l): l is LayerDefinition =>
        l != null && l.id !== "satellite" && l.legendItems.length > 0
    );

  // Hidden when layer panel is open or no layers active
  if (layerPanelOpen || legendLayers.length === 0) {
    return null;
  }

  const handleToggleExpand = (id: string) => {
    setExpandedLayer((prev) => (prev === id ? null : id));
  };

  const handleDismiss = (id: string) => {
    // If we're dismissing the expanded layer, collapse first
    if (expandedLayer === id) {
      setExpandedLayer(null);
    }
    onToggleLayer(id);
  };

  return (
    <div
      role="region"
      aria-label="Map legend"
      className="
        absolute left-3 bottom-24 z-10 max-w-[180px]
        md:bottom-24 md:max-w-[220px]
        bg-black/70 backdrop-blur-md border border-white/10 rounded-xl
        max-h-[25vh] md:max-h-[40vh] overflow-y-auto
        scrollbar-none
      "
    >
      <div className="py-1 divide-y divide-white/5">
        {legendLayers.map((layer) => (
          <LegendRow
            key={layer.id}
            layer={layer}
            expanded={expandedLayer === layer.id}
            onToggleExpand={() => handleToggleExpand(layer.id)}
            onDismiss={() => handleDismiss(layer.id)}
          />
        ))}
      </div>
    </div>
  );
}
