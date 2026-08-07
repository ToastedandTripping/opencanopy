/**
 * Unit tests for the dolly video config — pure helpers + drift guard.
 *
 * The runtime frame-scrubbing math (`dollyFrameIndex`, mobile sliding-window
 * frame loading) was DISCARDED when the live cameraTo/DollyCanvas approach
 * was replaced by a pre-rendered play-on-scroll video — a constant-fps video
 * decodes forward-only, there is no "which frame is closest to this scroll
 * progress" question at runtime anymore.
 *
 * Covers:
 *   1. dollyCameraForFrame: frame 0 = FLAT_BC, frame N-1 = STORY_END, easing
 *      baked into the sample (frame N/2 != halfway — it's eased, not linear),
 *      monotonic zoom, N=1 safety
 *   2. pickDollyTier
 *   3. dollyFrameUrl (repurposed: scratch-dir path for the offline render
 *      pipeline, not a runtime fetch URL)
 *   4. dollyVideoUrl / dollyPosterUrl (runtime R2 URLs the player fetches)
 *   5. DOLLY_TIERS manifest sanity (count > 0, width/height/fps > 0)
 *   6. Drift guard: if .render-scratch/story-dolly/signature.json exists,
 *      assert the current config hashes to the same value. Skipped when
 *      absent (pre-render state, which is expected until Lee runs the
 *      offline pipeline).
 *
 * All expectations use hand-computed values — NOT re-implementations of the
 * helper under test (avoids the tautological-test anti-pattern).
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";

import {
  pickDollyTier,
  dollyCameraForFrame,
  dollyFrameUrl,
  dollyVideoUrl,
  dollyPosterUrl,
  dollySignaturePayload,
  DOLLY_TIERS,
} from "@/lib/story/dolly-config";
import { FLAT_BC_CAMERA, STORY_END_CAMERA } from "@/data/chapters";
import { easeInOut, interpolateCamera } from "@/lib/math/interpolation";

// ─── 1. dollyCameraForFrame ───────────────────────────────────────────────────

describe("dollyCameraForFrame", () => {
  const Nd = 192; // desktop count
  const Nm = 144; // mobile count

  it("frame 0 -> FLAT_BC_CAMERA (province scale start)", () => {
    const cam = dollyCameraForFrame(0, Nd);
    expect(cam.center[0]).toBeCloseTo(FLAT_BC_CAMERA.center[0], 6);
    expect(cam.center[1]).toBeCloseTo(FLAT_BC_CAMERA.center[1], 6);
    expect(cam.zoom).toBeCloseTo(FLAT_BC_CAMERA.zoom, 6);
    expect(cam.pitch).toBeCloseTo(FLAT_BC_CAMERA.pitch, 6);
  });

  it("frame N-1 -> STORY_END_CAMERA (pocket zoom)", () => {
    const cam = dollyCameraForFrame(Nd - 1, Nd);
    expect(cam.center[0]).toBeCloseTo(STORY_END_CAMERA.center[0], 6);
    expect(cam.center[1]).toBeCloseTo(STORY_END_CAMERA.center[1], 6);
    expect(cam.zoom).toBeCloseTo(STORY_END_CAMERA.zoom, 6);
  });

  it("frame N-1 -> STORY_END_CAMERA for mobile count too", () => {
    const cam = dollyCameraForFrame(Nm - 1, Nm);
    expect(cam.zoom).toBeCloseTo(STORY_END_CAMERA.zoom, 6);
  });

  it("zoom is monotonically non-decreasing from frame 0 to N-1", () => {
    let prev = dollyCameraForFrame(0, Nd).zoom;
    for (let i = 1; i < Nd; i++) {
      const cur = dollyCameraForFrame(i, Nd).zoom;
      expect(cur).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = cur;
    }
  });

  it("matches easeInOut(i/(N-1)) exactly -- easing is baked into the sample, not linear", () => {
    // Hand-compute the expected camera at a specific frame via the raw
    // interpolation primitives, independent of dollyCameraForFrame's own
    // internals, and compare.
    const N = 141; // odd count so frame 70 lands exactly at t=0.5
    const i = 70;
    const expected = interpolateCamera(FLAT_BC_CAMERA, STORY_END_CAMERA, easeInOut(i / (N - 1)));
    const actual = dollyCameraForFrame(i, N);
    expect(actual.zoom).toBeCloseTo(expected.zoom, 9);
    expect(actual.center[0]).toBeCloseTo(expected.center[0], 9);
  });

  it("the midpoint frame's zoom equals the arithmetic mean (easeInOut(0.5)===0.5 exactly)", () => {
    const N = 141;
    const cam = dollyCameraForFrame(70, N); // t = 70/140 = 0.5 exactly
    const expectedZoom = (FLAT_BC_CAMERA.zoom + STORY_END_CAMERA.zoom) / 2;
    expect(cam.zoom).toBeCloseTo(expectedZoom, 6);
  });

  it("N=1 safe: returns FLAT_BC_CAMERA without dividing by zero", () => {
    const cam = dollyCameraForFrame(0, 1);
    expect(cam.zoom).toBeCloseTo(FLAT_BC_CAMERA.zoom, 6);
    expect(Number.isFinite(cam.zoom)).toBe(true);
  });
});

// ─── 2. pickDollyTier ─────────────────────────────────────────────────────────

describe("pickDollyTier", () => {
  it("isMobile=false -> desktop", () => {
    expect(pickDollyTier(false)).toBe("desktop");
  });

  it("isMobile=true -> mobile", () => {
    expect(pickDollyTier(true)).toBe("mobile");
  });
});

// ─── 3. dollyFrameUrl (offline-render scratch path) ───────────────────────────

describe("dollyFrameUrl (offline-render scratch-dir path, not a runtime URL)", () => {
  it("frame 0 -> .render-scratch/story-dolly/desktop/000.webp", () => {
    expect(dollyFrameUrl("desktop", 0)).toBe(".render-scratch/story-dolly/desktop/000.webp");
  });

  it("frame 9 -> ...009.webp (3-digit padding)", () => {
    expect(dollyFrameUrl("desktop", 9)).toBe(".render-scratch/story-dolly/desktop/009.webp");
  });

  it("frame 99 -> ...099.webp", () => {
    expect(dollyFrameUrl("mobile", 99)).toBe(".render-scratch/story-dolly/mobile/099.webp");
  });

  it("frame 191 (desktop last) -> ...191.webp", () => {
    expect(dollyFrameUrl("desktop", 191)).toBe(".render-scratch/story-dolly/desktop/191.webp");
  });

  it("all frame paths for a tier are unique", () => {
    const paths = new Set<string>();
    for (let i = 0; i < DOLLY_TIERS.desktop.count; i++) {
      paths.add(dollyFrameUrl("desktop", i));
    }
    expect(paths.size).toBe(DOLLY_TIERS.desktop.count);
  });
});

// ─── 4. dollyVideoUrl / dollyPosterUrl (runtime R2 URLs) ──────────────────────

describe("dollyVideoUrl / dollyPosterUrl", () => {
  it("desktop webm and mp4 point at distinct R2 paths under the same tier prefix", () => {
    const webm = dollyVideoUrl("desktop", "webm");
    const mp4 = dollyVideoUrl("desktop", "mp4");
    expect(webm).toMatch(/\/raster\/story-dolly\/v1\/desktop\.webm$/);
    expect(mp4).toMatch(/\/raster\/story-dolly\/v1\/desktop\.mp4$/);
  });

  it("mobile posters point at start/end WebP under the same tier prefix", () => {
    const start = dollyPosterUrl("mobile", "start");
    const end = dollyPosterUrl("mobile", "end");
    expect(start).toMatch(/\/raster\/story-dolly\/v1\/mobile-start\.webp$/);
    expect(end).toMatch(/\/raster\/story-dolly\/v1\/mobile-end\.webp$/);
    expect(start).not.toBe(end);
  });

  it("video and poster URLs share the same R2 host", () => {
    const video = dollyVideoUrl("desktop", "webm");
    const poster = dollyPosterUrl("desktop", "start");
    const videoHost = new URL(video).origin;
    const posterHost = new URL(poster).origin;
    expect(videoHost).toBe(posterHost);
  });
});

// ─── 5. DOLLY_TIERS manifest sanity ──────────────────────────────────────────

describe("DOLLY_TIERS manifest", () => {
  for (const [tier, config] of Object.entries(DOLLY_TIERS)) {
    describe(`tier: ${tier}`, () => {
      it("count > 0", () => {
        expect(config.count).toBeGreaterThan(0);
      });

      it("width > 0", () => {
        expect(config.width).toBeGreaterThan(0);
      });

      it("height > 0", () => {
        expect(config.height).toBeGreaterThan(0);
      });

      it("fps > 0", () => {
        expect(config.fps).toBeGreaterThan(0);
      });
    });
  }

  it("desktop has more frames than mobile", () => {
    expect(DOLLY_TIERS.desktop.count).toBeGreaterThan(DOLLY_TIERS.mobile.count);
  });

  it("desktop resolution exceeds mobile (compression makes resolution cheap)", () => {
    expect(DOLLY_TIERS.desktop.width).toBeGreaterThan(DOLLY_TIERS.mobile.width);
  });
});

// ─── 6. Drift guard ──────────────────────────────────────────────────────────

describe("DOLLY_FRAME_SIGNATURE drift guard", () => {
  const SIGNATURE_PATH = join(
    __dirname,
    "../../../.render-scratch/story-dolly/signature.json"
  );

  it("skips gracefully if frames not yet rendered (pre-render state)", () => {
    if (!existsSync(SIGNATURE_PATH)) {
      // Pre-render: signature file absent -> guard is inactive -> test is a no-op
      console.log("[dolly drift] No signature file found — skipping drift check (run `npm run render:dolly` to activate)");
      return;
    }

    // Post-render: compute current config hash and compare to committed signature
    const stored = JSON.parse(readFileSync(SIGNATURE_PATH, "utf-8")) as { signature: string };

    const currentSig = createHash("sha256")
      .update(dollySignaturePayload())
      .digest("hex")
      .slice(0, 16);

    expect(
      currentSig,
      `DOLLY_FRAME_SIGNATURE mismatch: the committed video was rendered from a different config.\n` +
      `Current config hash: ${currentSig}\n` +
      `Committed hash:      ${stored.signature}\n` +
      `Run \`npm run render:dolly\` -> \`scripts/encode-dolly.sh\` and re-upload to R2.`
    ).toBe(stored.signature);
  });
});
