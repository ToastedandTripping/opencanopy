"use client";

import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import { CanopyMap } from "@/components/map";
import { DrawTool, boundsToSelectionBBox } from "@/components/map/DrawTool";
import { WatershedOverlay } from "@/components/map/WatershedOverlay";
import type { SelectionBBox } from "@/components/map/DrawTool";
import {
  isTextEntryTarget,
  matchesAltShortcut,
  isTimelineTransportKey,
} from "@/lib/keyboard/map-shortcuts";
import { PresetChips } from "@/components/ui/PresetChips";
import { SearchBar } from "@/components/ui/SearchBar";
import { LoadingBar } from "@/components/ui/LoadingBar";
import { LayerPanel } from "@/components/panels/LayerPanel";
import { CalculatorPanel } from "@/components/panels/CalculatorPanel";
import { HotSpotPanel } from "@/components/panels/HotSpotPanel";
import { LoadingProvider } from "@/contexts/LoadingContext";
import type { HotSpot } from "@/data/hotspots";
import { TimelineControl } from "@/components/map/TimelineControl";
import { MapLegend } from "@/components/map/MapLegend";
import { StatusToast } from "@/components/ui/StatusToast";
import { MapErrorBoundary } from "@/components/ui/MapErrorBoundary";
import { getLayer } from "@/lib/layers";
import { useLayerState } from "@/hooks/useLayerState";
import { useMapState } from "@/hooks/useMapState";
import { useTimeline, RENDER_WATCHDOG_MS } from "@/hooks/useTimeline";
import { useWatershedSelection } from "@/hooks/useWatershedSelection";
import {
  calculateSelectionStats,
  calculateFinancialValue,
  clipFeaturesToSelection,
} from "@/lib/carbon";
import type { SelectionStats } from "@/lib/carbon";
import {
  fetchForestAgeForSelection,
  bboxAreaKm2,
  isSelectionTooLarge,
  createSeqGuard,
  ForestCarbonFetchError,
  hasSchemaDrift,
} from "@/lib/data/forest-carbon-client";
import { generateReport } from "@/lib/export/pdf-generator";
import type { BBox } from "@/types/layers";
import type { CalcStatus, CalcErrorInfo, CalcCaveats } from "@/components/panels/CalculatorPanel";

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

// Single console.info line per calc attempt (X6 operability) -- lets a field
// report ("the calculator said X") be diagnosed from the browser console
// without a debugger attached.
function logCalc(payload: Record<string, unknown>): void {
  console.info("[opencanopy:calc]", payload);
}

// Injectable-matchMedia reduced-motion check for the timeline scheduler,
// mirroring the pattern in useScrollytelling.ts (cached MediaQueryList,
import { prefersReducedMotion } from "@/lib/a11y/reduced-motion";

export default function Home() {
  const mapRef = useRef<MapRef>(null);
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const [hotSpotPanelOpen, setHotSpotPanelOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // Mutual exclusion between the two panels (Razor W1), scoped to mobile
  // only (Jen, P2 design review): below the md breakpoint both LayerPanel
  // and HotSpotPanel render a `role="dialog" aria-modal="true"` sheet, so
  // opening one while the other's sheet is still mounted would arm two
  // modal Tab traps at once. useDialogA11y's `defaultPrevented` guard
  // (useDialogA11y.ts) already makes that duel structurally impossible
  // regardless of this check, but closing the sibling here also avoids the
  // visual stack-up of two full-screen sheets. At >=768px both panels
  // render their `role="region"` (non-modal, opposite-edge, non-overlapping)
  // desktop variant, where closing the sibling has no a11y benefit and
  // removes a real "keep both open" workflow -- so it's skipped there.
  // window.innerWidth check (not a resize listener) mirrors the same
  // pattern SearchBar already uses; the narrow edge case of two panels open
  // on desktop then resized below md is accepted, not engineered around.
  const toggleLayerPanel = useCallback(() => {
    setLayerPanelOpen((prev) => {
      const next = !prev;
      if (next && window.innerWidth < 768) setHotSpotPanelOpen(false);
      return next;
    });
  }, []);

  const toggleHotSpotPanel = useCallback(() => {
    setHotSpotPanelOpen((prev) => {
      const next = !prev;
      if (next && window.innerWidth < 768) setLayerPanelOpen(false);
      return next;
    });
  }, []);

  // Focus-restore targets for useDialogA11y (part C): each panel's own
  // trigger button (tier-2 fallback if the pre-open focus target is gone --
  // e.g. a sibling dialog closed first and took it with it) and the map
  // container itself (tier-3, last resort). mainRef needs tabIndex={-1} on
  // <main> below to be a valid programmatic focus target.
  const layerToggleRef = useRef<HTMLButtonElement>(null);
  const hotSpotToggleRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  // Draw tool state
  const [drawActive, setDrawActive] = useState(false);
  const [selection, setSelection] = useState<SelectionBBox | null>(null);
  const [selectionStats, setSelectionStats] = useState<SelectionStats | null>(
    null
  );

  // Class filtering state (e.g. toggle individual forest age classes on/off)
  const [classFilters, setClassFilters] = useState<Record<string, string[]>>({});

  // Watershed mode
  const watershedSelection = useWatershedSelection();

  // ── CO2 calc state machine (loading | ok | no-data | error | too-large) ──
  // Render-independent replacement for the old queryRenderedFeatures path.
  // Headline is a function of calcStatus, NEVER of stats.totalCo2eTonnes
  // (which is 0 in both the real-zero and no-data cases -- conflating them
  // was the original bug). See CalculatorPanel.tsx for the state -> copy map.
  const [calcStatus, setCalcStatus] = useState<CalcStatus | null>(null);
  const [calcErrorInfo, setCalcErrorInfo] = useState<CalcErrorInfo | null>(null);
  const [calcCaveats, setCalcCaveats] = useState<CalcCaveats | null>(null);

  // Shared sequence-token guard across BOTH entry points (draw + watershed):
  // a new selection aborts the prior in-flight fetch/clip, and every async
  // resolution checks the token before calling setState so a slow stale
  // response can never overwrite a newer result (X5). Also covers React
  // StrictMode's double-effect-invocation in dev. See createSeqGuard
  // (forest-carbon-client.ts) for the extracted, unit-tested primitive.
  const calcGuardRef = useRef(createSeqGuard());
  // Last draw selection's polygon+bbox, for the error state's "try again"
  // button -- re-runs the same calc without requiring the user to redraw.
  const lastDrawCalcRef = useRef<{ polygon: GeoJSON.Feature<GeoJSON.Polygon>; bbox: BBox } | null>(
    null
  );

  const resetCalc = useCallback(() => {
    calcGuardRef.current.reset();
    setSelectionStats(null);
    setCalcStatus(null);
    setCalcErrorInfo(null);
    setCalcCaveats(null);
  }, []);

  const runCalculation = useCallback(
    (polygon: GeoJSON.Feature<GeoJSON.Polygon>, bboxCoords: BBox) => {
      const { signal, token } = calcGuardRef.current.start();

      setCalcErrorInfo(null);
      setCalcCaveats(null);

      // Pre-fetch bbox-area guard (empirically calibrated -- see
      // forest-carbon-client.ts for the full measurement table). This is the
      // real defense against feature-cap truncation in v1: it keeps
      // draw-select out of the regime where the cap is even reachable.
      if (isSelectionTooLarge(bboxCoords)) {
        setSelectionStats(null);
        setCalcStatus("too-large");
        logCalc({ status: "too-large", areaKm2: Math.round(bboxAreaKm2(bboxCoords)) });
        return;
      }

      setSelectionStats(null);
      setCalcStatus("loading");
      const t0 = nowMs();

      (async () => {
        try {
          const { features, maybeTruncated } = await fetchForestAgeForSelection(bboxCoords, {
            signal,
          });
          if (!calcGuardRef.current.isCurrent(token)) return; // superseded by a newer selection

          if (features.length === 0) {
            setSelectionStats(null);
            setCalcStatus("no-data");
            logCalc({ status: "no-data", features: 0, ms: Math.round(nowMs() - t0) });
            return;
          }

          // Schema-drift guard (hasSchemaDrift, forest-carbon-client.ts) --
          // this is the class of bug that silently zeroed the original
          // calculator. See that function's docstring for why it's keyed on
          // `class`, not `PROJ_AGE_1` (a genuinely all-harvested selection
          // must still compute normally, not be flagged as drift).
          if (hasSchemaDrift(features)) {
            setSelectionStats(null);
            setCalcStatus("error");
            setCalcErrorInfo({
              message: "Forest data format changed — please try again later.",
            });
            logCalc({ status: "error", kind: "schema-drift", ms: Math.round(nowMs() - t0) });
            return;
          }

          const { features: clipped, skipped, total } = await clipFeaturesToSelection(
            features,
            polygon,
            { signal }
          );
          if (!calcGuardRef.current.isCurrent(token)) return; // superseded mid-clip

          const stats = calculateSelectionStats(clipped);
          setSelectionStats(stats);
          setCalcStatus("ok");
          setCalcCaveats({
            truncated: maybeTruncated,
            skippedFraction: total > 0 ? skipped / total : 0,
          });
          logCalc({
            status: "ok",
            features: features.length,
            skipped,
            truncated: maybeTruncated,
            ms: Math.round(nowMs() - t0),
          });
        } catch (err) {
          if (!calcGuardRef.current.isCurrent(token)) return; // superseded -- stale error, don't surface
          const isAbort =
            (err instanceof DOMException && err.name === "AbortError") ||
            (err as { name?: string } | null)?.name === "AbortError";
          if (isAbort) return; // superseded fetch/clip abort, not a real failure

          const fcErr = err instanceof ForestCarbonFetchError ? err : null;
          const kind = fcErr?.kind ?? "network";
          const message =
            kind === "timeout"
              ? "This is taking longer than expected — try again."
              : kind === "rate-limit"
                ? "Too many requests — try again shortly."
                : "Forest data unavailable — try again.";
          setSelectionStats(null);
          setCalcStatus("error");
          setCalcErrorInfo({
            message,
            retryAvailableAt: fcErr?.retryAfterSeconds
              ? Date.now() + fcErr.retryAfterSeconds * 1000
              : undefined,
          });
          logCalc({ status: "error", kind, ms: Math.round(nowMs() - t0) });
        }
      })();
    },
    []
  );

  const onRetryCalc = useCallback(() => {
    const last = lastDrawCalcRef.current;
    if (last) runCalculation(last.polygon, last.bbox);
  }, [runCalculation]);

  const {
    enabledLayers,
    toggleLayer,
    applyPreset,
    activePreset,
    resetToDefaults,
    setLayers,
  } = useLayerState();

  // Compute active timeline layers: enabled layers that have a timelineField.
  // This drives both the dynamic range in useTimeline and the
  // timelineEligible gate for showing the timeline button.
  const activeTimelineLayers = useMemo(
    () => enabledLayers.map(id => getLayer(id)).filter(
      (l): l is NonNullable<ReturnType<typeof getLayer>> => l != null && !!l.timelineField
    ),
    [enabledLayers]
  );

  // Render-gate for the timeline scheduler (Phase A, honest timeline): the
  // hook stays maplibre-free, so this is built here from mapRef and injected
  // in. Reads mapRef.current lazily (never captured) so it's never stale.
  // The internal timeout is this function's OWN LAST-RESORT safety net
  // (guarantees the promise always settles even if 'idle' never fires or
  // the map instance disappears mid-wait) -- it is deliberately set to
  // RENDER_WATCHDOG_MS + 250, NOT the same RENDER_WATCHDOG_MS the hook
  // races it against (Razor W2): at equal delays, this timer is always
  // registered first (synchronously, before the hook's own
  // sleep(RENDER_WATCHDOG_MS) call in its Promise.race), so on an equal-
  // delay tie it would always resolve "render" a microtask before the
  // hook's "watchdog" branch could ever win -- silently making
  // watchdogFired permanently false and pipelineLog("timeline-watchdog")
  // dead code, even for a genuinely stalled multi-second paint. The +250ms
  // margin lets the hook's own watchdog deterministically own the
  // timeout+logging semantics; this timer only fires as a true last resort
  // (map torn down, 'idle' never coming at all).
  const waitForRender = useCallback(
    () =>
      new Promise<void>((resolve) => {
        const map = mapRef.current?.getMap();
        if (!map) return resolve();
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          clearTimeout(t);
          map.off("idle", onIdle);
          resolve();
        };
        const onIdle = () => finish();
        const t = setTimeout(finish, RENDER_WATCHDOG_MS + 250);
        map.once("idle", onIdle);
      }),
    []
  );

  const timeline = useTimeline(activeTimelineLayers, {
    waitForRender,
    prefersReducedMotion,
  });

  // Auto-disable timeline when no timeline-eligible layers are enabled
  const timelineEligible = activeTimelineLayers.length > 0;
  useEffect(() => {
    if (timeline.enabled && !timelineEligible) {
      timeline.disable();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- timeline object identity changes every render; listing .enabled and .disable is more correct
  }, [timelineEligible, timeline.enabled, timeline.disable]);

  const showTimelineButton = timelineEligible;

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

  // ── Class filter handler ───────────────────────────────────────────

  const handleToggleClassFilter = useCallback((layerId: string, classSlug: string) => {
    setClassFilters(prev => {
      const layer = getLayer(layerId);
      if (!layer) return prev;
      const allClasses = layer.legendItems
        .map(item => item.classSlug)
        .filter((s): s is string => s !== undefined);
      if (allClasses.length === 0) return prev;
      const current = prev[layerId] ?? allClasses;
      const isEnabled = current.includes(classSlug);
      let next: string[];
      if (isEnabled && current.length === 1) {
        // Last class toggled off -- reset to show all
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring to remove a key
        const { [layerId]: _, ...rest } = prev;
        return rest;
      } else if (isEnabled) {
        next = current.filter(c => c !== classSlug);
      } else {
        next = [...current, classSlug];
      }
      return { ...prev, [layerId]: next };
    });
  }, []);

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
      if (watershedSelection.mode !== "off") {
        resetCalc();
      }
      watershedSelection.disableMode();
    }
    setDrawActive((prev) => !prev);
  }, [drawActive, watershedSelection, resetCalc]);

  const clearSelection = useCallback(() => {
    setSelection(null);
    resetCalc();
    setDrawActive(false);
  }, [resetCalc]);

  // ── Watershed handlers ─────────────────────────────────────────────

  const toggleWatershedMode = useCallback(() => {
    if (watershedSelection.mode === "off") {
      // Disable draw mode when entering watershed mode
      setDrawActive(false);
      setSelection(null);
      resetCalc();
      watershedSelection.enableMode();
    } else {
      resetCalc();
      watershedSelection.clear();
    }
  }, [watershedSelection, resetCalc]);

  const clearWatershed = useCallback(() => {
    resetCalc();
    watershedSelection.clear();
  }, [watershedSelection, resetCalc]);

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

  // When a watershed selection completes: carbon is DESCOPED in v1 (BC
  // watershed groups run ~1,000-10,000+ km^2, far past both the pre-fetch
  // area guard and the fetch timeout -- probe: a 2,900km^2 draw already
  // takes 22s). Never feed it through the fetch/clip path. The boundary,
  // name, and official AREA_HA still render (WatershedOverlay + the areaHa
  // computed below) -- only the carbon readout goes straight to "too-large".
  // Option C (class-encoded raster) is the named follow-up that restores
  // watershed-scale carbon.
  useEffect(() => {
    if (watershedSelection.mode === "selected" && watershedSelection.watershed) {
      calcGuardRef.current.reset();
      setSelectionStats(null);
      setCalcErrorInfo(null);
      setCalcCaveats(null);
      setCalcStatus("too-large");
      logCalc({ status: "too-large", reason: "watershed-descoped-v1" });
    }
  }, [watershedSelection.mode, watershedSelection.watershed]);

  const handleSelectionChange = useCallback(
    (sel: SelectionBBox | null) => {
      setSelection(sel);

      if (!sel) {
        resetCalc();
        return;
      }

      lastDrawCalcRef.current = { polygon: sel.polygon, bbox: sel.bbox };
      runCalculation(sel.polygon, sel.bbox);

      // Deactivate draw mode after completing selection
      setDrawActive(false);
    },
    [resetCalc, runCalculation]
  );

  // B3 (WCAG 2.1.1): keyboard-reachable equivalent of a manual box-draw --
  // selects the current viewport bounds and feeds the SAME
  // handleSelectionChange -> runCalculation spine a mouse drag does (zero
  // downstream change). The pre-fetch isSelectionTooLarge guard absorbs a
  // whole-province viewport into the honest "too large" state rather than
  // a slow/failed fetch. Mirrors toggleDrawMode's mutual-exclusion with
  // watershed mode so the two selection kinds can never be active at once.
  const handleSelectVisibleArea = useCallback(() => {
    const map = mapRef.current?.getMap();
    if (!map) return;
    if (watershedSelection.mode !== "off") {
      watershedSelection.disableMode();
    }
    setDrawActive(false);
    handleSelectionChange(boundsToSelectionBBox(map.getBounds()));
  }, [handleSelectionChange, watershedSelection]);

  // ── Keyboard shortcuts ───────────────────────────────────────────

  // Destructure stable refs for the keyboard effect dependency array
  const timelineEnabled = timeline.enabled;
  const timelineStepBackward = timeline.stepBackward;
  const timelineStepForward = timeline.stepForward;
  const timelineTogglePlay = timeline.togglePlay;
  const timelineDisable = timeline.disable;

  // B1/B2: per-key target guard, NOT a blanket widen. Escape keeps the
  // original narrow input/textarea-only guard (isTextEntryTarget) so it can
  // still dismiss panels even when a button has focus -- e.g. the panel
  // Close button Escape itself just moved focus onto; a wide guard there
  // would be a keyboard trap. Alt+S / Alt+W / Space / arrows get the wider
  // isEditableOrControl guard via matchesAltShortcut/isTimelineTransportKey,
  // which also stops Space from hijacking a focused button's own click.
  // s/w now require Alt (B2, WCAG 2.1.4) -- bare s/w and any Ctrl/Cmd
  // combination (so OS/browser shortcuts like Ctrl+S are never hijacked) do
  // nothing here. See src/lib/keyboard/map-shortcuts.ts for the extracted,
  // unit-tested guard logic.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (matchesAltShortcut(e, "s")) {
        e.preventDefault();
        toggleDrawMode();
        return;
      }

      if (matchesAltShortcut(e, "w")) {
        e.preventDefault();
        toggleWatershedMode();
        return;
      }

      // Timeline: left/right arrow keys step year, space toggles play
      if (timelineEnabled && isTimelineTransportKey(e)) {
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          timelineStepBackward();
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          timelineStepForward();
          return;
        }
        if (e.key === " ") {
          e.preventDefault();
          timelineTogglePlay();
          return;
        }
      }

      if (e.key === "Escape") {
        if (isTextEntryTarget(e.target)) return;
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

  // Panel visibility: show for draw selection OR watershed selection, driven
  // by calcStatus (not stats-nullness -- Core-3c) so the loading spinner can
  // actually render: stats are null while a fetch is in flight, but the
  // panel must still be open and showing "Calculating...".
  const isWatershedSelected =
    watershedSelection.mode === "selected" &&
    watershedSelection.watershed !== null;
  const panelVisible = isWatershedSelected || (selection !== null && calcStatus !== null);

  // Header area figure: watershed's own official AREA_HA (kept visible even
  // in the "too-large" carbon state -- Core-8, the plan explicitly keeps the
  // boundary/name/area for watershed even though carbon is descoped), or the
  // clipped forested area for a completed draw calc, relabelled "forested
  // area analyzed" in the panel (it is NOT the raw drawn-rectangle area).
  // Null (no figure shown) for any draw selection that never reached "ok".
  const areaHa = isWatershedSelected
    ? watershedSelection.watershed!.areaHa
    : calcStatus === "ok" && selectionStats
      ? selectionStats.totalAreaHa
      : null;

  // stats (breakdown / equivalences / financial) only ever populated for a
  // completed, non-descoped calc -- by construction selectionStats is null
  // in every branch except "ok" (see runCalculation/resetCalc above), this
  // extra gate is defense-in-depth against that invariant drifting later.
  const displayStats = calcStatus === "ok" ? selectionStats : null;

  const handlePanelClose = isWatershedSelected ? clearWatershed : clearSelection;

  // ── Export PDF handler ──────────────────────────────────────────────
  // Gated to calcStatus === "ok": the PDF template requires a real
  // SelectionStats object, and "never a number" applies to Export exactly
  // as it does to the headline (X4). Watershed carbon never reaches "ok" in
  // v1 (always "too-large"), so watershedName below is currently
  // unreachable in practice -- kept as-is, forward-compatible with the
  // Option C follow-up that restores watershed-scale carbon.
  const handleExport = useCallback(() => {
    if (calcStatus !== "ok" || !displayStats) return;
    const canvas = mapRef.current?.getCanvas();
    if (!canvas) return;
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
  }, [calcStatus, displayStats, enabledLayers, isWatershedSelected, watershedSelection.watershed]);

  const watershedActive = watershedSelection.mode !== "off";

  return (
    <LoadingProvider>
    <MapErrorBoundary>
    <main
      ref={mainRef}
      tabIndex={-1}
      className="relative h-screen w-screen overflow-hidden focus:outline-none"
    >
      {/* Full-screen map */}
      <CanopyMap
        ref={mapRef}
        enabledLayers={enabledLayers}
        yearFilter={timeline.yearFilter}
        classFilters={classFilters}
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

      {/* Error toast — shown for hard failures; auto-dismisses after 6s */}
      <StatusToast />

      {/* Search bar -- top center on desktop, full width with margins on mobile */}
      <div className="absolute top-3 left-3 right-3 md:left-1/2 md:right-auto md:-translate-x-1/2 z-10 md:w-[min(320px,calc(100vw-8rem))]">
        <SearchBar onLocationSelect={handleLocationSelect} />
      </div>

      {/* Left control cluster -- layer toggle + hot spots */}
      <div className="absolute top-16 md:top-3 left-3 z-10 flex flex-col gap-2">
        {/* Layer panel toggle */}
        <button
          ref={layerToggleRef}
          onClick={toggleLayerPanel}
          className="relative flex items-center justify-center w-11 h-11 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 text-zinc-300 hover:text-white hover:bg-black/80 transition-colors focus-visible:ring-2 focus-visible:ring-white/30"
          title="Toggle layer panel"
          aria-label="Toggle layer panel"
          aria-expanded={layerPanelOpen}
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
            <span
              className="absolute -top-1 -right-1 flex items-center justify-center min-w-[14px] h-3.5 px-0.5 text-[9px] font-semibold rounded-full bg-emerald-500/90 text-white"
              title={`${enabledCount} layer${enabledCount === 1 ? "" : "s"} on`}
              aria-label={`${enabledCount} layer${enabledCount === 1 ? "" : "s"} on`}
            >
              {enabledCount}
            </span>
          )}
        </button>

        {/* Hot spots toggle */}
        <button
          ref={hotSpotToggleRef}
          onClick={toggleHotSpotPanel}
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
          aria-expanded={hotSpotPanelOpen}
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
          triggerRef={layerToggleRef}
          mapContainerRef={mainRef}
        />
      )}

      {/* Hot spot panel */}
      {hotSpotPanelOpen && (
        <HotSpotPanel
          onSelect={handleHotSpotSelect}
          onClose={() => setHotSpotPanelOpen(false)}
          triggerRef={hotSpotToggleRef}
          mapContainerRef={mainRef}
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

      {/* Watershed error (D3, honest failure state) -- a genuine
          no-watershed click (e.g. ocean) resolves silently and stays in
          "selecting" mode with no message; ONLY a real server/network
          failure sets watershedSelection.error, and only that renders
          here. role="status" + aria-live so a screen-reader user gets a
          signal too -- there's no other visible change when this fires. */}
      {watershedSelection.error && !watershedSelection.loading && (
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-black/80 backdrop-blur-md border border-amber-400/30 text-sm text-amber-300">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4 shrink-0"
              aria-hidden="true"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            {watershedSelection.error}
          </div>
        </div>
      )}

      {/* On-map legend / active layer indicator */}
      <MapLegend
        enabledLayers={enabledLayers}
        onToggleLayer={toggleLayer}
        layerPanelOpen={layerPanelOpen}
        classFilters={classFilters}
        onToggleClassFilter={handleToggleClassFilter}
      />

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
            rendering={timeline.rendering}
            prefersReducedMotion={prefersReducedMotion()}
            activeLayerIds={activeTimelineLayers.map((l) => l.id)}
            onTogglePlay={timeline.togglePlay}
            onSetYear={timeline.setYear}
            onSetSpeed={timeline.setSpeed}
            onSetStepSize={timeline.setStepSize}
            onClose={timeline.disable}
          />
        )}

        {/* Preset chips bar. On mobile this row (4 presets + divider + Select
            + Timeline toggle) is wider than the viewport at 375px, so it
            scrolls horizontally (overflow-x-auto + momentum scroll, see
            .scrollbar-none in globals.css). `pr-14` (56px = the fixed
            bug-report button's 44px width + its 12px right offset) reserves
            trailing scroll room so the last chip never ends up scrolled
            into the button's footprint -- md:pr-2 restores the symmetric
            padding on desktop, where the centered/max-width layout never
            reaches the bug button in the first place. */}
        <div className="flex items-center gap-1.5 pl-2 pr-14 md:pr-2 py-1.5 rounded-xl bg-black/70 backdrop-blur-md border border-white/10 overflow-x-auto scrollbar-none">
          <PresetChips
            activePreset={activePreset}
            onPresetSelect={handlePresetSelect}
          />
          {/* Divider */}
          <div className="w-px h-5 bg-white/10 shrink-0" />
          {/* Select Area button inline with presets */}
          <button
            onClick={toggleDrawMode}
            title={drawActive ? "Cancel selection (Esc)" : "Select area (Alt+S)"}
            aria-label={drawActive ? "Cancel area selection" : "Select area"}
            aria-pressed={drawActive}
            aria-keyshortcuts="Alt+S"
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
          {/* Select visible area button (B3, WCAG 2.1.1) -- keyboard-reachable
              equivalent of a manual box-draw. A real <button>, so it's
              Tab-reachable and Enter/Space-activatable with no extra wiring. */}
          <button
            onClick={handleSelectVisibleArea}
            title="Select the visible map area for carbon calculation"
            aria-label="Select visible area"
            className="flex items-center gap-1.5 px-2.5 py-2 min-h-[44px] rounded-lg shrink-0 text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/5 transition-all duration-200"
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
              <rect x="3" y="5" width="18" height="14" rx="2" />
              <path d="M8 9h8M8 13h5" />
            </svg>
            Visible area
          </button>
          {/* Timeline button -- only when cutblocks is enabled */}
          {showTimelineButton && (
            <button
              onClick={() => timeline.enabled ? timeline.disable() : timeline.enable()}
              title={timeline.enabled ? "Close timeline (Esc)" : "Open timeline"}
              aria-label={timeline.enabled ? "Close timeline" : "Open timeline"}
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
            title={watershedActive ? "Cancel watershed (Esc)" : "Watershed report (Alt+W)"}
            aria-label={watershedActive ? "Cancel watershed selection" : "Watershed report"}
            aria-pressed={watershedActive}
            aria-keyshortcuts="Alt+W"
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
        calcStatus={calcStatus}
        stats={displayStats}
        areaHa={areaHa}
        visible={panelVisible}
        onClose={handlePanelClose}
        onExport={handleExport}
        onRetry={calcStatus === "error" ? onRetryCalc : undefined}
        errorInfo={calcErrorInfo}
        caveats={calcCaveats}
        watershedName={
          isWatershedSelected
            ? watershedSelection.watershed!.name
            : undefined
        }
      />
      {/* Bug report — bottom-right, persistent */}
      <a
        href={`mailto:opencanopymap@gmail.com?subject=${encodeURIComponent("Bug Report — OpenCanopy")}`}
        onClick={(e) => {
          e.preventDefault();
          const map = mapRef.current?.getMap();
          const center = map?.getCenter();
          const zoom = map?.getZoom();
          const body = [
            "Describe the issue:",
            "",
            "---",
            `Map: ${center ? `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}` : "unknown"} @ z${zoom?.toFixed(1) ?? "?"}`,
            `Layers: ${enabledLayers.join(", ") || "none"}`,
            `Preset: ${activePreset || "none"}`,
            `UA: ${navigator.userAgent}`,
            `URL: ${window.location.href}`,
          ].join("\n");
          window.location.href = `mailto:opencanopymap@gmail.com?subject=${encodeURIComponent("Bug Report — OpenCanopy")}&body=${encodeURIComponent(body)}`;
        }}
        className="fixed bottom-14 right-3 z-10 flex items-center justify-center w-11 h-11 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 text-zinc-500 hover:text-zinc-200 hover:bg-black/80 transition-colors focus-visible:ring-2 focus-visible:ring-white/30"
        title="Report a bug"
        aria-label="Report a bug"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4"
        >
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
      </a>
    </main>
    </MapErrorBoundary>
    </LoadingProvider>
  );
}
