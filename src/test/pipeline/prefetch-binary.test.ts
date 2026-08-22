/**
 * prefetchBinaryTiles — URL generation test.
 *
 * Verifies that prefetchBinaryTiles() emits BINARY_RASTER_URL-pattern URLs
 * at the expected zoom levels for:
 *   1. Province viewport (z5-z6, centered on BC)
 *   2. NOTHING deeper: the old-growth pocket (z7-z8) used to be warmed for the
 *      ending dolly. The dolly is docked (tag dock/dolly-live-scrub, 2026-08-21)
 *      and the zoom is /map's job via the CTA deep-link, so those tiles must
 *      not be fetched on every landing-page load.
 *
 * Uses vi.resetModules() to bypass the binaryPrefetchStarted idempotency
 * guard and get a fresh module instance. Uses vi.useFakeTimers() to fire
 * the 1s-deferred loadBatch without actually waiting.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { BINARY_RASTER_URL } from "@/lib/r2-config";

// ── Binary URL pattern guard ──────────────────────────────────────────────────
//
// BINARY_RASTER_URL shape: .../raster/v3/binary/{z}/{x}/{y}.png
// We check resolved URLs match this pattern so that any rename / restructure
// is caught here before the tiles 404 in production.
const BINARY_URL_RE = /\/raster\/v3\/binary\/\d+\/\d+\/\d+\.png$/;

/** Capture all Image src assignments during a prefetchBinaryTiles() call. */
async function runPrefetchAndCaptureUrls(): Promise<string[]> {
  const capturedUrls: string[] = [];

  // Mock Image so tile fetches don't hit the network and we can inspect the URLs.
  class MockImage {
    crossOrigin = "";
    private _src = "";
    get src() {
      return this._src;
    }
    set src(url: string) {
      this._src = url;
      capturedUrls.push(url);
    }
  }
  vi.stubGlobal("Image", MockImage);
  vi.useFakeTimers();

  // Reset module registry so binaryPrefetchStarted resets to false in the
  // freshly-imported prefetch module.
  vi.resetModules();
  const { prefetchBinaryTiles } = await import("@/lib/story/prefetch");

  prefetchBinaryTiles();

  // Fire all pending timers (the 1s initial defer + any 100ms batch timers).
  vi.runAllTimers();

  return capturedUrls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("prefetchBinaryTiles URL generation", () => {
  it("emits at least one BINARY_RASTER_URL-pattern URL", async () => {
    const urls = await runPrefetchAndCaptureUrls();
    expect(urls.length).toBeGreaterThan(0);
  });

  it("all emitted URLs match the binary tile URL pattern", async () => {
    const urls = await runPrefetchAndCaptureUrls();
    for (const url of urls) {
      expect(url, `unexpected URL shape: ${url}`).toMatch(BINARY_URL_RE);
    }
  });

  it("emitted URLs share the same R2 base as BINARY_RASTER_URL", async () => {
    const urls = await runPrefetchAndCaptureUrls();
    // Derive the base from the canonical constant (single source of truth).
    const expectedBase = BINARY_RASTER_URL.replace("/{z}/{x}/{y}.png", "");
    for (const url of urls) {
      expect(url, `URL does not start with R2 base: ${url}`).toContain(
        expectedBase
      );
    }
  });

  it("includes z5 and z6 tiles (province viewport)", async () => {
    const urls = await runPrefetchAndCaptureUrls();
    const zLevels = new Set(
      urls.map((url) => {
        const m = url.match(/\/binary\/(\d+)\//);
        return m ? parseInt(m[1]) : -1;
      })
    );
    expect(zLevels.has(5), "missing z5 province tiles").toBe(true);
    expect(zLevels.has(6), "missing z6 province tiles").toBe(true);
  });

  it("does NOT prefetch z7/z8 pocket tiles (the ending dolly is docked)", async () => {
    const urls = await runPrefetchAndCaptureUrls();
    const zLevels = new Set(
      urls.map((url) => {
        const m = url.match(/\/binary\/(\d+)\//);
        return m ? parseInt(m[1]) : -1;
      })
    );
    expect(zLevels.has(7), "z7 pocket tiles prefetched — dolly warm-up crept back").toBe(false);
    expect(zLevels.has(8), "z8 pocket tiles prefetched — dolly warm-up crept back").toBe(false);
  });

  it("does not emit tiles outside z4-z9 (the raster overlay band)", async () => {
    const urls = await runPrefetchAndCaptureUrls();
    const zLevels = urls.map((url) => {
      const m = url.match(/\/binary\/(\d+)\//);
      return m ? parseInt(m[1]) : -1;
    });
    for (const z of zLevels) {
      expect(z, `out-of-band zoom ${z} should not be prefetched`).toBeGreaterThanOrEqual(4);
      expect(z, `out-of-band zoom ${z} should not be prefetched`).toBeLessThanOrEqual(9);
    }
  });

  it("deduplicates tiles — no duplicate URLs emitted", async () => {
    const urls = await runPrefetchAndCaptureUrls();
    const unique = new Set(urls);
    expect(
      unique.size,
      `got ${urls.length} URLs but only ${unique.size} are unique`
    ).toBe(urls.length);
  });
});
