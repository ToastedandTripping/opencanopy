/**
 * WFS Proxy Edge Function for OpenCanopy.
 *
 * Proxies client requests to BC Open Maps WFS endpoints with:
 * - Layer-based routing to the correct WFS endpoint
 * - Geometry simplification (Douglas-Peucker, zoom-adaptive tolerance)
 * - VRI age classification
 * - Retry logic with exponential backoff
 * - 7-day cache headers
 * - CORS headers
 *
 * Runs on Netlify Edge Functions (Deno runtime).
 *
 * Query: GET /api/wfs?layer={id}&bbox={west,south,east,north}&zoom={z}
 */

// Netlify Edge Functions run on Deno. The Context type is available at runtime
// via https://edge.netlify.com but we define a minimal interface here to avoid
// requiring Deno's type resolution in the main project.
interface NetlifyContext {
  geo?: { city?: string; country?: { code?: string } };
}

// ── EPSG:4326 (WGS84 lat/lng) → EPSG:3005 (BC Albers) conversion ──
//
// Full Albers Equal Area Conic projection for BC.
// Parameters: central meridian -126, std parallels 50/58.5,
// lat origin 45, false easting 1000000, NAD83/GRS80.

function wgs84ToBcAlbers(lon: number, lat: number): [number, number] {
  const DEG = Math.PI / 180;
  const a = 6378137.0;
  const f = 1 / 298.257222101;
  const e2 = 2 * f - f * f;
  const e = Math.sqrt(e2);

  const phi1 = 50.0 * DEG;
  const phi2 = 58.5 * DEG;
  const phi0 = 45.0 * DEG;
  const lam0 = -126.0 * DEG;

  const phi = lat * DEG;
  const lam = lon * DEG;

  const sinPhi1 = Math.sin(phi1), cosPhi1 = Math.cos(phi1);
  const sinPhi2 = Math.sin(phi2), cosPhi2 = Math.cos(phi2);
  const sinPhi0 = Math.sin(phi0);
  const sinPhi = Math.sin(phi);

  const mFunc = (c: number, s: number) => c / Math.sqrt(1 - e2 * s * s);
  const qFunc = (s: number) => {
    const es = e * s;
    return (1 - e2) * (s / (1 - e2 * s * s) - (1 / (2 * e)) * Math.log(Math.abs((1 - es) / (1 + es))));
  };

  const m1 = mFunc(cosPhi1, sinPhi1);
  const m2 = mFunc(cosPhi2, sinPhi2);
  const q0 = qFunc(sinPhi0);
  const q1 = qFunc(sinPhi1);
  const q2 = qFunc(sinPhi2);

  const n = (m1 * m1 - m2 * m2) / (q2 - q1);
  const C = m1 * m1 + n * q1;
  const rho0 = (a / n) * Math.sqrt(Math.abs(C - n * q0));

  const qP = qFunc(sinPhi);
  const rho = (a / n) * Math.sqrt(Math.abs(C - n * qP));
  const theta = n * (lam - lam0);

  const x = 1000000 + rho * Math.sin(theta);
  const y = rho0 - rho * Math.cos(theta);

  return [x, y];
}

// ── Layer endpoint configuration ────────────────────────────────

interface WFSLayerConfig {
  url: string;
  typeName: string;
  cqlFilter?: string;
  /** Property names to request (reduces payload). Leave undefined for all. */
  propertyNames?: string[];
}

const LAYER_CONFIG: Record<string, WFSLayerConfig> = {
  "forest-age": {
    url: "https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_VEGETATION.VEG_COMP_LYR_R1_POLY/ows",
    typeName: "pub:WHSE_FOREST_VEGETATION.VEG_COMP_LYR_R1_POLY",
    // No propertyName filter -- WFS 2.0 omits geometry when propertyName is set
    // unless the geometry column is explicitly named. Omitting gets all properties
    // + geometry. The simplification step reduces payload size.
  },
  cutblocks: {
    url: "https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_VEGETATION.RSLT_FOREST_COVER_INV_SVW/ows",
    typeName: "pub:WHSE_FOREST_VEGETATION.RSLT_FOREST_COVER_INV_SVW",
  },
  "tap-deferrals": {
    url: "https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_VEGETATION.VEG_COMP_LYR_R1_POLY/ows",
    typeName: "pub:WHSE_FOREST_VEGETATION.VEG_COMP_LYR_R1_POLY",
    cqlFilter: "PROJ_AGE_1 >= 250",
  },
  parks: {
    url: "https://openmaps.gov.bc.ca/geo/pub/WHSE_TANTALIS.TA_PARK_ECORES_PA_SVW/ows",
    typeName: "pub:WHSE_TANTALIS.TA_PARK_ECORES_PA_SVW",
  },
  conservancies: {
    url: "https://openmaps.gov.bc.ca/geo/pub/WHSE_TANTALIS.TA_CONSERVANCY_AREAS_SVW/ows",
    typeName: "pub:WHSE_TANTALIS.TA_CONSERVANCY_AREAS_SVW",
  },
  "fish-streams": {
    url: "https://openmaps.gov.bc.ca/geo/pub/WHSE_BASEMAPPING.FWA_STREAM_NETWORKS_SP/ows",
    typeName: "pub:WHSE_BASEMAPPING.FWA_STREAM_NETWORKS_SP",
    cqlFilter: "STREAM_ORDER >= 3",
  },
  "species-at-risk": {
    url: "https://openmaps.gov.bc.ca/geo/pub/WHSE_TERRESTRIAL_ECOLOGY.BIOT_OCCR_NON_SENS_AREA_SVW/ows",
    typeName: "pub:WHSE_TERRESTRIAL_ECOLOGY.BIOT_OCCR_NON_SENS_AREA_SVW",
  },
};

// ── Geometry simplification ─────────────────────────────────────

/**
 * Perpendicular distance from a point to a line segment.
 * Returns 0 when the line segment has zero length (start === end).
 */
function perpendicularDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const denom = Math.sqrt((y2 - y1) ** 2 + (x2 - x1) ** 2);
  if (denom === 0) return 0;
  return Math.abs((y2 - y1) * px - (x2 - x1) * py + x2 * y1 - y2 * x1) / denom;
}

/**
 * Douglas-Peucker line simplification (iterative).
 * Tolerance in degrees -- adaptive based on zoom level.
 * Uses an explicit stack to avoid stack overflow on large polygons.
 */
function simplifyCoords(
  coords: number[][],
  tolerance: number
): number[][] {
  if (coords.length <= 2) return coords;

  // Track which points to keep
  const keep = new Uint8Array(coords.length);
  keep[0] = 1;
  keep[coords.length - 1] = 1;

  // Iterative stack: pairs of [startIndex, endIndex]
  const stack: [number, number][] = [[0, coords.length - 1]];

  while (stack.length > 0) {
    const [start, end] = stack.pop()!;

    let maxDist = 0;
    let maxIdx = start;
    const [x1, y1] = coords[start];
    const [x2, y2] = coords[end];

    for (let i = start + 1; i < end; i++) {
      const [x, y] = coords[i];
      const dist = perpendicularDistance(x, y, x1, y1, x2, y2);
      if (dist > maxDist) {
        maxDist = dist;
        maxIdx = i;
      }
    }

    if (maxDist > tolerance) {
      keep[maxIdx] = 1;
      if (maxIdx - start > 1) stack.push([start, maxIdx]);
      if (end - maxIdx > 1) stack.push([maxIdx, end]);
    }
  }

  const result: number[][] = [];
  for (let i = 0; i < coords.length; i++) {
    if (keep[i]) result.push(coords[i]);
  }
  return result;
}

/**
 * Simplify a ring, ensuring it remains a valid polygon ring
 * (minimum 4 points: 3 unique + closing point).
 */
function simplifyRing(ring: number[][], tolerance: number): number[][] {
  if (ring.length <= 5) return ring;
  const simplified = simplifyCoords(ring, tolerance);
  if (simplified.length < 4) return ring;
  return simplified;
}

interface GeoJSONGeometry {
  type: string;
  coordinates: unknown;
}

/**
 * Simplify a GeoJSON geometry with zoom-adaptive tolerance.
 * Higher zoom = smaller tolerance = more detail preserved.
 */
function simplifyGeometry(
  geometry: GeoJSONGeometry | null,
  zoom: number
): GeoJSONGeometry | null {
  if (!geometry) return null;

  // Aggressive simplification at low zoom for performance
  // zoom 5-6: ~0.02 deg (~2km), zoom 7-8: ~0.01, zoom 10: ~0.001, zoom 12+: ~0.0002 (detail)
  const tolerance = zoom <= 6 ? 0.02
    : zoom <= 8 ? 0.01
    : zoom <= 10 ? 0.001
    : 0.0002;

  if (geometry.type === "Polygon") {
    const coords = geometry.coordinates as number[][][];
    return {
      type: "Polygon",
      coordinates: coords.map((ring) => simplifyRing(ring, tolerance)),
    };
  }

  if (geometry.type === "MultiPolygon") {
    const coords = geometry.coordinates as number[][][][];
    return {
      type: "MultiPolygon",
      coordinates: coords.map((polygon) =>
        polygon.map((ring) => simplifyRing(ring, tolerance))
      ),
    };
  }

  if (geometry.type === "LineString") {
    const coords = geometry.coordinates as number[][];
    const simplified = simplifyCoords(coords, tolerance);
    return {
      type: "LineString",
      coordinates: simplified.length >= 2 ? simplified : coords,
    };
  }

  if (geometry.type === "MultiLineString") {
    const coords = geometry.coordinates as number[][][];
    return {
      type: "MultiLineString",
      coordinates: coords.map((line) => {
        const simplified = simplifyCoords(line, tolerance);
        return simplified.length >= 2 ? simplified : line;
      }),
    };
  }

  // Points and other types pass through unchanged
  return geometry;
}

// ── VRI classification ──────────────────────────────────────────

type ForestClass = "old-growth" | "mature" | "young" | "harvested";

interface VRIProperties {
  HARVEST_DATE?: string | null;
  PROJ_AGE_1?: number;
  [key: string]: unknown;
}

function classifyVRIFeature(properties: VRIProperties): ForestClass | null {
  if (properties.HARVEST_DATE) return "harvested";
  const age = properties.PROJ_AGE_1;
  if (typeof age !== "number" || age <= 0) return null;
  if (age >= 250) return "old-growth";
  if (age >= 80) return "mature";
  return "young";
}

// ── Property whitelists per layer ────────────────────────────────
// Strip unused properties to reduce payload (40-60% savings for VRI data).
// Layers not listed here keep all properties (they have few to begin with).
const PROPERTY_WHITELIST: Record<string, string[]> = {
  "forest-age": [
    "class", "PROJ_AGE_1", "SPECIES_CD_1", "PROJ_HEIGHT_1",
    "POLYGON_AREA", "BEC_ZONE_CODE", "HARVEST_DATE", "OBJECTID", "FEATURE_ID",
  ],
  cutblocks: [
    "OPENING_ID", "DISTURBANCE_START_DATE", "DISTURBANCE_END_DATE", "FEATURE_AREA_SQM",
  ],
  "species-at-risk": [
    "SCIENTIFIC_NAME", "ENGLISH_NAME", "BC_LIST", "COSEWIC_STATUS", "ELEMENT_OCCURRENCE_ID",
  ],
  "tap-deferrals": [
    "class", "PROJ_AGE_1", "SPECIES_CD_1", "PROJ_HEIGHT_1",
    "POLYGON_AREA", "BEC_ZONE_CODE", "HARVEST_DATE", "OBJECTID", "FEATURE_ID",
  ],
};

// ── Fetch with retry ────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;
const FETCH_TIMEOUT = 30_000;

async function fetchWithRetry(url: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }

      const text = await res.text();

      // Check for WFS XML error responses
      if (text.includes("ExceptionReport")) {
        const match = text.match(
          /ExceptionText>(.*?)<\/(?:ows:)?ExceptionText/
        );
        throw new Error(
          `WFS Exception: ${match?.[1] ?? "Unknown WFS error"}`
        );
      }

      // Check for upstream timeout messages
      if (text.includes("upstream") && text.includes("timing out")) {
        throw new Error("Upstream server timeout");
      }

      return text;
    } catch (err) {
      const msg = (err as Error).message;
      if (attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw new Error(`WFS fetch failed after ${MAX_RETRIES} attempts: ${msg}`);
      }
    }
  }
  throw new Error("Unreachable");
}

// ── CORS/Cache response headers ─────────────────────────────────

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
    // 7-day cache
    "Cache-Control": "public, max-age=604800",
  };
}

function errorResponse(message: string, status = 400): Response {
  const headers = corsHeaders();
  // Never cache error responses
  headers["Cache-Control"] = "no-cache";
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers,
  });
}

// ── Main handler ────────────────────────────────────────────────

export default async function handler(
  request: Request,
  _context: NetlifyContext
): Promise<Response> {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // Only allow GET requests
  if (request.method !== "GET") {
    return errorResponse("Method not allowed", 405);
  }

  const url = new URL(request.url);
  const layerId = url.searchParams.get("layer");
  const bboxParam = url.searchParams.get("bbox");
  const zoomParam = url.searchParams.get("zoom");

  // Validate parameters
  if (!layerId || !bboxParam || !zoomParam) {
    return errorResponse(
      "Missing required parameters: layer, bbox, zoom"
    );
  }

  const config = LAYER_CONFIG[layerId];
  if (!config) {
    return errorResponse(`Unknown layer: ${layerId}`);
  }

  const bboxParts = bboxParam.split(",").map(Number);
  if (bboxParts.length !== 4 || bboxParts.some(isNaN)) {
    return errorResponse("Invalid bbox format. Expected: west,south,east,north");
  }

  const zoom = parseInt(zoomParam, 10);
  if (isNaN(zoom)) {
    return errorResponse("Invalid zoom parameter");
  }

  // Clamp bbox to valid coordinate ranges
  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));
  const [west, south, east, north] = [
    clamp(bboxParts[0], -180, 180),
    clamp(bboxParts[1], -90, 90),
    clamp(bboxParts[2], -180, 180),
    clamp(bboxParts[3], -90, 90),
  ];
  // Convert WGS84 bbox to BC Albers (EPSG:3005) -- BC WFS expects native CRS
  const [albersWest, albersSouth] = wgs84ToBcAlbers(west, south);
  const [albersEast, albersNorth] = wgs84ToBcAlbers(east, north);

  // Scale feature count by zoom -- fewer features at wide views
  const maxFeatures = zoom <= 6 ? 200 : zoom <= 8 ? 500 : zoom <= 10 ? 1000 : 2000;

  const wfsParams = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeName: config.typeName,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    bbox: `${Math.round(albersWest)},${Math.round(albersSouth)},${Math.round(albersEast)},${Math.round(albersNorth)},EPSG:3005`,
    count: String(maxFeatures),
  });

  // Add optional CQL filter
  if (config.cqlFilter) {
    wfsParams.set("CQL_FILTER", config.cqlFilter);
  }

  // Add property names to reduce payload
  if (config.propertyNames) {
    wfsParams.set("propertyName", config.propertyNames.join(","));
  }

  const wfsUrl = `${config.url}?${wfsParams}`;

  try {
    const responseText = await fetchWithRetry(wfsUrl);
    const geojson = JSON.parse(responseText) as GeoJSON.FeatureCollection;

    // Process features
    const processedFeatures = [];

    for (const feature of geojson.features) {
      // VRI-specific: classify by age
      if (layerId === "forest-age") {
        const cls = classifyVRIFeature(
          feature.properties as VRIProperties
        );
        if (!cls) continue; // Skip unclassifiable polygons
        (feature.properties as Record<string, unknown>).class = cls;
      }

      // Strip properties to whitelist (reduces payload 40-60% for VRI)
      const whitelist = PROPERTY_WHITELIST[layerId];
      if (whitelist && feature.properties) {
        const stripped: Record<string, unknown> = {};
        for (const key of whitelist) {
          if (key in feature.properties) {
            stripped[key] = (feature.properties as Record<string, unknown>)[key];
          }
        }
        feature.properties = stripped;
      }

      // Simplify geometry
      feature.geometry = simplifyGeometry(
        feature.geometry as GeoJSONGeometry,
        zoom
      ) as typeof feature.geometry;

      // Drop tiny polygons at low zoom (invisible at this scale)
      if (zoom <= 8 && feature.geometry) {
        const geom = feature.geometry as GeoJSONGeometry;
        if (geom.type === "Polygon") {
          const ring = (geom.coordinates as number[][][])[0];
          if (ring && ring.length >= 3) {
            let area = 0;
            for (let i = 0; i < ring.length - 1; i++) {
              area += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
            }
            area = Math.abs(area) / 2;
            if (area < 0.0001) continue; // ~1 hectare at BC latitudes
          }
        }
      }

      // Drop interior rings (polygon holes) at low zoom
      if (zoom <= 8 && feature.geometry) {
        const geom = feature.geometry as GeoJSONGeometry;
        if (geom.type === "Polygon") {
          const coords = geom.coordinates as number[][][];
          if (coords.length > 1) {
            (geom as { coordinates: number[][][] }).coordinates = [coords[0]];
          }
        } else if (geom.type === "MultiPolygon") {
          const coords = geom.coordinates as number[][][][];
          (geom as { coordinates: number[][][][] }).coordinates = coords.map(
            (polygon) => polygon.length > 1 ? [polygon[0]] : polygon
          );
        }
      }

      processedFeatures.push(feature);
    }

    const result: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: processedFeatures,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: corsHeaders(),
    });
  } catch (err) {
    console.error(`WFS proxy error for layer ${layerId}:`, (err as Error).message);
    return errorResponse("Data source temporarily unavailable", 502);
  }
}

export const config = { path: "/api/wfs" };
