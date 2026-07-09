/**
 * SSOT manifest for the pre-rendered dolly VIDEO sequence.
 *
 * Two consumers:
 *   1. The offline render pipeline (e2e/render/dolly.render.spec.ts) — captures
 *      one frame per index via `dollyCameraForFrame`, writes WebP frames to a
 *      gitignored scratch dir. `scripts/encode-dolly.sh` then encodes those
 *      frames into WebM/MP4 clips + first/last-frame posters, uploaded to R2.
 *   2. The runtime player (DollyVideo.tsx) — picks a tier and points <source>
 *      tags + the poster attribute at the R2-hosted URLs built here.
 *
 * Easing is BAKED INTO the frame sampling (`dollyCameraForFrame`), not applied
 * at runtime — a constant-fps video can't re-time itself during playback. This
 * replaces the old live `cameraTo` scrub (removed from useScrollytelling) with
 * an offline-rendered clip that reproduces the same eased province→pocket feel.
 *
 * MAINTENANCE: whenever STORY_END_CAMERA, FLAT_BC_CAMERA, or a tier's
 * dims/count/fps changes, run `npm run render:dolly` -> `scripts/encode-dolly.sh`
 * and re-upload to R2 (`raster/story-dolly/v1/`). The DOLLY_FRAME_SIGNATURE
 * drift test enforces this in CI.
 */

import { FLAT_BC_CAMERA, STORY_END_CAMERA } from "@/data/chapters";
import { easeInOut, interpolateCamera } from "@/lib/math/interpolation";
import type { ChapterCamera } from "@/data/chapters";
import { R2_PUBLIC_BASE } from "@/lib/r2-config";

export type DollyTier = "desktop" | "mobile";

export interface TierConfig {
  /** Frame count (N) rendered offline and encoded into the clip. */
  count: number;
  /** Frames per second of the encoded clip (constant — no runtime easing). */
  fps: number;
  /** Viewport width for the offline render (pixels). */
  width: number;
  /** Viewport height for the offline render (pixels). */
  height: number;
}

/**
 * Desktop 1920×1200 (bumped from an earlier 1280×800 — video compression makes
 * resolution nearly free, and 1280 upscales poorly on 2560/4K displays), ~192
 * frames @ 24fps ≈ 8s. Mobile 540×1100, ~144 frames @ 24fps ≈ 6s (portrait
 * viewport, smaller file).
 */
export const DOLLY_TIERS: Record<DollyTier, TierConfig> = {
  desktop: { count: 192, fps: 24, width: 1920, height: 1200 },
  mobile: { count: 144, fps: 24, width: 540, height: 1100 },
};

/** R2 prefix for all v1 dolly video/poster artifacts (see architecture.md). */
const DOLLY_R2_BASE = `${R2_PUBLIC_BASE}/raster/story-dolly/v1`;

/** Zero-padded 3-digit index string: 0 → "000", 191 → "191". Offline-render use only. */
function pad3(i: number): string {
  return String(i).padStart(3, "0");
}

/**
 * Local scratch-dir path for a single offline-rendered frame.
 *
 * Used ONLY by the capture pipeline (e2e/render/dolly.render.spec.ts writes
 * here). These frames are never committed and never served at runtime — the
 * encoded video replaces them entirely. Resolved against the repo root by the
 * render spec, not an HTTP URL.
 */
export function dollyFrameUrl(tier: DollyTier, i: number): string {
  return `.render-scratch/story-dolly/${tier}/${pad3(i)}.webp`;
}

/** WebM (VP9) + MP4 (H.264) source URLs for the encoded clip, per tier. */
export function dollyVideoUrl(tier: DollyTier, format: "webm" | "mp4"): string {
  return `${DOLLY_R2_BASE}/${tier}.${format}`;
}

/**
 * First/last-frame WebP poster URLs, per tier.
 *   "start" — province-scale (FLAT_BC_CAMERA); used as the <video poster> and
 *             as the poster-decoded gate before the clip is revealed.
 *   "end"   — old-growth pocket (STORY_END_CAMERA); the degradation-ladder
 *             still shown on reduced-motion, play() rejection, mid-playback
 *             error/stall, playback completion, and replay-suppressed re-entry.
 */
export function dollyPosterUrl(tier: DollyTier, which: "start" | "end"): string {
  return `${DOLLY_R2_BASE}/${tier}-${which}.webp`;
}

/** Pick the dolly tier based on device type. */
export function pickDollyTier(isMobile: boolean): DollyTier {
  return isMobile ? "mobile" : "desktop";
}

/**
 * Camera position for offline-render frame `i` of `count`.
 *
 * Easing is baked into the sample: t_i = easeInOut(i / (count - 1)). This is
 * the same curve the runtime player used to apply live (the old cameraTo
 * branch in useScrollytelling) — baking it here means the encoded clip
 * reproduces that feel exactly, with no runtime scrub math needed.
 *
 * Single source of truth for the frame-sampling contract — the offline render
 * spec MUST call this, never re-derive cameras inline.
 */
export function dollyCameraForFrame(i: number, count: number): ChapterCamera {
  if (count <= 1) {
    return { ...FLAT_BC_CAMERA, center: [...FLAT_BC_CAMERA.center] as [number, number] };
  }
  const t = easeInOut(i / (count - 1));
  return interpolateCamera(FLAT_BC_CAMERA, STORY_END_CAMERA, t);
}

/**
 * Committed hash of { FLAT_BC_CAMERA, STORY_END_CAMERA, DOLLY_TIERS, easing }.
 *
 * Written by `npm run render:dolly` alongside the frames (re-affirmed by
 * scripts/encode-dolly.sh when it writes the video/poster artifacts). A unit
 * test asserts the live config still hashes to this value; CI fails the
 * moment a camera endpoint, tier dims/count/fps, or the easing curve changes
 * without a re-render.
 *
 * null = frames not yet rendered; the drift test skips gracefully.
 */
export const DOLLY_FRAME_SIGNATURE: string | null = null;

/** Payload hashed into DOLLY_FRAME_SIGNATURE — exported so the render spec and
 * the drift test compute the identical hash from one definition. */
export function dollySignaturePayload(): string {
  return JSON.stringify({
    FLAT_BC_CAMERA,
    STORY_END_CAMERA,
    DOLLY_TIERS,
    easing: "easeInOut",
  });
}
