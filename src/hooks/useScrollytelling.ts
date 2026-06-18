"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { CHAPTERS, type ChapterCamera } from "@/data/chapters";
import { normalizeAngle, interpolateCamera } from "@/lib/math/interpolation";
import { yearFromProgress, type ScrubTable } from "@/lib/story/scrub";
import cutblocksScrub from "@/data/scrub/cutblocks-scrub.json";
import fireScrub from "@/data/scrub/fire-scrub.json";
import { pipelineLog } from "@/lib/debug/pipeline-logger";

const SCRUB_TABLES: Record<"cutblocks" | "fire", ScrubTable> = {
  cutblocks: cutblocksScrub as ScrubTable,
  fire: fireScrub as ScrubTable,
};

/** A resolved overlay for the current frame: image year + opacity. */
export interface ResolvedOverlay {
  source: "cutblocks" | "fire";
  year: number;
  opacity: number;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Check if user prefers reduced motion (cached per session). */
function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useScrollytelling() {
  const [activeChapterIndex, setActiveChapterIndex] = useState(0);
  const progressRef = useRef(0);
  const [currentCamera, setCurrentCamera] = useState<ChapterCamera>(
    CHAPTERS[0].camera
  );
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [overlays, setOverlays] = useState<ResolvedOverlay[]>([]);
  const rafRef = useRef<number | null>(null);
  const bearingRef = useRef(CHAPTERS[0].camera.bearing);

  // Compute camera from chapter index and progress
  const updateCamera = useCallback(
    (chapterIdx: number, prog: number) => {
      const chapter = CHAPTERS[chapterIdx];
      if (!chapter) return;

      const reducedMotion = prefersReducedMotion();

      // Only interpolate toward next chapter in the last 20% of scroll
      const nextChapter = CHAPTERS[chapterIdx + 1];
      let camera: ChapterCamera;

      if (nextChapter && prog > 0.8) {
        const t = reducedMotion ? 1 : (prog - 0.8) / 0.2;
        camera = interpolateCamera(chapter.camera, nextChapter.camera, t);
      } else {
        camera = { ...chapter.camera, center: [...chapter.camera.center] };
      }

      pipelineLog("updateCamera", `chapter=${chapterIdx}`, {
        zoom: camera.zoom,
        center: camera.center,
        prog,
      });

      // Timeline scrub: map progress to year via the nonlinear cumulative-area
      // table (sparse early decades compress, modern acceleration stretches).
      let scrubYear: number | null = null;
      if (chapter.timelineScrub && chapter.scrubTable) {
        scrubYear = yearFromProgress(SCRUB_TABLES[chapter.scrubTable], prog);
        pipelineLog("setYearFilter", String(scrubYear));
      }
      setYearFilter(scrubYear);

      // Resolve this frame's overlays (image year + opacity), decoupled from
      // yearFilter. Scrubbed overlays follow scrubYear; static overlays pin to
      // staticYear; fadeIn ramps opacity scroll-coupled (baseline beat).
      const resolved: ResolvedOverlay[] = (chapter.overlays ?? []).map((ov) => {
        const year =
          ov.mode === "scrubbed"
            ? scrubYear ?? ov.staticYear ?? 0
            : ov.staticYear ?? 0;
        const opacity = ov.fadeIn
          ? ov.opacity * clamp01((prog - ov.fadeIn[0]) / (ov.fadeIn[1] - ov.fadeIn[0]))
          : ov.opacity;
        return { source: ov.source, year, opacity };
      });
      setOverlays(resolved);

      bearingRef.current = normalizeAngle(camera.bearing);
      setCurrentCamera(camera);
    },
    []
  );

  // Bearing drift rAF loop
  useEffect(() => {
    const chapter = CHAPTERS[activeChapterIndex];

    // Skip bearing drift entirely if reduced motion or no drift configured
    if (!chapter?.bearingDrift || prefersReducedMotion()) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const degreesPerSecond = chapter.bearingDrift;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      bearingRef.current = normalizeAngle(
        bearingRef.current + degreesPerSecond * dt
      );

      setCurrentCamera((prev) => ({
        ...prev,
        bearing: bearingRef.current,
      }));

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [activeChapterIndex]);

  // Set up scrollama
  useEffect(() => {
    let destroyed = false;
    let scroller: import("scrollama").ScrollamaInstance | null = null;

    async function init() {
      const scrollamaFactory = (await import("scrollama")).default;
      if (destroyed) return;

      scroller = scrollamaFactory();
      scroller
        .setup({
          step: ".story-step",
          offset: 0.5,
          progress: true,
        })
        .onStepEnter((response) => {
          if (destroyed) return;
          pipelineLog("onStepEnter", `index=${response.index}`);
          progressRef.current = 0;
          setActiveChapterIndex(response.index);
          updateCamera(response.index, 0);
        })
        .onStepProgress((response) => {
          if (destroyed) return;
          progressRef.current = response.progress;
          updateCamera(response.index, response.progress);
        });
    }

    init();

    return () => {
      destroyed = true;
      scroller?.destroy();
    };
  }, [updateCamera]);

  // Cleanup rAF on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  return {
    activeChapterIndex,
    currentCamera,
    yearFilter,
    overlays,
    chapters: CHAPTERS,
  };
}
