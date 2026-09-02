import { defineConfig } from '@playwright/test';

/**
 * Playwright config for the PRODUCTION health monitor (`npm run audit:live`).
 *
 * Kept separate from playwright.config.ts (which testIgnores e2e/monitoring/)
 * so a plain `npm run test:e2e` or `npx playwright test` can never hit
 * opencanopy.ca by accident. Same shape as the probe config split.
 */
export default defineConfig({
  testDir: './e2e/monitoring',
  timeout: 120_000,
  expect: { timeout: 60_000 },
  retries: 1,
  use: {
    baseURL: 'https://opencanopy.ca',
    viewport: { width: 1280, height: 720 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
