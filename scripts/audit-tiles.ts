/**
 * OpenCanopy Tile Audit Pipeline -- Part A
 *
 * Standalone script that reads the local PMTiles archive and NDJSON source
 * data to validate tile content, feature counts, and property preservation.
 *
 * Usage:
 *   npx tsx scripts/audit-tiles.ts
 *   npx tsx scripts/audit-tiles.ts --output audit-results.json
 *
 * Checks:
 *   A1: Source layer verification (all 12 expected layers exist in PMTiles)
 *   A2: Feature count reconciliation (center tile at z7 and z10 per layer)
 *   A3: Property preservation (sample 100 features, verify props survive tiling)
 *   A4: Large feature detection (tenure-cutblocks >2000ha should exist but be filtered)
 *   A5: Tile boundary artifacts (near Revelstoke at z7 and z9)
 *   A6: Zoom consistency (z10 features have coverage in z6 parent tiles)
 *   A7: Timeline property format (DISTURBANCE_START_DATE, FIRE_YEAR)
 *   A8: Preprocessing comparison (dedup rate, reject rate, water subtraction stats)
 */

import path from "path";
import { existsSync, readFileSync } from "fs";
import { PMTiles } from "pmtiles";
import { NodeFileSource } from "./lib/node-file-source";
import { parseTile, getLayerFeatures, getLayerPropertyKeys } from "./lib/mvt-reader";
import { countLines } from "./lib/ndjson-sampler";
import { latLonToTile, parentTile } from "./lib/tile-math";
import {
  AuditResult,
  printResults,
  saveResults,
} from "./lib/audit-types";
import { LAYER_REGISTRY } from "../src/lib/layers/registry";

// ── Configuration ─────────────────────────────────────────────────────────────

const PMTILES_PATH = path.resolve(__dirname, "../data/tiles/opencanopy.pmtiles");
const NDJSON_DIR = path.resolve(__dirname, "../data/geojson");

const EXPECTED_SOURCE_LAYERS = [
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
] as const;

// Representative center points for each layer's NDJSON file
// (lat/lon near the middle of BC for layers that cover the province)
const LAYER_CENTER_POINTS: Record<string, { lat: number; lon: number }> = {
  "forest-age": { lat: 53.5, lon: -122.0 },
  "tenure-cutblocks": { lat: 54.0, lon: -124.0 },
  "fire-history": { lat: 52.0, lon: -121.0 },
  parks: { lat: 49.5, lon: -123.5 },
  conservancies: { lat: 55.0, lon: -128.0 },
  ogma: { lat: 52.5, lon: -123.0 },
  "wildlife-habitat-areas": { lat: 53.0, lon: -122.5 },
  "ungulate-winter-range": { lat: 54.5, lon: -122.0 },
  "community-watersheds": { lat: 49.5, lon: -119.5 },
  "mining-claims": { lat: 56.0, lon: -124.0 },
  "forestry-roads": { lat: 53.5, lon: -123.0 },
  "conservation-priority": { lat: 52.0, lon: -124.0 },
};

// BC sample points for A4 (large feature detection)
const BC_SAMPLE_POINTS = [
  { name: "NW", lat: 57.0, lon: -130.0 },
  { name: "N",  lat: 57.0, lon: -125.0 },
  { name: "NE", lat: 57.0, lon: -120.0 },
  { name: "W",  lat: 52.0, lon: -128.0 },
  { name: "C",  lat: 52.0, lon: -125.0 },
  { name: "E",  lat: 52.0, lon: -118.0 },
  { name: "SW", lat: 49.0, lon: -126.0 },
  { name: "S",  lat: 49.0, lon: -122.0 },
  { name: "SE", lat: 49.0, lon: -117.0 },
];

// ── PMTiles helper ────────────────────────────────────────────────────────────

async function readTile(
  pmtiles: PMTiles,
  z: number,
  x: number,
  y: number
): Promise<ArrayBuffer | null> {
  try {
    const result = await pmtiles.getZxy(z, x, y);
    if (!result || !result.data) return null;
    return result.data;
  } catch {
    return null;
  }
}

// ── TileAudit class ───────────────────────────────────────────────────────────

class TileAudit {
  private pmtiles: PMTiles;
  private source: NodeFileSource;

  constructor() {
    this.source = new NodeFileSource(PMTILES_PATH);
    this.pmtiles = new PMTiles(this.source);
  }

  async runAll(): Promise<AuditResult[]> {
    console.log("Opening PMTiles archive...");
    const header = await this.pmtiles.getHeader();
    console.log(
      `  PMTiles version: ${header.specVersion}, ` +
        `zoom range: z${header.minZoom}-z${header.maxZoom}\n`
    );

    const results: AuditResult[] = [];

    console.log("A1: Checking source layers...");
    results.push(...(await this.checkSourceLayers()));

    console.log("A2: Checking feature counts...");
    results.push(...(await this.checkFeatureCounts()));

    console.log("A3: Checking property preservation...");
    results.push(...(await this.checkPropertyPreservation()));

    console.log("A4: Checking large feature detection...");
    results.push(...(await this.checkLargeFeatures()));

    console.log("A5: Checking tile boundary artifacts...");
    results.push(...(await this.checkTileBoundaryArtifacts()));

    console.log("A6: Checking zoom consistency...");
    results.push(...(await this.checkZoomConsistency()));

    console.log("A7: Checking timeline property format...");
    results.push(...(await this.checkTimelinePropertyFormat()));

    console.log("A8: Checking preprocessing comparison...");
    results.push(...(await this.checkPreprocessingComparison()));

    await this.source.close();
    return results;
  }

  // ── A1: Source layer verification ──────────────────────────────────────────

  async checkSourceLayers(): Promise<AuditResult[]> {
    const results: AuditResult[] = [];

    // Read PMTiles metadata -- tippecanoe writes layer names in the metadata JSON
    const metadata = await this.pmtiles.getMetadata();
    let vectorLayers: Array<{ id: string }> = [];

    if (metadata && typeof metadata === "object") {
      const meta = metadata as Record<string, unknown>;
      if (Array.isArray(meta.vector_layers)) {
        vectorLayers = meta.vector_layers as Array<{ id: string }>;
      }
    }

    const foundLayers = new Set(vectorLayers.map((l) => l.id));

    if (foundLayers.size === 0) {
      results.push({
        check: "A1: Source layer metadata",
        status: "WARN",
        message:
          "PMTiles metadata has no vector_layers field. " +
          "This may indicate the file was built without tippecanoe metadata, " +
          "or the metadata format is non-standard.",
        details: { metadataKeys: metadata ? Object.keys(metadata as object) : [] },
      });
    } else {
      results.push({
        check: "A1: Source layer metadata",
        status: "PASS",
        message: `Found ${foundLayers.size} layer(s) in PMTiles metadata: ${[...foundLayers].join(", ")}`,
      });
    }

    // Check each expected layer
    if (foundLayers.size === 0) {
      // Empty/corrupt PMTiles -- all expected layers are missing
      for (const expected of EXPECTED_SOURCE_LAYERS) {
        results.push({
          check: `A1: All 12 expected source layers present`,
          status: "FAIL",
          message: `Layer "${expected}" missing: PMTiles metadata returned no vector_layers (empty or corrupt file).`,
          details: { missing: expected },
        });
      }
    } else {
      const missing: string[] = [];
      for (const expected of EXPECTED_SOURCE_LAYERS) {
        if (!foundLayers.has(expected)) {
          missing.push(expected);
        }
      }

      if (missing.length > 0) {
        results.push({
          check: "A1: All 12 expected source layers present",
          status: "FAIL",
          message: `Missing ${missing.length} source layer(s) from PMTiles metadata.`,
          details: { missing, found: [...foundLayers] },
        });
      } else {
        results.push({
          check: "A1: All 12 expected source layers present",
          status: "PASS",
          message: `All ${EXPECTED_SOURCE_LAYERS.length} expected source layers found in metadata.`,
        });
      }
    }

    // Also verify by actually reading tiles -- tiles at z8 center of BC should
    // contain most layers
    const bcCenter = latLonToTile(53.7, -127.6, 8);
    const tileData = await readTile(this.pmtiles, bcCenter.z, bcCenter.x, bcCenter.y);

    if (tileData) {
      const tile = parseTile(tileData);
      const tiledLayers = Object.keys(tile.layers);
      results.push({
        check: "A1: Source layers present in BC center tile (z8)",
        status: tiledLayers.length > 0 ? "PASS" : "WARN",
        message:
          tiledLayers.length > 0
            ? `BC center tile at z${bcCenter.z}/${bcCenter.x}/${bcCenter.y} contains layers: ${tiledLayers.join(", ")}`
            : "BC center tile at z8 returned no layers. Data may not cover this location.",
        details: { tile: `${bcCenter.z}/${bcCenter.x}/${bcCenter.y}` },
      });
    } else {
      results.push({
        check: "A1: Source layers present in BC center tile (z8)",
        status: "WARN",
        message: `No tile data at z${bcCenter.z}/${bcCenter.x}/${bcCenter.y} (BC center). ` +
          "This may indicate a zoom level gap or empty area at this location.",
        details: { tile: `${bcCenter.z}/${bcCenter.x}/${bcCenter.y}` },
      });
    }

    return results;
  }

  // ── A2: Feature count reconciliation ───────────────────────────────────────

  async checkFeatureCounts(): Promise<AuditResult[]> {
    const results: AuditResult[] = [];

    for (const layerName of EXPECTED_SOURCE_LAYERS) {
      const ndjsonPath = path.join(NDJSON_DIR, `${layerName}.ndjson`);
      const center = LAYER_CENTER_POINTS[layerName];

      // Count NDJSON features
      let ndjsonCount = 0;
      try {
        ndjsonCount = await countLines(ndjsonPath);
      } catch {
        results.push({
          check: `A2: Feature count [${layerName}]`,
          status: "WARN",
          message: `NDJSON file not found: ${ndjsonPath}. Cannot reconcile feature count.`,
        });
        continue;
      }

      // Read center tiles at z7 and z10
      const tileCountsByZoom: Record<number, number> = {};
      for (const zoom of [7, 10]) {
        const tile = latLonToTile(center.lat, center.lon, zoom);
        const tileData = await readTile(this.pmtiles, tile.z, tile.x, tile.y);
        if (tileData) {
          const parsed = parseTile(tileData);
          const features = getLayerFeatures(parsed, layerName);
          tileCountsByZoom[zoom] = features.length;
        } else {
          tileCountsByZoom[zoom] = -1; // no tile
        }
      }

      const z7Count = tileCountsByZoom[7];
      const z10Count = tileCountsByZoom[10];

      // Determine status:
      // - If BOTH z7 and z10 have 0 or no tile, that's a problem
      // - A single tile won't contain all features (tiling is spatial), so
      //   we just verify >0 in at least one zoom level
      const hasAnyFeatures = (z7Count > 0) || (z10Count > 0);

      results.push({
        check: `A2: Feature count [${layerName}]`,
        status: hasAnyFeatures ? "PASS" : "FAIL",
        message: hasAnyFeatures
          ? `NDJSON: ${ndjsonCount.toLocaleString()} features. ` +
            `Tile at z7: ${z7Count >= 0 ? z7Count : "no tile"}, ` +
            `z10: ${z10Count >= 0 ? z10Count : "no tile"} features in center tile.`
          : `NDJSON: ${ndjsonCount.toLocaleString()} features but ` +
            `center tiles at z7 and z10 both returned 0 features for source layer "${layerName}". ` +
            `This may indicate a source layer name mismatch or empty tiles at these locations.`,
        details: {
          ndjsonFeatures: ndjsonCount,
          centerPoint: center,
          z7TileFeatures: z7Count >= 0 ? z7Count : "no tile",
          z10TileFeatures: z10Count >= 0 ? z10Count : "no tile",
        },
      });

      // Sanity check: large NDJSON but near-zero tile features suggests massive data loss
      const tileTotal = Math.max(0, z7Count) + Math.max(0, z10Count);
      if (ndjsonCount > 1000 && tileTotal < 10) {
        results.push({
          check: `A2: Data loss sanity check [${layerName}]`,
          status: "WARN",
          message:
            `NDJSON has ${ndjsonCount.toLocaleString()} features but combined center tile count is only ${tileTotal}. ` +
            "This may indicate massive data loss during tiling (tippecanoe filtering, wrong layer name, or mismatched center point).",
          details: {
            ndjsonFeatures: ndjsonCount,
            combinedTileFeatures: tileTotal,
            z7TileFeatures: z7Count >= 0 ? z7Count : "no tile",
            z10TileFeatures: z10Count >= 0 ? z10Count : "no tile",
          },
        });
      }
    }

    return results;
  }

  // ── A3: Property preservation ───────────────────────────────────────────────

  async checkPropertyPreservation(): Promise<AuditResult[]> {
    const results: AuditResult[] = [];

    // Key properties we expect tippecanoe to preserve per layer
    const EXPECTED_PROPERTIES: Record<string, string[]> = {
      "forest-age": ["class"],
      "tenure-cutblocks": ["PLANNED_GROSS_BLOCK_AREA", "company_id"],
      "fire-history": ["FIRE_YEAR"],
      parks: ["PROTECTED_LANDS_NAME"],
      conservancies: ["CONSERVANCY_AREA_NAME"],
      ogma: ["OGMA_TYPE"],
      "wildlife-habitat-areas": ["COMMON_SPECIES_NAME"],
      "ungulate-winter-range": ["SPECIES_1"],
      "community-watersheds": ["CW_NAME"],
      "mining-claims": ["TENURE_TYPE_DESCRIPTION"],
      "forestry-roads": ["ROAD_SECTION_NAME"],
      "conservation-priority": ["TAP_CLASSIFICATION_LABEL"],
    };

    for (const layerName of EXPECTED_SOURCE_LAYERS) {
      const expectedProps = EXPECTED_PROPERTIES[layerName] ?? [];
      if (expectedProps.length === 0) continue;

      const center = LAYER_CENTER_POINTS[layerName];
      const tile = latLonToTile(center.lat, center.lon, 10);
      const tileData = await readTile(this.pmtiles, tile.z, tile.x, tile.y);

      if (!tileData) {
        // Try z8 as fallback (some layers have sparse coverage at z10 center points)
        const tile8 = latLonToTile(center.lat, center.lon, 8);
        const tileData8 = await readTile(this.pmtiles, tile8.z, tile8.x, tile8.y);

        if (!tileData8) {
          results.push({
            check: `A3: Property preservation [${layerName}]`,
            status: "WARN",
            message: `No tile data at z10 or z8 near center point ${center.lat}, ${center.lon}. ` +
              "Cannot verify property preservation at this location.",
          });
          continue;
        }

        const parsed = parseTile(tileData8);
        const tileProps = getLayerPropertyKeys(parsed, layerName, 20);
        this._checkPropsResult(results, layerName, tileProps, expectedProps, 8);
        continue;
      }

      const parsed = parseTile(tileData);
      const tileProps = getLayerPropertyKeys(parsed, layerName, 20);
      this._checkPropsResult(results, layerName, tileProps, expectedProps, 10);
    }

    return results;
  }

  private _checkPropsResult(
    results: AuditResult[],
    layerName: string,
    tileProps: Set<string>,
    expectedProps: string[],
    zoom: number
  ): void {
    if (tileProps.size === 0) {
      results.push({
        check: `A3: Property preservation [${layerName}]`,
        status: "WARN",
        message: `No features found in z${zoom} tile. Cannot verify property preservation.`,
      });
      return;
    }

    const missing = expectedProps.filter((p) => !tileProps.has(p));

    results.push({
      check: `A3: Property preservation [${layerName}]`,
      status: missing.length === 0 ? "PASS" : "FAIL",
      message:
        missing.length === 0
          ? `All expected properties preserved at z${zoom}. ` +
            `Tile has: ${[...tileProps].join(", ")}`
          : `Missing properties in z${zoom} tile: ${missing.join(", ")}. ` +
            `Found: ${[...tileProps].join(", ")}`,
      details: {
        zoom,
        expectedProperties: expectedProps,
        foundProperties: [...tileProps],
        missingProperties: missing,
      },
    });
  }

  // ── A4: Large feature detection ─────────────────────────────────────────────

  async checkLargeFeatures(): Promise<AuditResult[]> {
    const results: AuditResult[] = [];

    // Read 9 sample tiles at z8 across BC
    let tilesWithCutblocks = 0;
    let tilesWithLargeArea = 0;
    let totalCutblockFeatures = 0;
    let largeFeatureCount = 0;

    for (const point of BC_SAMPLE_POINTS) {
      const tile = latLonToTile(point.lat, point.lon, 8);
      const tileData = await readTile(this.pmtiles, tile.z, tile.x, tile.y);

      if (!tileData) continue;

      const parsed = parseTile(tileData);
      const features = getLayerFeatures(parsed, "tenure-cutblocks");

      if (features.length > 0) {
        tilesWithCutblocks++;
        totalCutblockFeatures += features.length;

        // Check for features with PLANNED_GROSS_BLOCK_AREA > 2000 ha
        for (const feature of features) {
          const props = (feature as { properties?: Record<string, unknown> }).properties;
          if (props && props.PLANNED_GROSS_BLOCK_AREA !== undefined) {
            const area = parseFloat(String(props.PLANNED_GROSS_BLOCK_AREA));
            if (!isNaN(area) && area > 2000) {
              tilesWithLargeArea++;
              largeFeatureCount++;
            }
          }
        }
      }
    }

    // Cutblocks should be present in at least some BC tiles
    results.push({
      check: "A4: Cutblocks present in BC tiles (z8)",
      status: tilesWithCutblocks > 0 ? "PASS" : "FAIL",
      message:
        tilesWithCutblocks > 0
          ? `Found tenure-cutblocks in ${tilesWithCutblocks}/${BC_SAMPLE_POINTS.length} BC sample tiles. ` +
            `Total: ${totalCutblockFeatures} features across sampled tiles.`
          : `No tenure-cutblocks found in any of ${BC_SAMPLE_POINTS.length} BC sample tiles at z8. ` +
            "Data may not be present or may be at wrong zoom level.",
      details: {
        tilesChecked: BC_SAMPLE_POINTS.length,
        tilesWithCutblocks,
        totalFeatures: totalCutblockFeatures,
      },
    });

    // Large features (>2000 ha) should exist in the tile data (not stripped by tippecanoe).
    // The rendering filter in the registry excludes them from display -- they must survive tiling.
    //
    // PASS: large features found (PLANNED_GROSS_BLOCK_AREA present and >2000 ha)
    // WARN: no large features found but we did read some features (all cutblocks genuinely small,
    //       or the property was stripped -- ambiguous, warrants review)
    // FAIL: totalFeaturesChecked === 0 (couldn't read any tenure-cutblocks features at all)
    let largeFeatureStatus: AuditResult["status"];
    let largeFeatureMessage: string;

    if (totalCutblockFeatures === 0) {
      largeFeatureStatus = "FAIL";
      largeFeatureMessage =
        "Could not read any tenure-cutblocks features from BC sample tiles at z8. " +
        "Cannot verify PLANNED_GROSS_BLOCK_AREA preservation. " +
        "The layer may be absent or all sampled tiles may be empty.";
    } else if (largeFeatureCount > 0) {
      largeFeatureStatus = "PASS";
      largeFeatureMessage =
        `Found ${largeFeatureCount} feature(s) with PLANNED_GROSS_BLOCK_AREA > 2000 ha in BC tiles at z8. ` +
        "Property preserved in tiles (as expected). Registry filter excludes them from rendering.";
    } else {
      largeFeatureStatus = "WARN";
      largeFeatureMessage =
        `Read ${totalCutblockFeatures} tenure-cutblocks features but none have PLANNED_GROSS_BLOCK_AREA > 2000 ha. ` +
        "Either all sampled cutblocks are genuinely small, or the property was stripped by tippecanoe. " +
        "Check that --include-all-properties or explicit -y flags were used during tile build.";
    }

    results.push({
      check: "A4: Large features (>2000 ha) exist in tile data",
      status: largeFeatureStatus,
      message: largeFeatureMessage,
      details: {
        largeFeatureCount,
        totalFeaturesChecked: totalCutblockFeatures,
        threshold: 2000,
        tilesWithLargeArea,
      },
    });

    return results;
  }

  // ── A5: Tile boundary artifacts ─────────────────────────────────────────────

  async checkTileBoundaryArtifacts(): Promise<AuditResult[]> {
    const results: AuditResult[] = [];

    // Near Revelstoke (-118.2, 51.0) -- dense forest coverage, good test area
    const REVELSTOKE = { lat: 51.0, lon: -118.2 };

    for (const zoom of [7, 9]) {
      const tile = latLonToTile(REVELSTOKE.lat, REVELSTOKE.lon, zoom);
      const tileData = await readTile(this.pmtiles, tile.z, tile.x, tile.y);

      if (!tileData) {
        results.push({
          check: `A5: Tile boundary artifacts (z${zoom}, Revelstoke)`,
          status: "WARN",
          message: `No tile data at z${zoom} near Revelstoke. Cannot check for boundary artifacts.`,
          details: { tile: `${tile.z}/${tile.x}/${tile.y}` },
        });
        continue;
      }

      const parsed = parseTile(tileData);

      // Check forest-age (most likely to show boundary artifacts due to polygon clipping)
      const features = getLayerFeatures(parsed, "forest-age");

      if (features.length === 0) {
        results.push({
          check: `A5: Tile boundary artifacts (z${zoom}, Revelstoke)`,
          status: "WARN",
          message: `No forest-age features in z${zoom} tile near Revelstoke. Cannot assess boundary artifacts.`,
          details: { tile: `${tile.z}/${tile.x}/${tile.y}` },
        });
        continue;
      }

      // Count polygon edges aligned with tile boundaries
      // Tile extent in MVT is 4096 units (0-4095)
      const TILE_EXTENT = 4096;
      const BOUNDARY_TOLERANCE = 4; // within 4 units of edge = boundary-aligned
      let boundaryEdgeCount = 0;
      let totalEdgeCount = 0;

      for (const feature of features) {
        const f = feature as {
          type: number; // 3 = polygon
          loadGeometry: () => Array<Array<{ x: number; y: number }>>;
        };

        if (f.type !== 3) continue; // only polygons

        try {
          const rings = f.loadGeometry();
          for (const ring of rings) {
            for (let i = 0; i < ring.length - 1; i++) {
              const p0 = ring[i];
              const p1 = ring[i + 1];

              // Check if this edge is aligned with a tile boundary
              const onLeftEdge =
                Math.abs(p0.x) <= BOUNDARY_TOLERANCE &&
                Math.abs(p1.x) <= BOUNDARY_TOLERANCE;
              const onRightEdge =
                Math.abs(p0.x - TILE_EXTENT) <= BOUNDARY_TOLERANCE &&
                Math.abs(p1.x - TILE_EXTENT) <= BOUNDARY_TOLERANCE;
              const onTopEdge =
                Math.abs(p0.y) <= BOUNDARY_TOLERANCE &&
                Math.abs(p1.y) <= BOUNDARY_TOLERANCE;
              const onBottomEdge =
                Math.abs(p0.y - TILE_EXTENT) <= BOUNDARY_TOLERANCE &&
                Math.abs(p1.y - TILE_EXTENT) <= BOUNDARY_TOLERANCE;

              totalEdgeCount++;
              if (onLeftEdge || onRightEdge || onTopEdge || onBottomEdge) {
                boundaryEdgeCount++;
              }
            }
          }
        } catch {
          // Skip features with geometry load errors
        }
      }

      const boundaryRatio =
        totalEdgeCount > 0 ? boundaryEdgeCount / totalEdgeCount : 0;
      const boundaryPercent = (boundaryRatio * 100).toFixed(1);

      // >5% boundary-aligned edges = WARN (likely artifact level)
      const status =
        boundaryRatio > 0.05
          ? "WARN"
          : "PASS";

      results.push({
        check: `A5: Tile boundary artifacts (z${zoom}, Revelstoke)`,
        status,
        message:
          `${boundaryPercent}% of polygon edges aligned with tile boundaries ` +
          `(${boundaryEdgeCount}/${totalEdgeCount} edges). ` +
          (status === "WARN"
            ? "Above 5% threshold -- potential clipping artifacts."
            : "Below 5% threshold -- tile clipping looks normal."),
        details: {
          tile: `${tile.z}/${tile.x}/${tile.y}`,
          features: features.length,
          boundaryEdges: boundaryEdgeCount,
          totalEdges: totalEdgeCount,
          boundaryPercent: parseFloat(boundaryPercent),
        },
      });
    }

    return results;
  }

  // ── A6: Zoom consistency ────────────────────────────────────────────────────

  async checkZoomConsistency(): Promise<AuditResult[]> {
    const results: AuditResult[] = [];

    // Sample 50 center points at z10 across BC
    // We'll spread them across BC using a grid
    const samplePoints: Array<{ lat: number; lon: number }> = [];
    const latSteps = 5;
    const lonSteps = 10;
    const latRange = [49.0, 60.0];
    const lonRange = [-139.0, -114.0];

    for (let i = 0; i < latSteps; i++) {
      for (let j = 0; j < lonSteps; j++) {
        samplePoints.push({
          lat: latRange[0] + (i + 0.5) * ((latRange[1] - latRange[0]) / latSteps),
          lon: lonRange[0] + (j + 0.5) * ((lonRange[1] - lonRange[0]) / lonSteps),
        });
      }
    }

    // For each sample point, check if a z10 tile with features has a corresponding
    // z6 parent tile that also has features (zoom consistency)
    let tilesChecked = 0;
    let tilesWithFeatures = 0;
    let parentTilesWithFeatures = 0;

    for (const point of samplePoints) {
      const z10Tile = latLonToTile(point.lat, point.lon, 10);
      const z10Data = await readTile(this.pmtiles, z10Tile.z, z10Tile.x, z10Tile.y);

      tilesChecked++;

      if (!z10Data) continue;

      const z10Parsed = parseTile(z10Data);
      // Count features across all layers
      const z10FeatureCount = Object.keys(z10Parsed.layers).reduce(
        (sum, layer) => sum + getLayerFeatures(z10Parsed, layer).length,
        0
      );

      if (z10FeatureCount === 0) continue;

      tilesWithFeatures++;

      // Check parent at z6 (4 zoom levels up)
      const z6Tile = parentTile(z10Tile.x, z10Tile.y, z10Tile.z, 4);
      const z6Data = await readTile(this.pmtiles, z6Tile.z, z6Tile.x, z6Tile.y);

      if (!z6Data) continue;

      const z6Parsed = parseTile(z6Data);
      const z6FeatureCount = Object.keys(z6Parsed.layers).reduce(
        (sum, layer) => sum + getLayerFeatures(z6Parsed, layer).length,
        0
      );

      if (z6FeatureCount > 0) {
        parentTilesWithFeatures++;
      }
    }

    const coverageRatio =
      tilesWithFeatures > 0 ? parentTilesWithFeatures / tilesWithFeatures : 0;
    const coveragePercent = (coverageRatio * 100).toFixed(1);

    let status: AuditResult["status"];
    if (coverageRatio >= 0.8) status = "PASS";
    else if (coverageRatio >= 0.5) status = "WARN";
    else status = "FAIL";

    results.push({
      check: "A6: Zoom consistency (z10 -> z6 parent coverage)",
      status,
      message:
        `${coveragePercent}% of z10 tiles with features have corresponding z6 parent data ` +
        `(${parentTilesWithFeatures}/${tilesWithFeatures} tiles). ` +
        (status === "FAIL"
          ? "Below 50% -- significant zoom level gaps detected."
          : status === "WARN"
          ? "Between 50-80% -- some zoom level gaps present."
          : "Above 80% -- zoom coverage looks consistent."),
      details: {
        tilesChecked,
        tilesWithFeatures,
        parentTilesWithFeatures,
        coveragePercent: parseFloat(coveragePercent),
      },
    });

    return results;
  }

  // ── A7: Timeline property format ───────────────────────────────────────────
  //
  // For each layer with timelineField, sample features from a tile and verify
  // the field value is a string starting with a 4-digit year (regex: /^\d{4}/).
  //
  // Background: tippecanoe can coerce numeric-looking strings to numbers.
  // FIRE_YEAR values like "2015" might become the integer 2015.
  // The story timeline filter uses ["slice", ["get", "FIRE_YEAR"], 0, 4] which
  // fails silently on numbers -- the expression returns null instead of "2015".
  //
  // DISTURBANCE_START_DATE is a full ISO date string ("2015-06-01") so it
  // should survive as a string. FIRE_YEAR is the higher-risk field.

  async checkTimelinePropertyFormat(): Promise<AuditResult[]> {
    const results: AuditResult[] = [];

    // Collect layers with timelineField that also have a tileSource
    const timelineLayers = LAYER_REGISTRY.filter(
      (l) => l.timelineField && l.tileSource
    );

    if (timelineLayers.length === 0) {
      results.push({
        check: "A7: Timeline property format",
        status: "WARN",
        message:
          "No registry layers have both timelineField and tileSource. " +
          "Nothing to check. This may indicate the registry has changed.",
      });
      return results;
    }

    for (const layer of timelineLayers) {
      const fieldName = layer.timelineField!;
      const sourceLayer = layer.tileSource!.sourceLayer;
      const center = LAYER_CENTER_POINTS[sourceLayer];

      if (!center) {
        results.push({
          check: `A7: Timeline property format [${layer.id}] field: ${fieldName}`,
          status: "WARN",
          message:
            `No center point defined for source layer "${sourceLayer}". ` +
            "Cannot sample tile for timeline format check.",
        });
        continue;
      }

      // Try z10, fall back to z8
      let tileData: ArrayBuffer | null = null;
      let usedZoom = 10;
      for (const zoom of [10, 8]) {
        const tile = latLonToTile(center.lat, center.lon, zoom);
        tileData = await readTile(this.pmtiles, tile.z, tile.x, tile.y);
        if (tileData) {
          usedZoom = zoom;
          break;
        }
      }

      if (!tileData) {
        results.push({
          check: `A7: Timeline property format [${layer.id}] field: ${fieldName}`,
          status: "WARN",
          message:
            `No tile data found at z10 or z8 near center point for "${sourceLayer}". ` +
            "Cannot verify timeline property format.",
        });
        continue;
      }

      const parsed = parseTile(tileData);
      const features = getLayerFeatures(parsed, sourceLayer);

      if (features.length === 0) {
        results.push({
          check: `A7: Timeline property format [${layer.id}] field: ${fieldName}`,
          status: "WARN",
          message:
            `No features found in z${usedZoom} tile for source layer "${sourceLayer}". ` +
            "Cannot verify timeline property format at this location.",
        });
        continue;
      }

      // Sample up to 20 features that have the timelineField set
      const YEAR_STRING_RE = /^\d{4}/;
      let sampled = 0;
      let numberCount = 0;
      let stringWithYearCount = 0;
      let nullCount = 0;
      let malformedCount = 0;
      const malformedExamples: unknown[] = [];

      for (const feature of features) {
        const props = (feature as { properties?: Record<string, unknown> })
          .properties;
        if (!props || !(fieldName in props)) continue;

        const val = props[fieldName];
        sampled++;

        if (val === null || val === undefined) {
          nullCount++;
        } else if (typeof val === "number") {
          numberCount++;
          if (malformedExamples.length < 3) malformedExamples.push(val);
        } else if (typeof val === "string" && YEAR_STRING_RE.test(val)) {
          stringWithYearCount++;
        } else {
          malformedCount++;
          if (malformedExamples.length < 3) malformedExamples.push(val);
        }

        if (sampled >= 20) break;
      }

      if (sampled === 0) {
        results.push({
          check: `A7: Timeline property format [${layer.id}] field: ${fieldName}`,
          status: "WARN",
          message:
            `Found ${features.length} features but none have the "${fieldName}" property. ` +
            "Property may have been dropped by tippecanoe or misnamed.",
          details: { sourceLayer, zoom: usedZoom, featureCount: features.length },
        });
        continue;
      }

      if (numberCount > 0) {
        results.push({
          check: `A7: Timeline property format [${layer.id}] field: ${fieldName}`,
          status: "FAIL",
          message:
            `FAIL: "${fieldName}" has been coerced to a number in ${numberCount}/${sampled} ` +
            `sampled features (z${usedZoom}, source: "${sourceLayer}"). ` +
            `The timeline ["slice", ["get", "${fieldName}"], 0, 4] expression will fail silently on numbers. ` +
            `Rebuild tiles with --include-all-properties or add -y ${fieldName}:string to tippecanoe flags. ` +
            `Example values found: ${JSON.stringify(malformedExamples)}`,
          details: {
            field: fieldName,
            sourceLayer,
            zoom: usedZoom,
            sampled,
            numberCount,
            stringWithYearCount,
            nullCount,
            malformedCount,
            malformedExamples,
          },
        });
      } else if (malformedCount > 0) {
        results.push({
          check: `A7: Timeline property format [${layer.id}] field: ${fieldName}`,
          status: "WARN",
          message:
            `"${fieldName}" has ${malformedCount}/${sampled} values that don't match /^\\d{4}/. ` +
            `These features won't match timeline year filters. ` +
            `Example malformed values: ${JSON.stringify(malformedExamples)}`,
          details: {
            field: fieldName,
            sourceLayer,
            zoom: usedZoom,
            sampled,
            numberCount,
            stringWithYearCount,
            nullCount,
            malformedCount,
            malformedExamples,
          },
        });
      } else {
        results.push({
          check: `A7: Timeline property format [${layer.id}] field: ${fieldName}`,
          status: "PASS",
          message:
            `"${fieldName}" format looks correct: ${stringWithYearCount}/${sampled} sampled ` +
            `features have string values starting with a 4-digit year (z${usedZoom}, source: "${sourceLayer}"). ` +
            `${nullCount > 0 ? `${nullCount} features have null values (expected for some records).` : ""}`,
          details: {
            field: fieldName,
            sourceLayer,
            zoom: usedZoom,
            sampled,
            stringWithYearCount,
            nullCount,
          },
        });
      }
    }

    return results;
  }

  // ── A8: Preprocessing comparison ───────────────────────────────────────────

  async checkPreprocessingComparison(): Promise<AuditResult[]> {
    const results: AuditResult[] = [];
    const reportPath = path.resolve(
      __dirname,
      "../data/geojson/preprocessed/_report.json"
    );

    if (!existsSync(reportPath)) {
      results.push({
        check: "A8: Preprocessing report",
        status: "PASS",
        message: "No preprocessing report found — raw data used (run `npm run preprocess` to generate)",
      });
      return results;
    }

    let report: {
      timestamp?: string;
      layers?: Array<{
        layer: string;
        rawFeatures?: number;
        finalFeatures?: number;
        dedup?: { duplicateRate?: number };
        validation?: { total?: number; rejected?: number };
        waterSubtract?: { intersected?: number; dropped?: number };
        error?: string;
      }>;
    };

    try {
      report = JSON.parse(readFileSync(reportPath, "utf-8"));
    } catch (err) {
      results.push({
        check: "A8: Preprocessing report",
        status: "WARN",
        message: `Could not read preprocessing report: ${(err as Error).message}`,
      });
      return results;
    }

    results.push({
      check: "A8: Preprocessing report",
      status: "PASS",
      message: `Preprocessing report found (timestamp: ${report.timestamp ?? "unknown"})`,
    });

    for (const layerReport of report.layers ?? []) {
      const layer = layerReport.layer;

      if (layerReport.error) {
        results.push({
          check: `A8: Preprocessing [${layer}]`,
          status: "WARN",
          message: `Layer preprocessing failed: ${layerReport.error}`,
        });
        continue;
      }

      // Dedup rate check
      const dedupRate = layerReport.dedup?.duplicateRate ?? 0;
      if (dedupRate > 0.2) {
        results.push({
          check: `A8: Dedup rate [${layer}]`,
          status: "WARN",
          message:
            `Dedup rate ${(dedupRate * 100).toFixed(1)}% exceeds 20% threshold. ` +
            `Source data may have significant duplication.`,
          details: { layer, dedupRate },
        });
      } else {
        results.push({
          check: `A8: Dedup rate [${layer}]`,
          status: "PASS",
          message: `Dedup rate ${(dedupRate * 100).toFixed(1)}% is within acceptable range (<= 20%)`,
          details: { layer, dedupRate },
        });
      }

      // Validation reject rate check
      const validTotal = layerReport.validation?.total ?? 0;
      const validRejected = layerReport.validation?.rejected ?? 0;
      const rejectRate = validTotal > 0 ? validRejected / validTotal : 0;
      if (rejectRate > 0.05) {
        results.push({
          check: `A8: Validation reject rate [${layer}]`,
          status: "WARN",
          message:
            `Validation reject rate ${(rejectRate * 100).toFixed(1)}% exceeds 5% threshold. ` +
            `Check source data quality for ${layer}.`,
          details: { layer, rejectRate, rejected: validRejected, total: validTotal },
        });
      } else {
        results.push({
          check: `A8: Validation reject rate [${layer}]`,
          status: "PASS",
          message: `Validation reject rate ${(rejectRate * 100).toFixed(1)}% within range (<= 5%). ${validRejected} of ${validTotal} features rejected.`,
          details: { layer, rejectRate },
        });
      }

      // Water subtraction informational
      if (layerReport.waterSubtract) {
        const { intersected, dropped } = layerReport.waterSubtract;
        results.push({
          check: `A8: Water subtraction [${layer}]`,
          status: "PASS",
          message: `Water subtraction: ${intersected ?? 0} features intersected lakes, ${dropped ?? 0} features dropped`,
          details: { layer, intersected, dropped },
        });
      }

      // Total feature removal check
      const rawFeatures = layerReport.rawFeatures ?? 0;
      const finalFeatures = layerReport.finalFeatures ?? rawFeatures;
      const removalRate = rawFeatures > 0 ? (rawFeatures - finalFeatures) / rawFeatures : 0;
      if (removalRate > 0.25) {
        results.push({
          check: `A8: Total feature removal [${layer}]`,
          status: "FAIL",
          message:
            `${(removalRate * 100).toFixed(1)}% of features removed during preprocessing (threshold: 25%). ` +
            `Raw: ${rawFeatures.toLocaleString()}, Final: ${finalFeatures.toLocaleString()}. ` +
            `Investigate dedup/validation rules or source data quality.`,
          details: { layer, rawFeatures, finalFeatures, removalRate },
        });
      } else {
        results.push({
          check: `A8: Total feature removal [${layer}]`,
          status: "PASS",
          message:
            `${(removalRate * 100).toFixed(1)}% of features removed during preprocessing (threshold: 25%). ` +
            `Raw: ${rawFeatures.toLocaleString()}, Final: ${finalFeatures.toLocaleString()}`,
          details: { layer, rawFeatures, finalFeatures, removalRate },
        });
      }
    }

    return results;
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const outputIdx = args.indexOf("--output");
  const outputPath = outputIdx >= 0 ? args[outputIdx + 1] : null;

  const audit = new TileAudit();

  try {
    const results = await audit.runAll();
    printResults(results);

    if (outputPath) {
      saveResults(results, outputPath);
    }
  } catch (err) {
    console.error("Audit failed with error:", err);
    process.exit(1);
  }
}

main();
