/**
 * Per-layer property and geometry validation for OpenCanopy source data.
 *
 * Streams through an NDJSON file, applies layer-specific rules, and writes
 * valid features to the output path. Invalid features are counted and
 * categorized by rejection reason.
 */

import { createReadStream, createWriteStream } from "fs";
import { createInterface } from "readline";

export interface ValidationResult {
  total: number;
  passed: number;
  rejected: number;
  reasons: Record<string, number>; // reason string → count
}

// BC geographic extent (WGS84, decimal degrees)
const BC_EXTENT = {
  minLon: -140,
  maxLon: -114,
  minLat: 48,
  maxLat: 61,
};

// Valid forest age classes
const VALID_AGE_CLASSES = new Set(["old-growth", "mature", "young", "harvested"]);

// ── Coordinate validators ─────────────────────────────────────────────────────

/**
 * Return false if any coordinate value is NaN, or if the lon/lat pair falls
 * outside the BC extent. Checks only the first coordinate pair (fast path).
 */
function firstCoordInBC(
  coords: unknown
): { ok: boolean; reason?: string } {
  // Drill down to the first [lon, lat] pair regardless of geometry type
  let current = coords;
  while (Array.isArray(current) && Array.isArray(current[0])) {
    current = current[0];
  }

  if (!Array.isArray(current) || current.length < 2) {
    return { ok: false, reason: "geometry: missing or empty coordinates" };
  }

  const lon = current[0] as number;
  const lat = current[1] as number;

  if (isNaN(lon) || isNaN(lat)) {
    return { ok: false, reason: "geometry: NaN coordinate value" };
  }

  if (lon < BC_EXTENT.minLon || lon > BC_EXTENT.maxLon) {
    return {
      ok: false,
      reason: `geometry: longitude ${lon.toFixed(4)} outside BC extent [${BC_EXTENT.minLon}, ${BC_EXTENT.maxLon}]`,
    };
  }

  if (lat < BC_EXTENT.minLat || lat > BC_EXTENT.maxLat) {
    return {
      ok: false,
      reason: `geometry: latitude ${lat.toFixed(4)} outside BC extent [${BC_EXTENT.minLat}, ${BC_EXTENT.maxLat}]`,
    };
  }

  return { ok: true };
}

/**
 * Verify that a polygon geometry has a valid outer ring (>= 4 coordinates).
 * Checks only the outer ring of the first polygon (fast path for degenerate
 * geometry detection).
 */
function polygonHasValidRing(
  geometry: { type: string; coordinates: unknown }
): { ok: boolean; reason?: string } {
  const coords = geometry.coordinates;

  // Polygon: coordinates = [ outerRing, ...holes ]
  // MultiPolygon: coordinates = [ [ outerRing, ...holes ], ... ]
  let outerRing: unknown[] | null = null;

  if (geometry.type === "Polygon") {
    const rings = coords as unknown[][];
    outerRing = rings[0] ?? null;
  } else if (geometry.type === "MultiPolygon") {
    const polys = coords as unknown[][][];
    outerRing = (polys[0] ?? [])[0] ?? null;
  } else {
    // Not a polygon -- ring check doesn't apply
    return { ok: true };
  }

  if (!outerRing || outerRing.length < 4) {
    return {
      ok: false,
      reason: `geometry: outer ring has ${outerRing?.length ?? 0} coordinates (minimum 4 required)`,
    };
  }

  return { ok: true };
}

// ── Per-layer rule validators ─────────────────────────────────────────────────

/**
 * Per-layer validation rules.
 * Return null if the feature passes, or a non-empty reason string to reject.
 */
const VALIDATION_RULES: Record<
  string,
  (feature: { type?: string; geometry?: unknown; properties?: Record<string, unknown> | null }) => string | null
> = {
  "forest-age": (feature) => {
    const props = feature.properties ?? {};

    const cls = props["class"];
    if (!VALID_AGE_CLASSES.has(cls as string)) {
      return `forest-age: invalid class "${cls}" (expected one of: ${[...VALID_AGE_CLASSES].join(", ")})`;
    }

    const age = props["age"];
    if (age !== null && age !== undefined) {
      const ageNum = Number(age);
      if (isNaN(ageNum) || ageNum < 0) {
        return `forest-age: age "${age}" is not a non-negative number`;
      }
    }

    return null;
  },

  "tenure-cutblocks": (feature) => {
    const props = feature.properties ?? {};

    const area = props["PLANNED_GROSS_BLOCK_AREA"];
    if (area === null || area === undefined) {
      return `tenure-cutblocks: PLANNED_GROSS_BLOCK_AREA is missing`;
    }
    const areaNum = Number(area);
    if (isNaN(areaNum) || areaNum <= 0 || areaNum >= 100_000) {
      return `tenure-cutblocks: PLANNED_GROSS_BLOCK_AREA ${area} not in range (0, 100000)`;
    }

    const startDate = props["DISTURBANCE_START_DATE"];
    if (startDate !== null && startDate !== undefined) {
      if (!/^\d{4}/.test(String(startDate))) {
        return `tenure-cutblocks: DISTURBANCE_START_DATE "${startDate}" does not start with a 4-digit year`;
      }
    }

    return null;
  },
};

// ── Main function ─────────────────────────────────────────────────────────────

/**
 * Validate an NDJSON file against per-layer and universal rules.
 *
 * @param inputPath   Source NDJSON
 * @param outputPath  Destination NDJSON (valid features only)
 * @param layerName   Layer name used to select per-layer rules
 * @returns           Validation statistics including per-reason counts
 */
export async function validateNdjson(
  inputPath: string,
  outputPath: string,
  layerName: string
): Promise<ValidationResult> {
  const layerRule = VALIDATION_RULES[layerName] ?? null;
  const writeStream = createWriteStream(outputPath, { encoding: "utf-8" });
  const reasons: Record<string, number> = {};

  let total = 0;
  let passed = 0;

  const rl = createInterface({
    input: createReadStream(inputPath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    total++;

    let feature: {
      type?: string;
      geometry?: { type: string; coordinates: unknown } | null;
      properties?: Record<string, unknown> | null;
    };

    try {
      feature = JSON.parse(trimmed);
    } catch {
      const reason = "parse error: malformed JSON";
      reasons[reason] = (reasons[reason] ?? 0) + 1;
      continue;
    }

    // ── Universal checks ──

    if (!feature.geometry || !feature.geometry.coordinates) {
      const reason = "geometry: null or missing";
      reasons[reason] = (reasons[reason] ?? 0) + 1;
      continue;
    }

    const coordCheck = firstCoordInBC(feature.geometry.coordinates);
    if (!coordCheck.ok) {
      const reason = coordCheck.reason ?? "geometry: coordinate out of range";
      reasons[reason] = (reasons[reason] ?? 0) + 1;
      continue;
    }

    const ringCheck = polygonHasValidRing(feature.geometry);
    if (!ringCheck.ok) {
      const reason = ringCheck.reason ?? "geometry: invalid ring";
      reasons[reason] = (reasons[reason] ?? 0) + 1;
      continue;
    }

    // ── Per-layer checks ──

    if (layerRule) {
      const rejection = layerRule(feature);
      if (rejection !== null) {
        reasons[rejection] = (reasons[rejection] ?? 0) + 1;
        continue;
      }
    }

    // Feature passed all checks
    writeStream.write(trimmed + "\n");
    passed++;
  }

  await new Promise<void>((resolve, reject) => {
    writeStream.end((err?: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const rejected = total - passed;
  return { total, passed, rejected, reasons };
}
