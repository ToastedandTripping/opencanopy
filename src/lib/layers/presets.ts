import type { LayerPreset } from "@/types/layers";

/**
 * Predefined layer combinations for common use cases.
 * Each preset activates a specific set of layers from the registry.
 */
export const LAYER_PRESETS: LayerPreset[] = [
  {
    id: "overview",
    label: "Overview",
    description: "Forest age classes with parks on satellite imagery",
    icon: "eye",
    layers: ["forest-age", "parks", "satellite"],
  },
  {
    id: "threats",
    label: "Threats",
    description: "Forest age classes with active cutblock boundaries",
    icon: "alert-triangle",
    layers: ["forest-age", "cutblocks"],
  },
  {
    id: "protection",
    label: "Protection",
    description: "Old growth forest, parks, and conservation priority areas",
    icon: "shield",
    layers: ["tap-deferrals", "parks", "conservation-priority"],
  },
  {
    id: "fire-logging",
    label: "Fire + Logging",
    description: "Historical fire perimeters overlaid with cutblocks and forest age",
    icon: "flame",
    layers: ["fire-history", "cutblocks", "forest-age"],
  },
];
