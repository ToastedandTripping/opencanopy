/**
 * OpenCanopy Audit Configuration — Single Source of Truth
 *
 * All constants, thresholds, layer definitions, zoom levels, and paths
 * used by the audit pipeline. Every audit imports from here instead of
 * defining its own local constants.
 *
 * Adding a layer or changing a threshold is a single-line edit in this file.
 */

import path from "path";
import { fileURLToPath } from "url";
import {
  EXPECTED_SOURCE_LAYERS,
  BC_SAMPLE_POINTS,
  BC_EXTENDED_GRID,
  type SourceLayerName,
} from "./bc-sample-grid";
import { ADVERSARIAL_POINTS } from "./adversarial-points";

// Re-export for convenience — audits import everything from audit-config
export {
  EXPECTED_SOURCE_LAYERS,
  BC_SAMPLE_POINTS,
  BC_EXTENDED_GRID,
  ADVERSARIAL_POINTS,
  type SourceLayerName,
};
export type { SamplePoint } from "./bc-sample-grid";
export type { AdversarialPoint, ExpectedValue } from "./adversarial-points";

// ── Project paths ────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "../..");

export const PATHS = {
  pmtiles: path.resolve(PROJECT_ROOT, "data/tiles/opencanopy.pmtiles"),
  reports: path.resolve(PROJECT_ROOT, "data/reports"),
  archive: path.resolve(PROJECT_ROOT, "data/reports/archive"),
  geojson: path.resolve(PROJECT_ROOT, "data/geojson"),
  preprocessed: path.resolve(PROJECT_ROOT, "data/geojson/preprocessed"),
  lakes: path.resolve(PROJECT_ROOT, "data/geojson/reference/fwa-lakes.ndjson"),
  tilesDir: path.resolve(PROJECT_ROOT, "data/tiles"),
  tilesArchive: path.resolve(PROJECT_ROOT, "data/tiles/archive"),
} as const;

// ── Zoom levels ──────────────────────────────────────────────────────────────

export const ZOOMS = {
  /** Standard audit zoom — used by most audits for tile sampling */
  feature: 10,
  /** Overview tier zoom — used by precision audit for coarse comparison */
  overview: 7,
  /** Geometry precision comparison zooms */
  precision: [7, 10] as readonly number[],
} as const;

// ── Layer groups ─────────────────────────────────────────────────────────────

/**
 * Polygon layers — excludes forestry-roads (lines) and conservation-priority
 * (detail tier only, sparse). Used by spatial and geometry precision audits.
 */
export const POLYGON_LAYERS = EXPECTED_SOURCE_LAYERS.filter(
  (l) => l !== "forestry-roads" && l !== "conservation-priority"
) as string[];

// ── Thresholds ───────────────────────────────────────────────────────────────

export const THRESHOLDS = {
  /** Source fidelity (F1): feature existence rate */
  fidelity: {
    pass: 0.98,
    warn: 0.95,
  },

  /** Property validation (P1): violation rate */
  propertyViolation: {
    warn: 0.05,
    fail: 0.10,
  },

  /** Spatial (S1): water body overlap fraction to flag */
  waterOverlap: 0.50,

  /** Temporal (C1): feature count delta percentages */
  temporal: {
    warnDeltaPct: 10,
    failDeltaPct: 25,
    warnDisappearancePct: 5,
  },

  /** CrossSource: internal consistency rate */
  crossSourceConsistency: 0.90,

  /** Geometry precision (G4): area divergence percentage */
  areaPrecision: 10,

  /** Source fidelity (F4): WFS grid seam strip width in degrees */
  boundaryStrip: 0.05,

  /** Feature matching: minimum fingerprint overlap score */
  matchThreshold: 0.50,
} as const;

// ── Sampling ─────────────────────────────────────────────────────────────────

export const SAMPLING = {
  /** F1/F2/F3: features sampled per layer for fidelity checks */
  fidelityPerLayer: 50,
  /** F4: features sampled per layer near WFS grid boundaries */
  boundaryPerLayer: 20,
  /** C2: features sampled for temporal persistence check */
  persistenceSample: 50,
  /** G1-G4: features sampled per layer for geometry precision */
  precisionPerLayer: 20,
} as const;

// ── ANSI colors ──────────────────────────────────────────────────────────────

export const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
} as const;
