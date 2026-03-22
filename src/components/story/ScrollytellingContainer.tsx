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
    chapters,
  } = useScrollytelling();
  const { supports3D } = useDeviceCapability();

  const activeChapter = chapters[activeChapterIndex];

  // Derive terrain config, respecting device capability
  const terrainConfig = useMemo(() => {
    if (!supports3D || !activeChapter?.terrain.enabled) {
      return { enabled: false, exaggeration: 0 };
    }
    return activeChapter.terrain;
  }, [supports3D, activeChapter]);

  // Derive fog config, respecting device capability
  const fogConfig = useMemo(() => {
    if (!supports3D) return undefined;
    return activeChapter?.fog;
  }, [supports3D, activeChapter]);

  // Determine if any active layer has hatch enabled
  const hatchEnabled = useMemo(
    () => activeChapter?.layers.some((l) => l.useHatch) ?? false,
    [activeChapter]
  );

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
            className="text-base font-semibold text-[#94a3b8]"
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
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
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
          terrain={terrainConfig}
          fog={fogConfig}
          layers={activeChapter?.layers ?? []}
          yearFilter={yearFilter}
          hatchEnabled={hatchEnabled}
          supports3D={supports3D}
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
              active={activeChapterIndex === i}
              position={chapter.id === "explore" ? "center" : "left"}
            >
              {chapter.id === "explore" && (
                <a
                  href="/map"
                  className="inline-flex items-center justify-center px-6 py-2.5 rounded-xl bg-[#2dd4bf] text-black font-semibold text-sm hover:bg-[#5eead4] transition-colors"
                >
                  Explore the Map
                </a>
              )}
            </NarrativePanel>
          </div>
        ))}
      </div>
    </div>
  );
}
