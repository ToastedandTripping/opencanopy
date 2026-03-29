/**
 * MVT (Mapbox Vector Tile) parsing utilities.
 *
 * Uses @mapbox/vector-tile + pbf, which are transitive dependencies
 * of maplibre-gl and verified to be importable in this environment.
 *
 * Handles gzip-compressed tiles transparently.
 */

import { gunzipSync } from "zlib";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const VectorTileLib = require("@mapbox/vector-tile");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PbfLib = require("pbf");

// @mapbox/vector-tile uses CommonJS exports
const { VectorTile } = VectorTileLib;

// pbf is transpiled ESM -- use .default if available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Pbf: new (buf: Uint8Array) => unknown = (PbfLib as any).default ?? PbfLib;

// Magic bytes for gzip
const GZIP_MAGIC = 0x1f8b;

/**
 * Parse a raw MVT tile (optionally gzip-compressed) into a VectorTile object.
 * Layers are accessible as tile.layers[layerName].
 */
export function parseTile(data: ArrayBuffer): typeof VectorTile.prototype {
  const bytes = Buffer.from(data);

  // Detect and decompress gzip
  const isGzip = bytes.length >= 2 && bytes.readUInt16BE(0) === GZIP_MAGIC;
  const raw = isGzip ? gunzipSync(bytes) : bytes;

  const pbf = new Pbf(new Uint8Array(raw));
  return new VectorTile(pbf);
}

/**
 * Get all feature objects from a named source layer in a parsed tile.
 * Returns an empty array if the layer doesn't exist.
 */
export function getLayerFeatures(
  tile: typeof VectorTile.prototype,
  layerName: string
): unknown[] {
  const layer = tile.layers[layerName];
  if (!layer) return [];

  const features: unknown[] = [];
  for (let i = 0; i < layer.length; i++) {
    features.push(layer.feature(i));
  }
  return features;
}

/**
 * Get the property keys present in the first N features of a named layer.
 * Used to verify property preservation during tiling.
 */
export function getLayerPropertyKeys(
  tile: typeof VectorTile.prototype,
  layerName: string,
  sampleSize = 10
): Set<string> {
  const layer = tile.layers[layerName];
  if (!layer) return new Set();

  const keys = new Set<string>();
  const limit = Math.min(sampleSize, layer.length);
  for (let i = 0; i < limit; i++) {
    const feature = layer.feature(i);
    const props = feature.properties;
    if (props) {
      Object.keys(props).forEach((k) => keys.add(k));
    }
  }
  return keys;
}
