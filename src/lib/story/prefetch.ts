/**
 * Tile prefetching for scrollytelling chapters.
 *
 * Since every camera position is known in advance, we can pre-warm
 * the browser tile cache on initial load so layers appear instantly
 * as the user scrolls.
 */

import { STORY_END_CAMERA } from "@/data/chapters";
import {
  YEAR_OVERLAY_URL_PATTERN,
  YEAR_OVERLAY_RANGE,
  FIRE_OVERLAY_URL_PATTERN,
  FIRE_OVERLAY_RANGE,
} from "@/lib/story/setup-layers";
import { BINARY_RASTER_URL } from "@/lib/r2-config";
import { dollyVideoUrl, dollyPosterUrl, type DollyTier } from "@/lib/story/dolly-config";

function lon2tile(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * (1 << zoom));
}

function lat2tile(lat: number, zoom: number): number {
  const latRad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
      (1 << zoom)
  );
}

interface TileCoord {
  z: number;
  x: number;
  y: number;
}

function viewportTiles(
  centerLon: number,
  centerLat: number,
  zoom: number,
  margin = 2
): TileCoord[] {
  const z = Math.floor(zoom);
  if (z < 4 || z > 9) return [];
  const cx = lon2tile(centerLon, z);
  const cy = lat2tile(centerLat, z);
  const tiles: TileCoord[] = [];
  const maxTile = (1 << z) - 1;
  for (let dx = -margin; dx <= margin; dx++) {
    for (let dy = -margin; dy <= margin; dy++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x >= 0 && x <= maxTile && y >= 0 && y <= maxTile) {
        tiles.push({ z, x, y });
      }
    }
  }
  return tiles;
}

let binaryPrefetchStarted = false;

/**
 * Prefetch binary end-reveal raster tiles for the ending + remains chapters.
 *
 * Warms two viewports:
 *   1. Province scale (z5-z6) — the ending chapter entry view, and where the
 *      live map holds throughout `remains` now that the dolly is a video
 *      overlay rather than a live camera scrub.
 *   2. Old-growth pocket (z6-z8) — STORY_END_CAMERA. No chapter camera ever
 *      lands here anymore (DollyVideo owns the zoom), but it is still the
 *      dolly video's rendered destination AND the /map CTA hand-off target
 *      (CtaSection builds its hash from this same constant) — its tiles must
 *      be warm before the user arrives, whether via the video's final frame
 *      or the CTA link.
 *
 * Called from StoryMap.onLoad so tiles are in the browser cache well before
 * the user scrolls into the ending chapter.
 * Idempotent: safe to call multiple times.
 */
export function prefetchBinaryTiles(): void {
  if (binaryPrefetchStarted || typeof Image === "undefined") return;
  binaryPrefetchStarted = true;

  const seen = new Set<string>();
  const urls: string[] = [];

  // Province scale for the ending chapter entry (centered on BC)
  const [provinceLon, provinceLat] = [-125.5, 54.0];
  for (const z of [5, 6]) {
    const tiles = viewportTiles(provinceLon, provinceLat, z, 2);
    for (const { z: tz, x, y } of tiles) {
      const key = `b:${tz}/${x}/${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      urls.push(
        BINARY_RASTER_URL.replace("{z}", String(tz))
          .replace("{x}", String(x))
          .replace("{y}", String(y))
      );
    }
  }

  // Old-growth pocket (STORY_END_CAMERA) at z6-z8 — the /map CTA hand-off
  // target and the dolly video's rendered destination. Idempotent: seen-set
  // deduplicates any overlap with the province block above.
  const [pocketLon, pocketLat] = STORY_END_CAMERA.center;
  for (const z of [6, 7, 8]) {
    const tiles = viewportTiles(pocketLon, pocketLat, z, 2);
    for (const { z: tz, x, y } of tiles) {
      const key = `b:${tz}/${x}/${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      urls.push(
        BINARY_RASTER_URL.replace("{z}", String(tz))
          .replace("{x}", String(x))
          .replace("{y}", String(y))
      );
    }
  }

  let idx = 0;
  const BATCH_SIZE = 6;

  function loadBatch() {
    const end = Math.min(idx + BATCH_SIZE, urls.length);
    for (; idx < end; idx++) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = urls[idx];
    }
    if (idx < urls.length) {
      setTimeout(loadBatch, 100);
    }
  }

  // Defer behind the year-overlay prefetch so it gets bandwidth first.
  // The binary reveal is the last beat in the story; a 1s head-start is plenty.
  setTimeout(loadBatch, 1000);
}

let yearOverlayPrefetchStarted = false;

// Keep references so browser doesn't GC the decoded images before MapLibre needs them.
const yearOverlayCache: HTMLImageElement[] = [];

/**
 * Prefetch all per-year cutblock overlay PNGs (1950-2025).
 * ~3MB total. Stored in yearOverlayCache so they stay decoded in memory
 * for instant swaps during timeline scrubbing.
 * Idempotent: safe to call from both HeroSection and StoryMap.
 */
export function prefetchYearOverlays(): void {
  if (yearOverlayPrefetchStarted || typeof Image === "undefined") return;
  yearOverlayPrefetchStarted = true;

  const urls: string[] = [];
  for (let yr = YEAR_OVERLAY_RANGE.start; yr <= YEAR_OVERLAY_RANGE.end; yr++) {
    urls.push(YEAR_OVERLAY_URL_PATTERN.replace("{year}", String(yr)));
  }

  let idx = 0;
  const BATCH = 10;

  function loadBatch() {
    const end = Math.min(idx + BATCH, urls.length);
    for (; idx < end; idx++) {
      const img = new Image();
      img.src = urls[idx];
      yearOverlayCache.push(img);
    }
    if (idx < urls.length) {
      setTimeout(loadBatch, 30);
    }
  }

  loadBatch();
}

let fireOverlayPrefetchStarted = false;
const fireOverlayCache: HTMLImageElement[] = [];

/**
 * Prefetch all per-year wildfire overlay PNGs (1917-2025, ~5MB).
 * Fire is a later beat than the cutblock timeline, so this starts behind the
 * cutblock prefetch (a one-shot deferral) to keep the eager landing payload
 * small while still warming the cache well before the fire beat is reached.
 * Idempotent: safe to call from both HeroSection and StoryMap.
 */
export function prefetchFireOverlays(): void {
  if (fireOverlayPrefetchStarted || typeof Image === "undefined") return;
  fireOverlayPrefetchStarted = true;

  const urls: string[] = [];
  for (let yr = FIRE_OVERLAY_RANGE.start; yr <= FIRE_OVERLAY_RANGE.end; yr++) {
    urls.push(FIRE_OVERLAY_URL_PATTERN.replace("{year}", String(yr)));
  }

  let idx = 0;
  const BATCH = 12;

  function loadBatch() {
    const end = Math.min(idx + BATCH, urls.length);
    for (; idx < end; idx++) {
      const img = new Image();
      img.src = urls[idx];
      fireOverlayCache.push(img);
    }
    if (idx < urls.length) {
      setTimeout(loadBatch, 30);
    }
  }

  // Short defer so the cutblock overlays + base tiles get first call, then load
  // promptly — the fire PNGs must be decoded before the user scrubs onto them,
  // or the swap stutters. The fire beat is far down the scroll, so ~1.5s of
  // batched loading finishes well before it's reached.
  setTimeout(loadBatch, 300);
}

// ── Dolly video prefetch ───────────────────────────────────────────────────

const dollyVideoPrefetchStarted: Partial<Record<DollyTier, boolean>> = {};

/**
 * Warm the pre-rendered dolly video for the given tier: fetch both posters
 * (so DollyVideo's poster-decoded gate and its final-frame-still fallback are
 * both instant) and kick a hidden `<video preload="auto">` element so the
 * browser starts buffering the clip into its media cache ahead of activation.
 *
 * Call this when the `ending` chapter enters — one chapter of lead before
 * `remains`, where the video actually plays. DollyVideo's own <video> element
 * reuses the exact same URLs, so this is a pure cache warm (no double
 * download once the browser's HTTP/media cache has the response).
 *
 * Only the active tier is warmed to avoid wasting bandwidth on the unused
 * sequence. Idempotent: safe to call multiple times per tier.
 */
export function prefetchDollyVideo(tier: DollyTier): void {
  if (dollyVideoPrefetchStarted[tier] || typeof Image === "undefined") return;
  dollyVideoPrefetchStarted[tier] = true;

  const img1 = new Image();
  img1.src = dollyPosterUrl(tier, "start");
  const img2 = new Image();
  img2.src = dollyPosterUrl(tier, "end");

  if (typeof document === "undefined") return;

  const video = document.createElement("video");
  video.muted = true;
  video.preload = "auto";
  video.style.display = "none";

  const sourceWebm = document.createElement("source");
  sourceWebm.src = dollyVideoUrl(tier, "webm");
  sourceWebm.type = "video/webm";
  video.appendChild(sourceWebm);

  const sourceMp4 = document.createElement("source");
  sourceMp4.src = dollyVideoUrl(tier, "mp4");
  sourceMp4.type = "video/mp4";
  video.appendChild(sourceMp4);

  // load() kicks off buffering per `preload="auto"`; the element is never
  // attached to the DOM or played — it only exists to warm the browser's
  // media cache before DollyVideo mounts its own (URL-identical) <video>.
  video.load();
}
