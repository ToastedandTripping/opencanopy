import { readFileSync } from "fs";
import path from "path";
import { gzipSync } from "zlib";
import { describe, it, expect } from "vitest";
import {
  parseTile,
  getLayerFeatures,
  getLayerPropertyKeys,
} from "../../../scripts/lib/mvt-reader";

/**
 * A real tile, not a synthetic one: z12/494/1196 from the live
 * opencanopy-v10.pmtiles, as PMTiles getZxy returns it to TileReader
 * (decompressed), fetched 2026-11-01. It covers the Tatshenshini-Alsek corner.
 *
 * The reader needs this guard because tile-reader.ts catches every parse error
 * and reports "tile doesn't exist", so a broken reader looks like missing data.
 * MapLibre 6 brought pbf 5, which broke it exactly that way, and nothing noticed.
 */
const FIXTURE = path.resolve(
  __dirname,
  "../fixtures/opencanopy-v10-z12-494-1196.mvt",
);

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

const raw = readFileSync(FIXTURE);

describe("parseTile on a real MVT tile", () => {
  it("reads every layer in the tile, with its feature count", () => {
    const tile = parseTile(toArrayBuffer(raw));
    const counts = Object.fromEntries(
      Object.entries(tile.layers).map(([name, layer]) => [
        name,
        (layer as { length: number }).length,
      ]),
    );
    expect(counts).toEqual({
      "forest-age": 17,
      parks: 1,
      "ungulate-winter-range": 1,
    });
  });

  it("decodes a feature's properties and geometry", () => {
    const tile = parseTile(toArrayBuffer(raw));
    const park = tile.layers.parks.feature(0);
    expect(park.properties).toEqual({
      name: "TATSHENSHINI-ALSEK PARK",
      designation: "PROVINCIAL PARK",
    });
    expect(park.loadGeometry()[0]).toHaveLength(37);
  });

  it("reads a gzip-compressed tile the same as a plain one", () => {
    const tile = parseTile(toArrayBuffer(gzipSync(raw)));
    expect(tile.layers["forest-age"].length).toBe(17);
    expect(tile.layers.parks.feature(0).properties.name).toBe(
      "TATSHENSHINI-ALSEK PARK",
    );
  });
});

describe("getLayerFeatures", () => {
  it("returns every feature in a named layer", () => {
    const tile = parseTile(toArrayBuffer(raw));
    expect(getLayerFeatures(tile, "forest-age")).toHaveLength(17);
  });

  it("returns nothing for a layer the tile does not have", () => {
    const tile = parseTile(toArrayBuffer(raw));
    expect(getLayerFeatures(tile, "fire-history")).toEqual([]);
  });
});

describe("getLayerPropertyKeys", () => {
  it("collects the keys a layer's features carry", () => {
    const tile = parseTile(toArrayBuffer(raw));
    expect([...getLayerPropertyKeys(tile, "forest-age")].sort()).toEqual([
      "age",
      "class",
      "species",
    ]);
  });

  // Every feature in the fixture's layers carries the same keys, so this case
  // uses a stand-in layer to tell the sample limit apart.
  it("samples only the first sampleSize features", () => {
    const features = [{ properties: { first: 1 } }, { properties: { second: 2 } }];
    const tile = {
      layers: { stub: { length: 2, feature: (i: number) => features[i] } },
    } as unknown as Parameters<typeof getLayerPropertyKeys>[0];
    expect([...getLayerPropertyKeys(tile, "stub", 1)]).toEqual(["first"]);
    expect([...getLayerPropertyKeys(tile, "stub")]).toEqual(["first", "second"]);
  });

  it("returns an empty set for a layer the tile does not have", () => {
    const tile = parseTile(toArrayBuffer(raw));
    expect(getLayerPropertyKeys(tile, "fire-history").size).toBe(0);
  });
});
