"use client";

import { useEffect, useRef } from "react";
import { prefetchYearOverlays } from "@/lib/story/prefetch";

function useRevealOnScroll() {
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    const elements = refs.current.filter(Boolean) as HTMLDivElement[];
    if (!elements.length) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    if (reducedMotion) {
      elements.forEach((el) => el.classList.add("hero-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add("hero-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.3 }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (idx: number) => (el: HTMLDivElement | null) => {
    refs.current[idx] = el;
  };
}

export function HeroSection() {
  const setRef = useRevealOnScroll();

  useEffect(() => {
    prefetchYearOverlays();
  }, []);

  return (
    <section className="relative bg-[var(--color-surface-0)]">
      {/* Beat 1 — What Exists */}
      <div
        ref={setRef(0)}
        className="hero-beat hero-visible relative min-h-[100dvh] flex items-center justify-center px-6 overflow-hidden"
      >
        <img
          src="/images/story/old-growth-canopy.webp"
          alt="Looking up into an old-growth canopy, moss-covered branches and a red cedar trunk"
          className="absolute inset-0 w-full h-full object-cover brightness-[0.55] saturate-[0.85]"
          style={{ objectPosition: "50% 42%" }}
          loading="eager"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(10,10,12,0.60) 0%, rgba(10,10,12,0.25) 35%, rgba(10,10,12,0.35) 65%, rgba(10,10,12,1.0) 100%)",
          }}
        />
        <div className="relative z-10 max-w-3xl text-center">
          <h1
            className="text-4xl md:text-6xl lg:text-7xl font-semibold text-white tracking-tight leading-[1.1]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            British Columbia is home to the last great temperate rainforests on
            Earth.
          </h1>
          <p className="mt-6 text-lg md:text-xl text-zinc-300">
            Some of these trees are older than the Roman Empire.
          </p>
        </div>

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 z-10">
          <span className="text-[10px] text-zinc-400 uppercase tracking-[0.25em]">
            Scroll
          </span>
          <div className="w-px h-10 hero-pulse-line" />
        </div>
      </div>

      {/* Beat 2 — What's Being Lost */}
      <div
        ref={setRef(1)}
        className="hero-beat-2 relative min-h-[100dvh] flex items-center justify-center md:items-start md:justify-start px-6 overflow-hidden"
      >
        {/* Decorative fog texture — heavily dimmed so the loss figure stays the
            focal point; an offset crop of the Beat-3 fog so it reads as the fog
            emerging rather than a repeat. */}
        <img
          src="/images/story/hero-fog.webp"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover opacity-[0.16] brightness-[0.8]"
          style={{ objectPosition: "70% 45%" }}
          loading="lazy"
        />
        <div
          className="absolute inset-0"
          style={{
            // Sealed to full dark at the bottom (last 20%) so the hero→story-map
            // seam stays clean now that Beat 2 is the final hero panel before the
            // sticky map (Beat 3 moved to the CTA). Fog still reads through the middle.
            background:
              "linear-gradient(180deg, rgba(10,10,12,1.0) 0%, rgba(10,10,12,0.40) 45%, rgba(10,10,12,0.70) 80%, rgba(10,10,12,1.0) 100%)",
          }}
        />
        <div className="relative z-10 max-w-3xl text-center md:text-left md:pt-[20vh] md:pl-16">
          <p
            className="text-5xl md:text-7xl lg:text-8xl font-bold text-[#ef4444] tracking-tight"
            style={{ fontFamily: "var(--font-display)", fontVariantNumeric: "lining-nums" }}
          >
            8 million hectares
          </p>
          <p className="mt-6 text-lg md:text-xl text-zinc-400" style={{ fontVariantNumeric: "lining-nums" }}>
            Logged since 1950. An area larger than Ireland.
          </p>
          <p className="mt-2 text-base text-zinc-400">
            Most of it will never be old growth again.
          </p>
        </div>
      </div>
    </section>
  );
}
