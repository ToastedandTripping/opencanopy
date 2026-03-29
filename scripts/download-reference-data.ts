/**
 * Download BC reference data for spatial validation.
 *
 * Currently downloads:
 *   - BC FWA Lakes (WHSE_BASEMAPPING.FWA_LAKES_POLY) via WFS
 *
 * Output: data/geojson/reference/fwa-lakes.ndjson
 *
 * Usage:
 *   npx tsx scripts/download-reference-data.ts          # skip if <30 days old
 *   npx tsx scripts/download-reference-data.ts --force  # always re-download
 */

import { existsSync, mkdirSync, statSync, writeFileSync, appendFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");

// -- Configuration -------------------------------------------------------------

const WFS_ENDPOINT =
  "https://openmaps.gov.bc.ca/geo/pub/WHSE_BASEMAPPING.FWA_LAKES_POLY/ows";

const TYPE_NAME = "pub:WHSE_BASEMAPPING.FWA_LAKES_POLY";

// 4×4 grid matching the parks/secondary layers grid in build-tiles.ts
const PARKS_GRID_COLS = 4;
const PARKS_GRID_ROWS = 4;

const BC_EXTENT = {
  west: 300000,
  east: 1900000,
  south: 300000,
  north: 1800000,
};

const CELL_WIDTH = (BC_EXTENT.east - BC_EXTENT.west) / PARKS_GRID_COLS;
const CELL_HEIGHT = (BC_EXTENT.north - BC_EXTENT.south) / PARKS_GRID_ROWS;

// Cache freshness threshold: 30 days in milliseconds
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const BATCH_SIZE = 10000;
const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 5000;
const FETCH_TIMEOUT_MS = 300_000;
const INTER_BATCH_DELAY_MS = 1000;

const OUTPUT_DIR = resolve(PROJECT_ROOT, "data", "geojson", "reference");
const OUTPUT_PATH = resolve(OUTPUT_DIR, "fwa-lakes.ndjson");

// -- Types ---------------------------------------------------------------------

interface GridCell {
  col: number;
  row: number;
  west: number;
  south: number;
  east: number;
  north: number;
}

// Subset of properties we care about from FWA_LAKES_POLY
interface LakeProps {
  WATERBODY_TYPE?: string;
  GNIS_NAME_1?: string;
  AREA_HA?: number;
}

// -- Grid helpers --------------------------------------------------------------

function getGridCells(): GridCell[] {
  const cells: GridCell[] = [];
  for (let row = 0; row < PARKS_GRID_ROWS; row++) {
    for (let col = 0; col < PARKS_GRID_COLS; col++) {
      cells.push({
        col,
        row,
        west: BC_EXTENT.west + col * CELL_WIDTH,
        south: BC_EXTENT.south + row * CELL_HEIGHT,
        east: BC_EXTENT.west + (col + 1) * CELL_WIDTH,
        north: BC_EXTENT.south + (row + 1) * CELL_HEIGHT,
      });
    }
  }
  return cells;
}

// -- WFS fetch -----------------------------------------------------------------

function buildWfsUrl(
  cell: GridCell,
  startIndex: number
): string {
  const bbox = `${cell.west},${cell.south},${cell.east},${cell.north},urn:ogc:def:crs:EPSG::3005`;
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeName: TYPE_NAME,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    BBOX: bbox,
    count: String(BATCH_SIZE),
    startIndex: String(startIndex),
    propertyName: "WATERBODY_TYPE,GNIS_NAME_1,AREA_HA,GEOMETRY",
  });
  return `${WFS_ENDPOINT}?${params.toString()}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`  Retry ${attempt}/${MAX_RETRIES - 1}...`);
      await sleep(RETRY_DELAY_MS);
    }
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(tid);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return res;
    } catch (err) {
      lastErr = err as Error;
      console.log(`  Request failed: ${lastErr.message}`);
    }
  }
  throw new Error(`All ${MAX_RETRIES} retries failed: ${lastErr?.message}`);
}

function extractProps(rawProps: Record<string, unknown>): LakeProps {
  return {
    WATERBODY_TYPE: rawProps.WATERBODY_TYPE as string | undefined,
    GNIS_NAME_1: rawProps.GNIS_NAME_1 as string | undefined,
    AREA_HA: rawProps.AREA_HA as number | undefined,
  };
}

async function downloadCell(cell: GridCell, outputPath: string): Promise<number> {
  let startIndex = 0;
  let totalFeatures = 0;

  while (true) {
    const url = buildWfsUrl(cell, startIndex);
    const res = await fetchWithRetry(url);
    const data = await res.json() as { features?: unknown[] };
    const features = data.features ?? [];

    for (const feature of features as Array<{
      type: string;
      geometry: unknown;
      properties: Record<string, unknown>;
    }>) {
      if (!feature.geometry) continue;
      const ndjsonFeature = {
        type: "Feature",
        geometry: feature.geometry,
        properties: extractProps(feature.properties ?? {}),
      };
      appendFileSync(outputPath, JSON.stringify(ndjsonFeature) + "\n");
      totalFeatures++;
    }

    if (features.length < BATCH_SIZE) break;
    startIndex += features.length;

    await sleep(INTER_BATCH_DELAY_MS);
  }

  return totalFeatures;
}

// -- Main ----------------------------------------------------------------------

async function main(): Promise<void> {
  const force = process.argv.includes("--force");

  // Cache check
  if (!force && existsSync(OUTPUT_PATH)) {
    const age = Date.now() - statSync(OUTPUT_PATH).mtimeMs;
    if (age < CACHE_MAX_AGE_MS) {
      const ageDays = (age / 1000 / 60 / 60 / 24).toFixed(1);
      console.log(`FWA lakes data is ${ageDays} days old (< 30). Skipping download.`);
      console.log(`Use --force to re-download.`);
      return;
    }
    console.log("FWA lakes data is older than 30 days. Re-downloading...");
  }

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, ""); // truncate / create

  console.log("=== Downloading BC FWA Lakes (WHSE_BASEMAPPING.FWA_LAKES_POLY) ===\n");

  const cells = getGridCells();
  let totalFeatures = 0;

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    console.log(`[${i + 1}/${cells.length}] Cell [${cell.col},${cell.row}]...`);
    try {
      const count = await downloadCell(cell, OUTPUT_PATH);
      totalFeatures += count;
      console.log(`  ${count} lake features`);
    } catch (err) {
      console.error(`  Cell [${cell.col},${cell.row}] failed: ${(err as Error).message}`);
      console.log("  Continuing to next cell...");
    }
  }

  const size = statSync(OUTPUT_PATH).size;
  console.log(`\nDownload complete: ${totalFeatures} total lake features`);
  console.log(`Output: ${OUTPUT_PATH} (${(size / 1024 / 1024).toFixed(1)} MB)`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
