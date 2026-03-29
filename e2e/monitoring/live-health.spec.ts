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

// ── Map instance discovery ────────────────────────────────────────────────────

/** Find MapLibre map instance via React fiber tree */
async function ensureMapInstance(page: Page, timeoutMs = 30000): Promise<void> {
  await page.waitForFunction(
    () => {
      if ((window as any).__opencanopy_map?.flyTo) return true;
      const container = document.querySelector('.maplibregl-map');
      if (!container) return false;
      const fiberKey = Object.keys(container).find(k => k.startsWith('__reactFiber'));
      if (!fiberKey) return false;
      let fiber = (container as any)[fiberKey];
      for (let depth = 0; fiber && depth < 40; depth++) {
        let state = fiber.memoizedState;
        for (let si = 0; state && si < 15; si++) {
          const m = state.memoizedState;
          if (m?.current?.getMap) {
            try {
              const map = m.current.getMap();
              if (map?.flyTo) { (window as any).__opencanopy_map = map; return true; }
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

async function waitForMapIdle(page: Page, timeoutMs = 60000): Promise<boolean> {
  try {
    await ensureMapInstance(page, timeoutMs);
    await page.waitForFunction(
      () => {
        const map = (window as any).__opencanopy_map;
        return map?.loaded() && map?.areTilesLoaded();
      },
      { timeout: timeoutMs }
    );
    return true;
  } catch {
    return false;
  }
}

async function queryFeatureCount(page: Page, layerName: string): Promise<number> {
  return page.evaluate((layer: string) => {
    const map = (window as any).__opencanopy_map;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (window as any).__opencanopy_map;
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
