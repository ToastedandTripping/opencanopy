/**
 * Registration-invariant dimension test for forest-base.png.
 *
 * Asserts that the committed forest-base.png is exactly 2048×1003 AND that
 * its dimensions match a reference year-overlay frame (1950.png), so the
 * static base and the per-year cutblock overlays share the same pixel grid
 * and will align correctly on the map.
 *
 * Both assertions are derived from ONE source of truth — the formula:
 *   width  = TARGET_WIDTH               (2048)
 *   height = int(width * (north - south) / (east - west))   (1003)
 * matching build-year-overlays.py:231 exactly.  This prevents the "both sides
 * drift the same way" failure mode — if the formula changes, update TARGET_WIDTH
 * here and the test will catch any stale output on the next regen.
 *
 * GUARD: The committed forest-base.png is the OLD 1024×501 until MARVIN runs
 * the full-data regen with `--dataset forest-base --width 2048`.  Until then
 * these tests are expected to fail.  They are marked with `it.fails` so the
 * suite stays green pre-regen and immediately goes red once the PNG is replaced
 * with the correct dimensions.
 *
 * After regen: remove the `it.fails` wrappers and confirm both tests pass.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ── Expected dimensions (single source of truth) ─────────────────────────────

// BC_BOUNDS from build-year-overlays.py:116
const BC_WEST = -139.5;
const BC_SOUTH = 48.0;
const BC_EAST = -114.0;
const BC_NORTH = 60.5;

// The target width chosen for the regen (matches --width 2048).
// Change this value if a different width is ever targeted; the expected height
// recalculates automatically from the same int(...) expression the script uses.
const TARGET_WIDTH = 2048;

// Mirrors build-year-overlays.py:231 exactly:
//   height = int(width * (north - south) / (east - west))
// int() truncates (NOT rounds); at width=2048 this is int(1003.92...) = 1003.
const EXPECTED_WIDTH = TARGET_WIDTH;
const EXPECTED_HEIGHT = Math.trunc(
  TARGET_WIDTH * (BC_NORTH - BC_SOUTH) / (BC_EAST - BC_WEST)
);

// Sanity-check the formula at module load time so a fat-finger to TARGET_WIDTH
// doesn't silently produce nonsense expected values.
if (EXPECTED_HEIGHT !== 1003) {
  throw new Error(
    `formula sanity check failed: expected EXPECTED_HEIGHT=1003, got ${EXPECTED_HEIGHT}. ` +
    `Check TARGET_WIDTH (${TARGET_WIDTH}) and BC_BOUNDS.`
  );
}

// ── PNG header parser ─────────────────────────────────────────────────────────

/**
 * Read width and height from a PNG file's IHDR chunk.
 *
 * PNG layout:
 *   bytes  0- 7  signature (8 bytes)
 *   bytes  8-11  IHDR chunk length (4 bytes, big-endian)
 *   bytes 12-15  chunk type "IHDR"
 *   bytes 16-19  width  (4 bytes, big-endian)
 *   bytes 20-23  height (4 bytes, big-endian)
 *
 * Returns { width, height } or throws if the file is not a valid PNG.
 */
function readPngDimensions(filePath: string): { width: number; height: number } {
  const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const buf = readFileSync(filePath);

  for (let i = 0; i < PNG_SIG.length; i++) {
    if (buf[i] !== PNG_SIG[i]) {
      throw new Error(`${filePath} does not have a valid PNG signature`);
    }
  }

  // IHDR is always the first chunk; width starts at byte 16.
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

// ── Paths ─────────────────────────────────────────────────────────────────────

const RASTER_DIR = resolve(__dirname, "../../../public/raster/cutblocks-by-year");
const BASE_PATH = resolve(RASTER_DIR, "forest-base.png");
const REF_OVERLAY_PATH = resolve(RASTER_DIR, "1950.png");

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("forest-base.png registration invariant", () => {
  // Both tests are expected to fail until MARVIN runs the full-data regen.
  // The committed file is the old 1024×501 blob.  After regen, remove it.fails.

  it.fails(
    `[PRE-REGEN] forest-base.png is exactly ${EXPECTED_WIDTH}×${EXPECTED_HEIGHT} after regen`,
    () => {
      expect(existsSync(BASE_PATH), `forest-base.png not found at ${BASE_PATH}`).toBe(true);
      const { width, height } = readPngDimensions(BASE_PATH);
      expect(width).toBe(EXPECTED_WIDTH);
      expect(height).toBe(EXPECTED_HEIGHT);
    }
  );

  it.fails(
    "[PRE-REGEN] forest-base.png and 1950.png share the same pixel grid after regen",
    () => {
      // Both files must exist
      expect(existsSync(BASE_PATH), `forest-base.png not found at ${BASE_PATH}`).toBe(true);
      expect(
        existsSync(REF_OVERLAY_PATH),
        `reference overlay 1950.png not found at ${REF_OVERLAY_PATH}`
      ).toBe(true);

      // Derive the expected dims from ONE place so they cannot drift independently.
      // If this expression ever changes in the script, update TARGET_WIDTH above.
      const baseDims = readPngDimensions(BASE_PATH);
      const refDims = readPngDimensions(REF_OVERLAY_PATH);

      // The base must match the expected target dims explicitly (not just equal
      // the overlay — if both happen to be the old 1024×501, that would pass
      // while misregistered).
      expect(baseDims.width).toBe(EXPECTED_WIDTH);
      expect(baseDims.height).toBe(EXPECTED_HEIGHT);

      // The reference overlay must ALSO match.  If the overlays were rebuilt at
      // a different width than TARGET_WIDTH, this will fail loudly.
      expect(refDims.width).toBe(EXPECTED_WIDTH);
      expect(refDims.height).toBe(EXPECTED_HEIGHT);

      // Belt-and-suspenders: both match each other.
      expect(baseDims.width).toBe(refDims.width);
      expect(baseDims.height).toBe(refDims.height);
    }
  );
});
