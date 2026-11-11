import type { Map as MaplibreMap } from "maplibre-gl";

/** The slice of a MapLibre map that onStyleReady needs. */
export type StyleReadyMap = Pick<MaplibreMap, "getStyle" | "once" | "off">;

/**
 * Run `cb` once the map's style JSON is parsed: now, if `map.getStyle()`
 * already returns a value, else on the map's one-time `style.load` event.
 * Returns a cancel that removes the pending listener (a no-op once fired or
 * when `cb` ran immediately).
 *
 * This is the only readiness test for map writes (Amendment A, 2026-11-10):
 * - Never `map.isStyleLoaded()`: it is false whenever any tile is in flight.
 * - Never `load` (nor react-map-gl's `onLoad`, the same event): MapLibre 6
 *   fires it only inside a render where `loaded()` is true, and on
 *   opencanopy.ca the last frame renders with tiles pending, so `load` did
 *   not fire until the visitor interacted (70 s observed in production).
 * `Style.serialize` returns undefined until the style is loaded, so
 * `getStyle()` presence is exactly "style JSON parsed", and `style.load` is
 * its event.
 *
 * Not for hot paths: `getStyle()` serializes the whole style.
 */
export function onStyleReady(map: StyleReadyMap, cb: () => void): () => void {
  // MapLibre's type says getStyle() always returns a spec; at runtime it is
  // undefined until the style JSON is parsed.
  if ((map.getStyle() as unknown) !== undefined) {
    cb();
    return () => {};
  }
  const listener = () => cb();
  map.once("style.load", listener);
  return () => {
    map.off("style.load", listener);
  };
}
