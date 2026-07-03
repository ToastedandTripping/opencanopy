import { defineConfig } from '@playwright/test';

/**
 * Self-contained Playwright config for performance PROBES (not tests).
 *
 * Used by `npm run probe:scrub` (Probe A of the scroll-story plan's Phase 0 —
 * see ~/.claude/plans/sharded-finding-beacon.md). Probes MEASURE and REPORT;
 * they only fail on harness errors, never on slow readings — the numbers feed
 * the WebGL-vs-frames decision memo, they are not a pass/fail gate here.
 *
 * Runs against the LIVE site by default (production build, real CDN, R2 CORS
 * happy) — that is the most faithful measurement surface we have, since the
 * keyless worktrees can't render the map locally and `next dev` overstates
 * frame cost. Override with PROBE_BASE_URL for local experiments (a static
 * `next build` + serve of out/, NOT the dev server).
 *
 * Probe specs use the `.probe.ts` suffix deliberately: the base e2e config's
 * default testMatch (*.spec/*.test) never picks them up, so `npm run test:e2e`
 * stays probe-free with no testIgnore coupling.
 */
export default defineConfig({
  testDir: './e2e/probes',
  testMatch: '**/*.probe.ts',
  timeout: 5 * 60 * 1000,
  retries: 0, // a probe retry would silently average away the jank we're measuring
  use: {
    baseURL: process.env.PROBE_BASE_URL ?? 'https://opencanopy.ca',
    viewport: { width: 1280, height: 800 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
