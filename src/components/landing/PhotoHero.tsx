"use client";

import Image from "next/image";

export function PhotoHero() {
  return (
    <section className="relative h-svh w-full overflow-hidden">
      <Image
        src="/images/landing/hero-mist.webp"
        alt="Old-growth forest disappearing into coastal mist"
        fill
        priority
        className="object-cover object-center"
        sizes="100vw"
      />

      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/80" />

      <div className="relative z-10 flex h-full flex-col justify-end px-6 pb-24 md:px-16 md:pb-32 lg:px-24">
        <h1
          className="max-w-3xl text-5xl md:text-7xl lg:text-8xl text-white tracking-tight leading-[0.95]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          See what&apos;s left.
        </h1>
        <p className="mt-5 max-w-xl text-lg md:text-xl text-zinc-300/90 leading-relaxed">
          Open-source conservation mapping for British Columbia.
          Government forest data, assembled for the first time.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <a
            href="/map"
            className="inline-flex items-center px-7 py-3 rounded-xl bg-[var(--color-accent)] text-black font-semibold text-sm hover:bg-[var(--color-accent-hover)] transition-colors"
          >
            Explore the map
          </a>
          <a
            href="#problem"
            className="inline-flex items-center px-7 py-3 rounded-xl border border-white/15 text-zinc-300 text-sm hover:border-white/30 hover:text-white transition-colors"
          >
            Learn more
          </a>
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 animate-pulse">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-white/40"
        >
          <path d="M12 5v14M5 12l7 7 7-7" />
        </svg>
      </div>
    </section>
  );
}
