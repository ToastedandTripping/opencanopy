import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Production monitor lives under its own config (playwright.live.config.ts,
  // `npm run audit:live`) so `npm run test:e2e` never fires at opencanopy.ca.
  testIgnore: ['**/monitoring/**'],
  timeout: 120_000,
  expect: { timeout: 60_000 },
  retries: 1,
  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1280, height: 720 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
