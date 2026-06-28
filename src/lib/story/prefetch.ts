/**
 * Tile prefetching for scrollytelling chapters.
 *
 * Since every camera position is known in advance, we can pre-warm
 * the browser tile cache on initial load so layers appear instantly
 * as the user scrolls.
 */

import { CHAPTERS, STORY_END_CAMERA } from "@/data/chapters";
import {
  YEAR_OVERLAY_URL_PATTERN,
  YEAR_OVERLAY_RANGE,
  FIRE_OVERLAY_URL_PATTERN,
  FIRE_OVERLAY_RANGE,
} from "@/lib/story/setup-layers";
import { FOREST_AGE_RASTER_URL, BINARY_RASTER_URL } from "@/lib/r2-config";

const RASTER_URL_TEMPLATE = FOREST_AGE_RASTER_URL;

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

let storyPrefetchStarted = false;

/**
 * Prefetch raster overview tiles for all chapter viewports.
 * Uses Image() elements so tiles land in the browser HTTP cache.
 * MapLibre will reuse them when it requests the same URLs.
 * Idempotent: safe to call from both HeroSection and StoryMap.
 */
export function prefetchStoryTiles(): void {
  if (storyPrefetchStarted || typeof Image === "undefined") return;
  storyPrefetchStarted = true;

  const seen = new Set<string>();
  const urls: string[] = [];

  for (const chapter of CHAPTERS) {
    const [lon, lat] = chapter.camera.center;
    const zoom = chapter.camera.zoom;

    const zoomFloor = Math.floor(zoom);
    const zoomLevels =
      zoomFloor >= 4 && zoomFloor <= 8
        ? [zoomFloor, Math.min(zoomFloor + 1, 9)]
        : [zoomFloor];

    for (const z of zoomLevels) {
      const tiles = viewportTiles(lon, lat, z);
      for (const { z: tz, x, y } of tiles) {
        const key = `${tz}/${x}/${y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        urls.push(
          RASTER_URL_TEMPLATE.replace("{z}", String(tz))
            .replace("{x}", String(x))
            .replace("{y}", String(y))
        );
      }
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

  loadBatch();
}

let binaryPrefetchStarted = false;

/**
 * Prefetch binary end-reveal raster tiles for the ending + remains chapters.
 *
 * Warms two viewports:
 *   1. Province scale (z5-z6) — the ending chapter entry view
 *   2. Old-growth pocket (z7-z8) — STORY_END_CAMERA, the dolly destination
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

  // Pocket zoom: STORY_END_CAMERA viewport (z7-z8) — the dolly landing spot
  const [pocketLon, pocketLat] = STORY_END_CAMERA.center;
  for (const z of [7, 8]) {
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

  // Defer behind the story + year-overlay prefetch so they get bandwidth first.
  // The binary reveal is the last beat in the story; a 1s head-start is plenty.
  setTimeout(loadBatch, 1000);
}

let terrainPrefetchStarted = false;

/**
 * Prefetch terrain DEM tiles for chapters that use 3D terrain.
 * Extends the existing Fairy Creek prefetch to cover all terrain chapters.
 * Idempotent: safe to call from both HeroSection and StoryMap.
 */
export function prefetchTerrainTiles(maptilerKey: string): void {
  if (terrainPrefetchStarted || typeof Image === "undefined" || !maptilerKey) return;
  terrainPrefetchStarted = true;

  const seen = new Set<string>();

  for (const chapter of CHAPTERS) {
    if (!chapter.terrain.enabled) continue;
    const [lon, lat] = chapter.camera.center;
    const z = Math.min(Math.floor(chapter.camera.zoom), 12);
    const tiles = viewportTiles(lon, lat, z, 1);

    for (const { z: tz, x, y } of tiles) {
      const key = `${tz}/${x}/${y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = `https://api.maptiler.com/tiles/terrain-rgb-v2/${tz}/${x}/${y}.webp?key=${maptilerKey}`;
    }
  }
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
