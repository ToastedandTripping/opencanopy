/** Layer category for grouping in the UI */
export type LayerCategory =
  | "forest"
  | "accountability"
  | "disturbance"
  | "water"
  | "species"
  | "protection"
  | "context";

/** Source configuration for a layer */
export interface LayerSource {
  type: "wfs" | "static" | "tiles" | "raster";
  /** WFS endpoint or tile URL template */
  url?: string;
  /** WFS type name (e.g. pub:WHSE_FOREST_VEGETATION.VEG_COMP_LYR_R1_POLY) */
  typeName?: string;
  /** Optional CQL filter for WFS requests */
  cqlFilter?: string;
  /** Path to static GeoJSON for non-WFS sources */
  staticData?: string;
  /** Data source attribution text */
  attribution?: string;
}

/** PMTiles vector tile source for pre-built data */
export interface TileSource {
  /** PMTiles URL (e.g. "pmtiles://https://tiles.opencanopy.ca/opencanopy.pmtiles") */
  url: string;
  /** Source layer name within the PMTiles archive */
  sourceLayer: string;
  /** Max zoom level for tile data (WFS takes over above this) */
  maxZoom: number;
}

/** MapLibre paint/layout style specification */
export interface LayerStyle {
  type: "fill" | "line" | "circle" | "symbol";
  /** MapLibre paint properties */
  paint: Record<string, unknown>;
  /** MapLibre layout properties */
  layout?: Record<string, unknown>;
  /** Default opacity (0-1) */
  opacity?: number;
  /** Default MapLibre filter expression applied to both PMTiles and WFS layers */
  filter?: unknown[];
}

/** Legend color swatch entry */
export interface LegendItem {
  color: string;
  label: string;
}

/**
 * Complete definition for a map layer.
 * The registry holds one of these for every layer the app can render.
 */
export interface LayerDefinition {
  /** Unique ID, used in URL state and layer toggling */
  id: string;
  /** Human-readable name */
  label: string;
  /** Category for panel grouping */
  category: LayerCategory;
  /** One-line description for tooltips */
  description: string;
  /** Data source configuration */
  source: LayerSource;
  /** Optional PMTiles source for low-zoom pre-built tiles */
  tileSource?: TileSource;
  /** Optional pre-rendered raster tiles for overview zoom levels (z4-z7).
   *  Used instead of vector tiles at low zoom to avoid browser crashes
   *  with hundreds of thousands of features per tile. */
  rasterOverview?: {
    urlTemplate: string;
    minZoom: number;
    maxZoom: number;
  };
  /** Optional URL template for per-class raster tiles (e.g. old-growth only).
   *  Contains a `{class}` placeholder replaced at runtime with the class slug.
   *  When a class filter selects a subset, these class-specific raster sources
   *  are shown instead of the default all-class rasterOverview. */
  rasterOverviewClassUrl?: string;
  /** MapLibre paint/layout specs */
  style: LayerStyle;
  /** Min/max zoom where layer renders */
  zoomRange: [number, number];
  /** On by default? */
  defaultEnabled: boolean;
  /** Clickable for feature info? */
  interactive: boolean;
  /** Color swatches for the layer panel */
  legendItems: LegendItem[];
  /** Fetch priority for WFS request staggering (lower = higher priority).
   *  0 = default-enabled layers (300ms debounce), undefined/1+ = secondary (800ms debounce). */
  fetchPriority?: number;
  /** Property name containing a date value for timeline filtering (e.g. "DISTURBANCE_START_DATE") */
  timelineField?: string;
}

/**
 * A named combination of layers that can be activated together.
 * Presets let users quickly switch between common views.
 */
export interface LayerPreset {
  id: string;
  label: string;
  description: string;
  icon: string;
  /** Array of layer IDs to enable */
  layers: string[];
}

/** BBox as [west, south, east, north] */
export type BBox = [number, number, number, number];
