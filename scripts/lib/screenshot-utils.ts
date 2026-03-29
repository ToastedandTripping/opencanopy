/**
 * Screenshot comparison utilities for the visual regression pipeline.
 *
 * Uses pixelmatch for pixel-level diffing and pngjs for PNG encode/decode.
 * Baseline management: baselines are stored as PNG files on disk; comparison
 * is opt-in (run audit:visual:update to refresh baselines).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pixelmatch = require("pixelmatch");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PNG } = require("pngjs");

export interface DiffResult {
  diffPixels: number;
  diffPercent: number;
  /** PNG-encoded diff image showing changed pixels highlighted in red */
  diffImage: Buffer;
}

/**
 * Compare two PNG buffers pixel-by-pixel using pixelmatch.
 * Returns the number of differing pixels, the percentage, and a diff image.
 *
 * @param actual   PNG buffer from the current screenshot
 * @param baseline PNG buffer loaded from the saved baseline
 * @param threshold per-pixel color distance threshold (0–1, default 0.1)
 */
export function compareScreenshots(
  actual: Buffer,
  baseline: Buffer,
  threshold = 0.1
): DiffResult {
  const actualPng = PNG.sync.read(actual);
  const baselinePng = PNG.sync.read(baseline);

  const { width, height } = actualPng;
  const diffPng = new PNG({ width, height });

  const diffPixels = pixelmatch(
    actualPng.data,
    baselinePng.data,
    diffPng.data,
    width,
    height,
    { threshold }
  );

  const totalPixels = width * height;
  const diffPercent = totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0;

  return {
    diffPixels,
    diffPercent,
    diffImage: PNG.sync.write(diffPng) as Buffer,
  };
}

/**
 * Load a saved baseline PNG from disk.
 * Returns null if no baseline file exists (first run).
 */
export function loadBaseline(name: string, baselinesDir: string): Buffer | null {
  const filepath = join(baselinesDir, `${name}.png`);
  if (!existsSync(filepath)) return null;
  return readFileSync(filepath);
}

/**
 * Save a PNG buffer as the baseline for the given name.
 * Creates the baselines directory if it doesn't exist.
 */
export function saveBaseline(
  name: string,
  data: Buffer,
  baselinesDir: string
): void {
  mkdirSync(baselinesDir, { recursive: true });
  const filepath = join(baselinesDir, `${name}.png`);
  writeFileSync(filepath, data);
}
