/**
 * PMTiles protocol handler for MapLibre GL.
 *
 * Registers the "pmtiles://" protocol so MapLibre can load vector tiles
 * directly from PMTiles archives (local or remote).
 *
 * Call initPMTiles() once before creating the map instance.
 */

import { Protocol } from "pmtiles";
import { addProtocol } from "maplibre-gl";

let protocol: Protocol | null = null;

export function initPMTiles(): void {
  if (protocol) return;
  protocol = new Protocol();
  addProtocol("pmtiles", protocol.tile);
}
