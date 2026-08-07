"use client";

/**
 * DollyVideo — pre-rendered play-on-scroll dolly clip.
 *
 * Absolutely-positioned <video> inside the sticky map div, over the live map
 * (which holds flat at province scale — FLAT_BC_CAMERA — for the whole
 * `remains` chapter; see chapters.ts). Replaces the old live z5→z8 `jumpTo`
 * scrub (tile-churn jank) with a single forward-only decode: hardware video
 * playback instead of per-frame WebGL tile loads.
 *
 * Player: <video muted playsInline> with WebM (VP9) + MP4 (H.264) sources per
 * device tier, object-fit: cover. Forward-only playback is what hardware
 * decode is for, and the autoplay-refusal fallback (iOS Low Power Mode) is
 * the SAME final-frame-still path the reduced-motion invariant already
 * requires — one mechanism, two obligations.
 *
 * ── Degradation ladder (must be graceful — the video will not exist in R2
 * until Lee runs the render/encode/upload pipeline) ──────────────────────────
 *   1. video    — plays once, muted, on chapter activation.
 *   2. still    — the encoded clip's LAST frame (dollyPosterUrl(tier,"end")),
 *                 shown on: reduced-motion (immediately, no playback attempt),
 *                 play() rejection (e.g. iOS Low Power Mode), a mid-playback
 *                 `error`/`stalled` event, normal `ended` completion, and any
 *                 re-entry after a play attempt has already been made this
 *                 page load (no replay-from-0 flash).
 *   3. nothing  — if the still poster ALSO fails to load (assets genuinely
 *                 absent), the whole overlay hides (opacity 0) and the live
 *                 z5 map + binary reveal underneath is the coherent fallback.
 * Plays at most ONCE per page load (hasPlayedRef) regardless of which path
 * was taken to reach "still".
 */

import { useEffect, useRef, useState } from "react";
import {
  dollyVideoUrl,
  dollyPosterUrl,
  type DollyTier,
} from "@/lib/story/dolly-config";

type Phase = "poster" | "playing" | "still";

interface DollyVideoProps {
  tier: DollyTier;
  active: boolean;
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Fetch + decode an image purely to know WHEN it is ready — the decoded
 * ImageBitmap itself is discarded (closed) immediately; rendering happens via
 * a normal <img>/<video poster> tag reusing the now browser-cached response.
 * Harvested from DollyCanvas's fetchBitmap. Returns null on any failure
 * (network error, 404 — the pre-render state) so callers can proceed
 * gracefully rather than gate forever.
 */
async function fetchBitmap(url: string): Promise<ImageBitmap | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

export function DollyVideo({ tier, active }: DollyVideoProps) {
  // SSR guard: this component only ever mounts client-side (Scrollytelling-
  // Container is dynamically imported with ssr:false), but the whole subtree
  // is defensive about window/document per repo convention.
  if (typeof window === "undefined") return null;

  return <DollyVideoClient tier={tier} active={active} />;
}

function DollyVideoClient({ tier, active }: DollyVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  // True once a play attempt has been made this page load (success, failure,
  // or reduced-motion short-circuit) — "plays once per page load" invariant.
  const hasPlayedRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("poster");
  const [posterDecoded, setPosterDecoded] = useState(false);
  // True if even the fallback still image failed to load — the terminal
  // degradation-ladder rung: hide entirely, let the live map show through.
  const [stillFailed, setStillFailed] = useState(false);

  // ── Poster-decoded gate ────────────────────────────────────────────────
  // Fetch+decode the frame-0 (start) poster once per tier so the video's
  // native `poster` attribute is guaranteed cache-warm the moment we attempt
  // playback — avoids a flash of black/blank before the first frame paints.
  // No leak on cancel: the bitmap is closed whether the fetch resolves before
  // or after the component unmounts/tier changes.
  useEffect(() => {
    let cancelled = false;
    setPosterDecoded(false);
    fetchBitmap(dollyPosterUrl(tier, "start")).then((bitmap) => {
      if (cancelled) {
        bitmap?.close();
        return;
      }
      bitmap?.close();
      // Resolve the gate even on failure (bitmap === null) — a missing
      // poster must not block the video attempt forever; the video's own
      // <source> tags are independent of this fetch.
      setPosterDecoded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [tier]);

  // ── Phase selection ────────────────────────────────────────────────────
  // Decide what to show whenever activation or poster-readiness changes.
  // Reduced-motion and "already played" both short-circuit straight to the
  // final-frame still — no video element is ever created in either case, so
  // video.play() is provably never called under reduced motion.
  useEffect(() => {
    if (!active) return;

    if (prefersReducedMotion() || hasPlayedRef.current) {
      setPhase("still");
      return;
    }

    if (!posterDecoded) return; // re-runs once the gate above resolves

    // Mark BEFORE the async play() attempt settles so a rapid exit+re-entry
    // while the promise is pending cannot fire a second attempt.
    hasPlayedRef.current = true;
    setPhase("playing");
  }, [active, posterDecoded]);

  // If the user scrolls away mid-playback, stop consuming resources and
  // treat it as a consumed attempt — re-entry shows the still, never a
  // restart from frame 0.
  useEffect(() => {
    if (!active && phase === "playing") {
      videoRef.current?.pause();
      setPhase("still");
    }
  }, [active, phase]);

  // ── Playback lifecycle ─────────────────────────────────────────────────
  // Attempt play() the instant the "playing" phase mounts a real <video>;
  // wire ended/error/stalled to the SAME demotion path as a play() rejection.
  useEffect(() => {
    if (phase !== "playing") return;
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    function toStill() {
      if (!cancelled) setPhase("still");
    }

    video.addEventListener("ended", toStill);
    video.addEventListener("error", toStill);
    video.addEventListener("stalled", toStill);

    video.play().catch(toStill);

    return () => {
      cancelled = true;
      video.removeEventListener("ended", toStill);
      video.removeEventListener("error", toStill);
      video.removeEventListener("stalled", toStill);
    };
  }, [phase]);

  const showAttribution = (phase === "playing" || phase === "still") && !stillFailed;

  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none overflow-hidden"
      style={{
        zIndex: 2,
        // Short opacity fade masks the live-map -> video seam on activation.
        opacity: active && !stillFailed ? 1 : 0,
        transition: "opacity 400ms ease",
      }}
    >
      {phase === "playing" && (
        <video
          ref={videoRef}
          muted
          playsInline
          preload="auto"
          poster={dollyPosterUrl(tier, "start")}
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: "cover" }}
        >
          <source src={dollyVideoUrl(tier, "webm")} type="video/webm" />
          <source src={dollyVideoUrl(tier, "mp4")} type="video/mp4" />
        </video>
      )}
      {phase === "still" && !stillFailed && (
        <img
          src={dollyPosterUrl(tier, "end")}
          alt=""
          className="absolute inset-0 w-full h-full"
          style={{ objectFit: "cover" }}
          onError={() => setStillFailed(true)}
        />
      )}
      {/* Attribution: rendered without attribution in the offline capture, so we
          display a small static credit matching the live AttributionControl. */}
      {showAttribution && (
        <div
          className="absolute bottom-2 right-2 text-[10px] text-white/50 pointer-events-none select-none"
          style={{ zIndex: 3 }}
        >
          {"©"} MapTiler {"©"} OpenStreetMap contributors
        </div>
      )}
    </div>
  );
}
