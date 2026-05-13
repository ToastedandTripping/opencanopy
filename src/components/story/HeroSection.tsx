"use client";

import { useEffect, useRef } from "react";
import { prefetchStoryTiles, prefetchTerrainTiles } from "@/lib/story/prefetch";

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
    prefetchStoryTiles();
    const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
    if (key) prefetchTerrainTiles(key);
  }, []);

  return (
    <section className="relative bg-[var(--color-surface-0)]">
      {/* Beat 1 — What Exists */}
      <div
        ref={setRef(0)}
        className="hero-beat hero-visible min-h-[100dvh] flex items-center justify-center px-6"
      >
        <div className="max-w-3xl text-center">
          <h1
            className="text-4xl md:text-6xl lg:text-7xl font-bold text-white tracking-tight leading-[1.1]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            British Columbia is home to the last great temperate rainforests on
            Earth.
          </h1>
          <p className="mt-6 text-lg md:text-xl text-zinc-500">
            Some of these trees are older than the Roman Empire.
          </p>
        </div>

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3">
          <span className="text-[10px] text-zinc-600 uppercase tracking-[0.25em]">
            Scroll
          </span>
          <div className="w-px h-10 hero-pulse-line" />
        </div>
      </div>

      {/* Beat 2 — What's Being Lost */}
      <div
        ref={setRef(1)}
        className="hero-beat min-h-[100dvh] flex items-center justify-center px-6"
      >
        <div className="max-w-3xl text-center">
          <p
            className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <span className="text-[var(--color-accent)]">5 million</span>{" "}
            <span className="text-white">hectares.</span>
          </p>
          <p className="mt-6 text-lg md:text-xl text-zinc-400">
            Logged since 1950. An area larger than Switzerland.
          </p>
          <p className="mt-2 text-base text-zinc-600">
            Clearcut and never recovered.
          </p>
        </div>
      </div>

      {/* Beat 3 — The Transition */}
      <div
        ref={setRef(2)}
        className="hero-beat min-h-[100dvh] flex items-center justify-center px-6"
      >
        <div className="max-w-2xl text-center">
          <h2
            className="text-4xl md:text-6xl font-bold text-white tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            We mapped it.
          </h2>
          <p className="mt-6 text-lg text-zinc-500">
            Every cutblock. Every old-growth stand. Every fire.
          </p>
        </div>
      </div>
    </section>
  );
}
