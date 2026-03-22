"use client";

import { LAYER_PRESETS } from "@/lib/layers";

interface PresetChipsProps {
  activePreset: string | null;
  onPresetSelect: (presetId: string) => void;
}

const ICONS: Record<string, string> = {
  eye: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
  "alert-triangle":
    "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z",
  leaf: "M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75",
  shield:
    "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  target:
    "M12 2a10 10 0 100 20 10 10 0 000-20zm0 4a6 6 0 100 12 6 6 0 000-12zm0 4a2 2 0 100 4 2 2 0 000-4z",
  flame:
    "M12 12.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM8.5 8.5A7 7 0 0112 2c0 3.5 3 5.5 3 9a7 7 0 11-6.5-2.5z",
  hammer:
    "M15.5 4.5l4 4-8 8-4-4 8-8zM3 21l4-4M14.5 5.5l4 4",
  droplet:
    "M12 2.69l5.66 5.66a8 8 0 11-11.31 0L12 2.69z",
  paw:
    "M12 18a4 4 0 01-4-4c0-2.5 4-6 4-6s4 3.5 4 6a4 4 0 01-4 4zM7 8a2 2 0 11-4 0 2 2 0 014 0zM21 8a2 2 0 11-4 0 2 2 0 014 0zM16.5 4a2 2 0 11-4 0 2 2 0 014 0zM11.5 4a2 2 0 11-4 0 2 2 0 014 0z",
  gap: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM12 9v2m0 4h.01",
};

/**
 * Horizontal bar of preset chips for quickly switching layer combinations.
 * Displayed at the bottom center of the map.
 */
export function PresetChips({ activePreset, onPresetSelect }: PresetChipsProps) {
  return (
    <div className="flex gap-2">
      {LAYER_PRESETS.map((preset) => {
        const isActive = activePreset === preset.id;
        return (
          <button
            key={preset.id}
            onClick={() => onPresetSelect(preset.id)}
            title={preset.description}
            aria-pressed={isActive}
            className={`
              flex items-center gap-1.5 px-3 py-2 min-h-[44px] rounded-full text-xs font-medium
              transition-all duration-200 shrink-0 whitespace-nowrap
              focus-visible:ring-2 focus-visible:ring-white/30
              ${
                isActive
                  ? "bg-white/15 text-white border border-white/20"
                  : "bg-white/5 text-zinc-400 border border-white/5 hover:bg-white/10 hover:text-zinc-200"
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
              className="w-3.5 h-3.5"
            >
              <path d={ICONS[preset.icon] || ICONS.eye} />
            </svg>
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
