/**
 * Client for fetching watershed boundary data via the WFS proxy.
 *
 * Uses the `point` query parameter to find the watershed containing
 * a given click location. Returns the full watershed polygon for
 * map rendering and metadata for the report card.
 */

export interface WatershedInfo {
  name: string;
  code: string;
  areaHa: number;
  polygon: GeoJSON.Feature;
}

import { DataFetchError } from "./fetch-errors";

/** @deprecated Use DataFetchError directly. Kept as a re-export for backward compat. */
export const WatershedFetchError = DataFetchError;

/**
 * Fetch the watershed boundary that contains the given point.
 * Returns null if no watershed is found (e.g. click was in the ocean) --
 * a genuine, non-error result. Throws WatershedFetchError for a real
 * server/network failure (D3) so the caller can tell the two apart instead
 * of both silently landing back in "selecting" mode.
 */
export async function fetchWatershedAtPoint(
  lng: number,
  lat: number
): Promise<WatershedInfo | null> {
  let res: Response;
  try {
    res = await fetch(`/api/wfs?layer=watershed-boundaries&point=${lng},${lat}`);
  } catch {
    throw new DataFetchError("network", "Network error");
  }

  if (!res.ok) {
    throw new DataFetchError("http", `HTTP ${res.status}`);
  }

  let fc: GeoJSON.FeatureCollection;
  try {
    fc = (await res.json()) as GeoJSON.FeatureCollection;
  } catch {
    throw new DataFetchError("http", "Invalid response from data source");
  }
  if (!fc.features?.length) return null;

  const f = fc.features[0];
  const props = f.properties ?? {};

  return {
    name: (props.WATERSHED_GROUP_NAME as string) ?? "Unknown",
    code: (props.WATERSHED_GROUP_CODE as string) ?? "",
    areaHa:
      (props.AREA_HA as number) ??
      (props.FEATURE_AREA_SQM ? (props.FEATURE_AREA_SQM as number) / 10000 : 0),
    polygon: f,
  };
}
