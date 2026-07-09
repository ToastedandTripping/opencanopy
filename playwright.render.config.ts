import { defineConfig } from '@playwright/test';

/**
 * Self-contained Playwright config for the dolly frame render.
 *
 * Used by `npm run render:dolly`. Unlike the base e2e config, this AUTO-STARTS
 * `next dev` on a pinned port (via webServer) and waits for the /render/dolly
 * route to compile before the capture begins — so the render is ONE command,
 * not a fragile two-terminal dance with a port race.
 *
 * The capture browser itself is launched with --disable-web-security inside
 * the spec (test.use), because the R2 binary reveal tiles serve no CORS headers
 * and would otherwise fail silently as WebGL textures from localhost.
 *
 * Output: .render-scratch/story-dolly/{desktop,mobile}/NNN.webp + signature.json
 * Runtime: ~10-15 min (336 frames across both tiers).
 *
 * After the render completes, run `scripts/encode-dolly.sh` to produce the
 * shippable WebM/MP4/poster artifacts, then upload them to R2.
 */
export default defineConfig({
  testDir: './e2e/render',
  testMatch: 'dolly.render.spec.ts',
  timeout: 20 * 60 * 1000, // 20 min global default; the spec sets 15 min per tier
  expect: { timeout: 60_000 },
  retries: 0, // a retry restarts the whole long render — fail fast and surface the error
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run dev -- -p 3000',
    // Wait for the actual render route to compile + respond, not just the root.
    url: 'http://localhost:3000/render/dolly?tier=desktop',
    reuseExistingServer: true,
    timeout: 120_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
