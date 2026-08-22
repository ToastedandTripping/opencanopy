/**
 * Scrollytelling chapter definitions.
 *
 * Each chapter drives a camera keyframe, layer configuration, and
 * narrative text for the story map.
 */

export interface ChapterCamera {
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

export interface ChapterLayer {
  id: string;
  opacity: number;
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
  /** Scroll spacer height in vh units */
  scrollHeight: number;
  /**
   * When true, activates the binary end-reveal raster (the ending chapter).
   * Hides the forest-base (binary carries old-growth color now). The raster's
   * opacity is managed per-frame by useScrollytelling + the StoryMap binary effect
   * — NOT by applyLayerVisibility.
   */
  revealBinary?: boolean;
  /**
   * Scroll-progress window [startProg, endProg] over which story-binary-reveal
   * fades from 0 → 0.85. When omitted but revealBinary=true, binary is at 0.85
   * immediately on chapter enter. Works like overlay `fadeIn`.
   */
  revealBinaryFadeIn?: [number, number];
}

/** The accumulation sequence is flat, top-down, province-scale throughout. */
export const FLAT_BC_CAMERA: ChapterCamera = {
  center: [-125.5, 54.0],
  zoom: 5,
  pitch: 0,
  bearing: 0,
};

/**
 * The CTA's `/map` destination — the old-growth pocket the reader lands on
 * when they click "Explore the Map" (CtaSection builds the hash from this).
 *
 * Finalized by eyeball (Phase 1b) against the built binary tiles: Vancouver
 * Island's west coast (Clayoquot Sound / Strathcona), where old-growth survivors
 * read as green amid a field of red clearcuts. Iconic, recognizable, and the
 * starkest "what's left" of the candidate pockets. Deuteranopia-checked (the
 * green/red luminance gap widens to ~4.5:1 under simulation).
 *
 * The story itself no longer zooms here: the ending dolly was DOCKED 2026-08-21
 * (git tags dock/dolly-live-scrub, dock/dolly-phase2-video; ROADMAP Parking Lot
 * has the restore recipe). The zoom is /map's job, one click later.
 */
export const STORY_END_CAMERA: ChapterCamera = {
  center: [-125.86, 49.38],
  zoom: 8,
  pitch: 0,
  bearing: 0,
};

export const CHAPTERS: Chapter[] = [
  {
    id: "overview",
    heading: "See what's left.",
    camera: FLAT_BC_CAMERA,
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
    // Shortened to 300vh so the red reveal and the explanatory panel land
    // together. This is the FINAL chapter: the page holds flat at province
    // scale and proceeds to the CTA, whose "Explore the Map" link carries the
    // reader to STORY_END_CAMERA on /map.
    id: "ending",
    heading: "35,000 hectares.",
    subheading: "That's what remains of BC's large old-growth trees. 0.3% of the province's forest.",
    body: "What you just watched was only the permit record. The full picture is worse.",
    citation: "Price, Holt & Daust, 2020",
    camera: FLAT_BC_CAMERA,
    layers: [{ id: "forest-age", opacity: 0.25 }],
    // cutblocks stays at 0.75 through the whole chapter so "the permit record"
    // red is on screen while the panel text lands; fire fades out immediately.
    // Binary fades in at 40-60% (after text has had 40% of the 300vh to settle),
    // layering the fuller red over the permit-record base.
    overlays: [
      { source: "cutblocks", mode: "static", staticYear: 2025, opacity: 0.75 },
      { source: "fire", mode: "static", staticYear: 2025, opacity: 0 },
    ],
    revealBinary: true,
    revealBinaryFadeIn: [0.4, 0.6],
    scrollHeight: 300,
  },
];
