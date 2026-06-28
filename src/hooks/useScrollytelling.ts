"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { CHAPTERS, type ChapterCamera } from "@/data/chapters";
import { computeBinaryRevealOpacity } from "@/lib/story/binary-opacity";
import { normalizeAngle, interpolateCamera, easeInOut } from "@/lib/math/interpolation";
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
  const [binaryRevealOpacity, setBinaryRevealOpacity] = useState(0);
  const rafRef = useRef<number | null>(null);
  const bearingRef = useRef(CHAPTERS[0].camera.bearing);
  // 1a: Coalesce scroll→camera/year updates to one call per animation frame.
  // pendingRef holds the latest {index, progress} written by onStepProgress
  // and the camera part of onStepEnter; newest-wins resolves the trailing-event
  // race (scrollama may fire an outgoing-step onStepProgress after the incoming
  // onStepEnter — both write here, so the rAF always sees the freshest values).
  const scrubRafRef = useRef<number | null>(null);
  const pendingRef = useRef<{ index: number; progress: number } | null>(null);

  // Compute camera from chapter index and progress
  const updateCamera = useCallback(
    (chapterIdx: number, prog: number) => {
      const chapter = CHAPTERS[chapterIdx];
      if (!chapter) return;

      const reducedMotion = prefersReducedMotion();

      // Intra-chapter dolly: when a chapter declares `cameraTo`, scrub
      // chapter.camera → chapter.cameraTo across the chapter's own progress,
      // eased and completing at DOLLY_END so the camera settles before the CTA.
      // Under prefers-reduced-motion, snap straight to the destination (t=1).
      // This takes priority over the toward-next interpolation so chapters with
      // `cameraTo` are not subject to the end-of-chapter camera jump.
      //
      // For chapters WITHOUT `cameraTo`: only interpolate toward the next chapter
      // in the last 20% of scroll (the existing toward-next dolly behavior).
      const DOLLY_END = 0.8;
      const nextChapter = CHAPTERS[chapterIdx + 1];
      let camera: ChapterCamera;

      if (chapter.cameraTo) {
        const t = reducedMotion ? 1 : easeInOut(clamp01(prog / DOLLY_END));
        camera = interpolateCamera(chapter.camera, chapter.cameraTo, t);
      } else if (nextChapter && prog > 0.8) {
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

      // Timeline scrub: map progress to year. A scrubStart HOLD delays the
      // scrub (no counter, overlay pinned to start year) so panel text can land
      // first. With a scrubTable, use the nonlinear cumulative-area curve (right
      // for the many-small-events cutblocks); without one, a steady LINEAR
      // mapping (right for fire, whose few huge events make nonlinear lurch).
      const scrub = chapter.timelineScrub;
      const scrubStart = chapter.scrubStart ?? 0;
      let scrubYear: number | null = null;
      if (scrub && prog >= scrubStart) {
        // Under prefers-reduced-motion, every scrub chapter holds through its
        // scrubStart, then resolves directly to its own scrub.end (snap, no
        // sweep). The hold gate above (prog >= scrubStart) is preserved
        // unchanged — so the fire chapter's "hold on red, then wildfire" beat
        // survives — and only the within-scrub interpolation is short-circuited.
        // This invariant must be preserved by any future Phase-3 scrub rewrite.
        if (prefersReducedMotion()) {
          scrubYear = scrub.end;
        } else {
          const localProg = scrubStart < 1 ? (prog - scrubStart) / (1 - scrubStart) : 1;
          const linearYear = scrub.start + (scrub.end - scrub.start) * localProg;
          if (chapter.scrubTable) {
            const cumYear = yearFromProgress(SCRUB_TABLES[chapter.scrubTable], localProg);
            const blend = chapter.scrubBlend ?? 0;
            scrubYear = Math.round(blend * linearYear + (1 - blend) * cumYear);
          } else {
            scrubYear = Math.round(linearYear);
          }
        }
        pipelineLog("setYearFilter", String(scrubYear));
      }
      setYearFilter(scrubYear);

      // Resolve this frame's overlays (image year + opacity), decoupled from
      // yearFilter. Scrubbed overlays follow scrubYear (pinned to start during a
      // hold); static overlays pin to staticYear; fadeIn ramps opacity.
      const resolved: ResolvedOverlay[] = (chapter.overlays ?? []).map((ov) => {
        const year =
          ov.mode === "scrubbed"
            ? scrubYear ?? scrub?.start ?? ov.staticYear ?? 0
            : ov.staticYear ?? 0;
        const opacity = ov.fadeIn
          ? ov.opacity * clamp01((prog - ov.fadeIn[0]) / (ov.fadeIn[1] - ov.fadeIn[0]))
          : ov.opacity;
        return { source: ov.source, year, opacity };
      });
      setOverlays(resolved);

      // Per-frame binary reveal opacity. chapters with revealBinaryFadeIn get a
      // scroll-coupled ramp; chapters with revealBinary but no fadeIn (e.g.
      // `remains`) jump straight to 0.85. Under prefers-reduced-motion, always
      // snap to 0.85 immediately so the reveal is not lost, just not animated.
      const binaryOpacity = computeBinaryRevealOpacity(
        chapter.revealBinary,
        chapter.revealBinaryFadeIn,
        prog,
        reducedMotion,
      );
      setBinaryRevealOpacity(binaryOpacity);

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

    // 1a: Schedule a single rAF to flush the latest pending camera update.
    // The callback reads from pendingRef (not progressRef) so it always uses
    // the freshest {index, progress} written by either onStepEnter or
    // onStepProgress — whichever fired last within this animation frame.
    function scheduleScrubFrame() {
      if (scrubRafRef.current !== null) return; // frame already queued
      scrubRafRef.current = requestAnimationFrame(() => {
        scrubRafRef.current = null;
        const pending = pendingRef.current;
        if (pending && !destroyed) {
          updateCamera(pending.index, pending.progress);
        }
      });
    }

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
          // Chapter identity and progress reset are SYNCHRONOUS — UI panel must
          // not lag a frame. Only the camera/year/overlay update is coalesced.
          progressRef.current = 0;
          setActiveChapterIndex(response.index);
          // Write {index:0} into pendingRef so the rAF carries the enter state
          // and any trailing outgoing-step onStepProgress will overwrite with
          // its own (stale) index — but that's also covered by the destroyed
          // guard and the newest-wins overwrite below.
          pendingRef.current = { index: response.index, progress: 0 };
          scheduleScrubFrame();
        })
        .onStepProgress((response) => {
          if (destroyed) return;
          progressRef.current = response.progress;
          // Overwrite with the latest values — newest wins within a frame.
          pendingRef.current = { index: response.index, progress: response.progress };
          scheduleScrubFrame();
        });
    }

    init();

    return () => {
      destroyed = true;
      // Cancel any pending scrub frame on teardown so a StrictMode
      // double-invoke cannot leak a stale frame into the next mount.
      if (scrubRafRef.current !== null) {
        cancelAnimationFrame(scrubRafRef.current);
        scrubRafRef.current = null;
      }
      scroller?.destroy();
    };
  }, [updateCamera]);

  // Cleanup rAFs on unmount (bearing-drift + scrub coalescer)
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (scrubRafRef.current !== null) {
        cancelAnimationFrame(scrubRafRef.current);
        scrubRafRef.current = null;
      }
    };
  }, []);

  return {
    activeChapterIndex,
    currentCamera,
    yearFilter,
    overlays,
    binaryRevealOpacity,
    chapters: CHAPTERS,
  };
}
