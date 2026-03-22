const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

/**
 * Map style URLs.
 * Falls back to OpenFreeMap when no MapTiler key is configured.
 */
export const MAP_STYLES = {
  satellite: MAPTILER_KEY
    ? `https://api.maptiler.com/maps/satellite/style.json?key=${MAPTILER_KEY}`
    : "https://tiles.openfreemap.org/styles/liberty",
  outdoor: MAPTILER_KEY
    ? `https://api.maptiler.com/maps/outdoor-v2/style.json?key=${MAPTILER_KEY}`
    : "https://tiles.openfreemap.org/styles/liberty",
  dark: MAPTILER_KEY
    ? `https://api.maptiler.com/maps/backdrop-dark/style.json?key=${MAPTILER_KEY}`
    : "https://tiles.openfreemap.org/styles/dark",
} as const;

/** BC overview center */
export const DEFAULT_CENTER: [number, number] = [-125.5, 54.0];
export const DEFAULT_ZOOM = 5;
export const DEFAULT_PITCH = 0;
export const DEFAULT_BEARING = 0;

export const INITIAL_VIEW_STATE = {
  longitude: DEFAULT_CENTER[0],
  latitude: DEFAULT_CENTER[1],
  zoom: DEFAULT_ZOOM,
  pitch: DEFAULT_PITCH,
  bearing: DEFAULT_BEARING,
};

export const TERRAIN_SOURCE = MAPTILER_KEY
  ? {
      url: `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_KEY}`,
      tileSize: 256,
      enabled: true,
    }
  : {
      url: "",
      tileSize: 256,
      enabled: false,
    };
