"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { calculateFinancialValue } from "@/lib/carbon";
import type { SelectionStats, FinancialValue } from "@/lib/carbon";

interface CalculatorPanelProps {
  stats: SelectionStats | null;
  visible: boolean;
  onClose: () => void;
  message?: string | null;
  /** When provided, shows the watershed name instead of "Selected Area" */
  watershedName?: string | null;
  /** Callback to export a print-ready PDF report */
  onExport?: () => void;
}

// ── Drag-to-dismiss hook ────────────────────────────────────

function useDragDismiss(onClose: () => void, active: boolean) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef(0);
  const currentTranslateY = useRef(0);
  const isDragging = useRef(false);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!active) return;
    const touch = e.touches[0];
    dragStartY.current = touch.clientY;
    currentTranslateY.current = 0;
    isDragging.current = true;
    if (sheetRef.current) sheetRef.current.style.transition = "none";
  }, [active]);

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

// ── Animation ──────────────────────────────────────────────────────────

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function useAnimatedNumber(target: number, duration = 2000, active = true): number {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number>(0);
  const prevTargetRef = useRef(0);

  useEffect(() => {
    if (!active) { prevTargetRef.current = 0; return; }
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
      <span className="text-xs text-zinc-500">{unit}</span>
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
          {suffix && <span className="text-zinc-500">{suffix}</span>}
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

function FinancialSection({ financial }: { financial: FinancialValue }) {
  // Find max value across all bars for proportional scaling
  const allValues = [
    ...financial.carbonValues.map((cv) => cv.value),
    financial.stumpageRevenue,
  ];
  const maxValue = Math.max(...allValues, 1);

  // Teal shades for carbon bars (darkest to lightest)
  const tealShades = ["#0d9488", "#14b8a6", "#5eead4"];

  return (
    <>
      <div className="h-px bg-white/5 mb-5" />

      <div className="mb-5">
        <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">
          Value If Protected vs. Revenue If Logged
        </h3>

        <div className="space-y-3">
          {financial.carbonValues.map((cv, i) => (
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
            value={financial.stumpageRevenue}
            maxValue={maxValue}
            color="#ef4444"
          />
        </div>

        <p className="text-xs text-zinc-500 mt-3">
          Carbon values represent avoided emissions credits. Both figures are one-time.
        </p>

        {financial.ecosystemServicesAnnual > 0 && (
          <div className="mt-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/5">
            <span className="text-sm text-zinc-300 tabular-nums">{fmtCurrency(financial.ecosystemServicesAnnual)}</span>
            <span className="text-xs text-zinc-500">/yr in ecosystem services</span>
            <p className="text-[10px] text-zinc-600 mt-0.5">Water filtration, habitat, recreation (excl. carbon)</p>
          </div>
        )}

        <p className="text-[10px] text-zinc-600 mt-2">
          Carbon: BC GGIRCA + Verra/Gold Standard. Stumpage: FLNRORD tables.
          Ecosystem services: Costanza et al. 2014 (excl. carbon).
        </p>
      </div>
    </>
  );
}

// ── Main panel ─────────────────────────────────────────────────────────

export function CalculatorPanel({ stats, visible, onClose, message, watershedName, onExport }: CalculatorPanelProps) {
  const animatedCO2 = useAnimatedNumber(stats?.totalCo2eTonnes ?? 0, 2200, visible);
  const { sheetRef, handleTouchStart, handleTouchMove, handleTouchEnd } = useDragDismiss(onClose, visible);

  const handleShare = useCallback(async () => {
    if (!stats) return;
    const text = [
      `This ${fmt(stats.totalAreaHa, 0)} hectare area of BC forest stores approximately ${fmt(Math.round(stats.totalCo2eTonnes))} tonnes of CO2.`,
      `That's equivalent to ${fmt(Math.round(stats.equivalences.cars))} cars driven for a year.`,
      "",
      "Mapped with OpenCanopy",
    ].join("\n");
    try {
      if (navigator.share) { await navigator.share({ title: "OpenCanopy", text }); }
      else { await navigator.clipboard.writeText(text); }
    } catch { /* User cancelled */ }
  }, [stats]);

  return (
    <>
      {/* Desktop: right panel */}
      <div className={`hidden md:flex flex-col fixed top-0 right-0 z-20 w-[360px] h-full bg-[#111114]/95 backdrop-blur-xl border-l border-white/5 transition-transform duration-300 ease-out ${visible ? "translate-x-0" : "translate-x-full"}`}>
        <PanelContent stats={stats} animatedCO2={animatedCO2} onClose={onClose} onShare={handleShare} onExport={onExport} message={message} watershedName={watershedName} />
      </div>

      {/* Mobile: bottom sheet */}
      <div ref={sheetRef} className={`md:hidden fixed bottom-0 left-0 right-0 z-20 bg-[#111114]/95 backdrop-blur-xl border-t border-white/5 rounded-t-2xl transition-transform duration-300 ease-out max-h-[70vh] flex flex-col ${visible ? "translate-y-0" : "translate-y-full"}`}>
        <div className="flex justify-center pt-3 pb-1 shrink-0 cursor-grab active:cursor-grabbing" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>
        <div className="overflow-y-auto flex-1">
          <PanelContent stats={stats} animatedCO2={animatedCO2} onClose={onClose} onShare={handleShare} onExport={onExport} message={message} watershedName={watershedName} />
        </div>
      </div>
    </>
  );
}

// ── Panel inner content (shared between desktop/mobile) ────────────────

function PanelContent({ stats, animatedCO2, onClose, onShare, onExport, message, watershedName }: { stats: SelectionStats | null; animatedCO2: number; onClose: () => void; onShare: () => void; onExport?: () => void; message?: string | null; watershedName?: string | null }) {
  const financial = useMemo(
    () => (stats ? calculateFinancialValue(stats) : null),
    [stats]
  );
  if (!stats) return null;

  return (
    <div className="flex flex-col gap-0 p-5 overflow-y-auto flex-1">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h2 className="text-xs uppercase tracking-widest text-zinc-500 mb-1">
            {watershedName ? "Watershed" : "Selected Area"}
          </h2>
          {watershedName && (
            <p className="text-sm font-medium text-blue-400 mb-0.5">{watershedName}</p>
          )}
          <p className="text-lg font-semibold text-white tabular-nums font-[family-name:var(--font-display)]">
            {fmt(stats.totalAreaHa, 1)}{" "}
            <span className="text-sm font-normal text-zinc-400">hectares</span>
          </p>
        </div>
        <button onClick={onClose} className="flex items-center justify-center w-11 h-11 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-zinc-300 transition-colors" aria-label="Close panel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="h-px bg-white/5 mb-5" />

      {message && stats.featureCount === 0 && (
        <div className="text-sm text-zinc-400 text-center mb-5">{message}</div>
      )}

      <div className="text-center mb-5">
        <div className="text-3xl font-bold text-white tabular-nums font-[family-name:var(--font-display)]">{fmt(animatedCO2)}</div>
        <div className="text-sm text-zinc-400 mt-1">tonnes CO<sub>2</sub> stored in this area</div>
        <div className="text-[10px] text-zinc-600 mt-0.5">{stats.featureCount} forest polygons analyzed</div>
      </div>

      <div className="h-px bg-white/5 mb-5" />

      <div className="mb-5">
        <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">Breakdown</h3>
        <div className="space-y-3">
          <AgeBar label="Old growth (250+ yr)" value={stats.oldGrowthHa} total={stats.totalAreaHa} color="#15803d" />
          <AgeBar label="Mature (80-250 yr)" value={stats.matureHa} total={stats.totalAreaHa} color="#4ade80" />
          <AgeBar label="Young (<80 yr)" value={stats.youngHa} total={stats.totalAreaHa} color="#f97316" />
          <AgeBar label="Harvested" value={stats.harvestedHa} total={stats.totalAreaHa} color="#ef4444" />
          <AgeBar label="Unknown age" value={stats.unknownHa} total={stats.totalAreaHa} color="#71717a" />
        </div>
      </div>

      <div className="h-px bg-white/5 mb-5" />

      <div className="mb-5">
        <h3 className="text-[10px] uppercase tracking-widest text-zinc-500 mb-3">That is equivalent to</h3>
        <div className="space-y-2.5">
          <EquivRow icon={<CarIcon />} value={stats.equivalences.cars} unit="cars driven for a year" />
          <EquivRow icon={<HomeIcon />} value={stats.equivalences.homes} unit="Canadian homes for a year" />
          <EquivRow icon={<PlaneIcon />} value={stats.equivalences.flights} unit="YVR-YYZ round trips" />
        </div>
      </div>

      {financial && <FinancialSection financial={financial} />}

      <p className="text-xs text-zinc-500 mt-1">Estimates are approximate. Accuracy improves at higher zoom levels.</p>

      <div className="flex-1" />

      <div className="flex gap-2 pt-4 border-t border-white/5">
        {onExport && (
          <button onClick={onExport} className="flex-1 py-3 px-3 min-h-[44px] rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-300 text-sm hover:bg-teal-500/20 transition-colors">Export</button>
        )}
        <button onClick={onShare} className="flex-1 py-3 px-3 min-h-[44px] rounded-lg bg-white/5 border border-white/10 text-zinc-300 text-sm hover:bg-white/10 transition-colors">Share</button>
        <button onClick={onClose} className="flex-1 py-3 px-3 min-h-[44px] rounded-lg bg-white/5 border border-white/10 text-zinc-400 text-sm hover:bg-white/10 transition-colors">Clear</button>
      </div>
    </div>
  );
}
