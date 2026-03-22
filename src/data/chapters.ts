/**
 * Scrollytelling chapter definitions.
 *
 * Each chapter drives a camera keyframe, layer configuration,
 * terrain/fog settings, and narrative text for the story map.
 */

export interface ChapterCamera {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface ChapterTerrain {
  enabled: boolean;
  exaggeration: number;
}

export interface ChapterFog {
  enabled: boolean;
  color: string;
  horizonBlend: number;
  range: [number, number];
}

export interface ChapterLayer {
  id: string;
  opacity: number;
  useHatch?: boolean;
  /** Filter to specific feature classes (e.g. ["old-growth", "mature"]) */
  classFilter?: string[];
}

export interface ChapterTimelineScrub {
  start: number;
  end: number;
}

export interface Chapter {
  id: string;
  heading: string;
  subheading?: string;
  body?: string;
  camera: ChapterCamera;
  terrain: ChapterTerrain;
  fog?: ChapterFog;
  layers: ChapterLayer[];
  timelineScrub?: ChapterTimelineScrub;
  /** Degrees per second for slow camera rotation */
  bearingDrift?: number;
  /** Scroll spacer height in vh units */
  scrollHeight: number;
}

export const CHAPTERS: Chapter[] = [
  {
    id: "overview",
    heading: "See what's left.",
    camera: {
      center: [-125.5, 54.0],
      zoom: 5,
      pitch: 0,
      bearing: 0,
    },
    terrain: { enabled: false, exaggeration: 0 },
    layers: [{ id: "forest-age", opacity: 0.6 }],
    scrollHeight: 150,
  },
  {
    id: "logging-timeline",
    heading: "75 years of logging.",
    body: "British Columbia has logged over 5 million hectares of forest since 1950. Each red mark is a cutblock -- an area where every tree was removed.",
    camera: {
      center: [-125.5, 54.0],
      zoom: 5,
      pitch: 5,
      bearing: 10,
    },
    terrain: { enabled: false, exaggeration: 0 },
    layers: [
      { id: "forest-age", opacity: 0.4 },
      { id: "cutblocks", opacity: 0.8 },
    ],
    timelineScrub: { start: 1950, end: 2025 },
    scrollHeight: 200,
  },
  {
    id: "fire",
    heading: "And fire.",
    camera: {
      center: [-125.5, 54.0],
      zoom: 5,
      pitch: 5,
      bearing: 10,
    },
    terrain: { enabled: false, exaggeration: 0 },
    layers: [
      { id: "forest-age", opacity: 0.3 },
      { id: "cutblocks", opacity: 0.6 },
      { id: "fire-history", opacity: 0.5 },
    ],
    scrollHeight: 120,
  },
  {
    id: "zoom-in",
    heading: "Zoom in.",
    camera: {
      center: [-124.55, 48.64],
      zoom: 12.5,
      pitch: 55,
      bearing: -30,
    },
    terrain: { enabled: true, exaggeration: 1.4 },
    fog: {
      enabled: true,
      color: "#0a0a0c",
      horizonBlend: 0.08,
      range: [0.5, 8],
    },
    layers: [{ id: "forest-age", opacity: 0.7, classFilter: ["old-growth", "mature"] }],
    scrollHeight: 180,
  },
  {
    id: "old-growth-hatch",
    heading: "This is what old growth looks like.",
    subheading: "And this is what's left.",
    body: "Old growth forests took centuries to reach this complexity. Once cut, they never return to what they were.",
    camera: {
      center: [-124.53, 48.66],
      zoom: 13,
      pitch: 55,
      bearing: -30,
    },
    terrain: { enabled: true, exaggeration: 1.4 },
    fog: {
      enabled: true,
      color: "#0a0a0c",
      horizonBlend: 0.08,
      range: [0.5, 8],
    },
    layers: [{ id: "forest-age", opacity: 0.7, useHatch: true }],
    bearingDrift: 3,
    scrollHeight: 150,
  },
  {
    id: "explore",
    heading: "Explore.",
    camera: {
      center: [-125.5, 54.0],
      zoom: 5,
      pitch: 0,
      bearing: 0,
    },
    terrain: { enabled: false, exaggeration: 0 },
    layers: [
      { id: "forest-age", opacity: 0.5 },
      { id: "parks", opacity: 0.8 },
    ],
    scrollHeight: 120,
  },
];
