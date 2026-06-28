/**
 * Registration-invariant dimension test for forest-base.png.
 *
 * Asserts that the committed forest-base.png is exactly 2048×1003.
 * The assertion derives from ONE source of truth — the formula:
 *   width  = TARGET_WIDTH               (2048)
 *   height = int(width * (north - south) / (east - west))   (1003)
 * matching build-year-overlays.py:231 exactly.  This prevents formula drift —
 * if TARGET_WIDTH changes, update it here and the test will catch any stale output.
 *
 * NOTE: the former "forest-base and 1950.png share the same pixel grid" test was
 * DROPPED (Phase 1b). The year overlays (cutblocks, fire) stay at 1024×501 permanently;
 * forest-base will be 2048×1003 after regen. Different resolutions over the same BC
 * extent is correct by design — MapLibre stretches both to the viewport independently.
 * An equality assertion would produce a permanently failing or misleading test.
 *
 * GUARD: The committed forest-base.png is the OLD 1024×501 until MARVIN runs
 * the full-data regen with `--dataset forest-base --width 2048`.  Until then
 * this test is expected to fail.  After regen: remove the `it.fails` wrapper.
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

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("forest-base.png registration invariant", () => {
  // Expected to fail until MARVIN runs the full-data regen (`--dataset forest-base --width 2048`).
  // The committed file is the old 1024×501 blob. After regen: remove `it.fails`.
  it.fails(
    `[PRE-REGEN] forest-base.png is exactly ${EXPECTED_WIDTH}×${EXPECTED_HEIGHT} after regen`,
    () => {
      expect(existsSync(BASE_PATH), `forest-base.png not found at ${BASE_PATH}`).toBe(true);
      const { width, height } = readPngDimensions(BASE_PATH);
      expect(width).toBe(EXPECTED_WIDTH);
      expect(height).toBe(EXPECTED_HEIGHT);
    }
  );

  // NOTE: The former "forest-base and 1950.png share the same pixel grid" test was dropped.
  // Year overlays stay at 1024×501 permanently; forest-base will be 2048×1003 after regen.
  // Different resolutions over the same BC extent is correct by design.
  // See module docblock for full rationale.
});
