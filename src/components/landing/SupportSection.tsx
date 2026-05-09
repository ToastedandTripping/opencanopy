"use client";

export function SupportSection() {
  return (
    <section className="relative z-10 bg-[var(--color-surface-0)] py-36 md:py-48">
      <div className="max-w-3xl mx-auto px-6 md:px-16 text-center">
        <h2
          className="text-2xl md:text-3xl text-white tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Open source. AGPLv3.
        </h2>
        <p className="mt-4 text-base text-zinc-400 leading-relaxed">
          Conservation tools should be public infrastructure. Anyone can run
          their own instance, add layers, contribute. Modifications must stay
          open. Adding a data layer is a single TypeScript object.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          <p className="text-xs text-zinc-500 tracking-wider uppercase">
            Support ongoing development
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <a
              href="https://github.com/sponsors/ToastedandTripping"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-white/10 text-zinc-400 text-sm hover:border-white/20 hover:text-zinc-200 transition-colors"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="w-4 h-4"
              >
                <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
              </svg>
              Sponsor on GitHub
            </a>
            <a
              href="https://ko-fi.com/opencanopy"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-white/10 text-zinc-400 text-sm hover:border-white/20 hover:text-zinc-200 transition-colors"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="w-4 h-4"
              >
                <path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3" />
              </svg>
              Buy me a coffee
            </a>
          </div>
        </div>

        <p className="mt-10 text-xs text-zinc-600">
          Data from BC Government open data. Not affiliated with or endorsed
          by the Province of British Columbia.
        </p>
      </div>
    </section>
  );
}
