/**
 * Spatial validation checks for the V2 diagnostic pipeline.
 *
 * Checks feature geometry against reference datasets (e.g. BC FWA lakes)
 * to catch systematic errors such as land-use features placed in water bodies.
 */

import { createReadStream, existsSync } from "fs";
import { createInterface } from "readline";
import { PMTiles } from "pmtiles";
import { NodeFileSource } from "./node-file-source";
import { parseTile, getLayerFeatures } from "./mvt-reader";
import { latLonToTile } from "./tile-math";
import { AuditResult } from "./audit-types";
import type { SamplePoint } from "./bc-sample-grid";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const turf = {
  bbox: require("@turf/bbox").default ?? require("@turf/bbox"),
  intersect: require("@turf/intersect").default ?? require("@turf/intersect"),
  area: require("@turf/area").default ?? require("@turf/area"),
  helpers: require("@turf/helpers"),
};

type GeoJSONFeature = {
  type: "Feature";
  geometry: GeoJSON.Geometry;
  properties: Record<string, unknown> | null;
};

type GeoJSONPolygon = {
  type: "Feature";
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  properties: Record<string, unknown> | null;
};

// Fraction of a feature's area that must overlap a water body to be flagged
const OVERLAP_THRESHOLD = 0.5;

// ── Lake data loader ───────────────────────────────────────────────────────────

/**
 * Load all lake polygon features from an NDJSON file into memory.
 * BC FWA lakes at ~25K features fit comfortably in RAM.
 */
async function loadLakes(lakesPath: string): Promise<GeoJSONPolygon[]> {
  const lakes: GeoJSONPolygon[] = [];
  const stream = createReadStream(lakesPath, { encoding: "utf8" });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const feature = JSON.parse(trimmed) as GeoJSONFeature;
      if (
        feature.type === "Feature" &&
        feature.geometry &&
        (feature.geometry.type === "Polygon" ||
          feature.geometry.type === "MultiPolygon")
      ) {
        lakes.push(feature as GeoJSONPolygon);
      }
    } catch {
      // Skip malformed lines
    }
  }

  return lakes;
}

// ── PMTiles helper ─────────────────────────────────────────────────────────────

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

// ── MVT feature → GeoJSON polygon ────────────────────────────────────────────

/**
 * Convert an MVT feature to a rough GeoJSON polygon for spatial checks.
 * MVT features use tile-local integer coordinates; we convert to WGS84.
 */
function mvtFeatureToGeoJSON(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  feature: any,
  tileX: number,
  tileY: number,
  zoom: number
): GeoJSONFeature | null {
  try {
    const extent = feature.extent ?? 4096;
    const n = Math.pow(2, zoom);

    function pixelToLonLat(px: number, py: number): [number, number] {
      const lon = ((tileX + px / extent) / n) * 360 - 180;
      const y = tileY + py / extent;
      const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
      return [lon, (latRad * 180) / Math.PI];
    }

    const geomType = feature.type; // 1=Point, 2=LineString, 3=Polygon
    if (geomType !== 3) return null; // Only polygons for water-body overlap

    const geoJson = feature.toGeoJSON(tileX, tileY, zoom);
    return {
      type: "Feature",
      geometry: geoJson.geometry,
      properties: feature.properties ?? null,
    };
  } catch {
    return null;
  }
}

// ── Bounding-box pre-filter ───────────────────────────────────────────────────

function bboxesOverlap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  a: [number, number, number, number],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  b: [number, number, number, number]
): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

// ── Main check ────────────────────────────────────────────────────────────────

/**
 * Check whether features in a PMTiles source layer fall inside BC water bodies.
 *
 * Strategy:
 * 1. Load lake polygons from NDJSON reference data into memory
 * 2. For each sample point, read the PMTiles tile at the given zoom
 * 3. For each polygon feature: bbox pre-check against all lakes, then
 *    @turf/intersect for precise overlap
 * 4. Features with >50% water overlap are flagged as FAIL
 */
export async function checkWaterBodyOverlap(
  pmtilesPath: string,
  lakesPath: string,
  samplePoints: SamplePoint[],
  sourceLayer: string,
  zoom: number
): Promise<AuditResult[]> {
  const results: AuditResult[] = [];

  if (!existsSync(pmtilesPath)) {
    results.push({
      check: `Water body overlap — ${sourceLayer} z${zoom}`,
      status: "WARN",
      message: `PMTiles file not found: ${pmtilesPath}`,
    });
    return results;
  }

  if (!existsSync(lakesPath)) {
    results.push({
      check: `Water body overlap — ${sourceLayer} z${zoom}`,
      status: "WARN",
      message: `Lakes reference file not found: ${lakesPath}. Run audit:download-reference first.`,
    });
    return results;
  }

  console.log(`  Loading lake reference data from ${lakesPath}...`);
  const lakes = await loadLakes(lakesPath);
  console.log(`  Loaded ${lakes.length} lake polygons`);

  // Pre-compute bboxes for lakes to speed up pre-filtering
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lakeBboxes: Array<[number, number, number, number]> = lakes.map((l) => {
    try {
      return turf.bbox.default
        ? turf.bbox.default(l)
        : (turf.bbox as (f: unknown) => [number, number, number, number])(l);
    } catch {
      return [-180, -90, 180, 90];
    }
  });

  const source = new NodeFileSource(pmtilesPath);
  const pmtiles = new PMTiles(source);

  let totalFeaturesChecked = 0;
  let totalWaterOverlaps = 0;
  const flaggedPoints: string[] = [];

  for (const point of samplePoints) {
    const tile = latLonToTile(point.lat, point.lon, zoom);
    const tileData = await readTile(pmtiles, tile.z, tile.x, tile.y);

    if (!tileData) {
      results.push({
        check: `Water body overlap — ${sourceLayer} z${zoom} @ ${point.name}`,
        status: "WARN",
        message: `No tile data at z${zoom}/${tile.x}/${tile.y} for point ${point.name}`,
      });
      continue;
    }

    const vectorTile = parseTile(tileData);
    const features = getLayerFeatures(vectorTile, sourceLayer);

    if (features.length === 0) {
      results.push({
        check: `Water body overlap — ${sourceLayer} z${zoom} @ ${point.name}`,
        status: "PASS",
        message: `No features in ${sourceLayer} at z${zoom}/${tile.x}/${tile.y} — nothing to check`,
      });
      continue;
    }

    let pointWaterOverlaps = 0;

    for (const rawFeature of features) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const feature = rawFeature as any;
      const geoFeature = mvtFeatureToGeoJSON(feature, tile.x, tile.y, zoom);
      if (!geoFeature) continue;
      totalFeaturesChecked++;

      // Bbox pre-filter
      let featureBbox: [number, number, number, number];
      try {
        featureBbox = (turf.bbox.default ?? turf.bbox)(geoFeature) as [number, number, number, number];
      } catch {
        continue;
      }

      for (let li = 0; li < lakes.length; li++) {
        if (!bboxesOverlap(featureBbox, lakeBboxes[li])) continue;

        // Precise intersection check
        try {
          const intersection = (turf.intersect.default ?? turf.intersect)(
            { type: "FeatureCollection", features: [geoFeature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>, lakes[li]] }
          );
          if (!intersection) continue;

          // Compute precise overlap fraction using @turf/area (geodesic m²)
          const featureArea = (turf.area.default ?? turf.area)(geoFeature);
          const overlapArea = (turf.area.default ?? turf.area)(intersection);
          const overlapRatio = featureArea > 0 ? overlapArea / featureArea : 0;

          if (overlapRatio > OVERLAP_THRESHOLD) {
            pointWaterOverlaps++;
            totalWaterOverlaps++;
            break; // No need to check other lakes for this feature
          }
        } catch {
          // Degenerate geometry — skip this lake/feature pair
        }
      }
    }

    if (pointWaterOverlaps > 0) {
      flaggedPoints.push(point.name);
      results.push({
        check: `Water body overlap — ${sourceLayer} z${zoom} @ ${point.name}`,
        status: "FAIL",
        message: `${pointWaterOverlaps} of ${features.length} features have >50% water body overlap`,
        details: { point: point.name, waterOverlaps: pointWaterOverlaps, totalFeatures: features.length },
      });
    } else {
      results.push({
        check: `Water body overlap — ${sourceLayer} z${zoom} @ ${point.name}`,
        status: "PASS",
        message: `No water body overlap detected (${features.length} features checked)`,
      });
    }
  }

  await source.close();

  console.log(
    `  Checked ${totalFeaturesChecked} features. Water overlaps: ${totalWaterOverlaps} across ${flaggedPoints.length} sample points`
  );

  return results;
}
