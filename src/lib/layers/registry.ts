import type { LayerDefinition } from "@/types/layers";
import {
  PRESENT_COMPANIES,
  OTHER_COMPANY_COLOR,
  companyColorExpression,
} from "@/data/companies";
import { R2_PUBLIC_BASE, FOREST_AGE_RASTER_URL, FOREST_AGE_CLASS_RASTER_URL } from "@/lib/r2-config";
import FOREST_AGE_PALETTE from "@/lib/layers/forest-age-palette.json";

export const PMTILES_URL = `pmtiles://${R2_PUBLIC_BASE}/opencanopy-v10.pmtiles`;
export const PMTILES_SOURCE_ID = "opencanopy";
export const PMTILES_MAX_ZOOM = 12;

/**
 * Cutblock polygons at or above this area are tenure boundaries, not real
 * cutblocks (real ones rarely exceed 1000 ha). Applied as a MapLibre filter
 * here and mirrored as the proxy's CQL filter for `cutblocks`
 * (netlify/edge-functions/wfs-proxy.ts); proxy-consistency-audit pins the two
 * to the same number. It is also a public-figure hazard: any hectare total
 * shown for cutblocks must apply the same cap (see lib/timeline/scented-track).
 */
export const CUTBLOCK_AREA_CAP_HA = 2000;

/**
 * WFS endpoint base URLs for BC Open Maps data.
 * All use the OGC WFS 2.0.0 protocol.
 */
const WFS_ENDPOINTS = {
  vri: "https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_VEGETATION.VEG_COMP_LYR_R1_POLY/ows",
  freshwater:
    "https://openmaps.gov.bc.ca/geo/pub/WHSE_BASEMAPPING.FWA_STREAM_NETWORKS_SP/ows",
  cdc: "https://openmaps.gov.bc.ca/geo/pub/WHSE_TERRESTRIAL_ECOLOGY.BIOT_OCCR_NON_SENS_AREA_SVW/ows",
  parks:
    "https://openmaps.gov.bc.ca/geo/pub/WHSE_TANTALIS.TA_PARK_ECORES_PA_SVW/ows",
  conservancies:
    "https://openmaps.gov.bc.ca/geo/pub/WHSE_TANTALIS.TA_CONSERVANCY_AREAS_SVW/ows",
  tenureCutblocks:
    "https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_TENURE.FTEN_CUT_BLOCK_POLY_SVW/ows",
  fireHistory: "https://openmaps.gov.bc.ca/geo/pub/WHSE_LAND_AND_NATURAL_RESOURCE.PROT_HISTORICAL_FIRE_POLYS_SP/ows",
  ogma: "https://openmaps.gov.bc.ca/geo/pub/WHSE_LAND_USE_PLANNING.RMP_OGMA_LEGAL_CURRENT_SVW/ows",
  wildlifeHabitatAreas: "https://openmaps.gov.bc.ca/geo/pub/WHSE_WILDLIFE_MANAGEMENT.WCP_WILDLIFE_HABITAT_AREA_POLY/ows",
  ungulateWinterRange: "https://openmaps.gov.bc.ca/geo/pub/WHSE_WILDLIFE_MANAGEMENT.WCP_UNGULATE_WINTER_RANGE_SP/ows",
  communityWatersheds: "https://openmaps.gov.bc.ca/geo/pub/WHSE_WATER_MANAGEMENT.WLS_COMMUNITY_WS_PUB_SVW/ows",
  miningClaims: "https://openmaps.gov.bc.ca/geo/pub/WHSE_MINERAL_TENURE.MTA_ACQUIRED_TENURE_SVW/ows",
  forestryRoads: "https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_TENURE.FTEN_ROAD_SECTION_LINES_SVW/ows",
  conservationPriority: "https://openmaps.gov.bc.ca/geo/pub/WHSE_FOREST_VEGETATION.OGSR_PRIORITY_DEF_AREA_CUR_SP/ows",
} as const;

const MAPTILER_KEY = process.env.NEXT_PUBLIC_MAPTILER_KEY;

/**
 * The OpenCanopy layer registry.
 * Each entry defines a layer's data source, visual style, zoom behavior, and
 * legend. Adding a layer is a single object here (see CONTRIBUTING.md).
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
      url: PMTILES_URL,
      sourceLayer: "forest-age",
      maxZoom: PMTILES_MAX_ZOOM,
    },
    rasterOverview: {
      urlTemplate: FOREST_AGE_RASTER_URL,
      minZoom: 4,
      maxZoom: 9,
    },
    rasterOverviewClassUrl: FOREST_AGE_CLASS_RASTER_URL,
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
            FOREST_AGE_PALETTE["old-growth"],
            "mature",
            FOREST_AGE_PALETTE["mature"],
            "young",
            FOREST_AGE_PALETTE["young"],
            "harvested",
            FOREST_AGE_PALETTE["harvested"],
            "#6b7280",
          ],
          "#6b7280",
        ],
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          5, 0.40,
          7, 0.48,
          9, 0.55,
          12, 0.65,
        ],
        "fill-opacity-transition": { duration: 300 },
      },
      opacity: 0.7,
    },
    zoomRange: [5, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [
      { color: FOREST_AGE_PALETTE["old-growth"], label: "Stands 250+ yr (VRI)", classSlug: "old-growth", note: "VRI counts all stands modelled at 250+ yr. The story's 0.3% (Price/Holt/Daust) counts large old-growth trees only." },
      { color: FOREST_AGE_PALETTE["mature"], label: "Mature (80-250 yr)", classSlug: "mature" },
      { color: FOREST_AGE_PALETTE["young"], label: "Young (<80 yr)", classSlug: "young" },
      { color: FOREST_AGE_PALETTE["harvested"], label: "Harvested", classSlug: "harvested" },
    ],
    fetchPriority: 0,
  },

  {
    id: "logging-risk",
    label: "Forest Age (Risk View)",
    category: "forest",
    description:
      "Forest age classes colored by logging pressure. Not a true vulnerability analysis -- shows age-based risk proxy only.",
    source: {
      type: "wfs",
      url: WFS_ENDPOINTS.vri,
      typeName: "pub:WHSE_FOREST_VEGETATION.VEG_COMP_LYR_R1_POLY",
      attribution: "BC VRI (FLNRORD)",
    },
    tileSource: {
      url: PMTILES_URL,
      sourceLayer: "forest-age",
      maxZoom: PMTILES_MAX_ZOOM,
      // Crash guard: forest-age is ~6.2M polygons. Unlike the primary
      // forest-age layer, this proxy has no rasterOverview, so gate the
      // vector tiles to z>=9 to avoid province-scale WebGL crashes.
      minZoom: 9,
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
          5, 0.40,
          7, 0.48,
          9, 0.55,
          12, 0.60,
        ],
        "fill-opacity-transition": { duration: 300 },
      },
      opacity: 0.6,
    },
    // Gated to z>=9 (see tileSource.minZoom) to avoid a province-scale crash;
    // zoomRange reflects the actual visible range.
    zoomRange: [9, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [
      { color: "#dc2626", label: "High (Old Growth)", classSlug: "old-growth" },
      { color: "#f97316", label: "Moderate (Mature)", classSlug: "mature" },
      { color: "#facc15", label: "Low (Young)", classSlug: "young" },
      { color: "#27272a", label: "Logged", classSlug: "harvested" },
    ],
    fetchPriority: 1,
  },

  {
    id: "cutblocks",
    label: "Cutblocks",
    category: "forest",
    description: "Forest tenure cutblocks showing logged and approved areas",
    source: {
      type: "wfs",
      url: WFS_ENDPOINTS.tenureCutblocks,
      typeName: "pub:WHSE_FOREST_TENURE.FTEN_CUT_BLOCK_POLY_SVW",
      attribution: "BC Forest Tenure (FLNRORD)",
    },
    tileSource: {
      url: PMTILES_URL,
      sourceLayer: "tenure-cutblocks",
      maxZoom: PMTILES_MAX_ZOOM,
    },
    style: {
      type: "fill",
      paint: {
        "fill-color": "#dc2626",
        // Boundary-dominant (Wave 3.9): the fill is near-zero so a permit edge
        // enclosing forest-age fill reads as the conflict by eye. De-collides
        // from forest-age "harvested" #ef4444 — that was a fill-vs-fill clash,
        // resolved by making cutblocks a boundary, not an area. NOTE: while the
        // timeline is scrubbed, DataLayer's merged filter+opacity effect
        // age-grades BOTH this fill (recency = brightness) AND the outline
        // opacity, so during scrub the layer reads as an age-graded fill rather
        // than a boundary; the boundary look governs the static/default view.
        "fill-opacity": 0.04,
        "fill-opacity-transition": { duration: 300 },
      },
      outline: {
        color: "#dc2626",
        width: [
          "interpolate", ["linear"], ["zoom"],
          5, 1,
          8.5, 1.6,
          12, 2.2,
        ],
        opacity: 0.9,
      },
      opacity: 0.7,
      // Exclude tenure boundaries (>= CUTBLOCK_AREA_CAP_HA) — real cutblocks
      // rarely exceed 1000 ha. Mirrored in the proxy CQL; audit-pinned.
      filter: [
        "any",
        ["!", ["has", "PLANNED_GROSS_BLOCK_AREA"]],
        ["<", ["to-number", ["get", "PLANNED_GROSS_BLOCK_AREA"]], CUTBLOCK_AREA_CAP_HA],
      ],
    },
    zoomRange: [5, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [{ color: "#dc2626", label: "Cutblock (boundary)" }],
    fetchPriority: 1,
    timelineField: "DISTURBANCE_START_DATE",
    timelineRange: [1950, 2025],
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
      url: PMTILES_URL,
      sourceLayer: "tenure-cutblocks",
      maxZoom: PMTILES_MAX_ZOOM,
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
          5, 0.40,
          8.5, 0.52,
          12, 0.62,
        ],
        "fill-opacity-transition": { duration: 300 },
      },
      opacity: 0.6,
    },
    zoomRange: [5, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [
      ...PRESENT_COMPANIES.map((c) => ({
        color: c.color,
        label: c.displayName,
      })),
      { color: OTHER_COMPANY_COLOR, label: "Other" },
    ],
    fetchPriority: 1,
    timelineField: "DISTURBANCE_START_DATE",
    timelineRange: [1950, 2025],
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
      url: PMTILES_URL,
      sourceLayer: "fire-history",
      maxZoom: PMTILES_MAX_ZOOM,
    },
    style: {
      type: "fill",
      paint: {
        "fill-color": "#f59e0b",
        "fill-outline-color": "#f59e0b",
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          5, 0.40,
          8.5, 0.52,
          12, 0.58,
        ],
        "fill-opacity-transition": { duration: 300 },
      },
      opacity: 0.55,
    },
    zoomRange: [5, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [{ color: "#f59e0b", label: "Fire Perimeter" }],
    fetchPriority: 1,
    timelineField: "FIRE_YEAR",
    timelineRange: [1917, 2025],
  },

  // ── Protection layers ──────────────────────────────────────────
  {
    id: "old-growth-250",
    label: "Old-Growth Stands (VRI 250+ yr)",
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
    // Tile-backed via the shared forest-age PMTiles source-layer (the same reuse
    // logging-risk uses), filtered to class=old-growth. The raster overview
    // reuses the dark-green old-growth isolation tiles Wave 2 already shipped —
    // visible at province scale with zero new pipeline. Because a tileSource is
    // present, loadData() short-circuits and the WFS path goes inert; popups
    // show PMTiles attrs (class/age), like the forest-age + logging-risk siblings.
    tileSource: {
      url: PMTILES_URL,
      sourceLayer: "forest-age",
      maxZoom: PMTILES_MAX_ZOOM,
    },
    rasterOverview: {
      urlTemplate: FOREST_AGE_CLASS_RASTER_URL.replace("{class}", "old-growth"),
      minZoom: 4,
      maxZoom: 9,
    },
    style: {
      type: "fill",
      paint: {
        "fill-color": FOREST_AGE_PALETTE["old-growth"],
        "fill-opacity": [
          "interpolate", ["linear"], ["zoom"],
          5, 0.45,
          8.5, 0.58,
          12, 0.65,
        ],
        "fill-opacity-transition": { duration: 300 },
      },
      // Solid gold border (not dashed) — rendered via the generic registry-driven
      // outline in PmtilesLayers, overriding the default faint auto-edge.
      outline: { color: "#fbbf24", width: 1.5, opacity: 0.9 },
      filter: ["==", ["get", "class"], "old-growth"],
      opacity: 0.65,
    },
    zoomRange: [4, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [{ color: FOREST_AGE_PALETTE["old-growth"], label: "Stands 250+ yr" }],
    fetchPriority: 0,
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
      url: PMTILES_URL,
      sourceLayer: "parks",
      maxZoom: PMTILES_MAX_ZOOM,
    },
    style: {
      type: "fill",
      paint: {
        // Emerald-tinted fill + crisp white outline (was a 0.1 white wash,
        // invisible over satellite). Legible by ~z8.5, AA-safe.
        "fill-color": "#34d399",
        "fill-outline-color": "#ffffff",
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          5, 0.18,
          8.5, 0.26,
          12, 0.32,
        ],
        "fill-opacity-transition": { duration: 300 },
      },
      opacity: 0.3,
    },
    zoomRange: [5, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [{ color: "#2f6b52", label: "Provincial Park" }],
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
      url: PMTILES_URL,
      sourceLayer: "conservancies",
      maxZoom: PMTILES_MAX_ZOOM,
    },
    style: {
      type: "fill",
      paint: {
        // Cool slate fill (Wave 3.6) — reads as a "designated area" over both the
        // dark basemap and satellite, staying out of the green (parks/OGMA) and
        // blue (water) lanes. The dashed white outline (style.outline) keeps the
        // recognizable conservancy identity.
        "fill-color": "#cbd5e1",
        "fill-opacity": [
          "interpolate", ["linear"], ["zoom"],
          5, 0.05,
          8.5, 0.07,
          12, 0.09,
        ],
        "fill-opacity-transition": { duration: 300 },
      },
      outline: {
        color: "#ffffff",
        width: [
          "interpolate", ["linear"], ["zoom"],
          5, 1.2,
          8.5, 1.6,
          12, 2,
        ],
        opacity: 0.8,
        dasharray: [6, 4],
      },
      opacity: 0.8,
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
      url: PMTILES_URL,
      sourceLayer: "ogma",
      maxZoom: PMTILES_MAX_ZOOM,
    },
    style: {
      type: "line",
      paint: {
        "line-color": "#22c55e",
        "line-dasharray": [6, 3],
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          5, 1.2,
          8.5, 1.6,
          12, 2,
        ],
        "line-opacity": 0.8,
        "line-opacity-transition": { duration: 300 },
      },
      opacity: 0.8,
    },
    zoomRange: [5, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [{ color: "#22c55e", label: "OGMA Boundary (dashed)" }],
  },

  {
    id: "tap-priority",
    label: "Conservation Priority Areas",
    category: "protection",
    description: "2.6 million hectares identified by BC's Old Growth Strategic Review as priority for deferral from logging",
    source: {
      type: "wfs",
      url: WFS_ENDPOINTS.conservationPriority,
      typeName: "pub:WHSE_FOREST_VEGETATION.OGSR_PRIORITY_DEF_AREA_CUR_SP",
      attribution: "BC OGSR (FLNRORD)",
    },
    tileSource: {
      url: PMTILES_URL,
      sourceLayer: "conservation-priority",
      maxZoom: PMTILES_MAX_ZOOM,
      // TODO(verify): No minZoom set — 258K polys renders from z0. Measured as
      // ~25× smaller than the logging-risk 6.2M polygon set that needed gating.
      // Leave config unchanged. Orchestrator should load at z5 during Workstream-F
      // live verification and gate tileSource.minZoom (e.g. to 9) only if FPS
      // measurably degrades. If gated, extend registry-audit Check 5.
    },
    style: {
      type: "fill",
      paint: {
        "fill-color": "#eab308",
        "fill-opacity": [
          "interpolate", ["linear"], ["zoom"],
          5, 0.30,
          8.5, 0.45,
          12, 0.55,
        ],
        "fill-outline-color": "#eab308",
        "fill-opacity-transition": { duration: 300 },
      },
      opacity: 0.40,
    },
    zoomRange: [5, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [{ color: "#eab308", label: "Priority Deferral Area" }],
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
      url: PMTILES_URL,
      sourceLayer: "community-watersheds",
      maxZoom: PMTILES_MAX_ZOOM,
    },
    style: {
      type: "fill",
      paint: {
        "fill-color": "#38bdf8",
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          5, 0.28,
          8.5, 0.42,
          12, 0.50,
        ],
        "fill-outline-color": "#38bdf8",
        "fill-opacity-transition": { duration: 300 },
      },
      opacity: 0.35,
    },
    zoomRange: [5, 18],
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
        // Wave 3.7: larger radius + brighter fill + a pale-amber halo so points
        // read over busy satellite tiles (audit D5: "invisible even when working").
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          7,
          5,
          10,
          7,
          14,
          10,
        ],
        "circle-opacity": 0.85,
        "circle-stroke-color": "#fde68a",
        "circle-stroke-width": 1.5,
        "circle-opacity-transition": { duration: 300 },
      },
      opacity: 0.8,
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
      url: PMTILES_URL,
      sourceLayer: "wildlife-habitat-areas",
      maxZoom: PMTILES_MAX_ZOOM,
    },
    style: {
      type: "fill",
      paint: {
        "fill-color": "#a3e635",
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          5, 0.30,
          8.5, 0.45,
          12, 0.52,
        ],
        "fill-outline-color": "#a3e635",
        "fill-opacity-transition": { duration: 300 },
      },
      opacity: 0.35,
    },
    zoomRange: [5, 18],
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
      url: PMTILES_URL,
      sourceLayer: "ungulate-winter-range",
      maxZoom: PMTILES_MAX_ZOOM,
    },
    style: {
      type: "fill",
      paint: {
        "fill-color": "#fb923c",
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          5, 0.28,
          8.5, 0.42,
          12, 0.50,
        ],
        "fill-outline-color": "#fb923c",
        "fill-opacity-transition": { duration: 300 },
      },
      opacity: 0.35,
    },
    zoomRange: [5, 18],
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
    legendItems: [{ color: "#525252", label: "Satellite (base map)" }],
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
      url: PMTILES_URL,
      sourceLayer: "mining-claims",
      maxZoom: PMTILES_MAX_ZOOM,
    },
    style: {
      type: "fill",
      paint: {
        "fill-color": "#a855f7",
        "fill-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          5, 0.30,
          8.5, 0.45,
          12, 0.52,
        ],
        "fill-outline-color": "#a855f7",
        "fill-opacity-transition": { duration: 300 },
      },
      opacity: 0.35,
    },
    zoomRange: [5, 18],
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
      url: PMTILES_URL,
      sourceLayer: "forestry-roads",
      maxZoom: PMTILES_MAX_ZOOM,
    },
    style: {
      type: "line",
      paint: {
        "line-color": "#71717a",
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          5, 0.5,
          8.5, 0.9,
          12, 1.3,
        ],
        "line-opacity": 0.65,
        "line-opacity-transition": { duration: 300 },
      },
      opacity: 0.65,
    },
    zoomRange: [7, 18],
    defaultEnabled: false,
    interactive: true,
    legendItems: [{ color: "#71717a", label: "Forestry Road" }],
  },
];

const PUBLIC_LAYER_IDS = new Set([
  "forest-age",
  "old-growth-250",
  "cutblocks",
  "parks",
  "fire-history",
  "tap-priority",
  "satellite",
]);

/**
 * Runtime-filtered registry.
 *
 * Gates: (1) layer must be in the public surface set, (2) satellite requires
 * a MapTiler API key. Layers outside PUBLIC_LAYER_IDS stay in LAYER_REGISTRY
 * for audit tests but are invisible to the UI, URL hydration, and rendering.
 */
export const LAYER_REGISTRY_AVAILABLE: LayerDefinition[] = LAYER_REGISTRY.filter(
  (l) => {
    if (!PUBLIC_LAYER_IDS.has(l.id)) return false;
    if (l.id === "satellite" && !MAPTILER_KEY) return false;
    return true;
  }
);

/** Look up a layer definition by ID */
export function getLayer(id: string): LayerDefinition | undefined {
  return LAYER_REGISTRY.find((l) => l.id === id);
}

/** Get all layers that should be enabled by default */
export function getDefaultLayers(): string[] {
  return LAYER_REGISTRY_AVAILABLE.filter((l) => l.defaultEnabled).map((l) => l.id);
}

