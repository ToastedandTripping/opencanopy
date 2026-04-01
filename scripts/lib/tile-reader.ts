/**
 * TileReader — Shared PMTiles tile access with LRU caching.
 *
 * Replaces the 7+ copies of fetchTile/readTile scattered across audit scripts.
 * All audits receive a single TileReader instance, so tiles read by one audit
 * are available to subsequent audits without re-reading from disk.
 *
 * Usage:
 *   const reader = new TileReader("data/tiles/opencanopy.pmtiles");
 *   const features = await reader.featuresAt(49.9, -119.5, "forest-age");
 *   await reader.close();
 */

import { PMTiles } from "pmtiles";
import { NodeFileSource } from "./node-file-source";
import { latLonToTile } from "./tile-math";
import { parseTile, getLayerFeatures, getLayerPropertyKeys } from "./mvt-reader";
import { ZOOMS } from "./audit-config";

// Re-export mvt-reader utilities so audits don't need a separate import
export { parseTile, getLayerFeatures, getLayerPropertyKeys };

// ── Types ────────────────────────────────────────────────────────────────────

/** Parsed MVT tile (opaque VectorTile object) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ParsedTile = any;

export interface TileReaderOptions {
  /** Maximum number of parsed tiles to cache (default: 512) */
  cacheSize?: number;
}

// ── TileReader ───────────────────────────────────────────────────────────────

export class TileReader {
  private pmtiles: PMTiles;
  private source: NodeFileSource;
  private cache = new Map<string, { tile: ParsedTile | null; lastUsed: number }>();
  private maxCache: number;
  private accessCounter = 0;

  constructor(pmtilesPath: string, options?: TileReaderOptions) {
    this.source = new NodeFileSource(pmtilesPath);
    this.pmtiles = new PMTiles(this.source);
    this.maxCache = options?.cacheSize ?? 512;
  }

  /** Access the underlying PMTiles instance (for metadata, etc.) */
  get raw(): PMTiles {
    return this.pmtiles;
  }

  /**
   * Read and parse a tile at z/x/y. Returns null if tile doesn't exist.
   * Results are cached — repeated reads of the same tile are free.
   */
  async getTile(z: number, x: number, y: number): Promise<ParsedTile | null> {
    const key = `${z}/${x}/${y}`;
    const cached = this.cache.get(key);
    if (cached) {
      cached.lastUsed = ++this.accessCounter;
      return cached.tile;
    }

    let tile: ParsedTile | null = null;
    try {
      const result = await this.pmtiles.getZxy(z, x, y);
      if (result?.data) {
        tile = parseTile(result.data);
      }
    } catch {
      // Tile doesn't exist or is corrupt — null is correct
    }

    // Evict LRU if at capacity
    if (this.cache.size >= this.maxCache) {
      let oldestKey = "";
      let oldestTime = Infinity;
      for (const [k, v] of this.cache) {
        if (v.lastUsed < oldestTime) {
          oldestTime = v.lastUsed;
          oldestKey = k;
        }
      }
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, { tile, lastUsed: ++this.accessCounter });
    return tile;
  }

  /**
   * Get the raw ArrayBuffer for a tile (for direct access without parsing).
   */
  async getRawTile(z: number, x: number, y: number): Promise<ArrayBuffer | null> {
    try {
      const result = await this.pmtiles.getZxy(z, x, y);
      return result?.data ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Get features from a specific layer at a lat/lon point.
   * Convenience method that handles coordinate conversion and tile parsing.
   */
  async featuresAt(
    lat: number,
    lon: number,
    layer: string,
    zoom: number = ZOOMS.feature
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ features: any[]; tileExists: boolean; tileCoord: { z: number; x: number; y: number } }> {
    const { x, y, z } = latLonToTile(lat, lon, zoom);
    const tile = await this.getTile(z, x, y);
    if (!tile) {
      return { features: [], tileExists: false, tileCoord: { z, x, y } };
    }
    return {
      features: getLayerFeatures(tile, layer),
      tileExists: true,
      tileCoord: { z, x, y },
    };
  }

  /**
   * Get all layers' features at a lat/lon point in a single tile read.
   * More efficient than calling featuresAt() for each layer separately.
   */
  async allFeaturesAt(
    lat: number,
    lon: number,
    layers: readonly string[],
    zoom: number = ZOOMS.feature
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<{ layerFeatures: Map<string, any[]>; tileExists: boolean }> {
    const { x, y, z } = latLonToTile(lat, lon, zoom);
    const tile = await this.getTile(z, x, y);
    if (!tile) {
      return { layerFeatures: new Map(), tileExists: false };
    }

    const layerFeatures = new Map<string, unknown[]>();
    for (const layer of layers) {
      layerFeatures.set(layer, getLayerFeatures(tile, layer));
    }
    return { layerFeatures, tileExists: true };
  }

  /** Number of tiles currently in cache */
  get cacheSize(): number {
    return this.cache.size;
  }

  /** Clear the tile cache */
  clearCache(): void {
    this.cache.clear();
    this.accessCounter = 0;
  }

  /** Close the PMTiles file handle */
  async close(): Promise<void> {
    this.cache.clear();
    await this.source.close();
  }
}
