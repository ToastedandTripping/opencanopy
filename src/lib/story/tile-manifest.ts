/**
 * Fail-open tile-presence manifest for the story's binary end-reveal raster
 * (story-binary-reveal).
 *
 * R2 404s for ocean/off-coast tiles within the z4-z9 bbox that a rectangular
 * `bounds` field can't exclude (BC's coastline is irregular) -- these show up
 * as console 404 spam on the live site. This module lets the story SUPPRESS
 * requests for tiles it can PROVE are missing, using a small, generatable
 * manifest of the tiles that actually exist in the bucket -- without ever
 * being able to create or block a request that would otherwise succeed.
 *
 * FAIL-OPEN CONTRACT (do not weaken): if the manifest is missing, malformed,
 * or built for a different raster version than the one currently deployed,
 * every tile request passes through untouched. This module may only ever
 * SUPPRESS a request it can prove is pointless; it must never risk hiding a
 * real tile.
 *
 * The manifest itself is NOT committed by this batch -- it must be generated
 * from the live R2 bucket (see scripts/generate-tile-manifest.py) or emitted
 * by a future run of scripts/build-raster-tiles.py. Until one exists at
 * /raster/binary-tile-manifest.json, the fetch below 404s, parseTileManifest
 * returns null, and every tile request passes through exactly as it does
 * today -- this module is safe to ship ahead of the manifest.
 */

import { addProtocol } from "maplibre-gl";
import { BINARY_RASTER_URL } from "@/lib/r2-config";

/** Custom scheme used for story-binary-reveal tile URLs (see setup-layers.ts). */
const BINARY_TILE_PROTOCOL = "ocbin";
export const BINARY_TILE_URL = `${BINARY_TILE_PROTOCOL}://{z}/{x}/{y}`;

/** Same-origin manifest path (public/, deployed with the static export -- no R2 CORS issue). */
const MANIFEST_URL = "/raster/binary-tile-manifest.json";

export interface TileManifest {
  /** Raster version segment this manifest was generated against (e.g. "v3", extracted from the R2 path). A mismatch vs. the deployed version is treated as stale. */
  version: string;
  /** "z/x/y" keys for every tile that exists in the bucket at generation time. */
  tiles: string[];
}

/** Extracts the "v<N>" path segment from a raster URL, e.g. ".../raster/v3/binary/..." -> "v3". */
function extractRasterVersion(url: string): string {
  const match = /\/raster\/(v\d+)\//.exec(url);
  return match ? match[1] : "unknown";
}

/** The version the deployed BINARY_RASTER_URL is currently built against. */
export const CURRENT_BINARY_RASTER_VERSION = extractRasterVersion(BINARY_RASTER_URL);

/**
 * Parse + validate a manifest payload. Returns null (the fail-open sentinel)
 * for anything that isn't a well-formed, current-version manifest -- wrong
 * shape, non-string entries, or a version that doesn't match `expectedVersion`
 * (a stale manifest from a previous tileset build).
 */
export function parseTileManifest(
  raw: unknown,
  expectedVersion: string
): Set<string> | null {
  if (!raw || typeof raw !== "object") return null;
  const manifest = raw as Partial<TileManifest>;
  if (manifest.version !== expectedVersion) return null;
  if (!Array.isArray(manifest.tiles)) return null;
  if (!manifest.tiles.every((t) => typeof t === "string")) return null;
  return new Set(manifest.tiles);
}

/**
 * True only when we can PROVE the tile is absent from the bucket -- i.e. the
 * manifest is present, valid, current, AND does not list this z/x/y.
 * Fail-open: a null manifest (missing/invalid/stale) always returns false,
 * meaning "not known to be missing" -- so the caller always falls through to
 * the real fetch.
 */
export function isKnownMissingTile(
  manifest: Set<string> | null,
  z: number,
  x: number,
  y: number
): boolean {
  if (manifest === null) return false;
  return !manifest.has(`${z}/${x}/${y}`);
}

// A verified 1x1 fully-transparent PNG (RGBA 0,0,0,0), generated + round-trip
// decoded with pngjs at authoring time (not hand-typed/memorized bytes -- see
// Ted's Phase-1 report). Used to short-circuit known-missing tiles with a
// valid, empty image instead of a network round-trip.
const EMPTY_TILE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAAklEQVR4AewaftIAAAAISURBVGMAAQAABQABCrzbBwAAAABJRU5ErkJggg==";

function emptyTileArrayBuffer(): ArrayBuffer {
  const binary = atob(EMPTY_TILE_PNG_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

let manifestPromise: Promise<Set<string> | null> | null = null;

/** Fetch + parse the manifest once per session. Any failure resolves to null (fail-open). */
function loadManifest(): Promise<Set<string> | null> {
  if (!manifestPromise) {
    manifestPromise = fetch(MANIFEST_URL)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => parseTileManifest(json, CURRENT_BINARY_RASTER_VERSION))
      .catch(() => null);
  }
  return manifestPromise;
}

const TILE_URL_PATTERN = new RegExp(`^${BINARY_TILE_PROTOCOL}://(\\d+)/(-?\\d+)/(-?\\d+)$`);

let protocolRegistered = false;

/**
 * Register the `ocbin://` protocol MapLibre uses for story-binary-reveal
 * tile requests. Idempotent -- safe to call from every StoryMap mount, same
 * pattern as initPMTiles().
 *
 * Real tiles: the handler reconstructs the actual R2 URL and fetches it --
 * behaviorally identical to today's direct-https source, just routed through
 * one extra async hop. Known-missing tiles (per a valid, current manifest):
 * resolved immediately with a synthetic empty PNG, no network request, no
 * console noise. Anything else (no manifest yet, bad JSON, stale version,
 * malformed url): falls through to the real fetch -- fail-open.
 */
export function registerBinaryTileProtocol(): void {
  if (protocolRegistered) return;
  protocolRegistered = true;

  addProtocol(BINARY_TILE_PROTOCOL, async (params, abortController) => {
    const match = TILE_URL_PATTERN.exec(params.url);
    if (!match) {
      throw new Error(`[OpenCanopy] malformed ${BINARY_TILE_PROTOCOL}:// tile URL: ${params.url}`);
    }
    const [, z, x, y] = match;

    const manifest = await loadManifest();
    if (isKnownMissingTile(manifest, Number(z), Number(x), Number(y))) {
      return { data: emptyTileArrayBuffer() };
    }

    const realUrl = BINARY_RASTER_URL.replace("{z}", z).replace("{x}", x).replace("{y}", y);
    const response = await fetch(realUrl, { signal: abortController.signal });
    if (!response.ok) {
      throw new Error(`Tile fetch error: ${response.statusText}`);
    }
    const data = await response.arrayBuffer();
    return {
      data,
      cacheControl: response.headers.get("cache-control") ?? undefined,
      expires: response.headers.get("expires") ?? undefined,
    };
  });
}
