"use client";

import { Footer } from "@/components/landing/Footer";

export function CtaSection() {
  return (
    <>
      <section className="relative z-10 bg-[var(--color-surface-0)] py-24 md:py-32">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2
            className="text-3xl md:text-4xl font-bold text-white tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Every dataset on this map is public.
          </h2>
          <p className="mt-4 text-lg text-zinc-400">
            Nobody had assembled them before.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="/map"
              className="inline-flex items-center justify-center px-8 py-3 rounded-xl bg-[var(--color-accent)] text-black font-semibold text-sm hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              Explore the Map
            </a>
            <a
              href="https://github.com/ToastedandTripping/opencanopy"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center px-8 py-3 rounded-xl border border-white/10 text-zinc-300 font-medium text-sm hover:border-white/20 hover:text-white transition-colors"
            >
              View on GitHub
            </a>
          </div>

          <div className="mt-8 flex flex-col items-center gap-3">
            <p className="text-xs text-zinc-500">Support OpenCanopy</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="https://github.com/sponsors/ToastedandTripping"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-lg border border-white/10 text-zinc-400 text-xs font-medium hover:border-white/20 hover:text-zinc-200 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                </svg>
                Sponsor on GitHub
              </a>
              <a
                href="https://ko-fi.com/opencanopy"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-2 rounded-lg border border-white/10 text-zinc-400 text-xs font-medium hover:border-white/20 hover:text-zinc-200 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
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

      <Footer />
    </>
  );
}
