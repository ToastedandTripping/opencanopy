"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useScrollytelling } from "@/hooks/useScrollytelling";
import { useDeviceCapability } from "@/hooks/useDeviceCapability";
import { StoryMap } from "./StoryMap";
import { NarrativePanel } from "./NarrativePanel";

export function ScrollytellingContainer() {
  const {
    activeChapterIndex,
    currentCamera,
    yearFilter,
    overlays,
    binaryRevealOpacity,
    chapters,
  } = useScrollytelling();
  const { supports3D } = useDeviceCapability();

  const activeChapter = chapters[activeChapterIndex];

  // Derive camera, forcing pitch to 0 on low-end devices
  const effectiveCamera = useMemo(() => {
    if (supports3D) return currentCamera;
    return { ...currentCamera, pitch: 0 };
  }, [supports3D, currentCamera]);

  return (
    <div className="relative">
      {/* Fixed nav: wordmark + skip-to-map */}
      <nav className="fixed top-0 left-0 z-50 flex items-center gap-4 px-5 py-3 bg-black/30 backdrop-blur-sm rounded-br-lg">
        <Link
          href="/"
          className="flex items-baseline gap-0 opacity-70 hover:opacity-100 transition-opacity"
          aria-label="OpenCanopy home"
        >
          <span
            className="text-base font-semibold text-[var(--color-text-muted)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Open
          </span>
          <span
            className="text-base font-semibold text-[#f0f0f0]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Canopy
          </span>
        </Link>
        <Link
          href="/map"
          className="text-xs text-zinc-400 hover:text-zinc-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded"
        >
          Skip to map
        </Link>
      </nav>

      {/* Sticky map background */}
      <div
        className="sticky top-0 w-screen z-0"
        style={{ height: "100vh" }}
      >
        <StoryMap
          camera={effectiveCamera}
          layers={activeChapter?.layers ?? []}
          yearFilter={yearFilter}
          overlays={overlays}
          counterLabel={activeChapter?.counterLabel}
          supports3D={supports3D}
          revealBinary={activeChapter?.revealBinary}
          binaryRevealOpacity={binaryRevealOpacity}
        />
        {/* Top-edge dark veil: absorbs the hero-photo -> map luminance seam.
            Top color matches the hero photo's full-dark bottom (#0a0a0c) and
            fades to transparent over 100px, so the join reads as a continuous
            dark field over any terrain tone (ocean blends already; this closes
            the step over the lighter grey landmass). pointer-events-none keeps
            map pan/zoom fully interactive. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0"
          style={{
            height: "100px",
            zIndex: 1,
            background: "linear-gradient(to bottom, #0a0a0c 0%, transparent 100%)",
          }}
        />
      </div>

      {/* Scrolling chapter panels */}
      <div className="relative z-10" style={{ marginTop: "-100vh" }}>
        {chapters.map((chapter, i) => (
          <div
            key={chapter.id}
            className="story-step relative"
            style={{ minHeight: `${chapter.scrollHeight}vh` }}
          >
            <NarrativePanel
              heading={chapter.heading}
              subheading={chapter.subheading}
              body={chapter.body}
              citation={chapter.citation}
              active={activeChapterIndex === i}
              position={chapter.id === "ending" || chapter.id === "remains" ? "center" : "left"}
              headingWeight={chapter.id === "remains" ? "normal" : "semibold"}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
