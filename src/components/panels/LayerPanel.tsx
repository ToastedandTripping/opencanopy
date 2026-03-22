"use client";

import { useState, useRef, useCallback } from "react";
import type { LayerCategory, LayerDefinition } from "@/types/layers";
import { LAYER_REGISTRY } from "@/lib/layers";

// ── Types ───────────────────────────────────────────────────

interface LayerPanelProps {
  enabledLayers: string[];
  onToggleLayer: (id: string) => void;
  onClose: () => void;
}

interface CategoryConfig {
  id: LayerCategory;
  label: string;
  icon: string;
}

// ── Category Configuration ──────────────────────────────────

const CATEGORIES: CategoryConfig[] = [
  {
    id: "forest",
    label: "Forest",
    icon: "M12 22V8m0 0l4 4m-4-4l-4 4M7 3l5 5 5-5",
  },
  {
    id: "accountability",
    label: "Accountability",
    icon: "M3 21h18M3 10h18M3 7l9-4 9 4M4 10v11M20 10v11M8 14v3M12 14v3M16 14v3",
  },
  {
    id: "disturbance",
    label: "Disturbance",
    icon: "M13 10V3L4 14h7v7l9-11h-7z",
  },
  {
    id: "water",
    label: "Water",
    icon: "M12 2.69l5.66 5.66a8 8 0 11-11.31 0L12 2.69z",
  },
  {
    id: "species",
    label: "Species",
    icon: "M12 18.5a6.5 6.5 0 006.5-6.5H5.5a6.5 6.5 0 006.5 6.5zM20 10c0-2-1.5-3-3-3m-3-4a3 3 0 00-4 0M10 7C8.5 7 7 8 7 10",
  },
  {
    id: "protection",
    label: "Protection",
    icon: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  },
  {
    id: "context",
    label: "Context",
    icon: "M12 21a9 9 0 100-18 9 9 0 000 18zM3.6 9h16.8M3.6 15h16.8M12 3a15.3 15.3 0 014 9 15.3 15.3 0 01-4 9 15.3 15.3 0 01-4-9 15.3 15.3 0 014-9z",
  },
];

// ── Subcomponents ───────────────────────────────────────────

function CategoryIcon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4 shrink-0"
    >
      <path d={path} />
    </svg>
  );
}

function LayerToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={`
        relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full
        transition-colors duration-200 ease-in-out
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20
        ${checked ? "bg-emerald-500/80" : "bg-white/10"}
      `}
    >
      <span
        className={`
          pointer-events-none inline-block h-4 w-4 rounded-full bg-white
          shadow-sm transform transition-transform duration-200 ease-in-out mt-0.5
          ${checked ? "translate-x-4 ml-0.5" : "translate-x-0.5"}
        `}
      />
    </button>
  );
}

function ColorSwatch({ layer }: { layer: LayerDefinition }) {
  const firstColor = layer.legendItems[0]?.color || "#6b7280";

  if (layer.style.type === "line") {
    return (
      <div className="w-4 h-4 shrink-0 flex items-center justify-center">
        <div
          className="w-4 h-0.5 rounded-full"
          style={{ backgroundColor: firstColor }}
        />
      </div>
    );
  }

  if (layer.style.type === "circle") {
    return (
      <div className="w-4 h-4 shrink-0 flex items-center justify-center">
        <div
          className="w-2.5 h-2.5 rounded-full"
          style={{ backgroundColor: firstColor }}
        />
      </div>
    );
  }

  return (
    <div
      className="w-4 h-4 shrink-0 rounded-sm"
      style={{ backgroundColor: firstColor, opacity: 0.8 }}
    />
  );
}

function LayerRow({
  layer,
  enabled,
  onToggle,
}: {
  layer: LayerDefinition;
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      title={layer.description}
      className={`
        flex items-center gap-3 w-full px-3 py-2 min-h-[44px] rounded-lg text-left
        transition-colors duration-150
        ${enabled ? "bg-white/5" : "hover:bg-white/[0.03]"}
      `}
    >
      <ColorSwatch layer={layer} />
      <span
        className={`flex-1 text-sm truncate ${
          enabled ? "text-zinc-200" : "text-zinc-500"
        }`}
      >
        {layer.label}
      </span>
      <LayerToggle checked={enabled} onChange={onToggle} />
    </button>
  );
}

function CategorySection({
  config,
  layers,
  enabledLayers,
  onToggleLayer,
  defaultOpen,
}: {
  config: CategoryConfig;
  layers: LayerDefinition[];
  enabledLayers: string[];
  onToggleLayer: (id: string) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const enabledCount = layers.filter((l) =>
    enabledLayers.includes(l.id)
  ).length;

  if (layers.length === 0) return null;

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full px-3 py-2 min-h-[44px] text-left hover:bg-white/[0.03] rounded-lg transition-colors"
      >
        <CategoryIcon path={config.icon} />
        <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          {config.label}
        </span>
        {enabledCount > 0 && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
            {enabledCount}
          </span>
        )}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className={`w-3.5 h-3.5 text-zinc-500 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5 ml-1">
          {layers.map((layer) => (
            <LayerRow
              key={layer.id}
              layer={layer}
              enabled={enabledLayers.includes(layer.id)}
              onToggle={() => onToggleLayer(layer.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Drag-to-dismiss hook ────────────────────────────────────

function useDragDismiss(onClose: () => void) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const currentTranslateY = useRef(0);
  const isDragging = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    dragStartY.current = touch.clientY;
    currentTranslateY.current = 0;
    isDragging.current = true;
    if (sheetRef.current) {
      sheetRef.current.style.transition = "none";
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || !sheetRef.current) return;
    const touch = e.touches[0];
    const deltaY = touch.clientY - dragStartY.current;
    if (deltaY > 0) {
      currentTranslateY.current = deltaY;
      sheetRef.current.style.transform = `translateY(${deltaY}px)`;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current || !sheetRef.current) return;
    isDragging.current = false;
    const sheet = sheetRef.current;
    sheet.style.transition = "transform 300ms ease-out";
    if (currentTranslateY.current > 100) {
      sheet.style.transform = "translateY(100%)";
      setTimeout(onClose, 300);
    } else {
      sheet.style.transform = "translateY(0)";
    }
    currentTranslateY.current = 0;
  }, [onClose]);

  return { sheetRef, handleTouchStart, handleTouchMove, handleTouchEnd };
}

// ── Main Panel ──────────────────────────────────────────────

/**
 * Layer control panel.
 * Desktop: slides in from the left edge, 320px wide.
 * Mobile: bottom sheet with drag handle, 50vh height, swipe to dismiss.
 */
export function LayerPanel({
  enabledLayers,
  onToggleLayer,
  onClose,
}: LayerPanelProps) {
  const { sheetRef, handleTouchStart, handleTouchMove, handleTouchEnd } =
    useDragDismiss(onClose);

  const layersByCategory = CATEGORIES.map((cat) => ({
    config: cat,
    layers: LAYER_REGISTRY.filter((l) => l.category === cat.id),
  }));

  return (
    <>
      {/* Backdrop (mobile only) */}
      <div
        className="fixed inset-0 bg-black/40 z-20 md:hidden"
        onClick={onClose}
      />

      {/* Desktop panel */}
      <div className="hidden md:flex flex-col fixed z-30 top-0 left-0 h-full w-80 bg-black/80 backdrop-blur-xl border-r border-white/10 overflow-hidden animate-in">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
          <h2 className="text-sm font-semibold text-zinc-200 tracking-wide">Layers</h2>
          <button onClick={onClose} className="flex items-center justify-center w-11 h-11 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-colors" aria-label="Close layer panel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {layersByCategory.map(({ config, layers }) => (
            <CategorySection key={config.id} config={config} layers={layers} enabledLayers={enabledLayers} onToggleLayer={onToggleLayer} defaultOpen={config.id === "forest" || config.id === "protection" || config.id === "disturbance"} />
          ))}
        </div>
        <div className="px-4 py-2 border-t border-white/5 shrink-0">
          <p className="text-[10px] text-zinc-600">{enabledLayers.length} of {LAYER_REGISTRY.length} layers active</p>
        </div>
      </div>

      {/* Mobile bottom sheet */}
      <div ref={sheetRef} className="md:hidden fixed z-30 bottom-0 left-0 right-0 h-[50vh] bg-black/80 backdrop-blur-xl border-t border-white/10 rounded-t-2xl flex flex-col overflow-hidden animate-in">
        <div className="flex justify-center pt-3 pb-1 shrink-0 cursor-grab active:cursor-grabbing" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 shrink-0">
          <h2 className="text-sm font-semibold text-zinc-200 tracking-wide">Layers</h2>
          <button onClick={onClose} className="flex items-center justify-center w-11 h-11 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-colors" aria-label="Close layer panel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {layersByCategory.map(({ config, layers }) => (
            <CategorySection key={config.id} config={config} layers={layers} enabledLayers={enabledLayers} onToggleLayer={onToggleLayer} defaultOpen={config.id === "forest" || config.id === "protection" || config.id === "disturbance"} />
          ))}
        </div>
        <div className="px-4 py-2 border-t border-white/5 shrink-0">
          <p className="text-[10px] text-zinc-600">{enabledLayers.length} of {LAYER_REGISTRY.length} layers active</p>
        </div>
      </div>
    </>
  );
}
