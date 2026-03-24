"use client";

import { Popup } from "react-map-gl/maplibre";

interface MapPopupProps {
  longitude: number;
  latitude: number;
  properties: Record<string, unknown>;
  onClose: () => void;
}

/** Format a VRI property name into something human-readable */
function formatPropertyName(key: string): string {
  const labels: Record<string, string> = {
    PROJ_AGE_1: "Stand Age",
    SPECIES_CD_1: "Dominant Species",
    SPECIES_PCT_1: "Species %",
    PROJ_HEIGHT_1: "Height (m)",
    POLYGON_AREA: "Area (ha)",
    BEC_ZONE_CODE: "BEC Zone",
    HARVEST_DATE: "Harvest Date",
    FEATURE_ID: "Feature ID",
    class: "Classification",
    PROTECTED_LANDS_NAME: "Park Name",
    PARK_CLASS: "Park Class",
    CONSERVANCY_AREA_NAME: "Conservancy",
    SCIENTIFIC_NAME: "Scientific Name",
    ENGLISH_NAME: "Common Name",
    BC_LIST: "BC Status",
    COSEWIC_STATUS: "COSEWIC Status",
    ELEMENT_OCCURRENCE_ID: "Occurrence ID",
    // Fire history
    FIRE_YEAR: "Fire Year",
    FIRE_SIZE_HECTARES: "Fire Size (ha)",
    FIRE_CAUSE: "Cause",
    FIRE_NUMBER: "Fire Number",
    // OGMA
    OGMA_TYPE: "OGMA Type",
    OGMA_PRIMARY_REASON_FOR_ESTABLISH: "Reason",
    LANDSCAPE_UNIT_NAME: "Landscape Unit",
    // Wildlife habitat areas
    COMMON_SPECIES_NAME: "Species",
    SCIENTIFIC_SPECIES_NAME: "Scientific Name",
    HABITAT_AREA_ID: "Habitat Area",
    TIMBER_HARVEST_CODE: "Harvest Allowed",
    APPROVAL_DATE: "Approved",
    // Ungulate winter range
    SPECIES_1: "Primary Species",
    SPECIES_2: "Secondary Species",
    UWR_TAG: "UWR Tag",
    // Community watersheds
    CW_NAME: "Watershed Name",
    AREA_HA: "Area (ha)",
    // Mining claims
    TENURE_TYPE_DESCRIPTION: "Tenure Type",
    CLAIM_NAME: "Claim Name",
    OWNER_NAME: "Owner",
    TENURE_STATUS: "Status",
    TENURE_AREA_IN_HECTARE: "Area (ha)",
    // Forestry roads
    ROAD_SECTION_NAME: "Road Name",
    ROAD_CLASS: "Road Class",
    // Conservation priority
    CURRENT_PRIORITY_DEFERRAL_ID: "Deferral ID",
    TAP_CLASSIFICATION_LABEL: "Classification",
    ANCIENT_FOREST_IND: "Ancient Forest",
    PRIORITY_BIG_TREED_OG_IND: "Priority Big-Treed OG",
    REMNANT_OLD_ECOSYS_IND: "Remnant Old Ecosystem",
    BGC_LABEL: "BEC Zone",
    FIELD_VERIFIED_IND: "Field Verified",
    REGION_NAME: "Region",
    DISTRICT_NAME: "District",
    FEATURE_AREA_SQM: "Area",
  };
  return labels[key] || key.replace(/_/g, " ").toLowerCase();
}

/** Format a property value for display */
function formatPropertyValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "--";

  if (key === "FEATURE_AREA_SQM" && typeof value === "number") {
    return `${(value / 10000).toLocaleString(undefined, { maximumFractionDigits: 1 })} ha`;
  }
  if (
    (key === "POLYGON_AREA" || key === "FIRE_SIZE_HECTARES" ||
     key === "AREA_HA" || key === "TENURE_AREA_IN_HECTARE") &&
    typeof value === "number"
  ) {
    return `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })} ha`;
  }
  if (key === "PROJ_AGE_1" && typeof value === "number") {
    return `${value} years`;
  }
  if (key === "PROJ_HEIGHT_1" && typeof value === "number") {
    return `${value.toFixed(1)} m`;
  }
  if (key === "class") {
    const classLabels: Record<string, string> = {
      "old-growth": "Old Growth",
      mature: "Mature Second Growth",
      young: "Young Forest",
      harvested: "Harvested",
    };
    return classLabels[value as string] || String(value);
  }

  return String(value);
}

/** Properties to show, in priority order */
const PRIORITY_KEYS = [
  "class",
  "PROJ_AGE_1",
  "SPECIES_CD_1",
  "PROJ_HEIGHT_1",
  "POLYGON_AREA",
  "BEC_ZONE_CODE",
  "HARVEST_DATE",
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
];

/** Keys to exclude from display */
const EXCLUDE_KEYS = new Set([
  "OBJECTID",
  "FEATURE_ID",
  "FEATURE_LENGTH_M",
  "SE_ANNO_CAD_DATA",
  "SHAPE",
  "GEOMETRY",
  "SPECIES_PCT_1",
]);

/**
 * Feature info popup displayed on map click.
 * Shows formatted properties in a clean dark panel.
 */
export function MapPopup({
  longitude,
  latitude,
  properties,
  onClose,
}: MapPopupProps) {
  // Sort properties by priority, then alphabetically
  const entries = Object.entries(properties)
    .filter(([key]) => !EXCLUDE_KEYS.has(key))
    .sort(([a], [b]) => {
      const ai = PRIORITY_KEYS.indexOf(a);
      const bi = PRIORITY_KEYS.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    })
    .slice(0, 8); // Limit to 8 properties

  return (
    <Popup
      longitude={longitude}
      latitude={latitude}
      onClose={onClose}
      closeButton
      closeOnClick={false}
      anchor="bottom"
      offset={12}
      maxWidth="280px"
    >
      <div className="p-3 text-sm">
        <div className="space-y-1.5">
          {entries.map(([key, value]) => (
            <div key={key} className="flex justify-between gap-3">
              <span className="text-zinc-400 text-xs shrink-0">
                {formatPropertyName(key)}
              </span>
              <span className="text-zinc-100 text-xs text-right font-medium">
                {formatPropertyValue(key, value)}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-2 pt-2 border-t border-white/5 text-[10px] text-zinc-500">
          {latitude.toFixed(4)}, {longitude.toFixed(4)}
        </div>
      </div>
    </Popup>
  );
}
