/**
 * Tile coordinate math utilities.
 *
 * Slippy map tile conventions (Web Mercator / EPSG:3857).
 * All coordinates are WGS84 (lat/lon in decimal degrees).
 */

export interface TileCoord {
  x: number;
  y: number;
  z: number;
}

export interface LatLon {
  lat: number;
  lon: number;
}

export interface TileBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

/**
 * Convert WGS84 lat/lon to tile coordinates at a given zoom level.
 * Returns integer tile x, y, z.
 */
export function latLonToTile(lat: number, lon: number, zoom: number): TileCoord {
  const z = Math.floor(zoom);
  const n = Math.pow(2, z);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)), z };
}

/**
 * Get the WGS84 bounding box of a tile.
 * Returns { west, south, east, north } in decimal degrees.
 */
export function tileBounds(x: number, y: number, z: number): TileBounds {
  const n = Math.pow(2, z);
  const west = (x / n) * 360 - 180;
  const east = ((x + 1) / n) * 360 - 180;
  const northRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const southRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n)));
  const north = (northRad * 180) / Math.PI;
  const south = (southRad * 180) / Math.PI;
  return { west, south, east, north };
}

/**
 * Get the WGS84 center lat/lon of a tile.
 */
export function tileCenter(x: number, y: number, z: number): LatLon {
  const bounds = tileBounds(x, y, z);
  return {
    lat: (bounds.north + bounds.south) / 2,
    lon: (bounds.west + bounds.east) / 2,
  };
}

/**
 * Get the parent tile at the given zoom level.
 * Returns the tile at (zoom - levels) that contains this tile.
 */
export function parentTile(x: number, y: number, z: number, levels = 1): TileCoord {
  const targetZ = z - levels;
  if (targetZ < 0) return { x: 0, y: 0, z: 0 };
  const factor = Math.pow(2, levels);
  return {
    x: Math.floor(x / factor),
    y: Math.floor(y / factor),
    z: targetZ,
  };
}
