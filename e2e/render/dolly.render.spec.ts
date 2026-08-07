/**
 * Dolly frame render spec.
 *
 * Drives the dev-only /render/dolly route to capture one WebP frame per camera
 * step for each tier (desktop + mobile), into a gitignored scratch dir.
 * `scripts/encode-dolly.sh` then encodes those frames into the WebM/MP4 clips
 * + first/last-frame posters that ship to R2 — the frames themselves are
 * never committed and never served at runtime.
 *
 * Prerequisites:
 *   - `next dev` running in another terminal (baseURL: http://localhost:3000)
 *   - `sharp` installed (devDependency)
 *   - .env.local present with NEXT_PUBLIC_MAPTILER_KEY
 *
 * Run: npm run render:dolly
 *   (= npx playwright test e2e/render/dolly.render.spec.ts --config=playwright.render.config.ts)
 *
 * Output: .render-scratch/story-dolly/{desktop,mobile}/NNN.webp
 *         .render-scratch/story-dolly/signature.json  (drift guard payload)
 *
 * After a successful render, run `scripts/encode-dolly.sh` to produce the
 * shippable video + poster artifacts, then upload them to R2
 * (raster/story-dolly/v1/) and commit ONLY the updated DOLLY_FRAME_SIGNATURE
 * in src/lib/story/dolly-config.ts.
 */

import { test, expect, type Page } from '@playwright/test';
import { join, resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';

// Import the shared config by relative path (no @/ alias in Playwright context)
import { DOLLY_TIERS, dollyCameraForFrame, dollyFrameUrl, dollySignaturePayload } from '../../src/lib/story/dolly-config';
import type { ChapterCamera } from '../../src/data/chapters';

// The binary reveal raster tiles are served from R2 (pub-*.r2.dev) WITHOUT
// permissive CORS headers, so MapLibre cannot use them as WebGL textures
// cross-origin from localhost — the live origin is allowed, localhost is not.
// Without this, captured frames show only the dark MapTiler basemap and NONE of
// the red/green forest reveal (verified empirically 2026-06-29). Disabling web
// security for this render-only headless capture lets the R2 tiles paint into the
// frames. This is the capture browser only; it never touches production or the
// runtime app. (Alternative: add localhost to the R2 bucket's allowed origins.)
test.use({ launchOptions: { args: ['--disable-web-security'] } });

// ── Paths ────────────────────────────────────────────────────────────────────
const REPO_ROOT = resolve(__dirname, '../..');
// Scratch dir — gitignored (.render-scratch/), NEVER committed. The video +
// posters produced from these frames are the shippable artifact.
const OUTPUT_ROOT = join(REPO_ROOT, '.render-scratch/story-dolly');

// ── Map instance helpers (mirrors screenshot-regression.spec.ts) ─────────────

/**
 * Find the MapLibre map instance by walking the React fiber tree and expose it
 * as window.__opencanopy_map.
 */
async function ensureMapInstance(page: Page, timeoutMs = 60000): Promise<void> {
  await page.waitForFunction(
    () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any).__opencanopy_map?.flyTo) return true;

      const container = document.querySelector('.maplibregl-map');
      if (!container) return false;

      const fiberKey = Object.keys(container).find(k => k.startsWith('__reactFiber'));
      if (!fiberKey) return false;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let fiber = (container as any)[fiberKey];
      for (let depth = 0; fiber && depth < 40; depth++) {
        let state = fiber.memoizedState;
        for (let si = 0; state && si < 15; si++) {
          const m = state.memoizedState;
          if (m?.current?.getMap) {
            try {
              const map = m.current.getMap();
              if (map?.flyTo) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (window as any).__opencanopy_map = map;
                return true;
              }
            } catch { /* skip */ }
          }
          state = state.next;
        }
        fiber = fiber.return;
      }
      return false;
    },
    { timeout: timeoutMs }
  );
}

/**
 * Wait for MapLibre to finish loading tiles and rendering, with a 2s settle
 * after areTilesLoaded to cover late tile paints at deep zoom levels.
 */
async function waitForMapIdle(page: Page, timeoutMs = 60000): Promise<void> {
  await ensureMapInstance(page, timeoutMs);
  await page.waitForFunction(
    () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = (window as any).__opencanopy_map;
      return map?.loaded() && map?.areTilesLoaded();
    },
    { timeout: timeoutMs }
  );
  // 2s settle — covers late z8 tile paints (do not shorten without verifying
  // that z8 pocket frames are fully loaded, not half-painted).
  await page.waitForTimeout(2000);
}

/**
 * Wire up window.__setDollyCamera imperatively on the live map instance.
 * MUST be called after ensureMapInstance (which sets window.__opencanopy_map).
 * This bypasses React state→useEffect→jumpTo so there is no race between
 * areTilesLoaded reporting true and the camera effect actually firing.
 */
async function wireSetDollyCamera(page: Page): Promise<void> {
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (window as any).__opencanopy_map;
    if (!map) throw new Error('wireSetDollyCamera: map not ready');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__setDollyCamera = (cam: { center: [number, number]; zoom: number; pitch: number; bearing: number }) => {
      map.jumpTo({
        center: cam.center,
        zoom: cam.zoom,
        pitch: cam.pitch,
        bearing: cam.bearing,
      });
    };
  });
}

/**
 * Apply a camera and assert it actually landed (belt-and-suspenders on top of
 * the imperative jumpTo). Prevents silently committing a stale/duplicate frame.
 */
async function setCameraAndAssert(
  page: Page,
  cam: ChapterCamera,
  epsilon = 0.001
): Promise<void> {
  await page.evaluate((c) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__setDollyCamera(c);
  }, cam);

  // Assert the camera was actually applied before returning
  await page.waitForFunction(
    ({ cam: c, eps }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const map = (window as any).__opencanopy_map;
      if (!map) return false;
      const center = map.getCenter();
      const zoom = map.getZoom();
      return (
        Math.abs(center.lng - c.center[0]) < eps &&
        Math.abs(center.lat - c.center[1]) < eps &&
        Math.abs(zoom - c.zoom) < eps
      );
    },
    { cam, eps: epsilon },
    { timeout: 5000 }
  );
}

// ── Signature computation ─────────────────────────────────────────────────────

function computeSignature(): string {
  return createHash('sha256').update(dollySignaturePayload()).digest('hex').slice(0, 16);
}

// ── Render loop ──────────────────────────────────────────────────────────────

const TIERS = ['desktop', 'mobile'] as const;

for (const tier of TIERS) {
  const { count, width, height, fps } = DOLLY_TIERS[tier];

  test.describe(`Dolly render — ${tier} (${count} frames @ ${width}×${height}, ${fps}fps)`, () => {
    test.setTimeout(15 * 60 * 1000); // 15 min per tier (6-8 min expected)

    test(`render ${count} frames`, async ({ page }) => {
      // Set viewport to the tier's render dimensions
      await page.setViewportSize({ width, height });

      // Navigate to the render route
      await page.goto(`/render/dolly?tier=${tier}`);

      // Wait for the map to idle at the initial camera
      await waitForMapIdle(page, 90000);

      // Wire up the imperative camera setter
      await wireSetDollyCamera(page);

      // Ensure output directory exists
      const outDir = join(OUTPUT_ROOT, tier);
      mkdirSync(outDir, { recursive: true });

      // Import sharp for WebP encoding
      const sharp = (await import('sharp')).default;

      // ── Frame loop ─────────────────────────────────────────────────────────
      for (let i = 0; i < count; i++) {
        // Easing is baked into dollyCameraForFrame — no runtime easing needed;
        // the encoded clip plays at constant fps and reproduces the curve.
        const cam = dollyCameraForFrame(i, count);

        // Apply camera imperatively + assert it landed
        await setCameraAndAssert(page, cam);

        // Wait for tiles to finish loading at this camera position
        await waitForMapIdle(page, 60000);

        // Capture full-viewport PNG then encode to WebP
        const png = await page.screenshot({ fullPage: false });

        // dollyFrameUrl returns the scratch-dir-relative path; resolve it
        // against the repo root for the actual file write.
        const outPath = join(REPO_ROOT, dollyFrameUrl(tier, i));

        await sharp(png)
          .webp({ quality: 90, effort: 4 })
          .toFile(outPath);

        if (i % 10 === 0) {
          console.log(`[${tier}] Frame ${i}/${count - 1} → ${outPath}`);
        }
      }

      console.log(`[${tier}] Done — ${count} frames written to ${outDir}`);
    });
  });
}

// ── Signature sidecar ────────────────────────────────────────────────────────
// Write signature.json after BOTH tiers complete. This is a separate test so
// it runs last (Playwright runs describes sequentially within a file).
test.describe('Write signature', () => {
  test('write .render-scratch/story-dolly/signature.json', async () => {
    mkdirSync(OUTPUT_ROOT, { recursive: true });
    const sig = computeSignature();
    writeFileSync(
      join(OUTPUT_ROOT, 'signature.json'),
      JSON.stringify({ signature: sig, generatedAt: new Date().toISOString() }, null, 2)
    );
    console.log(`[signature] ${sig} — copy into DOLLY_FRAME_SIGNATURE (src/lib/story/dolly-config.ts) once the encoded video/posters are uploaded to R2.`);
    expect(sig).toHaveLength(16);
  });
});
