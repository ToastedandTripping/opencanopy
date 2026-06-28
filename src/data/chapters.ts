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

/** Which pre-rendered image-overlay a chapter shows, and how. */
export type OverlayImageMode = "scrubbed" | "static";

export interface ChapterOverlay {
  /** Image source: cutblock red or wildfire amber. */
  source: "cutblocks" | "fire";
  /** scrubbed = image follows the scrub year; static = fixed staticYear. */
  mode: OverlayImageMode;
  /** Required when mode==="static" (e.g. baseline=range.start, scars=range.end). */
  staticYear?: number;
  /** Target raster-opacity 0..0.85. */
  opacity: number;
  /** Scroll-coupled fade window [startProg,endProg]; opacity ramps 0→opacity across it. */
  fadeIn?: [number, number];
}

export interface Chapter {
  id: string;
  heading: string;
  subheading?: string;
  body?: string;
  /** Source citation rendered small under the body (e.g. the closing stat). */
  citation?: string;
  camera: ChapterCamera;
  terrain: ChapterTerrain;
  fog?: ChapterFog;
  layers: ChapterLayer[];
  timelineScrub?: ChapterTimelineScrub;
  /**
   * Progress fraction [0,1] at which scrubbing begins. Before it, the beat
   * HOLDS: no year counter, scrubbed overlays pinned to their start year (and
   * typically faded out) so the panel text can land before the data moves.
   * Defaults to 0 (scrub from the top).
   */
  scrubStart?: number;
  /** Which cumulative-area scrub table maps scroll progress → year (scrub beats only). */
  scrubTable?: "cutblocks" | "fire";
  /**
   * Blend the scrubTable's cumulative-area pacing toward LINEAR, 0..1.
   * 0 = pure cumulative (early near-empty decades compress to nothing);
   * 1 = pure linear (every year equal time). A middle value gives the sparse
   * early decades enough scroll to read while still trimming the long tail.
   * Ignored when there's no scrubTable.
   */
  scrubBlend?: number;
  /** Per-chapter image overlays (red cutblocks / amber fire), opacity decoupled from yearFilter. */
  overlays?: ChapterOverlay[];
  /** Small label under the year counter (e.g. "wildfires"). */
  counterLabel?: string;
  /** Degrees per second for slow camera rotation */
  bearingDrift?: number;
  /** Scroll spacer height in vh units */
  scrollHeight: number;
  /**
   * When true, applyLayerVisibility shows the binary end-reveal raster
   * (story-binary-reveal at 0.85) and hides the forest-base (binary carries
   * old-growth color now). Set on the `ending` and `remains` chapters.
   * Replaces the former fragile isEnding opacity-sniff heuristic.
   */
  revealBinary?: boolean;
}

/** The accumulation sequence is flat, top-down, province-scale throughout. */
const FLAT_BC_CAMERA: ChapterCamera = {
  center: [-125.5, 54.0],
  zoom: 5,
  pitch: 0,
  bearing: 0,
};

const NO_TERRAIN: ChapterTerrain = { enabled: false, exaggeration: 0 };

/**
 * Final camera for the story's "remains" chapter — the old-growth pocket
 * that the ending dolly zooms into.
 *
 * TBD: center and zoom are PLACEHOLDERS. Finalized by eyeball after the binary
 * raster tiles are built and uploaded to R2. The orchestrator adjusts this
 * constant before deploying; everything else (CTA hash, prefetch, remains
 * chapter camera) derives from here automatically as the SSOT.
 *
 * When updating: set center = [lng, lat] of the most legible surviving
 * old-growth pocket at z8.5 on the binary tiles (green island surrounded by red).
 */
export const STORY_END_CAMERA: ChapterCamera = {
  // TBD: finalized by eyeball after binary tiles are built
  center: [-125.7, 51.3],
  zoom: 8.5,
  pitch: 0,
  bearing: 0,
};

export const CHAPTERS: Chapter[] = [
  {
    id: "overview",
    heading: "See what's left.",
    camera: FLAT_BC_CAMERA,
    terrain: NO_TERRAIN,
    layers: [{ id: "forest-age", opacity: 0.6 }],
    scrollHeight: 150,
  },
  {
    // Fade the pre-1950 / undated baseline in BEFORE the year counter starts,
    // so the viewer registers that much was already gone before the records.
    id: "baseline",
    heading: "Before the records began.",
    body: "Decades of logging predate the public record. Much of what you see in red was already gone by 1950.",
    camera: FLAT_BC_CAMERA,
    terrain: NO_TERRAIN,
    layers: [{ id: "forest-age", opacity: 0.5 }],
    overlays: [
      { source: "cutblocks", mode: "static", staticYear: 1950, opacity: 0.85, fadeIn: [0, 0.7] },
    ],
    scrollHeight: 150,
  },
  {
    id: "logging-timeline",
    heading: "75 years of logging.",
    body: "British Columbia has logged over 8 million hectares of forest since 1950. Each red mark is a cutblock — an area where every tree was removed.",
    camera: FLAT_BC_CAMERA,
    terrain: NO_TERRAIN,
    layers: [{ id: "forest-age", opacity: 0.4 }],
    timelineScrub: { start: 1950, end: 2025 },
    scrubTable: "cutblocks",
    // Pure cumulative compressed 1950-1980 to ~0.1% of scroll (the counter
    // teleported) and piled the rest on the 2000s. Blend 40% toward linear so
    // the early decades read and the long tail trims.
    scrubBlend: 0.4,
    overlays: [{ source: "cutblocks", mode: "scrubbed", opacity: 0.85 }],
    scrollHeight: 600,
  },
  {
    // Amber wildfire accumulates over the persisted red. Flat camera (no tilt).
    id: "fire",
    heading: "And then it burned.",
    body: "British Columbia has always burned — but the largest seasons on record are all recent. Since 2017, wildfire has taken more forest than logging did in decades.",
    camera: FLAT_BC_CAMERA,
    terrain: NO_TERRAIN,
    layers: [{ id: "forest-age", opacity: 0.3 }],
    // LINEAR scrub (no scrubTable): the counter advances one year per equal
    // scroll. Fire is a few huge discrete events (1958, 2017, 2023); the
    // cumulative-area nonlinear pacing made the counter lurch (linger on big
    // years, skip empty ones). Linear keeps it steady; the recent bloom still
    // lands hard at the end because those seasons are simply enormous.
    //
    // HOLD until 22%: enter on the full red province with "And then it burned."
    // showing and NO orange + NO counter, so the line lands first. Then the
    // amber begins (fades in 22-30%, synchronized with the counter starting).
    timelineScrub: { start: 1917, end: 2025 },
    scrubStart: 0.22,
    counterLabel: "wildfires",
    overlays: [
      { source: "cutblocks", mode: "static", staticYear: 2025, opacity: 0.75 },
      { source: "fire", mode: "scrubbed", opacity: 0.85, fadeIn: [0.22, 0.3] },
    ],
    scrollHeight: 300,
  },
  {
    // FTEN/fire overlays fade out; binary raster fades in showing only
    // old-growth (dark green) vs everything else (red). The map goes almost
    // entirely red — 35,000 ha of large old-growth out of 1.1M ha total.
    // scrollHeight bumped 300→600 to give the dolly-toward-remains time to run:
    // updateCamera interpolates ending.camera → remains.camera over the last
    // 20% of this chapter's scroll (~120vh at 600vh total).
    id: "ending",
    heading: "35,000 hectares.",
    subheading: "That's what remains of BC's large old-growth trees. 0.3% of the province's forest.",
    body: "What you just watched was only the permit record. The full picture is worse.",
    citation: "Price, Holt & Daust, 2020",
    camera: FLAT_BC_CAMERA,
    terrain: NO_TERRAIN,
    layers: [{ id: "forest-age", opacity: 0.25 }],
    overlays: [
      { source: "cutblocks", mode: "static", staticYear: 2025, opacity: 0 },
      { source: "fire", mode: "static", staticYear: 2025, opacity: 0 },
    ],
    revealBinary: true,
    scrollHeight: 600,
  },
  {
    // Final resting point after the dolly. The camera has arrived at
    // STORY_END_CAMERA (the old-growth pocket). The panel holds the closing
    // line; the binary layer stays on (revealBinary). Scrolling past this
    // chapter reveals the CTA section.
    id: "remains",
    heading: "This is what's left.", // George: finalize copy
    camera: STORY_END_CAMERA,
    terrain: NO_TERRAIN,
    layers: [{ id: "forest-age", opacity: 0.25 }],
    revealBinary: true,
    scrollHeight: 150,
  },
];
