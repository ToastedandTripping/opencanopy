"use client";

import { useRef, useCallback } from "react";
import { HOT_SPOTS, type HotSpot } from "@/data/hotspots";

// ── Types ───────────────────────────────────────────────────

interface HotSpotPanelProps {
  onSelect: (hotspot: HotSpot) => void;
  onClose: () => void;
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
    if (sheetRef.current) sheetRef.current.style.transition = "none";
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

// ── Hot spot card ───────────────────────────────────────────

function HotSpotCard({ hotspot, onSelect }: { hotspot: HotSpot; onSelect: () => void }) {
  return (
    <div className="group px-4 py-3 hover:bg-white/[0.03] transition-colors">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-emerald-400">
              <path d="M12 22V8m0 0l4 4m-4-4l-4 4M7 3l5 5 5-5" />
            </svg>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-zinc-200 mb-0.5">{hotspot.name}</h3>
          <p className="text-xs text-zinc-500 leading-relaxed mb-2">{hotspot.description}</p>
          {hotspot.stats?.oldGrowthHa && (
            <div className="flex items-center gap-1.5 mb-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500/60" />
              <span className="text-[10px] text-zinc-500">{hotspot.stats.oldGrowthHa.toLocaleString()} ha old growth</span>
            </div>
          )}
          <button
            onClick={onSelect}
            className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-lg bg-white/5 border border-white/10 text-xs text-zinc-300 hover:bg-white/10 hover:text-white transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-3 h-3">
              <circle cx="12" cy="12" r="10" />
              <path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" />
            </svg>
            Explore
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main panel ──────────────────────────────────────────────

export function HotSpotPanel({ onSelect, onClose }: HotSpotPanelProps) {
  const { sheetRef, handleTouchStart, handleTouchMove, handleTouchEnd } = useDragDismiss(onClose);

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-20 md:hidden" onClick={onClose} />

      {/* Desktop panel */}
      <div className="hidden md:flex flex-col fixed z-30 top-0 right-0 h-full w-80 bg-black/80 backdrop-blur-xl border-l border-white/10 overflow-hidden animate-in-right">
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200 tracking-wide">Discover</h2>
            <p className="text-[10px] text-zinc-500 mt-0.5">Notable conservation areas in BC</p>
          </div>
          <button onClick={onClose} className="flex items-center justify-center w-11 h-11 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-colors" aria-label="Close discover panel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1 divide-y divide-white/5">
          {HOT_SPOTS.map((hotspot) => (
            <HotSpotCard key={hotspot.id} hotspot={hotspot} onSelect={() => onSelect(hotspot)} />
          ))}
        </div>
        <div className="px-4 py-2 border-t border-white/5 shrink-0">
          <p className="text-[10px] text-zinc-600">{HOT_SPOTS.length} locations</p>
        </div>
      </div>

      {/* Mobile bottom sheet */}
      <div ref={sheetRef} className="md:hidden fixed z-30 bottom-0 left-0 right-0 h-[50vh] bg-black/80 backdrop-blur-xl border-t border-white/10 rounded-t-2xl flex flex-col overflow-hidden animate-in">
        <div className="flex justify-center pt-3 pb-1 shrink-0 cursor-grab active:cursor-grabbing" onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-zinc-200 tracking-wide">Discover</h2>
            <p className="text-[10px] text-zinc-500 mt-0.5">Notable conservation areas in BC</p>
          </div>
          <button onClick={onClose} className="flex items-center justify-center w-11 h-11 rounded-md hover:bg-white/10 text-zinc-400 hover:text-white transition-colors" aria-label="Close discover panel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1 divide-y divide-white/5">
          {HOT_SPOTS.map((hotspot) => (
            <HotSpotCard key={hotspot.id} hotspot={hotspot} onSelect={() => onSelect(hotspot)} />
          ))}
        </div>
        <div className="px-4 py-2 border-t border-white/5 shrink-0">
          <p className="text-[10px] text-zinc-600">{HOT_SPOTS.length} locations</p>
        </div>
      </div>
    </>
  );
}
