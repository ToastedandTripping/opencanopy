/**
 * Curated hot spots for OpenCanopy.
 *
 * These are notable locations in BC that serve as entry points
 * for users exploring old-growth forests and conservation areas.
 * Each hot spot defines which layers to enable for the best view.
 */

export interface HotSpot {
  id: string;
  name: string;
  description: string;
  center: [number, number]; // [lng, lat]
  zoom: number;
  layers: string[];
  stats?: {
    oldGrowthHa?: number;
    totalHa?: number;
  };
}

export const HOT_SPOTS: HotSpot[] = [
  {
    id: "eldred-valley",
    name: "Eldred Valley",
    description:
      "1,131 hectares of old growth near Powell River. Ancient cedars exceeding 1,200 years.",
    center: [-124.21, 50.16],
    zoom: 12,
    layers: ["forest-age", "tap-deferrals", "fish-streams"],
    stats: {
      oldGrowthHa: 1131,
    },
  },
  {
    id: "fairy-creek",
    name: "Fairy Creek",
    description:
      "Site of BC's largest civil disobedience action. Ancient temperate rainforest on southern Vancouver Island.",
    center: [-124.53, 48.67],
    zoom: 12,
    layers: ["forest-age", "cutblocks"],
  },
  {
    id: "inland-temperate-rainforest",
    name: "Inland Temperate Rainforest",
    description:
      "The world's only inland temperate rainforest. Ancient cedars in the wet Columbia Mountains.",
    center: [-118.2, 51.3],
    zoom: 10,
    layers: ["forest-age", "parks"],
  },
  {
    id: "stein-valley",
    name: "Stein Valley",
    description:
      "Unlogged watershed sacred to the Nlaka'pamux and Lil'wat Nations. One of the largest intact valleys in southern BC.",
    center: [-121.9, 50.35],
    zoom: 11,
    layers: ["forest-age", "parks", "fish-streams"],
  },
  {
    id: "carmanah-walbran",
    name: "Carmanah Walbran",
    description:
      "Home to Canada's tallest tree (the Carmanah Giant, 96m Sitka spruce). Old-growth temperate rainforest.",
    center: [-124.68, 48.75],
    zoom: 12,
    layers: ["forest-age", "parks"],
  },
];
