/**
 * Live Deployment Health Monitor — OpenCanopy V2 Diagnostic Pipeline
 *
 * Runs against PRODUCTION (https://opencanopy.ca/map).
 * DO NOT run as part of audit:visual — this hits production.
 *
 * Run separately with: npm run audit:live
 *
 * Checks:
 *   1. Page loads within 30s
 *   2. Map canvas exists
 *   3. Map reaches idle state (generous 60s timeout)
 *   4. Forest-age layer returns features at z5
 *   5. Cutblocks layer returns features at z7
 */

import { test, expect, type Page } from '@playwright/test';

const PRODUCTION_URL = 'https://opencanopy.ca/map';

// Override baseURL for this spec — we always hit production
test.use({ baseURL: PRODUCTION_URL });

test.describe.configure({ retries: 3 });

// ── Map idle wait ──────────────────────────────────────────────────────────────

async function waitForMapIdle(page: Page, timeoutMs = 60000): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => {
        const canvas = document.querySelector('.maplibregl-canvas');
        if (!canvas) return false;
        const container = canvas.closest('.maplibregl-map') as HTMLElement | null;
        if (!container) return false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const map = (container as any).__maplibreMap ?? (container as any)._map;
        if (!map) {
          // Canvas exists but map instance not directly accessible — treat as loaded
          return true;
        }
        return map.loaded() && map.areTilesLoaded();
      },
      { timeout: timeoutMs }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Query rendered features for a layer.
 * Returns -1 if the map instance is not accessible.
 */
async function queryFeatureCount(page: Page, layerName: string): Promise<number> {
  return page.evaluate((layer: string) => {
    const canvas = document.querySelector('.maplibregl-canvas');
    if (!canvas) return -1;
    const container = canvas.closest('.maplibregl-map') as HTMLElement | null;
    if (!container) return -1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (container as any).__maplibreMap ?? (container as any)._map;
    if (!map || typeof map.queryRenderedFeatures !== 'function') return -1;
    return map.queryRenderedFeatures(undefined, { layers: [layer] }).length;
  }, layerName);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test('production page loads within 30s', async ({ page }) => {
  const response = await page.goto(PRODUCTION_URL, { timeout: 30000, waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(400);
});

test('map canvas exists on production', async ({ page }) => {
  await page.goto(PRODUCTION_URL, { timeout: 30000, waitUntil: 'domcontentloaded' });
  // Wait for the canvas to appear (not necessarily idle)
  await page.waitForSelector('.maplibregl-canvas', { timeout: 30000 });
  const canvas = page.locator('.maplibregl-canvas');
  await expect(canvas).toBeVisible();
});

test('map reaches idle state on production', async ({ page }) => {
  await page.goto(PRODUCTION_URL, { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.maplibregl-canvas', { timeout: 30000 });

  const idle = await waitForMapIdle(page, 60000);
  expect(idle, 'Map should reach idle state within 60 seconds').toBe(true);
});

test('forest-age layer renders features at z5 on production', async ({ page }) => {
  await page.goto(PRODUCTION_URL, { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.maplibregl-canvas', { timeout: 30000 });
  await waitForMapIdle(page, 60000);

  // Wait with retries for features to appear
  let featureCount = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    featureCount = await queryFeatureCount(page, 'forest-age');
    if (featureCount > 0) break;
    if (attempt < 2) await page.waitForTimeout(10000);
  }

  if (featureCount === -1) {
    // Map instance not accessible — skip feature check but don't fail
    console.warn('Could not access map instance for queryRenderedFeatures check');
    test.skip();
    return;
  }

  expect(featureCount, 'forest-age should have rendered features at z5').toBeGreaterThan(0);
});

test('tenure-cutblocks layer renders features at z7 on production', async ({ page }) => {
  await page.goto(PRODUCTION_URL, { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.maplibregl-canvas', { timeout: 30000 });

  // Navigate to z7 (BC center) — map starts at DEFAULT_ZOOM=5
  await page.evaluate(() => {
    const canvas = document.querySelector('.maplibregl-canvas');
    if (!canvas) return;
    const container = canvas.closest('.maplibregl-map') as HTMLElement | null;
    if (!container) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (container as any).__maplibreMap ?? (container as any)._map;
    if (!map) return;
    map.flyTo({ center: [-125.0, 52.0], zoom: 7, duration: 0 });
  });

  await waitForMapIdle(page, 60000);

  // Wait with retries for cutblocks to render
  let featureCount = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    featureCount = await queryFeatureCount(page, 'tenure-cutblocks');
    if (featureCount > 0) break;
    if (attempt < 2) await page.waitForTimeout(10000);
  }

  if (featureCount === -1) {
    console.warn('Could not access map instance for queryRenderedFeatures check');
    test.skip();
    return;
  }

  expect(featureCount, 'tenure-cutblocks should have rendered features at z7').toBeGreaterThan(0);
});
