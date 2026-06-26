"use client";

import { useState } from "react";
import { getLayer } from "@/lib/layers";
import type { LayerDefinition, LegendItem } from "@/types/layers";
import { useLoadingContext } from "@/contexts/LoadingContext";
import type { LayerStatus } from "@/contexts/LoadingContext";

// ── Types ───────────────────────────────────────────────────

interface MapLegendProps {
  enabledLayers: string[];
  onToggleLayer: (id: string) => void;
  layerPanelOpen: boolean;
  classFilters?: Record<string, string[]>;
  onToggleClassFilter?: (layerId: string, className: string) => void;
}

// ── Color dot rendering ─────────────────────────────────────

function ColorDot({
  item,
  layer,
}: {
  item: LegendItem;
  layer: LayerDefinition;
}) {
  const styleType = layer.style.type;

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

  // Outline-dominant fill layers (boundary + faint interior, e.g. cutblocks /
  // conservancies) — bordered/hollow dot so the legend matches the map.
  if (styleType === "fill" && layer.style.outline) {
    const o = layer.style.outline;
    const interior =
      typeof layer.style.paint["fill-color"] === "string"
        ? (layer.style.paint["fill-color"] as string)
        : item.color;
    return (
      <span
        className="w-2.5 h-2.5 rounded-sm shrink-0"
        style={{
          backgroundColor: `${interior}33`,
          border: `1px ${o.dasharray ? "dashed" : "solid"} ${o.color}`,
        }}
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
        <ColorDot key={i} item={item} layer={layer} />
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

function ExpandedItems({
  layer,
  classFilters,
  onToggleClassFilter,
}: {
  layer: LayerDefinition;
  classFilters?: Record<string, string[]>;
  onToggleClassFilter?: (layerId: string, className: string) => void;
}) {
  // Check if the layer has a class-based fill-color expression
  const isFilterable =
    Array.isArray(layer.style.paint["fill-color"]) &&
    JSON.stringify(layer.style.paint["fill-color"]).includes('"class"');

  return (
    <div className="mt-1.5 ml-0.5 space-y-1">
      {layer.legendItems.map((item, i) => {
        const isActive =
          !classFilters?.[layer.id] ||
          classFilters[layer.id].includes(item.label);

        if (isFilterable && onToggleClassFilter) {
          return (
            <button
              key={i}
              onClick={() => onToggleClassFilter(layer.id, item.label)}
              className={`flex items-center gap-2 w-full text-left transition-opacity duration-200 ${
                isActive ? "" : "opacity-30"
              }`}
            >
              <ColorDot item={item} layer={layer} />
              <span className="text-[10px] text-zinc-400 leading-tight">
                {item.label}
              </span>
            </button>
          );
        }

        return (
          <div key={i} className="flex items-center gap-2">
            <ColorDot item={item} layer={layer} />
            <span className="text-[10px] text-zinc-400 leading-tight">
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Per-layer status indicator ──────────────────────────────

const STATUS_CONFIG: Record<
  Exclude<LayerStatus, "ok">,
  { text: string; className: string }
> = {
  loading: { text: "Loading…", className: "text-zinc-400" },
  empty: { text: "No data here", className: "text-zinc-500" },
  zoom: { text: "Zoom in", className: "text-zinc-500" },
  error: { text: "BC data unavailable", className: "text-amber-400" },
};

function LayerStatusBadge({ status }: { status: LayerStatus | undefined }) {
  if (!status || status === "ok") return null;
  const config = STATUS_CONFIG[status];
  return (
    <span className={`text-[10px] leading-none shrink-0 ${config.className}`}>
      {config.text}
    </span>
  );
}

// ── Legend row (compact + expandable) ───────────────────────

function LegendRow({
  layer,
  expanded,
  onToggleExpand,
  onDismiss,
  classFilters,
  onToggleClassFilter,
  status,
}: {
  layer: LayerDefinition;
  expanded: boolean;
  onToggleExpand: () => void;
  onDismiss: () => void;
  classFilters?: Record<string, string[]>;
  onToggleClassFilter?: (layerId: string, className: string) => void;
  status?: LayerStatus;
}) {
  return (
    <div className={`px-2 py-1.5${status === "error" ? " border-l-2 border-amber-400/40" : ""}`}>
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

        {/* Compact dots or status badge */}
        {!expanded && (
          status && status !== "ok"
            ? <LayerStatusBadge status={status} />
            : <CompactDots layer={layer} />
        )}

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
          <ExpandedItems
            layer={layer}
            classFilters={classFilters}
            onToggleClassFilter={onToggleClassFilter}
          />
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
  classFilters,
  onToggleClassFilter,
}: MapLegendProps) {
  const [expandedLayer, setExpandedLayer] = useState<string | null>(null);
  const { layerStatuses } = useLoadingContext();

  const legendLayers = enabledLayers
    .map((id) => getLayer(id))
    .filter(
      (l): l is LayerDefinition =>
        l != null && l.legendItems.length > 0
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
            classFilters={classFilters}
            onToggleClassFilter={onToggleClassFilter}
            status={layerStatuses.get(layer.id)}
          />
        ))}
      </div>
    </div>
  );
}
