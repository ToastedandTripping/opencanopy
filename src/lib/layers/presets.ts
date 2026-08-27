import type { LayerPreset } from "@/types/layers";

/**
 * Predefined layer combinations for common use cases.
 * Each preset activates a specific set of layers from the registry.
 */
export const LAYER_PRESETS: LayerPreset[] = [
  {
    id: "overview",
    label: "Overview",
    description: "Forest age classes with provincial parks",
    icon: "eye",
    layers: ["forest-age", "parks"],
  },
  {
    id: "threats",
    label: "Logging",
    description: "Forest age with cutblock boundaries — logging history",
    icon: "hammer",
    layers: ["forest-age", "cutblocks"],
  },
  {
    id: "protection",
    label: "Old Growth + Parks",
    description: "Old-growth stands, parks, and priority deferral areas",
    icon: "shield",
    layers: ["old-growth-250", "parks", "tap-priority"],
  },
  {
    id: "fire-logging",
    label: "Fire + Logging",
    description: "Historical fire perimeters overlaid with cutblocks and forest age",
    icon: "flame",
    layers: ["fire-history", "cutblocks", "forest-age"],
  },
];
