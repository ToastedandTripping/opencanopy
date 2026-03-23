import type { LayerDefinition } from "@/types/layers";
import {
  COMPANY_REGISTRY,
  companyColorExpression,
} from "@/data/companies";

/**
 * WFS endpoint base URLs for BC Open Maps data.
 * All use the OGC WFS 2.0.0 protocol.
 */
const WFS_ENDPOINTS = {
  vri: "https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_VEGETATION.VEG_COMP_LYR_R1_POLY/ows",
  results:
    "https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_VEGETATION.RSLT_FOREST_COVER_INV_SVW/ows",
  freshwater:
    "https://openmaps.gov.bc.ca/geo/pub/WHSE_BASEMAPPING.FWA_STREAM_NETWORKS_SP/ows",
  cdc: "https://openmaps.gov.bc.ca/geo/pub/WHSE_TERRESTRIAL_ECOLOGY.BIOT_OCCR_NON_SENS_AREA_SVW/ows",
  parks:
    "https://openmaps.gov.bc.ca/geo/pub/WHSE_TANTALIS.TA_PARK_ECORES_PA_SVW/ows",
  conservancies:
    "https://openmaps.gov.bc.ca/geo/pub/WHSE_TANTALIS.TA_CONSERVANCY_AREAS_SVW/ows",
  tenureCutblocks:
    "https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_TENURE.FTEN_CUT_BLOCK_POLY_SVW/ows",
  operatingTerritories:
    "https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_TENURE.FSP_FDU_POLY_SPG/ows",
  plannedCutblocks:
    "https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_TENURE.FOM_CUTBLOCK_SP/ows",
  fireHistory: "https://openmaps.gov.bc.ca/geo/pub/WHSE_LAND_AND_NATURAL_RESOURCE.PROT_HISTORICAL_FIRE_POLYS_SP/ows",
  ogma: "https://openmaps.gov.bc.ca/geo/pub/WHSE_LAND_USE_PLANNING.RMP_OGMA_LEGAL_CURRENT_SVW/ows",
  wildlifeHabitatAreas: "https://openmaps.gov.bc.ca/geo/pub/WHSE_WILDLIFE_MANAGEMENT.WCP_WILDLIFE_HABITAT_AREA_POLY/ows",
  ungulateWinterRange: "https://openmaps.gov.bc.ca/geo/pub/WHSE_WILDLIFE_MANAGEMENT.WCP_UNGULATE_WINTER_RANGE_SP/ows",
  communityWatersheds: "https://openmaps.gov.bc.ca/geo/pub/WHSE_WATER_MANAGEMENT.WLS_COMMUNITY_WS_PUB_SVW/ows",
  miningClaims: "https://openmaps.gov.bc.ca/geo/pub/WHSE_MINERAL_TENURE.MTA_ACQUIRED_TENURE_SVW/ows",
  forestryRoads: "https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_TENURE.FTEN_ROAD_SECTION_LINES_SVW/ows",
  conservationPriority: "https://openmaps.gov.bc.ca/geo/pub/WHSE_LAND_USE_PLANNING.OGSR_TAP_PRIORITY_DEF_AREA_CUR_SP/ows",
} as const;

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

/**
 * All 8 launch layers for OpenCanopy.
 * Each defines its data source, visual style, zoom behavior, and legend.
 */
export const LAYER_REGISTRY: LayerDefinition[] = [
  // ── Forest layers ──────────────────────────────────────────────
  {
    id: "forest-age",
    label: "Forest Age Classes",
    category: "forest",
    description:
      "VRI forest age classification: old growth (250+), mature (80-250), young (<80), harvested",
    source: {
      type: "wfs",
      url: WFS_ENDPOINTS.vri,
      typeName: "pub:WHSE_FOREST_VEGETATION.VEG_COMP_LYR_R1_POLY",
      attribution: "BC VRI (FLNRORD)",
    },
    tileSource: {
      url: "pmtiles://https://pub-b5568be386ef4e638b4e49af41395600.r2.dev/opencanopy-v5.pmtiles",
      sourceLayer: "forest-age",
      maxZoom: 10,
    },
    rasterOverview: {
      urlTemplate: "https://pub-b5568be386ef4e638b4e49af41395600.r2.dev/raster/forest-age/{z}/{x}/{y}.png",
      minZoom: 4,
      maxZoom: 10,
    },
    style: {
      type: "fill",
      paint: {
        "fill-color": [
          "case",
          ["has", "class"],
          [
            "match",
            ["get", "class"],
            "old-growth",
            "#15803d",
            "mature",
            "#4ade80",
            "young",
            "#f97316",
            "harvested",
            "#ef4444",
            "#6b7280",
          ],
          "#6b7280",
        ],
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0, 0.15,
          5, 0.22,
          7, 0.32,
          9, 0.45,
          12, 0.65,
        ],
        "fill-opacity-transition": { duration: 300 },
      },
      opacity: 0.7,
    },
    zoomRange: [5, 18],
    defaultEnabled: true,
    interactive: true,
    legendItems: [
      { color: "#15803d", label: "Old Growth (250+ yr)" },
      { color: "#4ade80", label: "Mature (80-250 yr)" },
      { color: "#f97316", label: "Young (<80 yr)" },
      { color: "#ef4444", label: "Harvested" },
    ],
    fetchPriority: 0,
  },

  {
    id: "logging-risk",
    label: "Logging Vulnerability",
    category: "forest",
    description:
      "Unprotected forest by timber value. Higher value = higher logging pressure.",
    source: {
      type: "wfs",
      url: WFS_ENDPOINTS.vri,
      typeName: "pub:WHSE_FOREST_VEGETATION.VEG_COMP_LYR_R1_POLY",
      attribution: "BC VRI (FLNRORD)",
    },
    tileSource: {
      url: "pmtiles://https://pub-b5568be386ef4e638b4e49af41395600.r2.dev/opencanopy-v5.pmtiles",
      sourceLayer: "forest-age",
      maxZoom: 10,
    },
    style: {
      type: "fill",
      paint: {
        "fill-color": [
          "case",
          ["has", "class"],
          [
            "match",
            ["get", "class"],
            "old-growth",
            "#dc2626", // red-600 -- highest logging pressure
            "mature",
            "#f97316", // orange-500
            "young",
            "#facc15", // yellow-400
            "harvested",
            "#27272a", // zinc-800 -- already logged
            "#71717a", // zinc-500 -- unknown
          ],
          "#71717a",
        ],
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0, 0.15,
          5, 0.22,
          7, 0.32,
          9, 0.45,
          12, 0.6,
        ],
        "fill-opacity-transition": { duration: 300 },
      },
      opacity: 0.6,
    },
    zoomRange: [5, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [
      { color: "#dc2626", label: "High (Old Growth)" },
      { color: "#f97316", label: "Moderate (Mature)" },
      { color: "#facc15", label: "Low (Young)" },
      { color: "#27272a", label: "Logged" },
    ],
    fetchPriority: 1,
  },

  {
    id: "cutblocks",
    label: "Cutblocks",
    category: "forest",
    description: "RESULTS database cutblocks showing logged areas",
    source: {
      type: "wfs",
      url: WFS_ENDPOINTS.results,
      typeName:
        "pub:WHSE_FOREST_VEGETATION.RSLT_FOREST_COVER_INV_SVW",
      attribution: "BC RESULTS (FLNRORD)",
    },
    style: {
      type: "line",
      paint: {
        "line-color": "#dc2626",
        "line-width": 2,
        "line-opacity": 0.9,
        "line-opacity-transition": { duration: 300 },
      },
      opacity: 0.9,
    },
    zoomRange: [7, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [{ color: "#dc2626", label: "Cutblock Boundary" }],
    timelineField: "DISTURBANCE_START_DATE",
  },

  // ── Accountability layers ─────────────────────────────────────
  {
    id: "tenure-cutblocks",
    label: "Logging Companies",
    category: "accountability",
    description:
      "Forest tenure cutblocks color-coded by licensee company",
    source: {
      type: "wfs",
      url: WFS_ENDPOINTS.tenureCutblocks,
      typeName: "pub:WHSE_FOREST_TENURE.FTEN_CUT_BLOCK_POLY_SVW",
      attribution: "BC Forest Tenure (FLNRORD)",
    },
    tileSource: {
      url: "pmtiles://https://pub-b5568be386ef4e638b4e49af41395600.r2.dev/opencanopy-v5.pmtiles",
      sourceLayer: "tenure-cutblocks",
      maxZoom: 10,
    },
    style: {
      type: "fill",
      paint: {
        "fill-color": [
          "case",
          ["has", "company_id"],
          companyColorExpression(),
          "#6b7280",
        ],
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0, 0.15,
          6, 0.3,
          9, 0.5,
          12, 0.6,
        ],
        "fill-opacity-transition": { duration: 300 },
      },
      opacity: 0.6,
    },
    zoomRange: [5, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [
      ...COMPANY_REGISTRY.slice(0, 7).map((c) => ({
        color: c.color,
        label: c.displayName,
      })),
      { color: "#6b7280", label: "Other" },
    ],
    fetchPriority: 1,
    timelineField: "DISTURBANCE_START_DATE",
  },

  // ── Disturbance layers ────────────────────────────────────────
  {
    id: "fire-history",
    label: "Fire History",
    category: "disturbance",
    description:
      "Historical fire perimeters from BC Wildfire Service records",
    source: {
      type: "wfs",
      url: WFS_ENDPOINTS.fireHistory,
      typeName: "pub:WHSE_LAND_AND_NATURAL_RESOURCE.PROT_HISTORICAL_FIRE_POLYS_SP",
      attribution: "BC Wildfire Service",
    },
    tileSource: {
      url: "pmtiles://https://pub-b5568be386ef4e638b4e49af41395600.r2.dev/opencanopy-v5.pmtiles",
      sourceLayer: "fire-history",
      maxZoom: 10,
    },
    style: {
      type: "fill",
      paint: {
        "fill-color": "#f59e0b",
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0, 0.15,
          5, 0.25,
          9, 0.4,
          12, 0.55,
        ],
        "fill-opacity-transition": { duration: 300 },
      },
      opacity: 0.5,
    },
    zoomRange: [5, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [{ color: "#f59e0b", label: "Fire Perimeter" }],
    fetchPriority: 1,
    timelineField: "FIRE_YEAR",
  },

  // ── Protection layers ──────────────────────────────────────────
  {
    id: "tap-deferrals",
    label: "Old Growth Forest (250+ years)",
    category: "protection",
    description:
      "Forest stands estimated at 250 years or older (BC VRI). Note: this shows old-growth extent, not official TAP deferral boundaries.",
    source: {
      type: "wfs",
      url: WFS_ENDPOINTS.vri,
      typeName: "pub:WHSE_FOREST_VEGETATION.VEG_COMP_LYR_R1_POLY",
      cqlFilter: "PROJ_AGE_1 >= 250",
      attribution: "BC VRI (FLNRORD)",
    },
    style: {
      type: "line",
      paint: {
        "line-color": "#fbbf24",
        "line-width": 2,
        "line-dasharray": [4, 3],
        "line-opacity": 0.9,
        "line-opacity-transition": { duration: 300 },
      },
      opacity: 0.9,
    },
    zoomRange: [7, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [{ color: "#fbbf24", label: "Old Growth 250+ yr (dashed)" }],
  },

  {
    id: "parks",
    label: "Provincial Parks",
    category: "protection",
    description: "BC Parks and ecological reserves",
    source: {
      type: "wfs",
      url: WFS_ENDPOINTS.parks,
      typeName: "pub:WHSE_TANTALIS.TA_PARK_ECORES_PA_SVW",
      attribution: "BC Parks (TANTALIS)",
    },
    tileSource: {
      url: "pmtiles://https://pub-b5568be386ef4e638b4e49af41395600.r2.dev/opencanopy-v5.pmtiles",
      sourceLayer: "parks",
      maxZoom: 10,
    },
    style: {
      type: "fill",
      paint: {
        "fill-color": "rgba(255,255,255,0.1)",
        "fill-outline-color": "#ffffff",
        "fill-opacity": 1,
        "fill-opacity-transition": { duration: 300 },
      },
      opacity: 1,
    },
    zoomRange: [5, 18],
    defaultEnabled: true,
    interactive: true,
    legendItems: [{ color: "#ffffff", label: "Provincial Park" }],
    fetchPriority: 0,
  },

  {
    id: "conservancies",
    label: "Conservancy Areas",
    category: "protection",
    description: "BC Conservancy areas with limited resource extraction",
    source: {
      type: "wfs",
      url: WFS_ENDPOINTS.conservancies,
      typeName: "pub:WHSE_TANTALIS.TA_CONSERVANCY_AREAS_SVW",
      attribution: "BC Conservancies (TANTALIS)",
    },
    tileSource: {
      url: "pmtiles://https://pub-b5568be386ef4e638b4e49af41395600.r2.dev/opencanopy-v5.pmtiles",
      sourceLayer: "conservancies",
      maxZoom: 10,
    },
    style: {
      type: "line",
      paint: {
        "line-color": "#ffffff",
        "line-width": 1.5,
        "line-dasharray": [6, 4],
        "line-opacity": 0.7,
        "line-opacity-transition": { duration: 300 },
      },
      opacity: 0.7,
    },
    zoomRange: [5, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [
      { color: "#ffffff", label: "Conservancy (dashed)" },
    ],
  },

  {
    id: "ogma",
    label: "Old Growth Management Areas",
    category: "protection",
    description:
      "Legally established Old Growth Management Areas (OGMAs) for biodiversity conservation",
    source: {
      type: "wfs",
      url: WFS_ENDPOINTS.ogma,
      typeName: "pub:WHSE_LAND_USE_PLANNING.RMP_OGMA_LEGAL_CURRENT_SVW",
      attribution: "BC FLNRORD",
    },
    tileSource: {
      url: "pmtiles://https://pub-b5568be386ef4e638b4e49af41395600.r2.dev/opencanopy-v5.pmtiles",
      sourceLayer: "ogma",
      maxZoom: 10,
    },
    style: {
      type: "line",
      paint: {
        "line-color": "#22c55e",
        "line-dasharray": [6, 3],
        "line-width": 1.5,
        "line-opacity": 0.8,
        "line-opacity-transition": { duration: 300 },
      },
      opacity: 0.8,
    },
    zoomRange: [7, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [{ color: "#22c55e", label: "OGMA Boundary (dashed)" }],
  },

  {
    id: "conservation-priority",
    label: "Conservation Priority Areas",
    category: "protection",
    description: "2.6 million hectares identified by BC's Old Growth Strategic Review as priority for deferral from logging",
    source: {
      type: "wfs",
      url: WFS_ENDPOINTS.conservationPriority,
      typeName: "pub:WHSE_LAND_USE_PLANNING.OGSR_TAP_PRIORITY_DEF_AREA_CUR_SP",
      attribution: "BC OGSR (FLNRORD)",
    },
    tileSource: {
      url: "pmtiles://https://pub-b5568be386ef4e638b4e49af41395600.r2.dev/opencanopy-v5.pmtiles",
      sourceLayer: "conservation-priority",
      maxZoom: 10,
    },
    style: {
      type: "fill",
      paint: {
        "fill-color": "#eab308",
        "fill-opacity": [
          "interpolate", ["linear"], ["zoom"],
          0, 0.1,
          6, 0.15,
          9, 0.25,
          12, 0.35,
        ],
        "fill-outline-color": "#eab308",
        "fill-opacity-transition": { duration: 300 },
      },
      opacity: 0.25,
    },
    zoomRange: [5, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [{ color: "#eab308", label: "TAP Priority Deferral" }],
    fetchPriority: 1,
  },

  // ── Water layers ───────────────────────────────────────────────
  {
    id: "fish-streams",
    label: "Fish-Bearing Streams",
    category: "water",
    description:
      "Freshwater Atlas streams classified as fish-bearing or potentially fish-bearing",
    source: {
      type: "wfs",
      url: WFS_ENDPOINTS.freshwater,
      typeName: "pub:WHSE_BASEMAPPING.FWA_STREAM_NETWORKS_SP",
      cqlFilter:
        "STREAM_ORDER >= 3",
      attribution: "BC Freshwater Atlas (GeoBC)",
    },
    style: {
      type: "line",
      paint: {
        "line-color": "#3b82f6",
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8,
          0.5,
          14,
          2,
        ],
        "line-opacity": 0.8,
        "line-opacity-transition": { duration: 300 },
      },
      opacity: 0.8,
    },
    zoomRange: [9, 18],
    defaultEnabled: false,
    interactive: false,
    legendItems: [{ color: "#3b82f6", label: "Fish Stream" }],
  },

  {
    id: "community-watersheds",
    label: "Community Watersheds",
    category: "water",
    description:
      "Designated community watersheds that supply drinking water to BC communities",
    source: {
      type: "wfs",
      url: WFS_ENDPOINTS.communityWatersheds,
      typeName: "pub:WHSE_WATER_MANAGEMENT.WLS_COMMUNITY_WS_PUB_SVW",
      attribution: "BC FLNRORD",
    },
    tileSource: {
      url: "pmtiles://https://pub-b5568be386ef4e638b4e49af41395600.r2.dev/opencanopy-v5.pmtiles",
      sourceLayer: "community-watersheds",
      maxZoom: 10,
    },
    style: {
      type: "fill",
      paint: {
        "fill-color": "#38bdf8",
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0, 0.08,
          7, 0.1,
          10, 0.18,
          13, 0.25,
        ],
        "fill-outline-color": "#38bdf8",
        "fill-opacity-transition": { duration: 300 },
      },
      opacity: 0.2,
    },
    zoomRange: [7, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [{ color: "#38bdf8", label: "Community Watershed" }],
  },

  // ── Species layers ─────────────────────────────────────────────
  {
    id: "species-at-risk",
    label: "Species at Risk",
    category: "species",
    description:
      "BC Conservation Data Centre species occurrence records (non-sensitive)",
    source: {
      type: "wfs",
      url: WFS_ENDPOINTS.cdc,
      typeName:
        "pub:WHSE_TERRESTRIAL_ECOLOGY.BIOT_OCCR_NON_SENS_AREA_SVW",
      attribution: "BC CDC (MOE)",
    },
    style: {
      type: "circle",
      paint: {
        "circle-color": "#f59e0b",
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          7,
          1,
          10,
          1.5,
          14,
          2.5,
        ],
        "circle-opacity": 0.4,
        "circle-stroke-color": "#f59e0b",
        "circle-stroke-width": 0,
        "circle-opacity-transition": { duration: 300 },
      },
      opacity: 0.7,
    },
    zoomRange: [7, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [{ color: "#f59e0b", label: "Species Occurrence" }],
  },

  {
    id: "wildlife-habitat-areas",
    label: "Wildlife Habitat Areas",
    category: "species",
    description:
      "Designated Wildlife Habitat Areas for species protection under the Forest and Range Practices Act",
    source: {
      type: "wfs",
      url: WFS_ENDPOINTS.wildlifeHabitatAreas,
      typeName: "pub:WHSE_WILDLIFE_MANAGEMENT.WCP_WILDLIFE_HABITAT_AREA_POLY",
      attribution: "BC MOE",
    },
    tileSource: {
      url: "pmtiles://https://pub-b5568be386ef4e638b4e49af41395600.r2.dev/opencanopy-v5.pmtiles",
      sourceLayer: "wildlife-habitat-areas",
      maxZoom: 10,
    },
    style: {
      type: "fill",
      paint: {
        "fill-color": "#a3e635",
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0, 0.1,
          7, 0.12,
          10, 0.2,
          13, 0.3,
        ],
        "fill-outline-color": "#a3e635",
        "fill-opacity-transition": { duration: 300 },
      },
      opacity: 0.25,
    },
    zoomRange: [7, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [{ color: "#a3e635", label: "Wildlife Habitat Area" }],
  },

  {
    id: "ungulate-winter-range",
    label: "Ungulate Winter Range",
    category: "species",
    description:
      "Designated winter range areas critical for ungulate species survival",
    source: {
      type: "wfs",
      url: WFS_ENDPOINTS.ungulateWinterRange,
      typeName: "pub:WHSE_WILDLIFE_MANAGEMENT.WCP_UNGULATE_WINTER_RANGE_SP",
      attribution: "BC MOE",
    },
    tileSource: {
      url: "pmtiles://https://pub-b5568be386ef4e638b4e49af41395600.r2.dev/opencanopy-v5.pmtiles",
      sourceLayer: "ungulate-winter-range",
      maxZoom: 10,
    },
    style: {
      type: "fill",
      paint: {
        "fill-color": "#fb923c",
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0, 0.08,
          7, 0.1,
          10, 0.18,
          13, 0.25,
        ],
        "fill-outline-color": "#fb923c",
        "fill-opacity-transition": { duration: 300 },
      },
      opacity: 0.2,
    },
    zoomRange: [7, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [{ color: "#fb923c", label: "Ungulate Winter Range" }],
  },

  // ── Context layers ─────────────────────────────────────────────
  {
    id: "satellite",
    label: "Satellite Imagery",
    category: "context",
    description: "MapTiler satellite raster tiles",
    source: {
      type: "raster",
      url: MAPTILER_KEY
        ? `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${MAPTILER_KEY}`
        : undefined,
      attribution: "MapTiler / Copernicus",
    },
    style: {
      type: "fill", // Not used for raster, but satisfies the type
      paint: {},
      opacity: 1,
    },
    zoomRange: [0, 22],
    defaultEnabled: false,
    interactive: false,
    legendItems: [{ color: "#4a7c59", label: "Satellite" }],
  },

  {
    id: "mining-claims",
    label: "Mining Claims",
    category: "context",
    description:
      "Active mineral and placer tenure claims across BC",
    source: {
      type: "wfs",
      url: WFS_ENDPOINTS.miningClaims,
      typeName: "pub:WHSE_MINERAL_TENURE.MTA_ACQUIRED_TENURE_SVW",
      attribution: "BC EMLI",
    },
    tileSource: {
      url: "pmtiles://https://pub-b5568be386ef4e638b4e49af41395600.r2.dev/opencanopy-v5.pmtiles",
      sourceLayer: "mining-claims",
      maxZoom: 10,
    },
    style: {
      type: "fill",
      paint: {
        "fill-color": "#a855f7",
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0, 0.08,
          6, 0.1,
          9, 0.15,
          12, 0.2,
        ],
        "fill-outline-color": "#a855f7",
        "fill-opacity-transition": { duration: 300 },
      },
      opacity: 0.15,
    },
    zoomRange: [6, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [{ color: "#a855f7", label: "Mining Claim" }],
  },

  {
    id: "forestry-roads",
    label: "Forestry Roads",
    category: "context",
    description:
      "Forest tenure road sections showing industrial access into BC forests",
    source: {
      type: "wfs",
      url: WFS_ENDPOINTS.forestryRoads,
      typeName: "pub:WHSE_FOREST_TENURE.FTEN_ROAD_SECTION_LINES_SVW",
      attribution: "BC FLNRORD",
    },
    tileSource: {
      url: "pmtiles://https://pub-b5568be386ef4e638b4e49af41395600.r2.dev/opencanopy-v5.pmtiles",
      sourceLayer: "forestry-roads",
      maxZoom: 10,
    },
    style: {
      type: "line",
      paint: {
        "line-color": "#71717a",
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          8, 0.5,
          12, 1,
        ],
        "line-opacity": 0.6,
        "line-opacity-transition": { duration: 300 },
      },
      opacity: 0.6,
    },
    zoomRange: [8, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [{ color: "#71717a", label: "Forestry Road" }],
  },
];

/** Look up a layer definition by ID */
export function getLayer(id: string): LayerDefinition | undefined {
  return LAYER_REGISTRY.find((l) => l.id === id);
}

/** Get all layers that should be enabled by default */
export function getDefaultLayers(): string[] {
  return LAYER_REGISTRY.filter((l) => l.defaultEnabled).map((l) => l.id);
}

