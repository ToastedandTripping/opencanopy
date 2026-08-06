/**
 * Derives property schemas from the pipeline extractors so that
 * registry-audit and schema-audit tests stay in sync automatically.
 *
 * Each extractor is called with a maximal dummy props object to discover
 * which keys it returns. forest-age is handled specially (VRI classification
 * outputs class/age/species, not via a PropertyExtractor).
 */

import { LAYER_CONFIG, type PropertyExtractor } from "../../../scripts/lib/extractors";

// Dummy props with every key the extractors might read.
// Values are non-null so conditional branches execute.
const DUMMY_PROPS: Record<string, unknown> = {
  CLIENT_NUMBER: "00001271",
  DISTURBANCE_START_DATE: "2020-01-01",
  PLANNED_GROSS_BLOCK_AREA: 100,
  FIRE_YEAR: "2020",
  FIRE_SIZE_HECTARES: 50,
  FIRE_CAUSE: "Lightning",
  PROTECTED_LANDS_NAME: "Test Park",
  PROTECTED_LANDS_DESIGNATION: "Provincial",
  PARK_NAME: "Test Park",
  CONSERVANCY_AREA_NAME: "Test Conservancy",
  OGMA_TYPE: "Legal",
  LANDSCAPE_UNIT_NAME: "Test Unit",
  COMMON_SPECIES_NAME: "Test Species",
  HABITAT_AREA_ID: 42,
  SPECIES_1: "Moose",
  UWR_TAG: "u-1-001",
  CW_NAME: "Test Watershed",
  AREA_HA: 1000,
  TENURE_TYPE_DESCRIPTION: "Mineral",
  OWNER_NAME: "Test Owner",
  TENURE_STATUS: "Active",
  ROAD_SECTION_NAME: "Test Road",
  CLIENT_NAME: "Test Client",
  TAP_CLASSIFICATION_LABEL: "Priority",
  ANCIENT_FOREST_IND: "Y",
  PRIORITY_BIG_TREED_OG_IND: "Y",
  BGC_LABEL: "CWHvh2",
  FIELD_VERIFIED_IND: "N",
  FEATURE_AREA_SQM: 50000,
};

function extractKeys(extractor: PropertyExtractor): Set<string> {
  const result = extractor(DUMMY_PROPS);
  if (!result) return new Set();
  return new Set(Object.keys(result));
}

/**
 * Derive a Record<layerName, Set<propertyKey>> from the pipeline extractors.
 * forest-age is hardcoded (VRI classification, not a PropertyExtractor).
 */
export function derivePropertySchemas(): Record<string, Set<string>> {
  const schemas: Record<string, Set<string>> = {
    // forest-age uses VRI classification: class + age + species
    // These come from the transform pipeline, not a PropertyExtractor.
    "forest-age": new Set(["class", "age", "species"]),
  };

  for (const layer of LAYER_CONFIG) {
    schemas[layer.name] = extractKeys(layer.extract);
  }

  return schemas;
}
