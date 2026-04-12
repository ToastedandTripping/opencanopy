/**
 * OpenCanopy Pipeline — Phase 5: Verify
 *
 * Post-build PMTiles verification:
 *   1. Read PMTiles header (first 128 bytes) — check version=3, tileType=1 (MVT),
 *      minZoom=4, maxZoom=12
 *   2. Check bounds cover BC (-140 to -113 lon, 48 to 61 lat — approximate)
 *   3. Check file size > 500MB
 *   4. Read PMTiles metadata — verify all expected vector layers are present
 *
 * All checks are logged as PASS/FAIL. Exits with code 1 if any check fails.
 *
 * Usage:
 *   npx tsx scripts/pipeline/verify.ts
 *   npx tsx scripts/pipeline/verify.ts --path data/tiles/opencanopy.pmtiles
 */

import { existsSync, statSync, openSync, readSync, closeSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { PMTiles } from "pmtiles";
import { NodeFileSource } from "../lib/node-file-source.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "../..");

// ── PMTiles v3 Header Parser ──────────────────────────────────────────────────
//
// PMTiles v3 header is 127 bytes total (padded to 128).
// Reference: https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md
//
// Bytes 0-6:   Magic number "PMTiles"
// Byte 7:      Version (3)
// Bytes 8-15:  Root directory offset (uint64 LE)
// Bytes 16-23: Root directory length (uint64 LE)
// Bytes 24-31: Metadata offset (uint64 LE)
// Bytes 32-39: Metadata length (uint64 LE)
// Bytes 40-47: Leaf directories offset (uint64 LE)
// Bytes 48-55: Leaf directories length (uint64 LE)
// Bytes 56-63: Tile data offset (uint64 LE)
// Bytes 64-71: Tile data length (uint64 LE)
// Bytes 72-79: # addressed tiles (uint64 LE)
// Bytes 80-87: # tile entries (uint64 LE)
// Bytes 88-95: # tile contents (uint64 LE)
// Byte 96:     Clustered (boolean)
// Byte 97:     Internal compression (uint8)
// Byte 98:     Tile compression (uint8)
// Byte 99:     Tile type (uint8) — 1=MVT, 2=PNG, 3=JPEG, 4=WEBP
// Byte 100:    Min zoom (uint8)
// Byte 101:    Max zoom (uint8)
// Bytes 102-105: Min longitude (int32 LE, degrees * 10_000_000)
// Bytes 106-109: Min latitude  (int32 LE, degrees * 10_000_000)
// Bytes 110-113: Max longitude (int32 LE, degrees * 10_000_000)
// Bytes 114-117: Max latitude  (int32 LE, degrees * 10_000_000)

interface PMTilesHeader {
  version: number;
  tileType: number;
  minZoom: number;
  maxZoom: number;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
}

function readHeader(filePath: string): PMTilesHeader {
  const buf = Buffer.alloc(128);
  const fd = openSync(filePath, "r");
  readSync(fd, buf, 0, 128, 0);
  closeSync(fd);

  const magic = buf.toString("ascii", 0, 7);
  if (magic !== "PMTiles") {
    throw new Error(`Not a PMTiles file (magic bytes: "${magic}")`);
  }

  const version = buf.readUInt8(7);
  const tileType = buf.readUInt8(99);
  const minZoom = buf.readUInt8(100);
  const maxZoom = buf.readUInt8(101);
  const minLon = buf.readInt32LE(102) / 1e7;
  const minLat = buf.readInt32LE(106) / 1e7;
  const maxLon = buf.readInt32LE(110) / 1e7;
  const maxLat = buf.readInt32LE(114) / 1e7;

  return { version, tileType, minZoom, maxZoom, minLon, minLat, maxLon, maxLat };
}

// ── Check runner ──────────────────────────────────────────────────────────────

interface CheckResult {
  name: string;
  passed: boolean;
  expected: string;
  actual: string;
  note?: string;
}

function check(
  name: string,
  passed: boolean,
  expected: string,
  actual: string,
  note?: string
): CheckResult {
  const status = passed ? "PASS" : "FAIL";
  const noteStr = note ? `  (${note})` : "";
  console.log(`  [${status}] ${name}`);
  if (!passed) {
    console.log(`         expected: ${expected}`);
    console.log(`         actual:   ${actual}${noteStr}`);
  } else {
    console.log(`         ${actual}${noteStr}`);
  }
  return { name, passed, expected, actual, note };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const pathArg = args.indexOf("--path");
  let pmtilesPath: string;

  if (pathArg >= 0 && args[pathArg + 1]) {
    pmtilesPath = resolve(args[pathArg + 1]);
  } else {
    pmtilesPath = resolve(PROJECT_ROOT, "data", "tiles", "opencanopy.pmtiles");
  }

  console.log("=== OpenCanopy Pipeline: Phase 5 — Verify ===");
  console.log();
  console.log(`Checking: ${pmtilesPath}`);
  console.log();

  const results: CheckResult[] = [];

  // ── Check 1: File exists ──
  if (!existsSync(pmtilesPath)) {
    console.error(`  FAIL: File not found: ${pmtilesPath}`);
    process.exit(1);
  }

  // ── Check 2: File size > 500MB ──
  const sizeBytes = statSync(pmtilesPath).size;
  const sizeMb = sizeBytes / 1024 / 1024;
  results.push(check(
    "File size > 500 MB",
    sizeMb > 500,
    "> 500 MB",
    `${sizeMb.toFixed(0)} MB`,
    sizeMb > 1000 ? "healthy" : sizeMb > 500 ? "below expected 1.5-2.0GB range but ok" : undefined
  ));

  // ── Parse header ──
  let header: PMTilesHeader;
  try {
    header = readHeader(pmtilesPath);
  } catch (err) {
    console.error(`  FAIL: Could not read PMTiles header: ${(err as Error).message}`);
    process.exit(1);
  }

  // ── Check 3: PMTiles version = 3 ──
  results.push(check(
    "PMTiles version = 3",
    header.version === 3,
    "3",
    String(header.version)
  ));

  // ── Check 4: Tile type = 1 (MVT) ──
  const tileTypeNames: Record<number, string> = { 1: "MVT", 2: "PNG", 3: "JPEG", 4: "WEBP" };
  results.push(check(
    "Tile type = MVT (1)",
    header.tileType === 1,
    "1 (MVT)",
    `${header.tileType} (${tileTypeNames[header.tileType] ?? "unknown"})`
  ));

  // ── Check 5: minZoom = 4 ──
  results.push(check(
    "Min zoom = 4",
    header.minZoom === 4,
    "4",
    String(header.minZoom)
  ));

  // ── Check 6: maxZoom = 12 ──
  results.push(check(
    "Max zoom = 12",
    header.maxZoom === 12,
    "12",
    String(header.maxZoom)
  ));

  // ── Check 7: Bounds cover BC (approximate) ──
  // BC spans roughly -140 to -113 lon, 48 to 61 lat.
  // Tiles should cover most of this extent.
  const bcMinLon = -140;
  const bcMaxLon = -113;
  const bcMinLat = 48;
  const bcMaxLat = 61;

  const boundsOk =
    header.minLon <= bcMinLon + 5 &&  // within 5° of BC west boundary
    header.maxLon >= bcMaxLon - 5 &&  // within 5° of BC east boundary
    header.minLat <= bcMinLat + 3 &&  // within 3° of BC south boundary
    header.maxLat >= bcMaxLat - 3;    // within 3° of BC north boundary

  results.push(check(
    "Bounds cover BC",
    boundsOk,
    `lon [${bcMinLon}, ${bcMaxLon}] lat [${bcMinLat}, ${bcMaxLat}]`,
    `lon [${header.minLon.toFixed(2)}, ${header.maxLon.toFixed(2)}] lat [${header.minLat.toFixed(2)}, ${header.maxLat.toFixed(2)}]`
  ));

  // ── Check 8: vector_layers metadata ──
  // Use PMTiles library to read tippecanoe-written metadata JSON and verify
  // all expected layers are present by name.
  const EXPECTED_LAYERS = [
    "forest-age",
    "tenure-cutblocks",
    "fire-history",
    "parks",
    "conservancies",
    "ogma",
    "wildlife-habitat-areas",
    "ungulate-winter-range",
    "community-watersheds",
    "mining-claims",
    "forestry-roads",
    "conservation-priority",
  ];

  try {
    console.log("  Checking vector_layers metadata...");
    const source = new NodeFileSource(pmtilesPath);
    const pmtilesInstance = new PMTiles(source);
    const metadata = await pmtilesInstance.getMetadata();
    const vectorLayers: Array<{ id: string }> =
      (metadata as Record<string, unknown>)?.vector_layers as Array<{ id: string }> ?? [];
    const layerNames = vectorLayers.map((l) => l.id);

    for (const expected of EXPECTED_LAYERS) {
      const layerPresent = layerNames.includes(expected);
      results.push(check(
        `Layer: ${expected}`,
        layerPresent,
        "present in vector_layers",
        layerPresent ? "present" : "MISSING"
      ));
    }

    await source.close();
  } catch (err) {
    console.error(`  FAIL: Could not read PMTiles metadata: ${(err as Error).message}`);
    results.push(check(
      "vector_layers metadata",
      false,
      "readable metadata",
      `error: ${(err as Error).message}`
    ));
  }

  // ── Summary ──
  console.log();
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`=== ${passed}/${results.length} checks passed ===`);

  if (failed > 0) {
    console.error(`${failed} check(s) failed.`);
    process.exit(1);
  }

  console.log("PMTiles verified successfully.");
}

main().catch((err) => {
  console.error("Verify error:", err);
  process.exit(1);
});
