"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { CanopyMap } from "@/components/map";
import { DrawTool } from "@/components/map/DrawTool";
import { WatershedOverlay } from "@/components/map/WatershedOverlay";
import type { SelectionBBox } from "@/components/map/DrawTool";
import { PresetChips } from "@/components/ui/PresetChips";
import { SearchBar } from "@/components/ui/SearchBar";
import { LoadingBar } from "@/components/ui/LoadingBar";
import { LayerPanel } from "@/components/panels/LayerPanel";
import { CalculatorPanel } from "@/components/panels/CalculatorPanel";
import { HotSpotPanel } from "@/components/panels/HotSpotPanel";
import { LoadingProvider } from "@/contexts/LoadingContext";
import type { HotSpot } from "@/data/hotspots";
import { TimelineControl } from "@/components/map/TimelineControl";
import { getLayer } from "@/lib/layers";
import { useLayerState } from "@/hooks/useLayerState";
import { useMapState } from "@/hooks/useMapState";
import { useTimeline } from "@/hooks/useTimeline";
import { useWatershedSelection } from "@/hooks/useWatershedSelection";
import { calculateSelectionStats, calculateFinancialValue } from "@/lib/carbon";
import type { SelectionStats } from "@/lib/carbon";
import { generateReport } from "@/lib/export/pdf-generator";
import bbox from "@turf/bbox";

// ── Empty stats constant (reused for "no data" states) ──────────────
const EMPTY_STATS: SelectionStats = {
  totalCarbonTonnes: 0,
  totalCo2eTonnes: 0,
  totalAreaHa: 0,
  oldGrowthHa: 0,
  matureHa: 0,
  youngHa: 0,
  harvestedHa: 0,
  unknownHa: 0,
  speciesBreakdown: {},
  equivalences: { cars: 0, homes: 0, flights: 0 },
  featureCount: 0,
};

export default function Home() {
  const mapRef = useRef<MapRef>(null);
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const [hotSpotPanelOpen, setHotSpotPanelOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Draw tool state
  const [drawActive, setDrawActive] = useState(false);
  const [selection, setSelection] = useState<SelectionBBox | null>(null);
  const [selectionStats, setSelectionStats] = useState<SelectionStats | null>(
    null
  );

  // Watershed mode
  const watershedSelection = useWatershedSelection();

  const {
    enabledLayers,
    toggleLayer,
    applyPreset,
    activePreset,
    resetToDefaults,
    setLayers,
  } = useLayerState();

  const timeline = useTimeline();

  // Auto-disable timeline when no timeline-eligible layers are enabled
  const timelineEligible = enabledLayers.some(id => getLayer(id)?.timelineField);
  useEffect(() => {
    if (timeline.enabled && !timelineEligible) {
      timeline.disable();
    }
  }, [timelineEligible, timeline.enabled, timeline.disable]);

  const cutblocksEnabled = timelineEligible;

  const handleLayerRestore = useCallback(
    (layers: string[], preset: string | null) => {
      // URL layers are authoritative -- only fall back to preset if no layers encoded
      if (layers.length > 0) {
        setLayers(layers);
      } else if (preset) {
        applyPreset(preset);
      }
    },
    [setLayers, applyPreset]
  );

  const { getShareUrl } = useMapState({
    mapRef,
    enabledLayers,
    activePreset,
    onLayerRestore: handleLayerRestore,
  });

  const handlePresetSelect = useCallback(
    (presetId: string) => {
      if (activePreset === presetId) {
        resetToDefaults();
      } else {
        applyPreset(presetId);
      }
    },
    [activePreset, applyPreset, resetToDefaults]
  );

  const handleCopyLink = useCallback(async () => {
    try {
      const url = getShareUrl();
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for insecure contexts
      const url = getShareUrl();
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [getShareUrl]);

  // ── Search handler ──────────────────────────────────────────────────

  const handleLocationSelect = useCallback(
    (lng: number, lat: number, zoom: number) => {
      mapRef.current?.flyTo({
        center: [lng, lat],
        zoom,
        duration: 2000,
      });
    },
    []
  );

  // ── Hot spots handler ─────────────────────────────────────────────

  const handleHotSpotSelect = useCallback(
    (hotspot: HotSpot) => {
      mapRef.current?.flyTo({
        center: hotspot.center,
        zoom: hotspot.zoom,
        duration: 2000,
      });
      setLayers(hotspot.layers);
      setHotSpotPanelOpen(false);
    },
    [setLayers]
  );

  // ── Draw tool handlers ─────────────────────────────────────────────

  const toggleDrawMode = useCallback(() => {
    // Disable watershed mode when entering draw mode
    if (!drawActive) {
      watershedSelection.disableMode();
    }
    setDrawActive((prev) => !prev);
  }, [drawActive, watershedSelection]);

  const clearSelection = useCallback(() => {
    setSelection(null);
    setSelectionStats(null);
    setDrawActive(false);
  }, []);

  // ── Watershed handlers ─────────────────────────────────────────────

  const toggleWatershedMode = useCallback(() => {
    if (watershedSelection.mode === "off") {
      // Disable draw mode when entering watershed mode
      setDrawActive(false);
      setSelection(null);
      setSelectionStats(null);
      watershedSelection.enableMode();
    } else {
      watershedSelection.clear();
    }
  }, [watershedSelection]);

  const clearWatershed = useCallback(() => {
    watershedSelection.clear();
  }, [watershedSelection]);

  // Map click interceptor: handle watershed clicks
  const handleMapClick = useCallback(
    (lng: number, lat: number): boolean => {
      if (watershedSelection.mode === "selecting") {
        watershedSelection.selectAtPoint(lng, lat);
        return true; // Intercept the click
      }
      return false; // Let CanopyMap handle it normally
    },
    [watershedSelection]
  );

  // Message shown in calculator when forest layer data is unavailable
  const [calcMessage, setCalcMessage] = useState<string | null>(null);

  // ── Query forest features within the watershed bbox ────────────────

  const queryForestFeaturesInBBox = useCallback(
    (bboxCoords: [number, number, number, number]) => {
      const map = mapRef.current;
      if (!map) return;

      const queryFeatures = () => {
        const sw = map.project([bboxCoords[0], bboxCoords[1]]);
        const ne = map.project([bboxCoords[2], bboxCoords[3]]);

        const topLeft: [number, number] = [
          Math.min(sw.x, ne.x),
          Math.min(sw.y, ne.y),
        ];
        const bottomRight: [number, number] = [
          Math.max(sw.x, ne.x),
          Math.max(sw.y, ne.y),
        ];

        return map.queryRenderedFeatures([topLeft, bottomRight], {
          layers: ["layer-forest-age-fill"],
        });
      };

      let features = queryFeatures();

      if (!features || features.length === 0) {
        if (!enabledLayers.includes("forest-age")) {
          toggleLayer("forest-age");
          setTimeout(() => {
            const retried = queryFeatures();
            if (retried && retried.length > 0) {
              const seen = new Set<string>();
              const unique = retried.filter((f) => {
                const id =
                  String(f.properties?.OBJECTID ?? "") ||
                  String(f.properties?.FEATURE_ID ?? "") ||
                  JSON.stringify(f.geometry);
                if (seen.has(id)) return false;
                seen.add(id);
                return true;
              });
              const stats = calculateSelectionStats(
                unique as unknown as GeoJSON.Feature[]
              );
              setSelectionStats(stats);
            } else {
              setCalcMessage("Zoom in to see forest data for this area.");
              setSelectionStats(EMPTY_STATS);
            }
          }, 500);
          return;
        }

        setCalcMessage("Zoom in to see forest data for this area.");
        setSelectionStats(EMPTY_STATS);
        return;
      }

      if (features && features.length > 0) {
        const seen = new Set<string>();
        const unique = features.filter((f) => {
          const id =
            String(f.properties?.OBJECTID ?? "") ||
            String(f.properties?.FEATURE_ID ?? "") ||
            JSON.stringify(f.geometry);
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        });

        const stats = calculateSelectionStats(
          unique as unknown as GeoJSON.Feature[]
        );
        setSelectionStats(stats);
      }
    },
    [enabledLayers, toggleLayer]
  );

  // When watershed selection completes, query forest features in the watershed bbox
  useEffect(() => {
    if (
      watershedSelection.mode === "selected" &&
      watershedSelection.watershed
    ) {
      setCalcMessage(null);
      const geoBbox = bbox(watershedSelection.watershed.polygon) as [
        number,
        number,
        number,
        number,
      ];
      queryForestFeaturesInBBox(geoBbox);
    }
  }, [
    watershedSelection.mode,
    watershedSelection.watershed,
    queryForestFeaturesInBBox,
  ]);

  const handleSelectionChange = useCallback(
    (sel: SelectionBBox | null) => {
      setSelection(sel);
      setCalcMessage(null);

      if (!sel || !mapRef.current) {
        setSelectionStats(null);
        return;
      }

      queryForestFeaturesInBBox(sel.bbox);

      // Deactivate draw mode after completing selection
      setDrawActive(false);
    },
    [queryForestFeaturesInBBox]
  );

  // ── Keyboard shortcuts ───────────────────────────────────────────

  // Destructure stable refs for the keyboard effect dependency array
  const timelineEnabled = timeline.enabled;
  const timelineStepBackward = timeline.stepBackward;
  const timelineStepForward = timeline.stepForward;
  const timelineTogglePlay = timeline.togglePlay;
  const timelineDisable = timeline.disable;

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        toggleDrawMode();
      }

      // Timeline: left/right arrow keys step year, space toggles play
      if (timelineEnabled) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          timelineStepBackward();
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          timelineStepForward();
        }
        if (e.key === " ") {
          e.preventDefault();
          timelineTogglePlay();
        }
      }

      if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        toggleWatershedMode();
      }

      if (e.key === "Escape") {
        if (timelineEnabled) {
          timelineDisable();
        } else if (watershedSelection.mode !== "off") {
          watershedSelection.clear();
        } else if (drawActive) {
          setDrawActive(false);
        } else if (selection) {
          clearSelection();
        } else if (hotSpotPanelOpen) {
          setHotSpotPanelOpen(false);
        } else if (layerPanelOpen) {
          setLayerPanelOpen(false);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawActive, selection, layerPanelOpen, hotSpotPanelOpen, toggleDrawMode, clearSelection, timelineEnabled, timelineStepBackward, timelineStepForward, timelineTogglePlay, timelineDisable, toggleWatershedMode, watershedSelection]);

  const enabledCount = enabledLayers.length;

  // Panel visibility: show for draw selection OR watershed selection
  const isWatershedSelected =
    watershedSelection.mode === "selected" &&
    watershedSelection.watershed !== null;
  const isDrawSelected = selection !== null && selectionStats !== null;
  const panelVisible =
    (isDrawSelected && !isWatershedSelected) ||
    (isWatershedSelected && selectionStats !== null);

  // For watershed: use watershed area for the stats if we have it
  const displayStats =
    isWatershedSelected && selectionStats
      ? { ...selectionStats, totalAreaHa: watershedSelection.watershed!.areaHa }
      : selectionStats;

  const handlePanelClose = isWatershedSelected ? clearWatershed : clearSelection;

  // ── Export PDF handler ──────────────────────────────────────────────

  const handleExport = useCallback(() => {
    const canvas = mapRef.current?.getCanvas();
    if (!canvas || !displayStats) return;
    const mapImageDataUrl = canvas.toDataURL("image/png");
    const financial = calculateFinancialValue(displayStats);
    generateReport({
      mapImageDataUrl,
      stats: displayStats,
      financial,
      enabledLayers,
      watershedName: isWatershedSelected
        ? watershedSelection.watershed?.name
        : undefined,
      timestamp: new Date().toLocaleDateString("en-CA", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    });
  }, [displayStats, enabledLayers, isWatershedSelected, watershedSelection.watershed]);

  const watershedActive = watershedSelection.mode !== "off";

  return (
    <LoadingProvider>
    <main className="relative h-screen w-screen overflow-hidden">
      {/* Full-screen map */}
      <CanopyMap
        ref={mapRef}
        enabledLayers={enabledLayers}
        yearFilter={timeline.yearFilter}
        className="absolute inset-0"
        onMapClick={handleMapClick}
        cursor={watershedSelection.mode === "selecting" ? "crosshair" : undefined}
      >
        <DrawTool
          active={drawActive}
          selection={selection}
          onSelectionChange={handleSelectionChange}
        />
        <WatershedOverlay
          polygon={watershedSelection.watershed?.polygon ?? null}
        />
      </CanopyMap>

      {/* Loading indicator at top of viewport */}
      <LoadingBar />

      {/* Search bar -- top center on desktop, full width with margins on mobile */}
      <div className="absolute top-3 left-3 right-3 md:left-1/2 md:right-auto md:-translate-x-1/2 z-10 md:w-[min(320px,calc(100vw-8rem))]">
        <SearchBar onLocationSelect={handleLocationSelect} />
      </div>

      {/* Left control cluster -- layer toggle + hot spots */}
      <div className="absolute top-16 md:top-3 left-3 z-10 flex flex-col gap-2">
        {/* Layer panel toggle */}
        <button
          onClick={() => setLayerPanelOpen(!layerPanelOpen)}
          className="relative flex items-center justify-center w-11 h-11 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 text-zinc-300 hover:text-white hover:bg-black/80 transition-colors focus-visible:ring-2 focus-visible:ring-white/30"
          title="Toggle layer panel"
          aria-label="Toggle layer panel"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            className="w-4.5 h-4.5"
          >
            <path d="m12 2 10 6.5v7L12 22 2 15.5v-7L12 2z" />
            <path d="M12 22v-7" />
            <path d="m22 8.5-10 7-10-7" />
          </svg>
          {enabledCount > 0 && (
            <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[14px] h-3.5 px-0.5 text-[9px] font-semibold rounded-full bg-emerald-500/90 text-white">
              {enabledCount}
            </span>
          )}
        </button>

        {/* Hot spots toggle */}
        <button
          onClick={() => setHotSpotPanelOpen(!hotSpotPanelOpen)}
          className={`
            flex items-center justify-center w-11 h-11 rounded-lg
            backdrop-blur-md border text-zinc-300
            hover:text-white transition-colors focus-visible:ring-2 focus-visible:ring-white/30
            ${
              hotSpotPanelOpen
                ? "bg-emerald-500/20 border-emerald-400/30"
                : "bg-black/70 border-white/10 hover:bg-black/80"
            }
          `}
          title="Discover hot spots"
          aria-label="Discover hot spots"
          aria-pressed={hotSpotPanelOpen}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4.5 h-4.5"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
          </svg>
        </button>
      </div>

      {/* Layer panel */}
      {layerPanelOpen && (
        <LayerPanel
          enabledLayers={enabledLayers}
          onToggleLayer={toggleLayer}
          onClose={() => setLayerPanelOpen(false)}
        />
      )}

      {/* Hot spot panel */}
      {hotSpotPanelOpen && (
        <HotSpotPanel
          onSelect={handleHotSpotSelect}
          onClose={() => setHotSpotPanelOpen(false)}
        />
      )}

      {/* Watershed loading indicator */}
      {watershedSelection.loading && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-black/80 backdrop-blur-md border border-white/10 text-sm text-zinc-300">
            <svg className="w-4 h-4 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading watershed...
          </div>
        </div>
      )}

      {/* Bottom bar cluster: timeline control + preset chips */}
      <div className="absolute bottom-8 left-3 right-3 md:left-1/2 md:right-auto md:-translate-x-1/2 z-10 md:max-w-[calc(100vw-10rem)] flex flex-col gap-2">
        {/* Timeline control -- above preset bar, only when active */}
        {timeline.enabled && (
          <TimelineControl
            currentYear={timeline.currentYear}
            playing={timeline.playing}
            playSpeed={timeline.playSpeed}
            range={timeline.range}
            stepSize={timeline.stepSize}
            onTogglePlay={timeline.togglePlay}
            onSetYear={timeline.setYear}
            onSetSpeed={timeline.setSpeed}
            onSetStepSize={timeline.setStepSize}
            onClose={timeline.disable}
          />
        )}

        {/* Preset chips bar */}
        <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl bg-black/70 backdrop-blur-md border border-white/10 overflow-x-auto scrollbar-none">
          <PresetChips
            activePreset={activePreset}
            onPresetSelect={handlePresetSelect}
          />
          {/* Divider */}
          <div className="w-px h-5 bg-white/10 shrink-0" />
          {/* Select Area button inline with presets */}
          <button
            onClick={toggleDrawMode}
            title={drawActive ? "Cancel selection (Esc)" : "Select area (S)"}
            aria-label={drawActive ? "Cancel area selection" : "Select area"}
            aria-pressed={drawActive}
            className={`
              flex items-center gap-1.5 px-2.5 py-2 min-h-[44px] rounded-lg shrink-0
              text-xs font-medium transition-all duration-200
              ${
                drawActive
                  ? "bg-blue-500/20 text-blue-300"
                  : "text-zinc-400 hover:text-white hover:bg-white/5"
              }
            `}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3 h-3"
            >
              <path d="M4 7V4h3M20 7V4h-3M4 17v3h3M20 17v3h-3" />
            </svg>
            {drawActive ? "Drawing..." : "Select"}
          </button>
          {/* Timeline button -- only when cutblocks is enabled */}
          {cutblocksEnabled && (
            <button
              onClick={() => timeline.enabled ? timeline.disable() : timeline.enable()}
              title={timeline.enabled ? "Close timeline (Esc)" : "Open logging timeline"}
              aria-label={timeline.enabled ? "Close logging timeline" : "Open logging timeline"}
              aria-pressed={timeline.enabled}
              className={`
                flex items-center gap-1.5 px-2.5 py-2 min-h-[44px] rounded-lg shrink-0
                text-xs font-medium transition-all duration-200
                ${
                  timeline.enabled
                    ? "bg-teal-500/20 text-teal-300"
                    : "text-zinc-400 hover:text-white hover:bg-white/5"
                }
              `}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3 h-3"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              Timeline
            </button>
          )}
          {/* Watershed button */}
          <button
            onClick={toggleWatershedMode}
            title={watershedActive ? "Cancel watershed (Esc)" : "Watershed report (W)"}
            aria-label={watershedActive ? "Cancel watershed selection" : "Watershed report"}
            aria-pressed={watershedActive}
            className={`
              flex items-center gap-1.5 px-2.5 py-2 min-h-[44px] rounded-lg shrink-0
              text-xs font-medium transition-all duration-200
              ${
                watershedActive
                  ? "bg-blue-500/20 text-blue-300"
                  : "text-zinc-400 hover:text-white hover:bg-white/5"
              }
            `}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-3 h-3"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
            {watershedSelection.loading
              ? "Loading..."
              : watershedSelection.mode === "selecting"
                ? "Click map..."
                : "Watershed"}
          </button>
          {/* Copy link button inline */}
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-1 px-2 py-2 min-h-[44px] rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition-all text-xs shrink-0"
            title="Copy shareable link"
            aria-label="Copy shareable link"
          >
            {copied ? (
              <span className="text-emerald-400 text-[10px]">Copied</span>
            ) : (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-3 h-3"
              >
                <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Calculator results panel */}
      <CalculatorPanel
        stats={displayStats}
        visible={panelVisible}
        onClose={handlePanelClose}
        onExport={handleExport}
        message={calcMessage}
        watershedName={
          isWatershedSelected
            ? watershedSelection.watershed!.name
            : undefined
        }
      />
    </main>
    </LoadingProvider>
  );
}
