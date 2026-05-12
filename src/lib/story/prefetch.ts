/**
 * Tile prefetching for scrollytelling chapters.
 *
 * Since every camera position is known in advance, we can pre-warm
 * the browser tile cache on initial load so layers appear instantly
 * as the user scrolls.
 */

import { CHAPTERS } from "@/data/chapters";

const R2_BASE = "https://pub-b5568be386ef4e638b4e49af41395600.r2.dev";
const RASTER_URL_TEMPLATE = `${R2_BASE}/raster/forest-age/{z}/{x}/{y}.png`;

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

/**
 * Prefetch raster overview tiles for all chapter viewports.
 * Uses Image() elements so tiles land in the browser HTTP cache.
 * MapLibre will reuse them when it requests the same URLs.
 */
export function prefetchStoryTiles(): void {
  if (typeof Image === "undefined") return;

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

/**
 * Prefetch terrain DEM tiles for chapters that use 3D terrain.
 * Extends the existing Fairy Creek prefetch to cover all terrain chapters.
 */
export function prefetchTerrainTiles(maptilerKey: string): void {
  if (typeof Image === "undefined" || !maptilerKey) return;

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
