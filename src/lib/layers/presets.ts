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
    id: "ecology",
    label: "Ecology",
    description: "Forest age, fish-bearing streams, and species at risk",
    icon: "leaf",
    layers: ["forest-age", "fish-streams", "species-at-risk"],
  },
  {
    id: "protection",
    label: "Protection",
    description: "Old growth forest, parks, and conservancy areas",
    icon: "shield",
    layers: ["tap-deferrals", "parks", "conservancies"],
  },
  {
    id: "accountability",
    label: "Accountability",
    description: "Cutblocks color-coded by logging company",
    icon: "target",
    layers: ["tenure-cutblocks", "parks"],
  },
  {
    id: "risk",
    label: "Risk",
    description: "Logging vulnerability by timber value with protected areas",
    icon: "flame",
    layers: ["logging-risk", "cutblocks", "parks"],
  },
  {
    id: "fire-logging",
    label: "Fire + Logging",
    description: "Historical fire perimeters overlaid with cutblocks and forest age",
    icon: "flame",
    layers: ["fire-history", "cutblocks", "forest-age"],
  },
  {
    id: "industrial-footprint",
    label: "Industrial",
    description: "Forestry roads, mining claims, and cutblocks showing industrial impact",
    icon: "hammer",
    layers: ["forestry-roads", "mining-claims", "cutblocks"],
  },
  {
    id: "drinking-water",
    label: "Drinking Water",
    description: "Community watersheds with cutblock and forestry road overlays",
    icon: "droplet",
    layers: ["community-watersheds", "cutblocks", "forestry-roads"],
  },
  {
    id: "conservation-gap",
    label: "Conservation Gap",
    description: "Priority areas identified for protection vs what is actually protected",
    icon: "gap",
    layers: ["conservation-priority", "parks", "conservancies", "ogma", "forest-age"],
  },
  {
    id: "species-habitat",
    label: "Species",
    description: "Wildlife habitat areas, ungulate winter range, and species at risk",
    icon: "paw",
    layers: ["wildlife-habitat-areas", "ungulate-winter-range", "species-at-risk", "tap-deferrals"],
  },
];

/** Look up a preset by ID */
export function getPreset(id: string): LayerPreset | undefined {
  return LAYER_PRESETS.find((p) => p.id === id);
}
