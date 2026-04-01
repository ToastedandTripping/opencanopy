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
  unlinkSync,
  copyFileSync,
  readdirSync,
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
  tenureCutblocks:
    "https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_TENURE.FTEN_CUT_BLOCK_POLY_SVW/ows",
  fireHistory:
    "https://openmaps.gov.bc.ca/geo/pub/WHSE_LAND_AND_NATURAL_RESOURCE.PROT_HISTORICAL_FIRE_POLYS_SP/ows",
  ogma:
    "https://openmaps.gov.bc.ca/geo/pub/WHSE_LAND_USE_PLANNING.RMP_OGMA_LEGAL_CURRENT_SVW/ows",
  wildlifeHabitatAreas:
    "https://openmaps.gov.bc.ca/geo/pub/WHSE_WILDLIFE_MANAGEMENT.WCP_WILDLIFE_HABITAT_AREA_POLY/ows",
  ungulateWinterRange:
    "https://openmaps.gov.bc.ca/geo/pub/WHSE_WILDLIFE_MANAGEMENT.WCP_UNGULATE_WINTER_RANGE_SP/ows",
  communityWatersheds:
    "https://openmaps.gov.bc.ca/geo/pub/WHSE_WATER_MANAGEMENT.WLS_COMMUNITY_WS_PUB_SVW/ows",
  miningClaims:
    "https://openmaps.gov.bc.ca/geo/pub/WHSE_MINERAL_TENURE.MTA_ACQUIRED_TENURE_SVW/ows",
  forestryRoads:
    "https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_TENURE.FTEN_ROAD_SECTION_LINES_SVW/ows",
  conservationPriority:
    "https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_VEGETATION.OGSR_PRIORITY_DEF_AREA_CUR_SP/ows",
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
// BC WFS server caps at 10,000 features per request regardless of maxFeatures.
// Must match server limit so pagination detects "full batch = more data" correctly.
// Previous BATCH_SIZE=50000 caused pagination to stop after 1st batch (10K < 50K).
const BATCH_SIZE = 10000;
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

// -- Company lookup (mirrors wfs-proxy.ts) ------------------------------------

const COMPANY_MAP: Record<string, string> = {
  "00001271": "canfor",
  "00142662": "west-fraser",
  "00147603": "tolko",
  "00002176": "interfor",
  "00149081": "western-forest-products",
  "00109260": "bc-timber-sales",
  "00160953": "mosaic",
  "00000230": "weyerhaeuser",
  "00007629": "teal-jones",
  "00148968": "san-group",
  "00155498": "conifex",
  "00001701": "dunkley",
  "00001297": "carrier",
  "00003248": "gorman",
  "00166320": "canoe-forest",
};

// -- Per-layer property extractors --------------------------------------------
// Each takes raw WFS properties and returns the subset to keep in NDJSON,
// or null to skip the feature entirely.

type PropertyExtractor = (
  props: Record<string, unknown>
) => Record<string, unknown> | null;

const extractTenureCutblocks: PropertyExtractor = (props) => {
  const clientNum = String(props.CLIENT_NUMBER ?? "").padStart(8, "0");
  return {
    company_id: COMPANY_MAP[clientNum] ?? "other",
    DISTURBANCE_START_DATE: props.DISTURBANCE_START_DATE != null && String(props.DISTURBANCE_START_DATE) !== "null"
      ? String(props.DISTURBANCE_START_DATE)
      : null,
    PLANNED_GROSS_BLOCK_AREA: props.PLANNED_GROSS_BLOCK_AREA ?? null,
  };
};

const extractFireHistory: PropertyExtractor = (props) => ({
  FIRE_YEAR: props.FIRE_YEAR != null ? String(props.FIRE_YEAR) : null,
  FIRE_SIZE_HECTARES: props.FIRE_SIZE_HECTARES ?? null,
  FIRE_CAUSE: props.FIRE_CAUSE ?? null,
});

const extractOgma: PropertyExtractor = (props) => ({
  OGMA_TYPE: props.OGMA_TYPE ?? null,
  LANDSCAPE_UNIT_NAME: props.LANDSCAPE_UNIT_NAME ?? null,
});

const extractWildlifeHabitatAreas: PropertyExtractor = (props) => {
  let habitatAreaId: number | null = null;
  if (props.HABITAT_AREA_ID != null) {
    const coerced = Number(props.HABITAT_AREA_ID);
    habitatAreaId = isNaN(coerced) ? null : coerced;
  }
  return {
    COMMON_SPECIES_NAME: props.COMMON_SPECIES_NAME ?? null,
    HABITAT_AREA_ID: habitatAreaId,
  };
};

const extractUngulateWinterRange: PropertyExtractor = (props) => ({
  SPECIES_1: props.SPECIES_1 ?? null,
  UWR_TAG: props.UWR_TAG ?? null,
});

const extractCommunityWatersheds: PropertyExtractor = (props) => ({
  CW_NAME: props.CW_NAME ?? null,
  AREA_HA: props.AREA_HA ?? null,
});

const extractMiningClaims: PropertyExtractor = (props) => ({
  TENURE_TYPE_DESCRIPTION: props.TENURE_TYPE_DESCRIPTION ?? null,
  OWNER_NAME: props.OWNER_NAME ?? null,
  TENURE_STATUS: props.TENURE_STATUS ?? null,
});

const extractForestryRoads: PropertyExtractor = (props) => ({
  ROAD_SECTION_NAME: props.ROAD_SECTION_NAME ?? null,
  CLIENT_NAME: props.CLIENT_NAME ?? null,
});

const extractConservationPriority: PropertyExtractor = (props) => ({
  TAP_CLASSIFICATION_LABEL: props.TAP_CLASSIFICATION_LABEL ?? null,
  LANDSCAPE_UNIT_NAME: props.LANDSCAPE_UNIT_NAME ?? null,
  ANCIENT_FOREST_IND: props.ANCIENT_FOREST_IND ?? null,
  PRIORITY_BIG_TREED_OG_IND: props.PRIORITY_BIG_TREED_OG_IND ?? null,
  BGC_LABEL: props.BGC_LABEL ?? null,
  FIELD_VERIFIED_IND: props.FIELD_VERIFIED_IND ?? null,
  FEATURE_AREA_SQM: props.FEATURE_AREA_SQM ?? null,
});

// -- Generic layer download ---------------------------------------------------

async function downloadLayerCells(
  endpoint: string,
  typeName: string,
  layerName: string,
  outputPath: string,
  grid: GridCell[],
  extractProperties: PropertyExtractor,
): Promise<number> {
  let total = 0;

  for (let i = 0; i < grid.length; i++) {
    const cell = grid[i];
    const bbox = `${cell.west},${cell.south},${cell.east},${cell.north},EPSG:3005`;
    console.log(
      `  [${i + 1}/${grid.length}] ${layerName} cell [${cell.col},${cell.row}]`
    );

    // Single fetch per cell -- no pagination (BC WFS rejects startIndex on
    // layers without a primary key). The bbox limits feature count per cell.
    const data = await fetchLayerBatch(
      endpoint,
      typeName,
      `${layerName} cell [${cell.col},${cell.row}]`,
      bbox,
    );

    if (!data || !data.features) continue;

    const features: GeoJSON.Feature[] = [];
    for (const f of data.features) {
      if (!f.geometry) continue;
      const extracted = extractProperties(f.properties);
      if (!extracted) continue;
      features.push({
        type: "Feature",
        geometry: f.geometry,
        properties: extracted,
      });
    }

    if (features.length > 0) {
      appendFeaturesNDJSON(outputPath, features);
      total += features.length;
      console.log(`    ${features.length} features`);
    }

    if (i < grid.length - 1) {
      await new Promise((r) => setTimeout(r, INTER_CELL_DELAY_MS));
    }
  }

  return total;
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

async function downloadVRICell(cell: GridCell, outputPath: string): Promise<number> {
  const bbox = `${cell.west},${cell.south},${cell.east},${cell.north},EPSG:3005`;
  let startIndex = 0;
  let hasMore = true;
  let totalRaw = 0;
  let totalClassified = 0;

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

    // Stream each batch directly to NDJSON -- never accumulate in memory.
    // Previous approach held all features in an array, crashing at ~300K
    // with "Invalid string length" when V8 hit its string size limit.
    const lines: string[] = [];
    for (const f of data.features) {
      if (!f.geometry) continue;
      const cls = classify(f.properties);
      if (!cls) continue;

      lines.push(JSON.stringify({
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
      }));
    }
    if (lines.length > 0) {
      appendFileSync(outputPath, lines.join("\n") + "\n");
      totalClassified += lines.length;
    }

    console.log(
      `    Batch ${startIndex}: ${batchCount} raw, ${totalClassified} classified so far`
    );

    if (batchCount < BATCH_SIZE) {
      hasMore = false;
    } else {
      startIndex += BATCH_SIZE;
      await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY_MS));
    }
  }

  console.log(
    `  Cell [${cell.col},${cell.row}]: ${totalRaw} raw -> ${totalClassified} classified`
  );
  return totalClassified;
}

// -- Parks & Conservancies download -------------------------------------------
// Try province-wide first. If it fails (HTTP 400 / timeout), fall back to a
// 4x4 grid of regional queries.

async function fetchLayerBatch(
  endpoint: string,
  typeName: string,
  label: string,
  bbox?: string
): Promise<WFSResponse | null> {
  // WFS 2.0.0 without startIndex/sortBy -- BC's WFS rejects pagination on layers
  // without a primary key ("Cannot do natural order without a primary key").
  // Instead, rely on bbox + count to limit results per request.
  // For grid-based downloads, each cell's bbox naturally limits feature count.
  const params = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeName,
    srsName: "EPSG:4326",
    outputFormat: "application/json",
    count: String(BATCH_SIZE),
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

  const data = await fetchLayerBatch(
    WFS_ENDPOINTS.parks,
    "pub:WHSE_TANTALIS.TA_PARK_ECORES_PA_SVW",
    "Parks province-wide"
  );

  if (!data || !data.features) {
    console.log("  Parks province-wide fetch failed. Signaling fallback.");
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

  console.log(
    `  Parks: ${data.features.length} raw, ${features.length} kept`
  );

  return features.length;
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

    console.log(
      `  [${i + 1}/${cells.length}] Parks cell [${cell.col},${cell.row}]`
    );

    const data = await fetchLayerBatch(
      WFS_ENDPOINTS.parks,
      "pub:WHSE_TANTALIS.TA_PARK_ECORES_PA_SVW",
      `Parks cell [${cell.col},${cell.row}]`,
      bbox
    );

    if (!data || !data.features) continue;

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

  const data = await fetchLayerBatch(
    WFS_ENDPOINTS.conservancies,
    "pub:WHSE_TANTALIS.TA_CONSERVANCY_AREAS_SVW",
    "Conservancies province-wide"
  );

  if (!data || !data.features) {
    console.log("  Conservancies province-wide fetch failed. Signaling fallback.");
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

  console.log(
    `  Conservancies: ${data.features.length} raw, ${features.length} kept`
  );

  return features.length;
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

    console.log(
      `  [${i + 1}/${cells.length}] Conservancies cell [${cell.col},${cell.row}]`
    );

    const data = await fetchLayerBatch(
      WFS_ENDPOINTS.conservancies,
      "pub:WHSE_TANTALIS.TA_CONSERVANCY_AREAS_SVW",
      `Conservancies cell [${cell.col},${cell.row}]`,
      bbox
    );

    if (!data || !data.features) continue;

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

// -- archive step -------------------------------------------------------------

/**
 * Archive the current PMTiles before a new build overwrites it.
 *
 * - Copies data/tiles/opencanopy.pmtiles to data/tiles/archive/opencanopy-YYYYMMDD.pmtiles
 * - Creates the archive directory if it doesn't exist
 * - Retains only the 3 most recent archives (deletes older ones)
 *
 * Called BEFORE runTippecanoe so the previous build is preserved even if
 * the new build fails.
 */
function archiveCurrentTiles(): void {
  const archiveDir = resolve(TILES_DIR, "archive");
  const outputPath = resolve(TILES_DIR, "opencanopy.pmtiles");

  if (!existsSync(outputPath)) {
    console.log("  No existing PMTiles to archive — skipping.");
    return;
  }

  mkdirSync(archiveDir, { recursive: true });

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  // Avoid silently overwriting a same-day archive: append -1, -2, ... as needed.
  let archiveName = `opencanopy-${today}.pmtiles`;
  let archivePath = resolve(archiveDir, archiveName);
  let suffix = 1;
  while (existsSync(archivePath)) {
    archiveName = `opencanopy-${today}-${suffix}.pmtiles`;
    archivePath = resolve(archiveDir, archiveName);
    suffix++;
  }

  console.log(`  Archiving current PMTiles → ${archivePath}`);
  copyFileSync(outputPath, archivePath);

  // Retain only 3 most recent archives
  const archives = readdirSync(archiveDir)
    .filter((f) => f.startsWith("opencanopy-") && f.endsWith(".pmtiles"))
    .sort() // YYYYMMDD is lexicographically sortable
    .reverse();

  const toDelete = archives.slice(3);
  for (const name of toDelete) {
    const p = resolve(archiveDir, name);
    console.log(`  Removing old archive: ${name}`);
    try { unlinkSync(p); } catch { /* ignore */ }
  }
}

// -- tippecanoe runner --------------------------------------------------------

const PREPROCESSED_DIR = resolve(GEOJSON_DIR, "preprocessed");

function runTippecanoe(): boolean {
  const outputPath = resolve(TILES_DIR, "opencanopy.pmtiles");
  const overviewPath = resolve(TILES_DIR, "overview.pmtiles");
  const detailPath = resolve(TILES_DIR, "detail.pmtiles");

  // Build layer inputs from ALL available NDJSON files
  const layerFiles = [
    "forest-age",
    "parks",
    "conservancies",
    "tenure-cutblocks",
    "fire-history",
    "ogma",
    "wildlife-habitat-areas",
    "ungulate-winter-range",
    "community-watersheds",
    "mining-claims",
    "forestry-roads",
    "conservation-priority",
  ];

  // Auto-detect preprocessed data: if a preprocessed NDJSON exists for a layer,
  // use it. Use --raw to explicitly skip preprocessed data (debugging only).
  // This replaces the old --preprocessed opt-in flag — the safe path is now the
  // default path. Forgetting a flag should never silently discard water subtraction.
  const forceRaw = process.argv.includes("--raw");
  let preprocessedLayers = new Set<string>();

  if (!forceRaw) {
    const manifestPath = resolve(PREPROCESSED_DIR, "_manifest.json");
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
          layers: string[];
          timestamp: string;
        };
        preprocessedLayers = new Set(manifest.layers);
        console.log(
          `  Auto-detected preprocessed data for ${preprocessedLayers.size} layer(s) ` +
          `(manifest timestamp: ${manifest.timestamp})`
        );
      } catch (err) {
        console.warn(`  Warning: could not read preprocessed manifest: ${(err as Error).message}`);
        console.warn(`  Falling back to raw NDJSON for all layers`);
      }
    }
    // Also check for preprocessed files not in manifest (e.g. from earlier runs)
    for (const name of layerFiles) {
      if (!preprocessedLayers.has(name)) {
        const ppPath = resolve(PREPROCESSED_DIR, `${name}.ndjson`);
        if (existsSync(ppPath) && statSync(ppPath).size > 0) {
          preprocessedLayers.add(name);
          console.log(`  Auto-detected preprocessed ${name} (not in manifest)`);
        }
      }
    }
  } else {
    console.log("  --raw flag: skipping all preprocessed data");
  }

  // Build two input lists: both tiers include ALL layers. Every layer should be
  // visible at province level (z4-z7) for the full picture. The overview tier's
  // coalescing handles dense tiles automatically.
  const overviewInputs: string[] = [];
  const detailInputs: string[] = [];

  for (const name of layerFiles) {
    // Prefer preprocessed version if available (auto-detected or in manifest)
    let p: string;
    if (preprocessedLayers.has(name)) {
      p = resolve(PREPROCESSED_DIR, `${name}.ndjson`);
      console.log(`  ${name}: using preprocessed data`);
    } else {
      p = resolve(GEOJSON_DIR, `${name}.ndjson`);
    }

    if (existsSync(p) && statSync(p).size > 0) {
      overviewInputs.push("-L", `${name}:${p}`);
      detailInputs.push("-L", `${name}:${p}`);
    } else if (existsSync(p) && statSync(p).size === 0) {
      console.log(`  Skipping ${name}: NDJSON exists but is empty (0 bytes)`);
    } else {
      console.log(`  Skipping ${name}: NDJSON file missing`);
    }
  }

  if (detailInputs.length === 0) {
    console.error("No NDJSON files found to tile.");
    return false;
  }

  // Check tippecanoe and tile-join exist
  try {
    execSync("which tippecanoe", { stdio: "pipe" });
  } catch {
    console.error(
      "\ntippecanoe not found. Install tippecanoe:\n" +
        "  Ubuntu/Debian: sudo apt-get install -y tippecanoe\n" +
        "  macOS: brew install tippecanoe\n" +
        "  From source: https://github.com/felt/tippecanoe\n"
    );
    return false;
  }

  try {
    execSync("which tile-join", { stdio: "pipe" });
  } catch {
    console.error(
      "\ntile-join not found. It ships with tippecanoe -- ensure the full package is installed.\n"
    );
    return false;
  }

  try {
    // Two-tier build: both tiers keep ALL features (no dropping, no coalescing).
    // The split exists because the BROWSER has WebGL/protobuf parsing limits:
    // z5 tiles with 400K features at simplification=8 produce ~3-4MB protobuf
    // that MapLibre's Web Worker silently fails to parse. High simplification
    // at z4-z7 reduces per-tile vertex count so the browser can render them.
    // At z8-z10, tiles are smaller (more tiles, fewer features each) so
    // moderate simplification works fine.

    // ── Tier 1: Overview (z4-z7) ──
    // 10MB tile cap with coalescing. This was the original working configuration
    // that successfully rendered at z5 (confirmed: "1.6M+ features rendering").
    // The ONLY issue was incomplete source data (7 truncated grid cells), now fixed.
    // 10MB is large enough for MapLibre to parse but triggers coalescing on the
    // densest tiles to keep them manageable.
    console.log("\nTier 1: Overview tiles (z4-z7, 10MB cap + coalesce)...");
    const overviewCmd = [
      "tippecanoe",
      "-o", overviewPath,
      "-P",
      "-Z", "4", "-z", "7",
      "--no-feature-limit",
      "-M", "10000000",
      "--coalesce-smallest-as-needed",
      "--simplification=10",
      "--buffer=16",
      // Force timeline properties to string so MapLibre filter expressions work
      "--attribute-type=FIRE_YEAR:string",
      // DISTURBANCE_START_DATE is already a string in NDJSON when present.
      // Do NOT force it to string via --attribute-type — tippecanoe converts
      // JSON null to literal "null" string, which then fails pattern validation.
      "--force",
      ...overviewInputs,
    ].join(" ");
    console.log(`  $ ${overviewCmd}\n`);
    execSync(overviewCmd, { stdio: "inherit", timeout: 3_600_000 });

    // ── Tier 2: Detail (z8-z10) ──
    // All features, moderate simplification for accurate boundaries.
    // conservation-priority is included here (excluded from overview tier).
    console.log("\nTier 2: Detail tiles (z8-z10, moderate simplification)...");
    const detailCmd = [
      "tippecanoe",
      "-o", detailPath,
      "-P",
      "-Z", "8", "-z", "10",
      "--no-feature-limit", "--no-tile-size-limit",
      "--simplification=8",
      "--buffer=16",
      // Force timeline properties to string so MapLibre filter expressions work
      "--attribute-type=FIRE_YEAR:string",
      // DISTURBANCE_START_DATE is already a string in NDJSON when present.
      // Do NOT force it to string via --attribute-type — tippecanoe converts
      // JSON null to literal "null" string, which then fails pattern validation.
      "--force",
      ...detailInputs,
    ].join(" ");
    console.log(`  $ ${detailCmd}\n`);
    execSync(detailCmd, { stdio: "inherit", timeout: 3_600_000 });

    // ── Merge ──
    console.log("\nMerging overview + detail...");
    const mergeCmd = [
      "tile-join",
      "-o", outputPath,
      "-pk",
      "--force",
      overviewPath,
      detailPath,
    ].join(" ");
    console.log(`  $ ${mergeCmd}\n`);
    execSync(mergeCmd, { stdio: "inherit", timeout: 600_000 });

    // Clean up intermediate files
    try { unlinkSync(overviewPath); } catch { /* may not exist on failure */ }
    try { unlinkSync(detailPath); } catch { /* may not exist on failure */ }

    const stats = statSync(outputPath);
    console.log(
      `\nPMTiles output: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`
    );

    // --audit flag: run full audit suite after successful tile generation
    if (process.argv.includes("--audit")) {
      console.log("\nRunning post-build audit (--audit)...");
      try {
        execSync("npm run audit", { stdio: "inherit" });
      } catch {
        console.error("Post-build audit FAILED. Tile file was generated but audit checks did not pass.");
        return false;
      }
    }

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
    console.log("Archiving current PMTiles before rebuild...");
    archiveCurrentTiles();
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
      const cellCount = await downloadVRICell(cell, forestAgePath);

      if (cellCount > 0) {
        totalFeatures += cellCount;
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

  // Secondary layer downloads -- generic grid-cell pagination
  console.log("\n=== Secondary Layer Downloads ===\n");

  const secondaryLayers: Array<{
    endpoint: string;
    typeName: string;
    name: string;
    grid: GridCell[];
    extract: PropertyExtractor;
  }> = [
    {
      endpoint: WFS_ENDPOINTS.tenureCutblocks,
      typeName: "pub:WHSE_FOREST_TENURE.FTEN_CUT_BLOCK_POLY_SVW",
      name: "tenure-cutblocks",
      grid: getAllGridCells(),
      extract: extractTenureCutblocks,
    },
    {
      endpoint: WFS_ENDPOINTS.fireHistory,
      typeName: "pub:WHSE_LAND_AND_NATURAL_RESOURCE.PROT_HISTORICAL_FIRE_POLYS_SP",
      name: "fire-history",
      grid: getAllGridCells(),
      extract: extractFireHistory,
    },
    {
      endpoint: WFS_ENDPOINTS.ogma,
      typeName: "pub:WHSE_LAND_USE_PLANNING.RMP_OGMA_LEGAL_CURRENT_SVW",
      name: "ogma",
      grid: getAllParksGridCells(),
      extract: extractOgma,
    },
    {
      endpoint: WFS_ENDPOINTS.wildlifeHabitatAreas,
      typeName: "pub:WHSE_WILDLIFE_MANAGEMENT.WCP_WILDLIFE_HABITAT_AREA_POLY",
      name: "wildlife-habitat-areas",
      grid: getAllParksGridCells(),
      extract: extractWildlifeHabitatAreas,
    },
    {
      endpoint: WFS_ENDPOINTS.ungulateWinterRange,
      typeName: "pub:WHSE_WILDLIFE_MANAGEMENT.WCP_UNGULATE_WINTER_RANGE_SP",
      name: "ungulate-winter-range",
      grid: getAllParksGridCells(),
      extract: extractUngulateWinterRange,
    },
    {
      endpoint: WFS_ENDPOINTS.communityWatersheds,
      typeName: "pub:WHSE_WATER_MANAGEMENT.WLS_COMMUNITY_WS_PUB_SVW",
      name: "community-watersheds",
      grid: getAllParksGridCells(),
      extract: extractCommunityWatersheds,
    },
    {
      endpoint: WFS_ENDPOINTS.miningClaims,
      typeName: "pub:WHSE_MINERAL_TENURE.MTA_ACQUIRED_TENURE_SVW",
      name: "mining-claims",
      grid: getAllGridCells(),
      extract: extractMiningClaims,
    },
    {
      endpoint: WFS_ENDPOINTS.forestryRoads,
      typeName: "pub:WHSE_FOREST_TENURE.FTEN_ROAD_SECTION_LINES_SVW",
      name: "forestry-roads",
      grid: getAllGridCells(),
      extract: extractForestryRoads,
    },
    {
      endpoint: WFS_ENDPOINTS.conservationPriority,
      typeName: "pub:WHSE_FOREST_VEGETATION.OGSR_PRIORITY_DEF_AREA_CUR_SP",
      name: "conservation-priority",
      grid: getAllParksGridCells(),
      extract: extractConservationPriority,
    },
  ];

  for (const layer of secondaryLayers) {
    const outputPath = resolve(GEOJSON_DIR, `${layer.name}.ndjson`);
    if (existsSync(outputPath) && statSync(outputPath).size > 0) {
      console.log(`  ${layer.name}: NDJSON exists, skipping download`);
    } else {
      writeFileSync(outputPath, "");
      const count = await downloadLayerCells(
        layer.endpoint,
        layer.typeName,
        layer.name,
        outputPath,
        layer.grid,
        layer.extract,
      );
      console.log(`  ${layer.name}: ${count} features`);
    }
  }

  console.log("\n=== NDJSON Summary ===");
  const allLayerNames = [
    "forest-age", "parks", "conservancies",
    "tenure-cutblocks", "fire-history", "ogma",
    "wildlife-habitat-areas", "ungulate-winter-range",
    "community-watersheds", "mining-claims", "forestry-roads",
    "conservation-priority",
  ];
  for (const name of allLayerNames) {
    const p = resolve(GEOJSON_DIR, `${name}.ndjson`);
    if (existsSync(p)) {
      const stats = statSync(p);
      if (stats.size === 0) {
        console.log(`  ${name}: EMPTY (0 bytes) -- WFS download returned no features`);
      } else {
        console.log(`  ${name}: ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
      }
    } else {
      console.log(`  ${name}: MISSING`);
    }
  }

  if (!skipTiles) {
    const totalElapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
    console.log(
      `\nDownload phase complete (${totalElapsed} min). Archiving current tiles before rebuild...`
    );
    archiveCurrentTiles();
    console.log("Starting tile generation...");
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
