/**
 * Per-layer property extractors and VRI classification logic.
 *
 * Extracted from scripts/build-tiles.ts to be shared across the new
 * pipeline modules (transform.ts, build-tiles.ts).
 *
 * Each PropertyExtractor takes raw WFS properties and returns the subset
 * to keep in the output NDJSON, or null to skip the feature entirely.
 */

// -- Company lookup (mirrors wfs-proxy.ts) ------------------------------------

export const COMPANY_MAP: Record<string, string> = {
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

export type PropertyExtractor = (
  props: Record<string, unknown>
) => Record<string, unknown> | null;

export const extractTenureCutblocks: PropertyExtractor = (props) => {
  const clientNum = String(props.CLIENT_NUMBER ?? "").padStart(8, "0");
  return {
    company_id: COMPANY_MAP[clientNum] ?? "other",
    DISTURBANCE_START_DATE: props.DISTURBANCE_START_DATE != null && String(props.DISTURBANCE_START_DATE) !== "null"
      ? String(props.DISTURBANCE_START_DATE)
      : null,
    PLANNED_GROSS_BLOCK_AREA: props.PLANNED_GROSS_BLOCK_AREA ?? null,
  };
};

export const extractFireHistory: PropertyExtractor = (props) => ({
  FIRE_YEAR: props.FIRE_YEAR != null ? String(props.FIRE_YEAR) : null,
  FIRE_SIZE_HECTARES: props.FIRE_SIZE_HECTARES ?? null,
  FIRE_CAUSE: props.FIRE_CAUSE ?? null,
});

export const extractParks: PropertyExtractor = (props) => ({
  name: (props.PROTECTED_LANDS_NAME ?? props.PARK_NAME ?? "") as string,
  designation: (props.PROTECTED_LANDS_DESIGNATION ?? "") as string,
});

export const extractConservancies: PropertyExtractor = (props) => ({
  name: (props.CONSERVANCY_AREA_NAME ?? "") as string,
});

export const extractOgma: PropertyExtractor = (props) => ({
  OGMA_TYPE: props.OGMA_TYPE ?? null,
  LANDSCAPE_UNIT_NAME: props.LANDSCAPE_UNIT_NAME ?? null,
});

export const extractWildlifeHabitatAreas: PropertyExtractor = (props) => {
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

export const extractUngulateWinterRange: PropertyExtractor = (props) => ({
  SPECIES_1: props.SPECIES_1 ?? null,
  UWR_TAG: props.UWR_TAG ?? null,
});

export const extractCommunityWatersheds: PropertyExtractor = (props) => ({
  CW_NAME: props.CW_NAME ?? null,
  AREA_HA: props.AREA_HA ?? null,
});

export const extractMiningClaims: PropertyExtractor = (props) => ({
  TENURE_TYPE_DESCRIPTION: props.TENURE_TYPE_DESCRIPTION ?? null,
  OWNER_NAME: props.OWNER_NAME ?? null,
  TENURE_STATUS: props.TENURE_STATUS ?? null,
});

export const extractForestryRoads: PropertyExtractor = (props) => ({
  ROAD_SECTION_NAME: props.ROAD_SECTION_NAME ?? null,
  CLIENT_NAME: props.CLIENT_NAME ?? null,
});

export const extractConservationPriority: PropertyExtractor = (props) => ({
  TAP_CLASSIFICATION_LABEL: props.TAP_CLASSIFICATION_LABEL ?? null,
  LANDSCAPE_UNIT_NAME: props.LANDSCAPE_UNIT_NAME ?? null,
  ANCIENT_FOREST_IND: props.ANCIENT_FOREST_IND ?? null,
  PRIORITY_BIG_TREED_OG_IND: props.PRIORITY_BIG_TREED_OG_IND ?? null,
  BGC_LABEL: props.BGC_LABEL ?? null,
  FIELD_VERIFIED_IND: props.FIELD_VERIFIED_IND ?? null,
  FEATURE_AREA_SQM: props.FEATURE_AREA_SQM ?? null,
});

// -- VRI classification -------------------------------------------------------

export type ForestClass = "old-growth" | "mature" | "young" | "harvested";

/**
 * Classify a VRI polygon by forest age class.
 *
 * Fixes: string "null" is truthy but must be treated as absent (Razor P1-1 + P2-2).
 *
 * @returns ForestClass or null if the feature should be dropped (no age data)
 */
export function classify(props: Record<string, unknown>): ForestClass | null {
  const hd = props.HARVEST_DATE;
  if (hd != null && String(hd) !== "null" && String(hd) !== "") return "harvested";
  const age = props.PROJ_AGE_1;
  if (typeof age !== "number" || age <= 0) return null;
  if (age >= 250) return "old-growth";
  if (age >= 80) return "mature";
  return "young";
}

// -- Layer configuration ------------------------------------------------------

export interface LayerConfig {
  name: string;
  typeName: string;
  extract: PropertyExtractor;
}

/**
 * All 11 non-VRI layers with their WFS type names and property extractors.
 * Used by transform.ts to iterate layers and apply the right extractor.
 */
export const LAYER_CONFIG: LayerConfig[] = [
  { name: "tenure-cutblocks", typeName: "WHSE_FOREST_TENURE.FTEN_CUT_BLOCK_POLY_SVW", extract: extractTenureCutblocks },
  { name: "fire-history", typeName: "WHSE_LAND_AND_NATURAL_RESOURCE.PROT_HISTORICAL_FIRE_POLYS_SP", extract: extractFireHistory },
  { name: "parks", typeName: "WHSE_TANTALIS.TA_PARK_ECORES_PA_SVW", extract: extractParks },
  { name: "conservancies", typeName: "WHSE_TANTALIS.TA_CONSERVANCY_AREAS_SVW", extract: extractConservancies },
  { name: "ogma", typeName: "WHSE_LAND_USE_PLANNING.RMP_OGMA_LEGAL_CURRENT_SVW", extract: extractOgma },
  { name: "wildlife-habitat-areas", typeName: "WHSE_WILDLIFE_MANAGEMENT.WCP_WILDLIFE_HABITAT_AREA_POLY", extract: extractWildlifeHabitatAreas },
  { name: "ungulate-winter-range", typeName: "WHSE_WILDLIFE_MANAGEMENT.WCP_UNGULATE_WINTER_RANGE_SP", extract: extractUngulateWinterRange },
  { name: "community-watersheds", typeName: "WHSE_WATER_MANAGEMENT.WLS_COMMUNITY_WS_PUB_SVW", extract: extractCommunityWatersheds },
  { name: "mining-claims", typeName: "WHSE_MINERAL_TENURE.MTA_ACQUIRED_TENURE_SVW", extract: extractMiningClaims },
  { name: "forestry-roads", typeName: "WHSE_FOREST_TENURE.FTEN_ROAD_SECTION_LINES_SVW", extract: extractForestryRoads },
  { name: "conservation-priority", typeName: "WHSE_FOREST_VEGETATION.OGSR_PRIORITY_DEF_AREA_CUR_SP", extract: extractConservationPriority },
];
