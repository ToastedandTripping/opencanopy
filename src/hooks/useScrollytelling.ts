"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { CHAPTERS, type ChapterCamera } from "@/data/chapters";
import { normalizeAngle, interpolateCamera } from "@/lib/math/interpolation";
import { pipelineLog } from "@/lib/debug/pipeline-logger";

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

      // Timeline scrub: map progress to year
      if (chapter.timelineScrub) {
        const year = Math.round(
          chapter.timelineScrub.start +
            (chapter.timelineScrub.end - chapter.timelineScrub.start) * prog
        );
        pipelineLog("setYearFilter", String(year));
        setYearFilter(year);
      } else {
        setYearFilter(null);
      }

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
          setActiveChapterIndex(response.index);
          updateCamera(response.index, progressRef.current);
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
    chapters: CHAPTERS,
  };
}
