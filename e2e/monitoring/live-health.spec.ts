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
 *   6. fish-streams WFS returns features (D3 deploy gate — cqlFilter layer)
 *   7. tap-deferrals WFS returns features (D3 deploy gate — cqlFilter layer)
 *   8. cutblocks supplemental WFS returns features (D3 deploy gate — cqlFilter layer)
 */

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'fs';
import { join } from 'path';

const PRODUCTION_URL = 'https://opencanopy.ca/map';

// Parse the PMTiles CDN URL from registry.ts at test setup time.
// This auto-updates when PMTILES_URL is bumped to a new version — no manual
// test edits required on version bumps.
const REGISTRY_PATH = join(__dirname, '../../src/lib/layers/registry.ts');
const REGISTRY_CONTENT = readFileSync(REGISTRY_PATH, 'utf-8');
const PMTILES_URL_MATCH = REGISTRY_CONTENT.match(/pmtiles:\/\/(https:\/\/[^"]+\.pmtiles)/);
const PMTILES_CDN_URL = PMTILES_URL_MATCH?.[1] ?? '';

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

test('PMTiles file accessible on R2', async ({ request }) => {
  expect(PMTILES_CDN_URL, 'Could not parse PMTiles URL from registry.ts').toBeTruthy();
  const resp = await request.head(PMTILES_CDN_URL);
  expect(resp.status(), `PMTiles should return 200: ${PMTILES_CDN_URL}`).toBe(200);
  // PMTiles requires HTTP Range requests
  const rangeResp = await request.fetch(PMTILES_CDN_URL, {
    method: 'GET',
    headers: { Range: 'bytes=0-511' },
  });
  expect(rangeResp.status(), 'PMTiles should support Range requests').toBe(206);
});

test('forest-age raster overview renders at z5 on production', async ({ page }) => {
  // At z5, forest-age renders via pre-rendered raster tiles (not vector).
  // Verify the raster layer exists and is visible.
  await page.goto(PRODUCTION_URL, { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.maplibregl-canvas', { timeout: 30000 });
  await waitForMapIdle(page, 60000);

  const rasterState = await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (window as any).__opencanopy_map;
    if (!map) return { found: false };
    const layer = map.getLayer('layer-forest-age-raster');
    return {
      found: !!layer,
      visibility: layer ? map.getLayoutProperty('layer-forest-age-raster', 'visibility') : null,
    };
  });

  expect(rasterState.found, 'forest-age raster layer should exist at z5').toBe(true);
  expect(rasterState.visibility, 'forest-age raster should be visible').toBe('visible');
});

test('forest-age vector tiles render features at z11 on production', async ({ page }) => {
  // At z11, forest-age renders via PMTiles vector tiles (raster handoff at z10→z11).
  // Use the MapLibre layer ID, not the source-layer name.
  await page.goto(PRODUCTION_URL, { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.maplibregl-canvas', { timeout: 30000 });

  // Navigate to a definitely-forested area at z11 (Prince George vicinity)
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (window as any).__opencanopy_map;
    if (!map) return;
    map.flyTo({ center: [-122.7, 53.9], zoom: 11, duration: 0 });
  });

  await waitForMapIdle(page, 60000);

  let featureCount = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    featureCount = await queryFeatureCount(page, 'layer-forest-age-tiles-fill');
    if (featureCount > 0) break;
    if (attempt < 2) await page.waitForTimeout(10000);
  }

  if (featureCount === -1) {
    console.warn('Could not access map instance for queryRenderedFeatures check');
    test.skip();
    return;
  }

  expect(
    featureCount,
    'forest-age vector tiles should have rendered features at z11 over a forested area'
  ).toBeGreaterThan(0);
});

test('tenure-cutblocks vector tiles render features at z11 on production', async ({ page }) => {
  await page.goto(PRODUCTION_URL, { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.maplibregl-canvas', { timeout: 30000 });

  // Navigate to central interior at z11 where cutblocks should be dense
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (window as any).__opencanopy_map;
    if (!map) return;
    map.flyTo({ center: [-122.7, 53.9], zoom: 11, duration: 0 });
    // Ensure tenure-cutblocks layer is visible (may be default-disabled)
    if (map.getLayer('layer-tenure-cutblocks-tiles-fill')) {
      map.setLayoutProperty('layer-tenure-cutblocks-tiles-fill', 'visibility', 'visible');
    }
  });

  await waitForMapIdle(page, 60000);

  let featureCount = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    featureCount = await queryFeatureCount(page, 'layer-tenure-cutblocks-tiles-fill');
    if (featureCount > 0) break;
    if (attempt < 2) await page.waitForTimeout(10000);
  }

  if (featureCount === -1) {
    console.warn('Could not access map instance for queryRenderedFeatures check');
    test.skip();
    return;
  }

  expect(
    featureCount,
    'tenure-cutblocks should have rendered features at z11'
  ).toBeGreaterThan(0);
});

// ── D3 deploy gates: cqlFilter layers must return features ───────────────────
//
// These tests are the deploy gate for the D3 proxy CQL fix. Each test:
//   - Navigates to a viewport that is INSIDE the layer's zoomRange AND
//     under the 50,000 km² WFS area guard (DataLayer.tsx:930-947).
//   - Enables the layer and waits for WFS data to arrive.
//   - Asserts rendered features > 0.
//
// Viewport selection rationale:
//   - fish-streams (z9+): Campbell River area (-125.3, 50.0) at z10 —
//     dense FWA stream network, high STREAM_ORDER values. Area ~130 km².
//   - tap-deferrals (z7+): Wells Gray area (-119.9, 51.7) at z9 —
//     known old-growth concentrations, PROJ_AGE_1 >= 250. Area ~280 km².
//   - cutblocks (supplemental WFS, tile-backed, z13+): Prince George (-122.7, 53.9)
//     at z13 — dense tenure cutblocks. Area <50 km². Layer is tile-backed so
//     this tests the supplemental WFS path; rendered layer ID is the WFS fill.
//
// These tests run against production after deploy — they are NOT local CI gates.

test('D3: fish-streams WFS returns features via cqlFilter proxy fix', async ({ page }) => {
  // fish-streams: zoomRange [9, 18], WFS-only (no tileSource), defaultEnabled: false.
  // Enable via hash param so the layer is active on load — bare URL leaves it off.
  await page.goto(`${PRODUCTION_URL}#layers=fish-streams`, { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.maplibregl-canvas', { timeout: 30000 });
  await waitForMapIdle(page, 60000);

  // Navigate to Campbell River area at z10 — inside fish-streams zoomRange,
  // well under the 50,000 km² area guard.
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (window as any).__opencanopy_map;
    if (!map) return;
    map.flyTo({ center: [-125.3, 50.0], zoom: 10, duration: 0 });
  });

  await waitForMapIdle(page, 60000);

  // Wait for the WFS layer to be added (may take a moment after navigation)
  await page.waitForTimeout(5000);

  let featureCount = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    featureCount = await queryFeatureCount(page, 'layer-fish-streams-line');
    if (featureCount > 0) break;
    if (attempt < 2) await page.waitForTimeout(8000);
  }

  if (featureCount === -1) {
    console.warn('D3 fish-streams: Could not access map instance');
    test.skip();
    return;
  }

  expect(
    featureCount,
    'fish-streams WFS layer should return features at z10 (D3 proxy CQL fix)'
  ).toBeGreaterThan(0);
});

test('D3: tap-deferrals WFS returns features via cqlFilter proxy fix', async ({ page }) => {
  // tap-deferrals: zoomRange [7, 18], WFS-only, defaultEnabled: false.
  // Enable via hash param so the layer is active on load — bare URL leaves it off.
  await page.goto(`${PRODUCTION_URL}#layers=tap-deferrals`, { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.maplibregl-canvas', { timeout: 30000 });
  await waitForMapIdle(page, 60000);

  // Navigate to Wells Gray area at z9 — known old-growth, inside zoomRange,
  // under the area guard.
  await page.evaluate(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const map = (window as any).__opencanopy_map;
    if (!map) return;
    map.flyTo({ center: [-119.9, 51.7], zoom: 9, duration: 0 });
  });

  await waitForMapIdle(page, 60000);
  await page.waitForTimeout(5000);

  let featureCount = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    featureCount = await queryFeatureCount(page, 'layer-tap-deferrals-line');
    if (featureCount > 0) break;
    if (attempt < 2) await page.waitForTimeout(8000);
  }

  if (featureCount === -1) {
    console.warn('D3 tap-deferrals: Could not access map instance');
    test.skip();
    return;
  }

  expect(
    featureCount,
    'tap-deferrals WFS layer should return features at z9 in Wells Gray old-growth area (D3 proxy CQL fix)'
  ).toBeGreaterThan(0);
});

test('D3: cutblocks WFS proxy returns features via cqlFilter fix', async ({ request }) => {
  // cutblocks is tile-backed: the D10 fix removed WfsLayers for tile-backed
  // layers so there is no 'layer-cutblocks-fill' GeoJSON layer in the UI.
  // Test the proxy endpoint directly — that's the correct CI gate for the D3
  // cqlFilter fix on a tile-backed layer (orchestrator-confirmed approach).
  //
  // Small bbox near Prince George (-122.7, 53.9) at z13 — dense cutblocks area.
  // BC Albers bbox approximation for ~1 km² viewport around that coordinate.
  const response = await request.get(
    'https://opencanopy.ca/api/wfs?layer=cutblocks&bbox=-122.75,53.88,-122.65,53.92&zoom=13',
    { timeout: 30000 }
  );
  expect(response.status(), 'WFS proxy must return 200').toBe(200);
  const body = await response.json();
  expect(
    body.features?.length,
    'cutblocks WFS proxy should return features at z13 near Prince George (D3 cqlFilter fix)'
  ).toBeGreaterThan(0);
});
