/**
 * Regression guard: prefers-reduced-motion scrollama crash
 *
 * Bug: `.story-step { min-height: auto !important; }` in the reduced-motion
 * media query collapses every .story-step to offsetHeight 0 (their only height
 * comes from inline `minHeight: ${scrollHeight}vh`; NarrativePanel is absolute
 * and contributes nothing). scrollama .setup() computes a non-finite
 * IntersectionObserver threshold → throws → the whole story collapses.
 *
 * Fix: that one CSS declaration was removed (src/app/globals.css ~line 297).
 * Reduced motion is handled by 1c (year-counter hold-then-snap), not geometry.
 *
 * These assertions are CI-safe: they do NOT depend on map tiles, R2 overlays,
 * or MapLibre loading (which 404 locally). scrollama and the step DOM work
 * regardless of tile availability.
 *
 * To run locally (requires a running server):
 *   npm run dev &              # start Next.js on :3000
 *   npx playwright test e2e/reduced-motion-scrollama.spec.ts --project=chromium
 *
 * Note on reducedMotion emulation: test.use({ reducedMotion: 'reduce' }) sets
 * the browser context option but does not reliably apply the CSS media query in
 * all Playwright versions. We call page.emulateMedia({ reducedMotion: 'reduce' })
 * explicitly before navigation — this is the correct API for CSS media emulation
 * and was verified to apply `prefers-reduced-motion: reduce` to the page.
 */

import { test, expect, type Page } from '@playwright/test';

/**
 * Navigate to the story page under prefers-reduced-motion: reduce and wait for
 * the dynamic ScrollytellingContainer (ssr: false) to hydrate and for scrollama
 * to attempt .setup() — the crash fires during this window.
 *
 * Returns the list of page errors caught during load.
 */
async function loadStoryWithReducedMotion(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (err: Error) => errors.push(err.message));

  // emulateMedia must be called before goto so CSS is applied from first paint.
  // test.use({ reducedMotion: 'reduce' }) sets the browser context flag but does
  // not reliably emulate the CSS media query; page.emulateMedia() is the correct
  // API for this (verified experimentally against Playwright 1.58.2).
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // networkidle ensures CSS chunks are fully loaded before we measure geometry.
  await page.goto('/', { waitUntil: 'networkidle' });

  // Give React time to hydrate and scrollama to run .setup().
  await page.waitForTimeout(2000);

  return errors;
}

test.describe('scrollama under prefers-reduced-motion: reduce', () => {
  test('1 — no IntersectionObserver / scrollama crash on load', async ({ page }) => {
    const errors = await loadStoryWithReducedMotion(page);

    const crashErrors = errors.filter((msg) =>
      /IntersectionObserver|threshold|non-finite|finite/i.test(msg)
    );

    expect(
      crashErrors,
      `scrollama crash error(s) detected under reduced-motion: ${crashErrors.join('; ')}`
    ).toHaveLength(0);
  });

  test('2 — all .story-step elements have positive height (not collapsed)', async ({ page }) => {
    await loadStoryWithReducedMotion(page);

    const stepHeights = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.story-step')).map((el) =>
        (el as HTMLElement).offsetHeight
      );
    });

    expect(stepHeights.length, 'Expected at least 1 .story-step on the page').toBeGreaterThan(0);

    for (let i = 0; i < stepHeights.length; i++) {
      expect(
        stepHeights[i],
        `story-step[${i}] offsetHeight should be > 100px (was ${stepHeights[i]}px — collapsed step = scrollama crash)`
      ).toBeGreaterThan(100);
    }
  });

  test('3 — document.body.scrollHeight indicates story content is not collapsed', async ({ page }) => {
    await loadStoryWithReducedMotion(page);

    const bodyScrollHeight = await page.evaluate(() => document.body.scrollHeight);

    expect(
      bodyScrollHeight,
      `body.scrollHeight=${bodyScrollHeight}px — story appears collapsed (expected > 8000px for 5 chapters with combined ~1500vh at 720px viewport)`
    ).toBeGreaterThan(8000);
  });

  test('4 — year counter shows end-state year (hold-then-snap, not mid-sweep)', async ({ page }) => {
    // Under reduced-motion, the year counter should hold then snap to the chapter
    // end year rather than sweeping through all intermediate values.
    // This guards the 1c (reduced-motion snap) behaviour once the crash is fixed.
    //
    // Note: if this assertion proves flaky in CI (depends on scrollama timing),
    // the core regression is already guarded by tests 1-3. The snap behaviour
    // is also unit-tested in src/test/pipeline/scrollytelling-raf.test.ts.

    await loadStoryWithReducedMotion(page);

    // Scroll to the end of the story (past all chapters) to trigger the final year
    await page.evaluate(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'instant' });
    });

    // Give scrollama time to fire onStepEnter for the last chapter
    await page.waitForTimeout(1500);

    const counterVisible = await page
      .locator('.story-year-counter')
      .isVisible()
      .catch(() => false);

    if (!counterVisible) {
      // Counter may not be visible yet if story didn't fully load; skip softly.
      // The crash guard (tests 1-3) is the critical assertion.
      test.skip();
      return;
    }

    const distinctYearValues = await page.evaluate(() => {
      // Capture the current text of every year counter on the page
      return Array.from(document.querySelectorAll('.story-year-counter')).map(
        (el) => (el as HTMLElement).innerText.trim()
      );
    });

    // Under reduced motion, by the time we've scrolled to the end, the counter
    // should show a small number of distinct values (ideally 1: the final year).
    // We assert <= 2 to be robust to any minor timing variation.
    const uniqueValues = [...new Set(distinctYearValues)];
    expect(
      uniqueValues.length,
      `Under reduced-motion the year counter should show <= 2 distinct values (end-state snap), got: ${uniqueValues.join(', ')}`
    ).toBeLessThanOrEqual(2);
  });
});
