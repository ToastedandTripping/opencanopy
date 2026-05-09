"use client";

import Image from "next/image";

export function PhotoCloser() {
  return (
    <section className="relative z-10 min-h-[80vh] flex items-end overflow-hidden">
      <Image
        src="/images/landing/closer-cedars.webp"
        alt="A person standing among ancient old-growth cedars"
        fill
        loading="eager"
        className="object-cover object-center"
        sizes="100vw"
      />

      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

      <div className="relative z-10 w-full px-6 pb-20 md:px-16 md:pb-28">
        <div className="max-w-3xl">
          <h2
            className="text-3xl md:text-5xl text-white tracking-tight leading-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Every dataset on this map is public.
          </h2>
          <p className="mt-4 text-lg text-zinc-300/80">
            Nobody had assembled them before.
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <a
              href="/map"
              className="inline-flex items-center px-8 py-3 rounded-xl bg-[var(--color-accent)] text-black font-semibold text-sm hover:bg-[var(--color-accent-hover)] transition-colors"
            >
              Explore the map
            </a>
            <a
              href="https://github.com/ToastedandTripping/opencanopy"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-8 py-3 rounded-xl border border-white/15 text-zinc-300 text-sm hover:border-white/30 hover:text-white transition-colors"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
