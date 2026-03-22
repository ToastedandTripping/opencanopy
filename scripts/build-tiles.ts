/**
 * PMTiles Build Pipeline for OpenCanopy
 *
 * Downloads VRI forest data from BC's WFS API region by region,
 * classifies polygons by age, outputs NDJSON, then runs tippecanoe
 * to generate a PMTiles archive for province-wide visualization.
 *
 * Output format: NDJSON (newline-delimited GeoJSON) -- one Feature
 * per line, no wrapping FeatureCollection. This avoids the ~500MB
 * string-length limit that FeatureCollection hits on full-province
 * runs and enables streaming appends without re-parsing.
 *
 * Usage:
 *   npx tsx scripts/build-tiles.ts              # Full province download
 *   npx tsx scripts/build-tiles.ts --region 5,5  # Single grid cell for testing
 *   npx tsx scripts/build-tiles.ts --skip-tiles   # Download only, skip tippecanoe
 *   npx tsx scripts/build-tiles.ts --tiles-only   # Skip download, run tippecanoe on existing NDJSON
 *
 * BC extent in EPSG:3005 (BC Albers):
 *   West: 300000, East: 1900000 (~1600km)
 *   South: 300000, North: 1800000 (~1500km)
 *
 * Grid: 8 columns x 8 rows = 64 cells of ~200km x ~187.5km each (VRI)
 *       4 columns x 4 rows = 16 cells for parks/conservancies fallback
 */

import {
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync,
  statSync,
  appendFileSync,
} from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "..");

// -- Configuration ------------------------------------------------------------

const WFS_ENDPOINTS = {
  vri: "https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_VEGETATION.VEG_COMP_LYR_R1_POLY/ows",
  parks:
    "https://openmaps.gov.bc.ca/geo/pub/WHSE_TANTALIS.TA_PARK_ECORES_PA_SVW/ows",
  conservancies:
    "https://openmaps.gov.bc.ca/geo/pub/WHSE_TANTALIS.TA_CONSERVANCY_AREAS_SVW/ows",
} as const;

// BC extent in EPSG:3005 (BC Albers)
const BC_EXTENT = {
  west: 300000,
  east: 1900000,
  south: 300000,
  north: 1800000,
};

// VRI grid: 8x8 = 64 cells, each ~200km x ~187.5km
const GRID_COLS = 8;
const GRID_ROWS = 8;

const CELL_WIDTH = (BC_EXTENT.east - BC_EXTENT.west) / GRID_COLS;
const CELL_HEIGHT = (BC_EXTENT.north - BC_EXTENT.south) / GRID_ROWS;

// Parks/conservancies fallback grid: 4x4 = 16 cells (coarser, fewer features)
const PARKS_GRID_COLS = 4;
const PARKS_GRID_ROWS = 4;

const PARKS_CELL_WIDTH =
  (BC_EXTENT.east - BC_EXTENT.west) / PARKS_GRID_COLS;
const PARKS_CELL_HEIGHT =
  (BC_EXTENT.north - BC_EXTENT.south) / PARKS_GRID_ROWS;

// WFS fetch settings
const BATCH_SIZE = 50000;
const MAX_RETRIES = 4;
const RETRY_DELAY_MS = 5000;
const FETCH_TIMEOUT_MS = 300_000; // 5 minutes per request
const INTER_BATCH_DELAY_MS = 1000;
const INTER_CELL_DELAY_MS = 2000;

// Output paths
const GEOJSON_DIR = resolve(PROJECT_ROOT, "data", "geojson");
const TILES_DIR = resolve(PROJECT_ROOT, "data", "tiles");
const PROGRESS_DIR = resolve(PROJECT_ROOT, "data", "progress");
const PROGRESS_FILE = resolve(PROGRESS_DIR, "grid-progress.json");

// -- Types --------------------------------------------------------------------

interface GridCell {
  col: number;
  row: number;
  west: number;
  south: number;
  east: number;
  north: number;
}

interface ProgressState {
  completedCells: string[];
  forestAgeFeatureCount: number;
  startedAt: string;
  lastUpdated: string;
}

type ForestClass = "old-growth" | "mature" | "young" | "harvested";

interface ClassifiedFeature {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: {
    class: ForestClass;
    age: number | null;
    species: string | null;
  };
}

// -- Classification -----------------------------------------------------------

function classify(props: Record<string, unknown>): ForestClass | null {
  if (props.HARVEST_DATE) return "harvested";
  const age = props.PROJ_AGE_1;
  if (typeof age !== "number" || age <= 0) return null;
  if (age >= 250) return "old-growth";
  if (age >= 80) return "mature";
  return "young";
}

// -- Grid helpers -------------------------------------------------------------

function getGridCell(col: number, row: number): GridCell {
  return {
    col,
    row,
    west: BC_EXTENT.west + col * CELL_WIDTH,
    south: BC_EXTENT.south + row * CELL_HEIGHT,
    east: BC_EXTENT.west + (col + 1) * CELL_WIDTH,
    north: BC_EXTENT.south + (row + 1) * CELL_HEIGHT,
  };
}

function getParksGridCell(col: number, row: number): GridCell {
  return {
    col,
    row,
    west: BC_EXTENT.west + col * PARKS_CELL_WIDTH,
    south: BC_EXTENT.south + row * PARKS_CELL_HEIGHT,
    east: BC_EXTENT.west + (col + 1) * PARKS_CELL_WIDTH,
    north: BC_EXTENT.south + (row + 1) * PARKS_CELL_HEIGHT,
  };
}

function getAllGridCells(): GridCell[] {
  const cells: GridCell[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      cells.push(getGridCell(col, row));
    }
  }
  return cells;
}

function getAllParksGridCells(): GridCell[] {
  const cells: GridCell[] = [];
  for (let row = 0; row < PARKS_GRID_ROWS; row++) {
    for (let col = 0; col < PARKS_GRID_COLS; col++) {
      cells.push(getParksGridCell(col, row));
    }
  }
  return cells;
}

function cellKey(cell: GridCell): string {
  return `${cell.col},${cell.row}`;
}

// -- Progress tracking --------------------------------------------------------

function loadProgress(): ProgressState {
  if (existsSync(PROGRESS_FILE)) {
    return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8")) as ProgressState;
  }
  return {
    completedCells: [],
    forestAgeFeatureCount: 0,
    startedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };
}

function saveProgress(state: ProgressState): void {
  state.lastUpdated = new Date().toISOString();
  mkdirSync(PROGRESS_DIR, { recursive: true });
  writeFileSync(PROGRESS_FILE, JSON.stringify(state, null, 2));
}

// -- WFS fetch with retry -----------------------------------------------------

async function fetchWithRetry(
  url: string,
  label: string
): Promise<unknown | null> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const text = await res.text();

      if (text.includes("ExceptionReport")) {
        const match = text.match(
          /ExceptionText>(.*?)<\/(?:ows:)?ExceptionText/
        );
        throw new Error(`WFS Exception: ${match?.[1] ?? "unknown error"}`);
      }
      if (text.includes("upstream") && text.includes("timing out")) {
        throw new Error("Upstream server timeout");
      }

      return JSON.parse(text);
    } catch (err) {
      const msg = (err as Error).message;
      if (attempt < MAX_RETRIES) {
        const wait = RETRY_DELAY_MS * attempt;
        console.log(
          `    [retry ${attempt}/${MAX_RETRIES}] ${label}: ${msg} -- waiting ${wait}ms`
        );
        await new Promise((r) => setTimeout(r, wait));
      } else {
        console.error(
          `    [FAILED] ${label} after ${MAX_RETRIES} attempts: ${msg}`
        );
        return null;
      }
    }
  }
  return null;
}

// -- VRI download for a single grid cell --------------------------------------

interface WFSResponse {
  features?: Array<{
    geometry: GeoJSON.Geometry;
    properties: Record<string, unknown>;
  }>;
}

async function downloadVRICell(cell: GridCell): Promise<ClassifiedFeature[]> {
  const bbox = `${cell.west},${cell.south},${cell.east},${cell.north},EPSG:3005`;
  const features: ClassifiedFeature[] = [];
  let startIndex = 0;
  let hasMore = true;
  let totalRaw = 0;

  while (hasMore) {
    const params = new URLSearchParams({
      service: "WFS",
      version: "1.1.0",
      request: "GetFeature",
      typeName: "pub:WHSE_FOREST_VEGETATION.VEG_COMP_LYR_R1_POLY",
      bbox,
      srsName: "EPSG:4326",
      outputFormat: "json",
      maxFeatures: String(BATCH_SIZE),
      startIndex: String(startIndex),
      sortBy: "OBJECTID",
    });

    const url = `${WFS_ENDPOINTS.vri}?${params}`;
    const label = `VRI cell [${cell.col},${cell.row}] offset ${startIndex}`;
    const data = (await fetchWithRetry(url, label)) as WFSResponse | null;

    if (!data || !data.features) {
      console.log(
        `    Skipping remaining batches for cell [${cell.col},${cell.row}] -- fetch returned null`
      );
      break;
    }

    const batchCount = data.features.length;
    totalRaw += batchCount;

    for (const f of data.features) {
      if (!f.geometry) continue;
      const cls = classify(f.properties);
      if (!cls) continue;

      features.push({
        type: "Feature",
        geometry: f.geometry,
        properties: {
          class: cls,
          age:
            typeof f.properties.PROJ_AGE_1 === "number"
              ? f.properties.PROJ_AGE_1
              : null,
          species:
            typeof f.properties.SPECIES_CD_1 === "string"
              ? f.properties.SPECIES_CD_1
              : null,
        },
      });
    }

    console.log(
      `    Batch ${startIndex}: ${batchCount} raw, ${features.length} classified so far`
    );

    if (batchCount < BATCH_SIZE) {
      hasMore = false;
    } else {
      startIndex += BATCH_SIZE;
      await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY_MS));
    }
  }

  console.log(
    `  Cell [${cell.col},${cell.row}]: ${totalRaw} raw -> ${features.length} classified`
  );
  return features;
}

// -- Parks & Conservancies download -------------------------------------------
// Try province-wide first. If it fails (HTTP 400 / timeout), fall back to a
// 4x4 grid of regional queries.

async function fetchLayerBatch(
  endpoint: string,
  typeName: string,
  label: string,
  startIndex: number,
  bbox?: string
): Promise<WFSResponse | null> {
  // WFS 1.1.0: BC's server rejects v2.0.0 + srsName=EPSG:4326 (HTTP 400).
  // v1.1.0 works reliably. Uses maxFeatures instead of count.
  const params = new URLSearchParams({
    service: "WFS",
    version: "1.1.0",
    request: "GetFeature",
    typeName,
    srsName: "EPSG:4326",
    outputFormat: "json",
    maxFeatures: String(BATCH_SIZE),
    startIndex: String(startIndex),
  });
  if (bbox) {
    params.set("bbox", bbox);
  }

  const url = `${endpoint}?${params}`;
  return (await fetchWithRetry(url, label)) as WFSResponse | null;
}

async function downloadParksProvinceWide(
  outputPath: string
): Promise<number> {
  console.log("\nDownloading parks (province-wide attempt)...");
  let startIndex = 0;
  let hasMore = true;
  let total = 0;

  while (hasMore) {
    const data = await fetchLayerBatch(
      WFS_ENDPOINTS.parks,
      "pub:WHSE_TANTALIS.TA_PARK_ECORES_PA_SVW",
      `Parks offset ${startIndex}`,
      startIndex
    );

    if (!data || !data.features) {
      // Any batch failure triggers gridded fallback
      console.log(`  Parks batch ${startIndex} failed. Signaling fallback.`);
      return -1;
    }

    const features: GeoJSON.Feature[] = [];
    for (const f of data.features) {
      if (!f.geometry) continue;
      features.push({
        type: "Feature",
        geometry: f.geometry,
        properties: {
          name:
            f.properties.PROTECTED_LANDS_NAME ??
            f.properties.PARK_NAME ??
            "",
          designation: f.properties.PROTECTED_LANDS_DESIGNATION ?? "",
        },
      });
    }

    appendFeaturesNDJSON(outputPath, features);
    total += features.length;

    console.log(
      `  Parks batch ${startIndex}: ${data.features.length} raw, ${total} total`
    );

    if (data.features.length < BATCH_SIZE) {
      hasMore = false;
    } else {
      startIndex += BATCH_SIZE;
      await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY_MS));
    }
  }

  return total;
}

async function downloadParksGridded(outputPath: string): Promise<number> {
  console.log(
    `\nDownloading parks (gridded ${PARKS_GRID_COLS}x${PARKS_GRID_ROWS})...`
  );
  const cells = getAllParksGridCells();
  let total = 0;
  const seenIds = new Set<string>();

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const bbox = `${cell.west},${cell.south},${cell.east},${cell.north},EPSG:3005`;
    let startIndex = 0;
    let hasMore = true;

    console.log(
      `  [${i + 1}/${cells.length}] Parks cell [${cell.col},${cell.row}]`
    );

    while (hasMore) {
      const data = await fetchLayerBatch(
        WFS_ENDPOINTS.parks,
        "pub:WHSE_TANTALIS.TA_PARK_ECORES_PA_SVW",
        `Parks cell [${cell.col},${cell.row}] offset ${startIndex}`,
        startIndex,
        bbox
      );

      if (!data || !data.features) break;

      const features: GeoJSON.Feature[] = [];
      for (const f of data.features) {
        if (!f.geometry) continue;
        // Dedup: parks spanning cell boundaries appear in multiple cells
        const fid = String(f.properties.OBJECTID ?? (f as Record<string, unknown>).id ?? "");
        if (fid && seenIds.has(fid)) continue;
        if (fid) seenIds.add(fid);
        features.push({
          type: "Feature",
          geometry: f.geometry,
          properties: {
            name:
              f.properties.PROTECTED_LANDS_NAME ??
              f.properties.PARK_NAME ??
              "",
            designation: f.properties.PROTECTED_LANDS_DESIGNATION ?? "",
          },
        });
      }

      if (features.length > 0) {
        appendFeaturesNDJSON(outputPath, features);
        total += features.length;
      }

      if (data.features.length < BATCH_SIZE) {
        hasMore = false;
      } else {
        startIndex += BATCH_SIZE;
        await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY_MS));
      }
    }

    if (i < cells.length - 1) {
      await new Promise((r) => setTimeout(r, INTER_CELL_DELAY_MS));
    }
  }

  return total;
}

async function downloadParks(outputPath: string): Promise<number> {
  // Try province-wide first; fall back to gridded if it fails
  const result = await downloadParksProvinceWide(outputPath);
  if (result >= 0) {
    console.log(`  Parks total: ${result} features`);
    return result;
  }

  console.log("  Province-wide parks query failed. Falling back to grid...");
  // Truncate any partial output before gridded retry
  writeFileSync(outputPath, "");
  const gridResult = await downloadParksGridded(outputPath);
  console.log(`  Parks total (gridded): ${gridResult} features`);
  return gridResult;
}

async function downloadConservanciesProvinceWide(
  outputPath: string
): Promise<number> {
  console.log("\nDownloading conservancies (province-wide attempt)...");
  let startIndex = 0;
  let hasMore = true;
  let total = 0;

  while (hasMore) {
    const data = await fetchLayerBatch(
      WFS_ENDPOINTS.conservancies,
      "pub:WHSE_TANTALIS.TA_CONSERVANCY_AREAS_SVW",
      `Conservancies offset ${startIndex}`,
      startIndex
    );

    if (!data || !data.features) {
      // Any batch failure triggers gridded fallback
      console.log(`  Conservancies batch ${startIndex} failed. Signaling fallback.`);
      return -1;
    }

    const features: GeoJSON.Feature[] = [];
    for (const f of data.features) {
      if (!f.geometry) continue;
      features.push({
        type: "Feature",
        geometry: f.geometry,
        properties: {
          name: f.properties.CONSERVANCY_AREA_NAME ?? "",
        },
      });
    }

    appendFeaturesNDJSON(outputPath, features);
    total += features.length;

    console.log(
      `  Conservancies batch ${startIndex}: ${data.features.length} raw, ${total} total`
    );

    if (data.features.length < BATCH_SIZE) {
      hasMore = false;
    } else {
      startIndex += BATCH_SIZE;
      await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY_MS));
    }
  }

  return total;
}

async function downloadConservanciesGridded(
  outputPath: string
): Promise<number> {
  console.log(
    `\nDownloading conservancies (gridded ${PARKS_GRID_COLS}x${PARKS_GRID_ROWS})...`
  );
  const cells = getAllParksGridCells();
  let total = 0;
  const seenIds = new Set<string>();

  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    const bbox = `${cell.west},${cell.south},${cell.east},${cell.north},EPSG:3005`;
    let startIndex = 0;
    let hasMore = true;

    console.log(
      `  [${i + 1}/${cells.length}] Conservancies cell [${cell.col},${cell.row}]`
    );

    while (hasMore) {
      const data = await fetchLayerBatch(
        WFS_ENDPOINTS.conservancies,
        "pub:WHSE_TANTALIS.TA_CONSERVANCY_AREAS_SVW",
        `Conservancies cell [${cell.col},${cell.row}] offset ${startIndex}`,
        startIndex,
        bbox
      );

      if (!data || !data.features) break;

      const features: GeoJSON.Feature[] = [];
      for (const f of data.features) {
        if (!f.geometry) continue;
        // Dedup: conservancies spanning cell boundaries appear in multiple cells
        const fid = String(f.properties.OBJECTID ?? (f as Record<string, unknown>).id ?? "");
        if (fid && seenIds.has(fid)) continue;
        if (fid) seenIds.add(fid);
        features.push({
          type: "Feature",
          geometry: f.geometry,
          properties: {
            name: f.properties.CONSERVANCY_AREA_NAME ?? "",
          },
        });
      }

      if (features.length > 0) {
        appendFeaturesNDJSON(outputPath, features);
        total += features.length;
      }

      if (data.features.length < BATCH_SIZE) {
        hasMore = false;
      } else {
        startIndex += BATCH_SIZE;
        await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY_MS));
      }
    }

    if (i < cells.length - 1) {
      await new Promise((r) => setTimeout(r, INTER_CELL_DELAY_MS));
    }
  }

  return total;
}

async function downloadConservancies(outputPath: string): Promise<number> {
  const result = await downloadConservanciesProvinceWide(outputPath);
  if (result >= 0) {
    console.log(`  Conservancies total: ${result} features`);
    return result;
  }

  console.log(
    "  Province-wide conservancies query failed. Falling back to grid..."
  );
  writeFileSync(outputPath, "");
  const gridResult = await downloadConservanciesGridded(outputPath);
  console.log(`  Conservancies total (gridded): ${gridResult} features`);
  return gridResult;
}

// -- NDJSON writing -----------------------------------------------------------
// Each feature is one JSON line. No wrapping FeatureCollection. This allows
// streaming appends without ever reading/parsing the full file, which is
// critical for the forest-age layer that exceeds 500MB.

function appendFeaturesNDJSON(
  filepath: string,
  features: (ClassifiedFeature | GeoJSON.Feature)[]
): void {
  const lines = features.map((f) => JSON.stringify(f)).join("\n");
  if (lines) {
    appendFileSync(filepath, lines + "\n");
  }
}

// -- tippecanoe runner --------------------------------------------------------

function runTippecanoe(): boolean {
  const forestPath = resolve(GEOJSON_DIR, "forest-age.ndjson");
  const parksPath = resolve(GEOJSON_DIR, "parks.ndjson");
  const conservanciesPath = resolve(GEOJSON_DIR, "conservancies.ndjson");
  const outputPath = resolve(TILES_DIR, "opencanopy.pmtiles");

  const inputs: string[] = [];
  if (existsSync(forestPath)) {
    inputs.push("-l", "forest-age", forestPath);
  }
  if (existsSync(parksPath)) {
    inputs.push("-l", "parks", parksPath);
  }
  if (existsSync(conservanciesPath)) {
    inputs.push("-l", "conservancies", conservanciesPath);
  }

  if (inputs.length === 0) {
    console.error("No NDJSON files found to tile.");
    return false;
  }

  try {
    execSync("which tippecanoe", { stdio: "pipe" });
  } catch {
    console.error(
      "\ntippecanoe not found. Install it:\n" +
        "  Ubuntu/Debian: sudo apt-get install -y tippecanoe\n" +
        "  macOS: brew install tippecanoe\n" +
        "  From source: https://github.com/felt/tippecanoe\n"
    );
    return false;
  }

  console.log("\nRunning tippecanoe...");
  const cmd = [
    "tippecanoe",
    "-o",
    outputPath,
    "-P", // parallel read / line-delimited (NDJSON) input
    "-Z",
    "0",
    "-z",
    "10", // WFS takes over at zoom 11+; no need for tile detail above 10
    "--drop-densest-as-needed",
    "--coalesce-smallest-as-needed",
    "-M",
    "500000",
    "--simplification=12",
    "--extend-zooms-if-still-dropping",
    "--force",
    ...inputs,
  ].join(" ");

  console.log(`  $ ${cmd}\n`);

  try {
    execSync(cmd, { stdio: "inherit", timeout: 600_000 });
    const stats = statSync(outputPath);
    const sizeMB = (stats.size / 1024 / 1024).toFixed(1);
    console.log(`\nPMTiles output: ${outputPath} (${sizeMB} MB)`);
    return true;
  } catch (err) {
    console.error("tippecanoe failed:", (err as Error).message);
    return false;
  }
}

// -- Main ---------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);

  const regionArg = args.find((a) => a.startsWith("--region"));
  const regionValue = regionArg
    ? args[args.indexOf(regionArg) + 1] ?? regionArg.split("=")[1]
    : null;
  const skipTiles = args.includes("--skip-tiles");
  const tilesOnly = args.includes("--tiles-only");

  console.log("=== OpenCanopy PMTiles Build Pipeline ===\n");

  if (tilesOnly) {
    console.log("Mode: tiles-only (skipping download, running tippecanoe)\n");
    const ok = runTippecanoe();
    process.exit(ok ? 0 : 1);
  }

  mkdirSync(GEOJSON_DIR, { recursive: true });
  mkdirSync(TILES_DIR, { recursive: true });

  let cells: GridCell[];

  if (regionValue) {
    const [col, row] = regionValue.split(",").map(Number);
    if (
      isNaN(col) ||
      isNaN(row) ||
      col < 0 ||
      col >= GRID_COLS ||
      row < 0 ||
      row >= GRID_ROWS
    ) {
      console.error(
        `Invalid region: ${regionValue}. Must be col,row where col=[0-${GRID_COLS - 1}], row=[0-${GRID_ROWS - 1}]`
      );
      process.exit(1);
    }
    cells = [getGridCell(col, row)];
    console.log(`Mode: single region [${col},${row}]`);
  } else {
    cells = getAllGridCells();
    console.log(`Mode: full province (${cells.length} grid cells)`);
  }

  console.log(
    `Grid: ${GRID_COLS}x${GRID_ROWS}, cell size: ${(CELL_WIDTH / 1000).toFixed(0)}km x ${(CELL_HEIGHT / 1000).toFixed(0)}km`
  );
  console.log(`Output: ${GEOJSON_DIR}\n`);

  const progress = loadProgress();
  const pendingCells = cells.filter(
    (c) => !progress.completedCells.includes(cellKey(c))
  );

  if (pendingCells.length < cells.length) {
    const done = cells.length - pendingCells.length;
    console.log(`Resuming: ${done}/${cells.length} cells already complete\n`);
  }

  const forestAgePath = resolve(GEOJSON_DIR, "forest-age.ndjson");
  const startTime = Date.now();
  let totalFeatures = progress.forestAgeFeatureCount;

  // Initialize NDJSON file on fresh start (no completed cells yet)
  if (progress.completedCells.length === 0 && !existsSync(forestAgePath)) {
    writeFileSync(forestAgePath, "");
  }

  for (let i = 0; i < pendingCells.length; i++) {
    const cell = pendingCells[i];
    const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    const overall = `[${i + 1}/${pendingCells.length}]`;

    console.log(
      `\n${overall} Downloading VRI cell [${cell.col},${cell.row}] (${elapsed} min elapsed)...`
    );
    console.log(
      `  BBOX: ${cell.west},${cell.south},${cell.east},${cell.north} (EPSG:3005)`
    );

    try {
      const features = await downloadVRICell(cell);

      if (features.length > 0) {
        appendFeaturesNDJSON(forestAgePath, features);
        totalFeatures += features.length;
        console.log(`  Running total: ${totalFeatures} classified features`);
      } else {
        console.log(
          `  Cell [${cell.col},${cell.row}]: no classified features (ocean/ice/empty)`
        );
      }

      progress.completedCells.push(cellKey(cell));
      progress.forestAgeFeatureCount = totalFeatures;
      saveProgress(progress);
    } catch (err) {
      console.error(
        `  Cell [${cell.col},${cell.row}] failed:`,
        (err as Error).message
      );
      console.log("  Saving progress and continuing to next cell...");
      saveProgress(progress);
    }

    if (i < pendingCells.length - 1) {
      await new Promise((r) => setTimeout(r, INTER_CELL_DELAY_MS));
    }
  }

  console.log(
    `\nVRI download complete: ${totalFeatures} total classified features`
  );

  // Parks download -- writes directly to NDJSON via streaming append
  const parksPath = resolve(GEOJSON_DIR, "parks.ndjson");
  writeFileSync(parksPath, "");
  const parksCount = await downloadParks(parksPath);
  if (parksCount === 0) {
    console.log("  No parks features downloaded.");
  }

  // Conservancies download -- same pattern
  const conservanciesPath = resolve(GEOJSON_DIR, "conservancies.ndjson");
  writeFileSync(conservanciesPath, "");
  const conservanciesCount = await downloadConservancies(conservanciesPath);
  if (conservanciesCount === 0) {
    console.log("  No conservancies features downloaded.");
  }

  console.log("\n=== NDJSON Summary ===");
  for (const name of ["forest-age", "parks", "conservancies"]) {
    const p = resolve(GEOJSON_DIR, `${name}.ndjson`);
    if (existsSync(p)) {
      const stats = statSync(p);
      console.log(`  ${name}: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
    }
  }

  if (!skipTiles) {
    const totalElapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(
      `\nDownload phase complete (${totalElapsed} min). Starting tile generation...`
    );
    const ok = runTippecanoe();
    if (!ok) {
      console.log(
        "\nTile generation failed. NDJSON files are saved -- run with --tiles-only to retry."
      );
      process.exit(1);
    }
  } else {
    console.log(
      "\nSkipping tile generation (--skip-tiles). Run with --tiles-only later."
    );
  }

  const totalElapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\nPipeline complete in ${totalElapsed} minutes.`);
}

main().catch((err) => {
  console.error("Pipeline error:", err);
  process.exit(1);
});
