/**
 * Mobile sheet keyboard pass (P2 a11y relay, part C -- useDialogA11y).
 *
 * Unit tests exercise the hook's guard logic against injected fixtures
 * (src/hooks/useDialogA11y.test.tsx), but real CSS (Tailwind's
 * `hidden`/`md:hidden` responsive display, which decides which of the two
 * simultaneously-rendered panel variants is actually visible) can't be
 * exercised in happy-dom. This is the one real-browser pass over that path.
 *
 * Keyless-safe: the LayerPanel is plain DOM (toggle buttons + a scrollable
 * list) -- it doesn't touch the MapLibre canvas, so it renders fully
 * without a MAPTILER_KEY. The panel's underlying map DOES fail to load
 * tiles/style in this environment, but that failure is silent at the
 * browser API level (no React exception, no MapErrorBoundary fallback),
 * so the toolbar and panels stay reachable.
 *
 * To run locally (requires a running dev server):
 *   npm run dev &
 *   npx playwright test e2e/mobile-sheet-keyboard.spec.ts --project=chromium
 */

import { test, expect } from '@playwright/test';

test.describe('LayerPanel mobile bottom sheet -- Tab trap, Escape-close, focus restore', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Tab cycles within the sheet, wraps at both ends, Escape closes, and focus restores to the trigger button', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    // networkidle + a short settle wait, not domcontentloaded -- this route
    // ships a heavy MapLibre bundle, and domcontentloaded resolves before
    // React finishes hydrating it. A too-early click lands on a real,
    // visible, focusable <button> whose onClick isn't attached yet (native
    // focus/visibility work pre-hydration; the custom handler doesn't),
    // which silently no-ops forever rather than erroring -- exactly the
    // failure mode this caused before this fix. Same pattern as
    // e2e/reduced-motion-scrollama.spec.ts.
    await page.goto('/map', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const trigger = page.getByRole('button', { name: 'Toggle layer panel' });
    await trigger.waitFor({ state: 'visible' });
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // The mobile sheet is the one with role="dialog" -- the simultaneously
    // -rendered desktop variant is role="region", so this is unambiguous
    // even though both are in the DOM.
    const sheet = page.locator('[role="dialog"][aria-label="Layers"]');
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute('aria-modal', 'true');

    const closeButton = sheet.getByRole('button', { name: 'Close layer panel' });

    // 1) Focus-in on open: the close button gets focus, not the invisible
    //    desktop variant's close button.
    await expect(closeButton).toBeFocused();

    const focusable = sheet.locator(
      'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const focusableCount = await focusable.count();
    expect(focusableCount).toBeGreaterThan(1);
    const lastFocusable = focusable.last();

    // 2) Forward Tab all the way through wraps back to the close button
    //    (the first element) instead of escaping the sheet.
    for (let i = 0; i < focusableCount; i++) {
      await page.keyboard.press('Tab');
    }
    await expect(closeButton).toBeFocused();

    // 3) Shift+Tab from the first (close button) wraps to the LAST
    //    focusable element -- the plan's explicit "shift+Tab wrap on the
    //    first element" case.
    await page.keyboard.press('Shift+Tab');
    await expect(lastFocusable).toBeFocused();

    // 4) Escape closes the sheet (handled by the page-level keydown
    //    handler, B1 -- useDialogA11y deliberately does not duplicate
    //    this) and focus restores to the trigger button that opened it.
    await page.keyboard.press('Escape');
    await expect(sheet).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');

    const relevantErrors = consoleErrors.filter((msg) => !/maplibre|tile|webgl/i.test(msg));
    expect(relevantErrors, `Unexpected page errors: ${relevantErrors.join('; ')}`).toHaveLength(0);
  });

  test('Tab does not escape the sheet mid-cycle even from a middle element', async ({ page }) => {
    // networkidle + a short settle wait, not domcontentloaded -- this route
    // ships a heavy MapLibre bundle, and domcontentloaded resolves before
    // React finishes hydrating it. A too-early click lands on a real,
    // visible, focusable <button> whose onClick isn't attached yet (native
    // focus/visibility work pre-hydration; the custom handler doesn't),
    // which silently no-ops forever rather than erroring -- exactly the
    // failure mode this caused before this fix. Same pattern as
    // e2e/reduced-motion-scrollama.spec.ts.
    await page.goto('/map', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const trigger = page.getByRole('button', { name: 'Toggle layer panel' });
    await trigger.click();

    const sheet = page.locator('[role="dialog"][aria-label="Layers"]');
    await expect(sheet).toBeVisible();

    // Tab a few times into the middle of the sheet's focus order, then
    // confirm focus is still inside the sheet (not escaped to the search
    // bar or some other page control).
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Tab');
    }
    const activeInsideSheet = await sheet.evaluate((el) => el.contains(document.activeElement));
    expect(activeInsideSheet).toBe(true);
  });
});
