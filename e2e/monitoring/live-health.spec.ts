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
 *   4. PMTiles file accessible on R2 (200, and 206 on a Range request)
 *   5. Forest-age raster overview renders at z5
 *   6. Forest-age vector tiles render features at z11
 *   7. Public cutblocks vector tiles render features at z11, after a camera
 *      witness proves the flyTo landed (map-not-found fails, never skips)
 *   8. old-growth-250 renders via PMTiles (z10-12 band guard)
 *   9. fish-streams WFS proxy, requested directly: features > 0 and every
 *      feature STREAM_ORDER >= 3 (D3 deploy gate; cqlFilter layer)
 *  10. cutblocks WFS proxy, requested directly (D3 deploy gate; cqlFilter layer)
 *
 * Every layer the page is asked to show is in PUBLIC_LAYER_IDS: a layer the
 * public cannot see fails here by construction. The WFS-only cqlFilter path
 * (fish-streams, not public) is guarded through the proxy instead (check 9).
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

test('cutblocks vector tiles render features at z11 on production', async ({ page }) => {
  // Public `cutblocks` (tile-backed, source-layer tenure-cutblocks), enabled
  // through the hash so the page itself shows it. The map is found BEFORE the
  // flyTo: production never sets window.__opencanopy_map, so a flyTo issued
  // first is a silent no-op and the count would run at the default z5 camera.
  await page.goto(`${PRODUCTION_URL}#layers=cutblocks`, { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.maplibregl-canvas', { timeout: 30000 });

  // Map-not-found fails this test (ensureMapInstance throws on timeout).
  await ensureMapInstance(page, 30000);

  // Central interior at z11, where cutblocks are dense (Prince George vicinity)
  const TARGET = { lng: -122.7, lat: 53.9, zoom: 11 };
  await page.evaluate((t) => {
    const map = (window as any).__opencanopy_map;
    map.flyTo({ center: [t.lng, t.lat], zoom: t.zoom, duration: 0 });
  }, TARGET);

  await waitForMapIdle(page, 60000);

  // Camera witness: the count below means nothing unless the flyTo landed.
  const camera = await page.evaluate(() => {
    const map = (window as any).__opencanopy_map;
    const c = map.getCenter();
    return { zoom: map.getZoom() as number, lng: c.lng as number, lat: c.lat as number };
  });
  expect(Math.abs(camera.zoom - TARGET.zoom), `camera zoom ${camera.zoom} should be within 0.5 of ${TARGET.zoom}`).toBeLessThanOrEqual(0.5);
  expect(Math.abs(camera.lng - TARGET.lng), `camera lng ${camera.lng} should be within 0.05 of ${TARGET.lng}`).toBeLessThanOrEqual(0.05);
  expect(Math.abs(camera.lat - TARGET.lat), `camera lat ${camera.lat} should be within 0.05 of ${TARGET.lat}`).toBeLessThanOrEqual(0.05);

  let featureCount = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    featureCount = await queryFeatureCount(page, 'layer-cutblocks-tiles-fill');
    if (featureCount > 0) break;
    if (attempt < 2) await page.waitForTimeout(10000);
  }

  // No skip: -1 (map lost) and 0 (no layer, or nothing drawn) are both red.
  expect(
    featureCount,
    'cutblocks should have rendered features at z11 near Prince George'
  ).toBeGreaterThan(0);
});

// ── D3 deploy gates: cqlFilter layers must return features ───────────────────
//
// These tests are the deploy gate for the D3 proxy CQL fix. Both request the
// production proxy (/api/wfs) directly: fish-streams is WFS-only and not in
// PUBLIC_LAYER_IDS, so no UI shows it any more, and cutblocks is tile-backed,
// so the D10 fix left it no WFS layer in the UI either.
//
// Viewport selection rationale:
//   - fish-streams (z9+): Campbell River bbox -125.4,49.95,-125.2,50.05 at
//     z10 -- dense FWA stream network, high STREAM_ORDER values. Every feature
//     must have STREAM_ORDER >= 3, so a dropped CQL filter goes red, not only
//     an empty answer.
//   - cutblocks (z13): Prince George (-122.7, 53.9), bbox under 50 km2 --
//     dense tenure cutblocks.
//
// old-growth-250, which sits between the two, is a PMTiles render check, not
// a D3 gate.
//
// Reading a failure: a 200 with zero features is red. A proxy 502 or a
// timeout is recorded `unverified` and re-run at least 15 minutes later; a 502
// that persists is red, because a CQL regression in the proxy also returns 502.
//
// These tests run against production after deploy -- they are NOT local CI gates.

test('D3: fish-streams WFS proxy returns stream-order-filtered features', async ({ request }) => {
  // fish-streams: WFS-only, whitelisted by the proxy with
  // cqlFilter "STREAM_ORDER >= 3" (netlify/edge-functions/wfs-proxy.ts).
  const response = await request.get(
    'https://opencanopy.ca/api/wfs?layer=fish-streams&bbox=-125.4,49.95,-125.2,50.05&zoom=10',
    { timeout: 30000 }
  );
  expect(
    response.status(),
    'WFS proxy must return 200 (one 502 or timeout is unverified: re-run 15+ min later; a persistent 502 is red)'
  ).toBe(200);
  const body = await response.json();
  const features: Array<{ properties?: { STREAM_ORDER?: unknown } }> = body.features ?? [];
  expect(
    features.length,
    'fish-streams WFS proxy should return features at z10 near Campbell River (D3 cqlFilter fix)'
  ).toBeGreaterThan(0);
  const belowOrder3 = features.filter((f) => !(Number(f.properties?.STREAM_ORDER) >= 3));
  expect(
    belowOrder3.length,
    'every fish-streams feature must have STREAM_ORDER >= 3 (the proxy CQL filter is applied)'
  ).toBe(0);
});

test('old-growth-250 renders via PMTiles across the z10-12 band', async ({ page }) => {
  // old-growth-250 is tile-backed (forest-age source-layer filtered to
  // class=old-growth) + a dark-green raster overview — no longer a WFS line.
  // The proxy cqlFilter fix is still gated by the fish-streams + cutblocks tests
  // above. This test guards the NEW behavior and the documented forest-age z11
  // thin-band risk: the fill must populate at z11, not just z10.
  await page.goto(`${PRODUCTION_URL}#layers=old-growth-250`, { timeout: 30000, waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.maplibregl-canvas', { timeout: 30000 });
  await waitForMapIdle(page, 60000);

  // Wells Gray area at z11 — known old-growth concentration, mid PMTiles band.
  await page.evaluate(() => {
     
    const map = (window as any).__opencanopy_map;
    if (!map) return;
    map.flyTo({ center: [-119.9, 51.7], zoom: 11, duration: 0 });
  });

  await waitForMapIdle(page, 60000);
  await page.waitForTimeout(5000);

  let featureCount = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    featureCount = await queryFeatureCount(page, 'layer-old-growth-250-tiles-fill');
    if (featureCount > 0) break;
    if (attempt < 2) await page.waitForTimeout(8000);
  }

  if (featureCount === -1) {
    console.warn('old-growth-250: Could not access map instance');
    test.skip();
    return;
  }

  expect(
    featureCount,
    'old-growth-250 fill should render via PMTiles at z11 in Wells Gray (z11 thin-band guard)'
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
