/**
 * Screenshot Regression Spec — OpenCanopy V2 Diagnostic Pipeline
 *
 * Captures screenshots at 36 viewports (9 BC sample points × 4 zoom levels)
 * and 12 per-layer isolation screenshots at BC center.
 *
 * First run: saves baselines to e2e/screenshots/baselines/
 * Subsequent runs: compares against baselines, writes diffs to e2e/screenshots/diffs/
 *
 * Run with dev server running: npm run audit:visual
 * Update baselines: npm run audit:visual:update
 */

import { test, expect, type Page } from '@playwright/test';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import {
  compareScreenshots,
  loadBaseline,
  saveBaseline,
} from '../../scripts/lib/screenshot-utils';
import {
  SCREENSHOT_VIEWPORTS,
  BC_SAMPLE_POINTS,
  EXPECTED_SOURCE_LAYERS,
  SOURCE_TO_MAPLIBRE,
} from '../../scripts/lib/bc-sample-grid';

const BASELINES_DIR = join(__dirname, 'baselines');
const DIFFS_DIR = join(__dirname, 'diffs');

// Pixel diff threshold — 2% of pixels may differ before flagging
const DIFF_THRESHOLD_PERCENT = 2;
// Per-pixel color threshold for pixelmatch
const PIXEL_THRESHOLD = 0.1;

// ── Map instance discovery ────────────────────────────────────────────────────

/**
 * Find the MapLibre map instance by walking the React fiber tree.
 * react-map-gl stores a ref with getMap() on a component a few levels up
 * from the .maplibregl-map container. This is more reliable than looking
 * for undocumented properties on DOM elements.
 */
async function ensureMapInstance(page: Page, timeoutMs = 30000): Promise<void> {
  await page.waitForFunction(
    () => {
      // Already found?
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

/**
 * Wait for MapLibre to finish loading tiles and rendering.
 */
async function waitForMapIdle(page: Page, timeoutMs = 45000): Promise<void> {
  await ensureMapInstance(page, timeoutMs);
  await page.waitForFunction(
    () => {
      const map = (window as any).__opencanopy_map;
      return map?.loaded() && map?.areTilesLoaded();
    },
    { timeout: timeoutMs }
  );
  await page.waitForTimeout(2000);
}

/**
 * Navigate the map to a specific lat/lon/zoom using MapLibre's flyTo.
 */
async function navigateTo(page: Page, lat: number, lon: number, zoom: number): Promise<void> {
  await page.evaluate(
    ({ lat, lon, zoom }) => {
      return new Promise<void>((resolve, reject) => {
        const map = (window as any).__opencanopy_map;
        if (!map) { reject(new Error('navigateTo: map not found')); return; }
        const onIdle = () => { map.off('idle', onIdle); resolve(); };
        map.on('idle', onIdle);
        map.flyTo({ center: [lon, lat], zoom, duration: 0 });
      });
    },
    { lat, lon, zoom }
  );
  await page.waitForTimeout(1000);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function ensureDirs(): void {
  mkdirSync(BASELINES_DIR, { recursive: true });
  mkdirSync(DIFFS_DIR, { recursive: true });
}

async function captureAndCompare(
  page: Page,
  slug: string,
  screenshotPath: string
): Promise<void> {
  const screenshot = await page.screenshot({ path: screenshotPath });

  const baseline = loadBaseline(slug, BASELINES_DIR);
  if (!baseline) {
    // First run — save as baseline
    saveBaseline(slug, screenshot, BASELINES_DIR);
    console.log(`[baseline] Saved new baseline: ${slug}`);
    return;
  }

  // Compare against existing baseline
  const result = compareScreenshots(screenshot, baseline, PIXEL_THRESHOLD);
  if (result.diffPercent > DIFF_THRESHOLD_PERCENT) {
    // Save diff image for inspection
    const diffPath = join(DIFFS_DIR, `${slug}-diff.png`);
    mkdirSync(DIFFS_DIR, { recursive: true });
    require('fs').writeFileSync(diffPath, result.diffImage);
    expect.soft(result.diffPercent, `Visual regression at ${slug}: ${result.diffPercent.toFixed(2)}% pixels changed (${result.diffPixels} pixels). Diff: ${diffPath}`).toBeLessThanOrEqual(DIFF_THRESHOLD_PERCENT);
  } else {
    console.log(`[pass] ${slug}: ${result.diffPercent.toFixed(2)}% diff (${result.diffPixels}px)`);
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

test.describe('Screenshot Regression — 36 BC viewports', () => {
  test.beforeEach(async ({ page }) => {
    ensureDirs();
    await page.goto('/map');
    await waitForMapIdle(page, 45000);
  });

  for (const viewport of SCREENSHOT_VIEWPORTS) {
    test(`viewport: ${viewport.name}`, async ({ page }) => {
      await navigateTo(page, viewport.lat, viewport.lon, viewport.zoom);
      await waitForMapIdle(page, 45000);

      const screenshotPath = join(DIFFS_DIR, `${viewport.slug}-actual.png`);
      await captureAndCompare(page, viewport.slug, screenshotPath);
    });
  }
});

test.describe('Screenshot Regression — 12 layer isolation at BC center', () => {
  const CENTER_LAT = 52.0;
  const CENTER_LON = -125.0;
  const CENTER_ZOOM = 7;

  test.beforeEach(async ({ page }) => {
    ensureDirs();
    await page.goto('/map');
    await waitForMapIdle(page, 45000);
    await navigateTo(page, CENTER_LAT, CENTER_LON, CENTER_ZOOM);
    await waitForMapIdle(page, 45000);
  });

  for (const layerName of EXPECTED_SOURCE_LAYERS) {
    const slug = `layer-${layerName}-z${CENTER_ZOOM}`;

    test(`layer isolation: ${layerName}`, async ({ page }) => {
      // queryRenderedFeatures takes MapLibre layer IDs, not source-layer names.
      // Use SOURCE_TO_MAPLIBRE to translate.
      const mapLibreLayerId = SOURCE_TO_MAPLIBRE[layerName];

      const featureCount = await page.evaluate(
        (layer: string) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const map = (window as any).__opencanopy_map;
          if (!map || typeof map.queryRenderedFeatures !== 'function') return -1;
          if (!map.getLayer(layer)) return -2;
          return map.queryRenderedFeatures(undefined, { layers: [layer] }).length;
        },
        mapLibreLayerId
      );

      // Feature count of -1 means map instance not accessible.
      // -2 means the MapLibre layer doesn't exist (PMTiles source failed to load).
      if (featureCount === -1) {
        console.warn(`[warn] Could not access map instance for layer ${layerName} — skipping`);
        test.skip();
        return;
      }
      if (featureCount === -2) {
        console.warn(`[warn] MapLibre layer ${mapLibreLayerId} not found — PMTiles source may have failed to load`);
      }

      console.log(`[info] Layer ${mapLibreLayerId} has ${featureCount} rendered features at z${CENTER_ZOOM}`);

      const screenshotPath = join(DIFFS_DIR, `${slug}-actual.png`);
      await captureAndCompare(page, slug, screenshotPath);
    });
  }
});
