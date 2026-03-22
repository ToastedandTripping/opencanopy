const capabilities = [
  {
    title: "See",
    body: "8 data layers from BC government. Forest age, cutblocks, parks, conservancies, fish streams, species at risk, old growth, satellite.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-6 h-6 text-[#2dd4bf]"
      >
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
  {
    title: "Measure",
    body: "Draw a box, get carbon stats and equivalences. Tonnes of CO2 stored, equivalent cars, homes, flights. Species-specific carbon models.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-6 h-6 text-[#2dd4bf]"
      >
        <path d="M4 7V4h3M20 7V4h-3M4 17v3h3M20 17v3h-3" />
      </svg>
    ),
  },
  {
    title: "Share",
    body: "Every view is a URL. Send exact locations and layer configurations to colleagues, media, or council.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="w-6 h-6 text-[#2dd4bf]"
      >
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
      </svg>
    ),
  },
];

export function HowItWorks() {
  return (
    <section id="features" className="px-6 py-20 md:py-32">
      <div className="max-w-4xl mx-auto">
        <h2
          className="text-3xl font-bold text-white text-center"
          style={{ fontFamily: "var(--font-display)" }}
        >
          What you can do
        </h2>
        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
          {capabilities.map((cap) => (
            <div key={cap.title} className="text-center md:text-left">
              <div className="flex justify-center md:justify-start">
                {cap.icon}
              </div>
              <h3
                className="mt-4 text-xl font-semibold text-white"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {cap.title}
              </h3>
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
