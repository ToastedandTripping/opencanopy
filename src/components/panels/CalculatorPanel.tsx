"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  calculateEquivalences,
  calculateFinancialValue,
  presentCo2Tonnes,
  presentDollars,
} from "@/lib/carbon";
import type { SelectionStats, FinancialValue } from "@/lib/carbon";
import { useDragDismiss } from "@/hooks/useDragDismiss";
import FOREST_AGE_PALETTE from "@/lib/layers/forest-age-palette.json";

// ── Calc state machine (shared with page.tsx) ───────────────────────────
//
// The headline is a function of `calcStatus`, NEVER of
// `stats.totalCo2eTonnes` -- that value is 0 in both the real-zero case and
// the no-data case, and conflating them was the original defect (a
// confident, shareable "0 tonnes" for ocean/empty selections). See the
// relay plan (jazzy-gathering-codd) state-machine table for the full
// trigger -> copy mapping this file implements.

export type CalcStatus = "loading" | "ok" | "no-data" | "error" | "too-large";

export interface CalcErrorInfo {
  message: string;
  /** Absolute epoch-ms deadline (Date.now() + Retry-After seconds, computed
   *  once by the caller when the error occurs) after which "try again"
   *  re-enables. An absolute timestamp -- rather than a relative seconds
   *  count synced into local state -- lets the countdown be derived by pure
   *  arithmetic during render, with no ref reads/writes or setState calls
   *  in an effect body (both disallowed under this project's React
   *  Compiler lint rules: react-hooks/refs, react-hooks/set-state-in-effect). */
  retryAvailableAt?: number;
}

export interface CalcCaveats {
  /** Defensive backstop only (features.length >= CAP - margin) -- the real
   *  defense against truncation is the pre-fetch area guard. Kept as a
   *  belt-and-suspenders caveat in case it ever fires. */
  truncated: boolean;
  /** Fraction of fetched features that hit the clip's per-feature
   *  try/catch path (self-intersecting/degenerate VRI rings). Above ~5% the
   *  panel discloses that some polygons couldn't be precisely measured. */
  skippedFraction: number;
}

interface CalculatorPanelProps {
  calcStatus: CalcStatus | null;
  /** Populated only when calcStatus === "ok". */
  stats: SelectionStats | null;
  /** Header hectare figure. Null hides the area line entirely (a draw
   *  selection refused by the guard has no defensible area to show). For
   *  watershed this is the official AREA_HA (shown even while carbon reads
   *  "too-large" -- Core-8); for a completed draw calc it's the clipped
   *  forested area, labelled accordingly below. */
  areaHa: number | null;
  visible: boolean;
  onClose: () => void;
  /** Present only in the "error" state. */
  onRetry?: () => void;
  errorInfo?: CalcErrorInfo | null;
  caveats?: CalcCaveats | null;
  /** When provided, shows the watershed name instead of "Selected Area" */
  watershedName?: string | null;
  /** Callback to export a print-ready PDF report */
  onExport?: () => void;
}

// ── Animation ──────────────────────────────────────────────────────────

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

import { prefersReducedMotion } from "@/lib/a11y/reduced-motion";

function useAnimatedNumber(target: number, duration = 2000, active = true): number {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number>(0);
  const prevTargetRef = useRef(0);

  useEffect(() => {
    if (!active) { prevTargetRef.current = 0; return; }
    if (prefersReducedMotion()) {
      // Jump straight to the final value -- no count-up (a11y, critic #10).
      // matchMedia is an effect-only read (the purity rule bars it from the
      // render body), so the resulting setState has to live here too; this
      // mirrors the setState-in-effect precedent in
      // useLayerState.ts/useTimeline.ts, both of which disable the same
      // rule for the same "synchronize with an external, non-derivable
      // value" reason.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDisplay(target);
      prevTargetRef.current = target;
      return;
    }
    const from = prevTargetRef.current;
    const delta = target - from;
    let startTime = 0;
    const tick = (now: number) => {
      if (!startTime) startTime = now;
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      setDisplay(Math.round(from + delta * eased));
      if (progress < 1) { frameRef.current = requestAnimationFrame(tick); }
      else { prevTargetRef.current = target; }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current); };
  }, [target, duration, active]);

  if (!active) return 0;
  return display;
}

/** Ticks down to `retryAvailableAt` (an absolute epoch-ms deadline, computed
 *  once by the caller from the proxy's Retry-After header) so "try again"
 *  is briefly disabled with a real countdown instead of an arbitrary guess.
 *
 *  Mounted fresh (via `key={retryAvailableAt}` at the call site below) for
 *  every new error, so the initial value can come from a useState lazy
 *  initializer -- the one place a "read the clock once" computation is
 *  sanctioned -- instead of a ref comparison or a setState call directly in
 *  an effect body, both of which this project's React Compiler lint rules
 *  disallow (react-hooks/refs, react-hooks/set-state-in-effect,
 *  react-hooks/purity: Date.now() is impure and can't be called in the
 *  render body itself). Ticking after mount only ever calls setState from
 *  inside the interval callback, which is the sanctioned "subscribe to an
 *  external timer" effect shape. */
function useRetryCountdown(retryAvailableAt: number | undefined): number {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    retryAvailableAt ? Math.max(0, Math.ceil((retryAvailableAt - Date.now()) / 1000)) : 0
  );

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const interval = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
    // Intentionally mount-only: this hook remounts fresh per error via the
    // `key` at the call site (RetryButton), and ticking every second is
    // handled by the interval's own functional setState update above, not
    // by resubscribing on every secondsLeft change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return secondsLeft;
}

/** The error state's "try again" affordance. A distinct component (rather
 *  than inlining useRetryCountdown in PanelContent) so it can be mounted
 *  fresh per error via `key={retryAvailableAt}` at the call site. */
function RetryButton({
  retryAvailableAt,
  onRetry,
}: {
  retryAvailableAt: number | undefined;
  onRetry: () => void;
}) {
  const secondsLeft = useRetryCountdown(retryAvailableAt);
  return (
    <button
      onClick={onRetry}
      disabled={secondsLeft > 0}
      className="py-2 px-4 min-h-[40px] rounded-lg bg-white/5 border border-white/10 text-zinc-300 text-sm hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    >
      {secondsLeft > 0 ? `Try again in ${secondsLeft}s` : "Try again"}
    </button>
  );
}

// ── Formatting ─────────────────────────────────────────────────────────

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("en-CA", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtCurrency(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}M`;
  }
  return `$${fmt(Math.round(n))}`;
}

// ── Age class bar ──────────────────────────────────────────────────────

function AgeBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  if (value < 0.01) return null;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="text-zinc-300 tabular-nums">{fmt(value, 1)} ha</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// ── Equivalence row ────────────────────────────────────────────────────

function EquivRow({ icon, value, unit }: { icon: React.ReactNode; value: number; unit: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-5 h-5 flex items-center justify-center text-zinc-500 shrink-0">{icon}</div>
      <span className="text-sm text-zinc-200 tabular-nums font-medium">{fmt(Math.round(value))}</span>
      <span className="text-xs text-zinc-400">{unit}</span>
    </div>
  );
}

// ── Small SVG icons ────────────────────────────────────────────────────

function CarIcon() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M5 17h14M5 17a2 2 0 01-2-2V9a2 2 0 012-2h1l2-3h8l2 3h1a2 2 0 012 2v6a2 2 0 01-2 2M5 17a1 1 0 100 2 1 1 0 000-2zm14 0a1 1 0 100 2 1 1 0 000-2z" /></svg>);
}
function HomeIcon() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h3a1 1 0 001-1V10" /></svg>);
}
function PlaneIcon() {
  return (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" /></svg>);
}
function SpinnerIcon() {
  return (
    <svg className="w-5 h-5 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Financial value bar ───────────────────────────────────────────────

function ValueBar({
  label,
  value,
  maxValue,
  color,
  suffix,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  suffix?: string;
}) {
  const pct = maxValue > 0 ? Math.max((value / maxValue) * 100, 1) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-zinc-400">{label}</span>
        <span className="text-zinc-300 tabular-nums">
          {fmtCurrency(value)}
          {suffix && <span className="text-zinc-400">{suffix}</span>}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ── Financial section ────────────────────────────────────────────────
//
// Dollar figures inherit ballpark per-hectare rates (markets.ts) -- a
// to-the-dollar figure implies precision the inputs don't have (critic X4).
// presentDollars rounds each value to ~2 significant figures for display;
// the underlying FinancialValue math (calculateFinancialValue) is unchanged.

function FinancialSection({ financial }: { financial: FinancialValue }) {
  const roundedCarbonValues = financial.carbonValues.map((cv) => ({
    ...cv,
    value: presentDollars(cv.value),
  }));
  const roundedStumpage = presentDollars(financial.stumpageRevenue);
  const roundedEcosystem = presentDollars(financial.ecosystemServicesAnnual);

  const allValues = [...roundedCarbonValues.map((cv) => cv.value), roundedStumpage];
  const maxValue = Math.max(...allValues, 1);

  // Teal shades for carbon bars (darkest to lightest)
  const tealShades = ["#0d9488", "#14b8a6", "#5eead4"];

  return (
    <>
      <div className="h-px bg-white/5 mb-5" />

      <div className="mb-5">
        <h3 className="text-[10px] uppercase tracking-widest text-zinc-400 mb-3">
          Value If Protected vs. Revenue If Logged
        </h3>

        <div className="space-y-3">
          {roundedCarbonValues.map((cv, i) => (
            <ValueBar
              key={cv.market}
              label={cv.market}
              value={cv.value}
              maxValue={maxValue}
              color={tealShades[i] ?? tealShades[tealShades.length - 1]}
            />
          ))}
          <ValueBar
            label="Logging revenue"
            value={roundedStumpage}
            maxValue={maxValue}
            color="#ef4444"
          />
        </div>

        <p className="text-xs text-zinc-400 mt-3">
          Carbon values represent avoided emissions credits. Both figures are one-time,
          rounded estimates. Compliance-market pricing applies to regulated emitters; a
          landowner selling forest-carbon credits would typically access voluntary-market
          rates.
        </p>

        {roundedEcosystem > 0 && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5">
            <span className="text-sm text-zinc-300 tabular-nums">{fmtCurrency(roundedEcosystem)}</span>
            <span className="text-xs text-zinc-400">/yr in ecosystem services</span>
            <p className="text-[10px] text-zinc-400 mt-0.5">Water filtration, habitat, recreation (excl. carbon)</p>
          </div>
        )}

        <p className="text-[10px] text-zinc-400 mt-2">
          Carbon: BC GGIRCA + Verra/Gold Standard. Stumpage: FLNRORD tables.
          Ecosystem services: Costanza et al. 2014 (excl. carbon).
        </p>
      </div>
    </>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────

export function CalculatorPanel({
  calcStatus,
  stats,
  areaHa,
  visible,
  onClose,
  onRetry,
  errorInfo,
  caveats,
  watershedName,
  onExport,
}: CalculatorPanelProps) {
  const isOk = calcStatus === "ok" && stats !== null;
  const co2 = useMemo(() => (isOk ? presentCo2Tonnes(stats!.totalCo2eTonnes) : null), [isOk, stats]);
  const animatedCO2 = useAnimatedNumber(co2?.rounded ?? 0, 2200, isOk);
  const { sheetRef, handleTouchStart, handleTouchMove, handleTouchEnd } = useDragDismiss(onClose, visible);

  const handleShare = useCallback(async () => {
    if (!isOk || !stats || !co2) return; // status-gated (X4): never share a loading/no-data/error/too-large state
    // Derived from co2.rounded, NOT stats.equivalences (which is computed
    // off the raw, un-rounded tonnage) -- keeps the shared car count
    // self-consistent with the rounded tonnage headline above it.
    const equiv = calculateEquivalences(co2.rounded);
    const lines = [
      `This ${fmt(areaHa ?? stats.totalAreaHa, 0)} hectare forested area of BC stores approximately ${fmt(co2.rounded)} tonnes of CO2 (may be up to ~20% lower).`,
      `That's equivalent to ${fmt(Math.round(equiv.cars))} cars driven for a year.`,
    ];
    if (caveats?.truncated) {
      lines.push("Note: this is a large selection -- the estimate may undercount.");
    }
    if (caveats && caveats.skippedFraction > 0.05) {
      lines.push("Note: some polygons in this area couldn't be precisely measured.");
    }
    lines.push("", "Mapped with OpenCanopy");
    const text = lines.join("\n");
    try {
      if (navigator.share) { await navigator.share({ title: "OpenCanopy", text }); }
      else { await navigator.clipboard.writeText(text); }
    } catch { /* User cancelled */ }
  }, [isOk, stats, co2, areaHa, caveats]);

  const handleExportClick = useCallback(() => {
    if (!isOk || !onExport) return; // status-gated (X4): PDF never generated from a bad/loading state
    onExport();
  }, [isOk, onExport]);

  return (
    <>
      {/* Desktop: right panel */}
      <div className={`hidden md:flex flex-col fixed top-0 right-0 z-20 w-[360px] h-full bg-[#111114]/95 backdrop-blur-xl border-l border-white/5 transition-transform duration-300 ease-out ${visible ? "translate-x-0" : "translate-x-full"}`}>
        <PanelContent
          calcStatus={calcStatus}
          stats={stats}
          areaHa={areaHa}
          co2={co2}
          animatedCO2={animatedCO2}
          onClose={onClose}
          onShare={handleShare}
          onExport={onExport ? handleExportClick : undefined}
          onRetry={onRetry}
          errorInfo={errorInfo}
          caveats={caveats}
          watershedName={watershedName}
        />
      </div>

      {/* Mobile: bottom sheet */}
      <div ref={sheetRef} className={`md:hidden fixed bottom-0 left-0 right-0 z-20 bg-[#111114]/95 backdrop-blur-xl border-t border-white/5 rounded-t-2xl transition-transform duration-300 ease-out max-h-[70vh] flex flex-col ${visible ? "translate-y-0" : "translate-y-full"}`}>
        <div className="flex justify-center pt-3 pb-1 shrink-0 cursor-grab active:cursor-grabbing" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>
        <div className="overflow-y-auto flex-1">
          <PanelContent
            calcStatus={calcStatus}
            stats={stats}
            areaHa={areaHa}
            co2={co2}
            animatedCO2={animatedCO2}
            onClose={onClose}
            onShare={handleShare}
            onExport={onExport ? handleExportClick : undefined}
            onRetry={onRetry}
            errorInfo={errorInfo}
            caveats={caveats}
            watershedName={watershedName}
          />
        </div>
      </div>
    </>
  );
}

// ── Panel inner content (shared between desktop/mobile) ────────────────

interface PanelContentProps {
  calcStatus: CalcStatus | null;
  stats: SelectionStats | null;
  areaHa: number | null;
  co2: { rounded: number; bandLow: number } | null;
  animatedCO2: number;
  onClose: () => void;
  onShare: () => void;
  onExport?: () => void;
  onRetry?: () => void;
  errorInfo?: CalcErrorInfo | null;
  caveats?: CalcCaveats | null;
  watershedName?: string | null;
}

function PanelContent({
  calcStatus,
  stats,
  areaHa,
  co2,
  animatedCO2,
  onClose,
  onShare,
  onExport,
  onRetry,
  errorInfo,
  caveats,
  watershedName,
}: PanelContentProps) {
  const financial = useMemo(
    () => (calcStatus === "ok" && stats ? calculateFinancialValue(stats) : null),
    [calcStatus, stats]
  );
  // Derived from co2.rounded, NOT stats.equivalences (which is computed off
  // the raw, un-rounded tonnage) -- keeps the displayed car/home/flight
  // counts self-consistent with the rounded headline tonnage shown above
  // them (critic X4).
  const equiv = useMemo(() => (co2 ? calculateEquivalences(co2.rounded) : null), [co2]);

  if (calcStatus === null) return null;

  const isOk = calcStatus === "ok" && stats !== null && co2 !== null;
  // Watershed carbon is DESCOPED for every watershed (page.tsx sets
  // "too-large" unconditionally on selection, not as a size gate -- see
  // that effect's comment) -- no smaller watershed would ever succeed, and
  // the user picked a watershed, they didn't draw. A message that tells
  // them to "draw a smaller area" misattributes the cause (the exact
  // honesty defect this relay exists to fix). The draw path's message cites
  // the real guard threshold instead of a vague instruction.
  const tooLargeMessage = watershedName
    ? "Carbon estimates aren't available for watersheds yet — try drawing a custom area on the map instead."
    : "Area too large (max ~500 km²) — draw a smaller area.";

  return (
    <div className="flex flex-col gap-0 p-5 overflow-y-auto flex-1">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-xs uppercase tracking-widest text-zinc-400 mb-1">
            {watershedName ? "Watershed" : "Selected Area"}
          </h2>
          {watershedName && (
            <p className="text-sm font-medium text-blue-400 mb-0.5">{watershedName}</p>
          )}
          {areaHa !== null && (
            <p className="text-lg font-semibold text-white tabular-nums font-[family-name:var(--font-display)]">
              {fmt(areaHa, 1)}{" "}
              <span className="text-sm font-normal text-zinc-400">
                {watershedName ? "hectares" : "hectares (forested area analyzed)"}
              </span>
            </p>
          )}
        </div>
        <button onClick={onClose} className="flex items-center justify-center w-11 h-11 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors" aria-label="Close panel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="h-px bg-white/5 mb-5" />

      {/* aria-live: a screen-reader user gets no other signal when a calc
          resolves to one of these states -- there's no focus move and no
          visible change outside this panel (a11y, critic #9). */}
      <div role="status" aria-live="polite">
        {calcStatus === "loading" && (
          <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <SpinnerIcon />
            <div className="text-sm text-zinc-400">Calculating…</div>
            <div className="text-xs text-zinc-400">This can take up to 20 seconds for larger areas.</div>
          </div>
        )}

        {calcStatus === "no-data" && (
          <div className="text-sm text-zinc-400 text-center py-10">
            No forest data in this area.
          </div>
        )}

        {calcStatus === "error" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div className="text-sm text-zinc-400">{errorInfo?.message ?? "Forest data unavailable — try again."}</div>
            {onRetry && (
              // Keyed on the deadline so a NEW error (new retryAvailableAt)
              // remounts this button with a fresh countdown -- see
              // useRetryCountdown's comment for why this is the mount, not a
              // ref/effect-setState, boundary.
              <RetryButton
                key={errorInfo?.retryAvailableAt ?? "none"}
                retryAvailableAt={errorInfo?.retryAvailableAt}
                onRetry={onRetry}
              />
            )}
          </div>
        )}

        {calcStatus === "too-large" && (
          <div className="text-sm text-zinc-400 text-center py-10">{tooLargeMessage}</div>
        )}
      </div>

      {isOk && stats && co2 && (
        <>
          <div className="text-center mb-5">
            <div className="text-3xl font-bold text-white tabular-nums font-[family-name:var(--font-display)]">{fmt(animatedCO2)}</div>
            <div className="text-sm text-zinc-400 mt-1">tonnes CO<sub>2</sub> stored in this area</div>
            <div className="text-xs text-zinc-400 mt-1">may be as low as {fmt(co2.bandLow)} tonnes</div>
            <div className="text-[10px] text-zinc-400 mt-0.5">{stats.featureCount} forest polygons analyzed</div>
          </div>

          {caveats?.truncated && (
            <div className="text-xs text-amber-400/90 text-center mb-4 px-2">
              This is a large selection — the estimate may undercount.
            </div>
          )}
          {caveats && caveats.skippedFraction > 0.05 && (
            <div className="text-xs text-amber-400/90 text-center mb-4 px-2">
              Some polygons in this area couldn&apos;t be precisely measured.
            </div>
          )}

          <div className="h-px bg-white/5 mb-5" />

          <div className="mb-5">
            <h3 className="text-[10px] uppercase tracking-widest text-zinc-400 mb-3">Breakdown</h3>
            <div className="space-y-3">
              <AgeBar label="Old growth (250+ yr)" value={stats.oldGrowthHa} total={stats.totalAreaHa} color={FOREST_AGE_PALETTE["old-growth"]} />
              <AgeBar label="Mature (80-250 yr)" value={stats.matureHa} total={stats.totalAreaHa} color="#4ade80" />
              <AgeBar label="Young (<80 yr)" value={stats.youngHa} total={stats.totalAreaHa} color="#f97316" />
              <AgeBar label="Harvested" value={stats.harvestedHa} total={stats.totalAreaHa} color="#ef4444" />
              <AgeBar label="Unknown age" value={stats.unknownHa} total={stats.totalAreaHa} color="#71717a" />
            </div>
          </div>

          <div className="h-px bg-white/5 mb-5" />

          <div className="mb-5">
            <h3 className="text-[10px] uppercase tracking-widest text-zinc-400 mb-3">That is equivalent to (approx.)</h3>
            <div className="space-y-2.5">
              <EquivRow icon={<CarIcon />} value={equiv?.cars ?? 0} unit="cars driven for a year" />
              <EquivRow icon={<HomeIcon />} value={equiv?.homes ?? 0} unit="Canadian homes for a year" />
              <EquivRow icon={<PlaneIcon />} value={equiv?.flights ?? 0} unit="YVR-YYZ round trips" />
            </div>
          </div>

          {financial && <FinancialSection financial={financial} />}

          <p className="text-xs text-zinc-400 mt-1">
            Approximate — may overestimate by up to ~20%. Calculated from official BC government
            forest inventory data.
          </p>

          {/* Real affordance replacing the dead "(see methodology)" text --
              the panel now discloses the same plain-language basics the PDF
              footer already carries (critic #4). */}
          <details className="mt-2">
            <summary className="text-xs text-zinc-400 underline decoration-dotted underline-offset-2 cursor-pointer select-none">
              How this is calculated
            </summary>
            <div className="mt-2 space-y-1.5 text-[11px] text-zinc-400 leading-relaxed">
              <p>
                Carbon is estimated per forest polygon from BC&apos;s Vegetation Resource
                Inventory (VRI) — the province&apos;s official forest data — using species and
                stand age.
              </p>
              <p>
                Growth follows a standard curve: carbon builds up quickly in young stands, then
                levels off toward maturity, calibrated from published forest-carbon research.
              </p>
              <p>
                These are upper-range ecosystem estimates (soil and root carbon included, not
                just merchantable timber), so they may overestimate by 10–20% compared to more
                conservative figures.
              </p>
            </div>
          </details>
        </>
      )}

      <div className="flex-1" />

      <div className="flex gap-2 pt-4 border-t border-white/5">
        {onExport && (
          <button
            onClick={onExport}
            disabled={!isOk}
            className="flex-1 py-3 px-3 min-h-[44px] rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-300 text-sm hover:bg-teal-500/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-teal-500/10"
          >
            Export
          </button>
        )}
        <button
          onClick={onShare}
          disabled={!isOk}
          className="flex-1 py-3 px-3 min-h-[44px] rounded-lg bg-white/5 border border-white/10 text-zinc-300 text-sm hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-white/5"
        >
          Share
        </button>
        <button onClick={onClose} className="flex-1 py-3 px-3 min-h-[44px] rounded-lg bg-white/5 border border-white/10 text-zinc-400 text-sm hover:bg-white/10 transition-colors">Clear</button>
      </div>
    </div>
  );
}
