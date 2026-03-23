"use client";

interface NarrativePanelProps {
  heading: string;
  subheading?: string;
  body?: string;
  active: boolean;
  position: "left" | "center";
  children?: React.ReactNode;
}

export function NarrativePanel({
  heading,
  subheading,
  body,
  active,
  position,
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

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-10 ${positionClasses}`}
      aria-hidden={!active}
    >
      <div
        className={`pointer-events-auto bg-[var(--color-surface-overlay)] backdrop-blur-xl border border-white/10 rounded-2xl p-8 narrative-panel ${cardPositionClasses}`}
        style={{
          opacity: active ? 1 : 0,
          transform: active ? "none" : "translateY(12px)",
          transition: "opacity 500ms ease, transform 500ms ease",
        }}
      >
        <h2
          className="text-2xl md:text-3xl font-bold text-white tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {heading}
        </h2>
        {subheading && (
          <p className="mt-3 text-lg text-zinc-300">{subheading}</p>
        )}
        {body && <p className="mt-4 text-base text-zinc-400 leading-relaxed">{body}</p>}
        {children && <div className="mt-6">{children}</div>}
      </div>
    </div>
  );
}
