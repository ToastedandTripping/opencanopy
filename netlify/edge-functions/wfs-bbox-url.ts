/**
 * WFS bbox URL construction — extracted for unit testability.
 *
 * GeoServer constraint (D3): `bbox` and `CQL_FILTER` are mutually exclusive.
 * When a layer has a cqlFilter, the bbox must be embedded inside CQL_FILTER as:
 *   CQL_FILTER=BBOX(GEOMETRY,w,s,e,n) AND (filter)
 * and the separate `bbox` param must be OMITTED.
 * Filterless layers continue to use the plain `bbox` param with EPSG:3005 suffix.
 *
 * Proven shape (live, 2026-06-10):
 *   CQL_FILTER=BBOX(GEOMETRY,1035926,542789,1071379,576537) AND STREAM_ORDER>=3
 * against WHSE_BASEMAPPING.FWA_STREAM_NETWORKS_SP returned LineString features.
 * The separate-params form reproduces an ExceptionReport.
 *
 * This file is pure URLSearchParams logic — no Deno APIs — so it can be
 * imported by both the Deno edge function and the vitest test suite.
 */

export interface WFSLayerConfigForUrl {
  url: string;
  typeName: string;
  cqlFilter?: string;
  propertyNames?: string[];
}

export function buildBboxWfsUrl(
  config: WFSLayerConfigForUrl,
  albersWest: number,
  albersSouth: number,
  albersEast: number,
  albersNorth: number,
  maxFeatures: number,
): string {
  const bboxCoords = `${Math.round(albersWest)},${Math.round(albersSouth)},${Math.round(albersEast)},${Math.round(albersNorth)}`;

  const baseParams: Record<string, string> = {
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeName: config.typeName,
    outputFormat: "application/json",
    srsName: "EPSG:4326",
    count: String(maxFeatures),
  };

  if (config.cqlFilter) {
    // Embed bbox inside CQL_FILTER; omit the separate bbox param.
    // Parenthesize the layer filter to prevent operator precedence surprises.
    baseParams["CQL_FILTER"] = `BBOX(GEOMETRY,${bboxCoords}) AND (${config.cqlFilter})`;
  } else {
    // No CQL filter: use plain bbox param with CRS qualifier.
    baseParams["bbox"] = `${bboxCoords},EPSG:3005`;
  }

  const wfsParams = new URLSearchParams(baseParams);

  // Add property names to reduce payload
  if (config.propertyNames) {
    wfsParams.set("propertyName", config.propertyNames.join(","));
  }

  return `${config.url}?${wfsParams}`;
}
