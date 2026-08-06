"use client";

import { prefersReducedMotion } from "@/lib/a11y/reduced-motion";

interface NarrativePanelProps {
  heading: string;
  subheading?: string;
  body?: string;
  citation?: string;
  active: boolean;
  position: "left" | "center";
  /**
   * Font weight for the heading. Accepts Tailwind weight names.
   * Default: "semibold" (600) — preserved for all existing chapters.
   * Pass "normal" for the "remains" chapter's contemplative closing line.
   */
  headingWeight?: "semibold" | "normal";
  children?: React.ReactNode;
}

export function NarrativePanel({
  heading,
  subheading,
  body,
  citation,
  active,
  position,
  headingWeight = "semibold",
  children,
}: NarrativePanelProps) {
  const positionClasses =
    position === "center"
      ? "flex items-end md:items-center justify-center pb-[max(2rem,env(safe-area-inset-bottom,2rem))] md:pb-0"
      : "flex items-end md:items-center justify-start pb-[max(2rem,env(safe-area-inset-bottom,2rem))] md:pb-0";

  const cardPositionClasses =
    position === "center"
      ? "max-w-lg mx-auto text-center"
      : "max-w-md ml-6 mr-6 md:ml-12 md:mr-0";

  // Transition styles gated on prefers-reduced-motion.
  // When reduced motion is preferred: no animation, just instant opacity snap.
  // This applies to ALL chapters, not just "remains".
  const cardStyle = prefersReducedMotion()
    ? {
        opacity: active ? 1 : 0,
        transform: "none",
        transition: "none",
      }
    : {
        opacity: active ? 1 : 0,
        transform: active ? "none" : "translateY(12px)",
        transition: active
          ? "opacity 500ms cubic-bezier(0.16, 1, 0.3, 1), transform 500ms cubic-bezier(0.16, 1, 0.3, 1)"
          : "opacity 200ms cubic-bezier(0.4, 0, 1, 1), transform 200ms cubic-bezier(0.4, 0, 1, 1)",
      };

  const headingWeightClass = headingWeight === "normal" ? "font-normal" : "font-semibold";

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-10 ${positionClasses}`}
    >
      <div
        className={`pointer-events-auto bg-[var(--color-surface-overlay)] backdrop-blur-xl border border-white/[0.12] rounded-2xl p-8 narrative-panel ${cardPositionClasses}`}
        style={cardStyle}
      >
        <h2
          className={`text-2xl md:text-3xl ${headingWeightClass} text-white tracking-normal`}
          style={{ fontFamily: "var(--font-display)" }}
        >
          {heading}
        </h2>
        {subheading && (
          <p className="mt-3 text-lg text-zinc-300">{subheading}</p>
        )}
        {body && <p className="mt-4 text-base text-zinc-400 leading-relaxed">{body}</p>}
        {citation && (
          <p className="mt-4 text-xs text-zinc-400 italic">
            <cite>{citation}</cite>
          </p>
        )}
        {children && <div className="mt-6">{children}</div>}
      </div>
    </div>
  );
}
