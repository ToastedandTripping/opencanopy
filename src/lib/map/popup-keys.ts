/**
 * Feature-property display order for the map popup.
 *
 * Lives outside the React component so the schema audit
 * (src/test/audit/schema-audit.test.ts, Check 12) can import the SAME list
 * MapPopup renders from. Before 2026-09-01 the audit carried a hand-copy that
 * had silently drifted from the component while staying green.
 *
 * Keys not listed here still render (the popup is generic); this only fixes
 * the order of the ones that are.
 */
export const POPUP_PRIORITY_KEYS = [
  // Logging Companies (tenure-cutblocks): the licensee is the headline fact
  "company_id",
  "class",
  "PROJ_AGE_1",
  "SPECIES_CD_1",
  "PROJ_HEIGHT_1",
  "POLYGON_AREA",
  "BEC_ZONE_CODE",
  "HARVEST_DATE",
  "DISTURBANCE_START_DATE",
  "PLANNED_GROSS_BLOCK_AREA",
  "PROTECTED_LANDS_NAME",
  "PARK_CLASS",
  "CONSERVANCY_AREA_NAME",
  "SCIENTIFIC_NAME",
  "ENGLISH_NAME",
  "BC_LIST",
  "COSEWIC_STATUS",
  // Fire history
  "FIRE_YEAR",
  "FIRE_SIZE_HECTARES",
  "FIRE_CAUSE",
  // OGMA
  "OGMA_TYPE",
  "LANDSCAPE_UNIT_NAME",
  // Wildlife
  "COMMON_SPECIES_NAME",
  "SCIENTIFIC_SPECIES_NAME",
  // Ungulate
  "SPECIES_1",
  "SPECIES_2",
  // Watersheds
  "CW_NAME",
  "AREA_HA",
  // Mining
  "CLAIM_NAME",
  "OWNER_NAME",
  "TENURE_STATUS",
  "TENURE_AREA_IN_HECTARE",
  // Roads
  "ROAD_SECTION_NAME",
  "ROAD_CLASS",
  // Conservation priority
  "TAP_CLASSIFICATION_LABEL",
  "ANCIENT_FOREST_IND",
  "BGC_LABEL",
  "REGION_NAME",
  "DISTRICT_NAME",
  "FEATURE_AREA_SQM",
] as const;
