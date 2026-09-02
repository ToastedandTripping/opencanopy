"use client";

import { LAYER_PRESETS } from "@/lib/layers";

interface PresetChipsProps {
  activePreset: string | null;
  onPresetSelect: (presetId: string) => void;
}

const ICONS: Record<string, string> = {
  eye: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
  shield:
    "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  flame:
    "M12 12.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7zM8.5 8.5A7 7 0 0112 2c0 3.5 3 5.5 3 9a7 7 0 11-6.5-2.5z",
  hammer:
    "M15.5 4.5l4 4-8 8-4-4 8-8zM3 21l4-4M14.5 5.5l4 4",
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
                  ? "bg-emerald-500/20 text-white border border-emerald-400/40"
                  : "bg-transparent text-zinc-500 border border-white/5 hover:bg-white/10 hover:text-zinc-200"
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
            {isActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
            )}
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
