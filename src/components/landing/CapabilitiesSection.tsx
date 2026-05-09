"use client";

const CAPABILITIES = [
  {
    title: "See",
    body: "18 data layers: forest age, cutblocks, fire history, parks, conservancies, species at risk, mining claims, forestry roads. All from BC government.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
        <circle cx="12" cy="12" r="3" />
        <path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8-10-8-10-8z" />
      </svg>
    ),
  },
  {
    title: "Measure",
    body: "Draw a box or select a watershed. See tonnes of CO2 stored, equivalent cars, homes, flights. Species-specific carbon models.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
        <path d="M4 7V4h3M20 7V4h-3M4 17v3h3M20 17v3h-3" />
      </svg>
    ),
  },
  {
    title: "Share",
    body: "Every view is a URL. Send exact locations and layer configurations to colleagues, media, or council.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
] as const;

export function CapabilitiesSection() {
  return (
    <section className="relative z-10 bg-[var(--color-surface-1)] py-36 md:py-48">
      <div className="max-w-4xl mx-auto px-6 md:px-16">
        <h2
          className="text-3xl md:text-4xl text-white tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          What you can do with it.
        </h2>

        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
          {CAPABILITIES.map((cap) => (
            <div key={cap.title}>
              <div className="text-[var(--color-accent)]">{cap.icon}</div>
              <h3 className="mt-3 text-lg font-bold text-white">{cap.title}</h3>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed">
                {cap.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
