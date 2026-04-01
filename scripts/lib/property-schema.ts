/**
 * Property Schema — Unified property validation for OpenCanopy tiles.
 *
 * Replaces two separate systems:
 *   1. EXPECTED_PROPERTIES in audit-tiles.ts (simple key presence check for A3)
 *   2. TILE_PROPERTY_RULES in property-validators.ts (deep validation for P1)
 *
 * One schema, two access patterns:
 *   - checkPresence(layer, feature) — fast: does the feature have its key properties?
 *   - validateDeep(layer, feature, index) — thorough: are property values valid?
 *
 * Adding a layer or property: edit LAYER_PROPERTIES below. Both A3 and P1 pick
 * up the change automatically.
 */

import type { SourceLayerName } from "./audit-config";

// ── Types ────────────────────────────────────────────────────────────────────

export interface PropertyRule {
  required: boolean;
  type: "string" | "number";
  pattern?: RegExp;
  min?: number;
  max?: number;
  enum?: readonly string[];
  /**
   * The "signature" property for this layer — checked by A3 (presence only).
   * Each layer should have at least one signature property. If not set,
   * all required properties are treated as signature properties.
   */
  signature?: boolean;
}

export interface PropertyFinding {
  property: string;
  status: "ok" | "missing-required" | "wrong-type" | "out-of-range" | "bad-enum" | "bad-pattern";
  message: string;
}

export interface ValidationResult {
  layer: SourceLayerName;
  featureIndex: number;
  valid: boolean;
  findings: PropertyFinding[];
}

// ── Known company_id values ──────────────────────────────────────────────────

export const KNOWN_COMPANY_IDS = [
  "canfor", "west-fraser", "tolko", "interfor", "western-forest-products",
  "bc-timber-sales", "mosaic", "weyerhaeuser", "teal-jones", "san-group",
  "conifex", "dunkley", "carrier", "gorman", "canoe-forest", "other",
] as const;

// ── Unified property schema ──────────────────────────────────────────────────

/**
 * Complete property rules for all 12 OpenCanopy source layers.
 *
 * Properties marked `signature: true` are the ones checked by the A3 presence
 * test (quick sanity check that tippecanoe preserved key properties).
 */
export const LAYER_PROPERTIES: Record<string, Record<string, PropertyRule>> = {
  "forest-age": {
    class: { required: true, type: "string", enum: ["old-growth", "mature", "young", "harvested"], signature: true },
    age: { required: false, type: "number", min: 0, max: 2000 },
    species: { required: false, type: "string" },
  },

  "tenure-cutblocks": {
    company_id: { required: true, type: "string", enum: KNOWN_COMPANY_IDS, signature: true },
    PLANNED_GROSS_BLOCK_AREA: { required: true, type: "number", min: 0.01, max: 100000, signature: true },
    DISTURBANCE_START_DATE: { required: false, type: "string", pattern: /^\d{4}/ },
  },

  "fire-history": {
    FIRE_YEAR: { required: true, type: "string", pattern: /^\d{4}/, signature: true },
    FIRE_SIZE_HECTARES: { required: false, type: "number", min: 0, max: 10000000 },
    FIRE_CAUSE: { required: false, type: "string" },
  },

  "parks": {
    name: { required: true, type: "string", signature: true },
    designation: { required: false, type: "string" },
  },

  "conservancies": {
    name: { required: true, type: "string", signature: true },
  },

  "ogma": {
    OGMA_TYPE: { required: false, type: "string", signature: true },
    LANDSCAPE_UNIT_NAME: { required: false, type: "string" },
  },

  "wildlife-habitat-areas": {
    COMMON_SPECIES_NAME: { required: false, type: "string", signature: true },
    HABITAT_AREA_ID: { required: false, type: "number", min: 0, max: 99999999 },
  },

  "ungulate-winter-range": {
    SPECIES_1: { required: false, type: "string", signature: true },
    UWR_TAG: { required: false, type: "string" },
  },

  "community-watersheds": {
    CW_NAME: { required: true, type: "string", signature: true },
    AREA_HA: { required: false, type: "number", min: 0, max: 1000000 },
  },

  "mining-claims": {
    TENURE_TYPE_DESCRIPTION: { required: true, type: "string", signature: true },
    OWNER_NAME: { required: false, type: "string" },
    TENURE_STATUS: { required: false, type: "string" },
  },

  "forestry-roads": {
    ROAD_SECTION_NAME: { required: false, type: "string", signature: true },
    CLIENT_NAME: { required: false, type: "string" },
  },

  "conservation-priority": {
    TAP_CLASSIFICATION_LABEL: { required: false, type: "string", signature: true },
    LANDSCAPE_UNIT_NAME: { required: false, type: "string" },
    ANCIENT_FOREST_IND: { required: false, type: "string" },
    PRIORITY_BIG_TREED_OG_IND: { required: false, type: "string" },
    BGC_LABEL: { required: false, type: "string" },
    FIELD_VERIFIED_IND: { required: false, type: "string" },
    FEATURE_AREA_SQM: { required: false, type: "number", min: 0, max: 100000000000 },
  },
};

// ── Quick presence check (A3) ────────────────────────────────────────────────

/**
 * Get the signature property names for a layer (used by A3 presence check).
 * Returns properties marked `signature: true`, or all required properties
 * if none are explicitly marked.
 */
export function getSignatureProperties(layer: string): string[] {
  const rules = LAYER_PROPERTIES[layer];
  if (!rules) return [];

  const sig = Object.entries(rules)
    .filter(([, r]) => r.signature)
    .map(([k]) => k);

  if (sig.length > 0) return sig;

  // Fallback: all required properties
  return Object.entries(rules)
    .filter(([, r]) => r.required)
    .map(([k]) => k);
}

/**
 * Quick check: does the feature have its key (signature) properties?
 * Returns true if at least one signature property is present and non-null.
 * Used by audit-tiles A3 for fast sanity checks.
 */
export function checkPresence(
  layer: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  feature: any
): boolean {
  const sigProps = getSignatureProperties(layer);
  if (sigProps.length === 0) return true; // no rules for this layer

  const props = feature?.properties ?? {};
  return sigProps.some((key) => props[key] != null);
}

// ── Deep validation (P1) ─────────────────────────────────────────────────────

/**
 * Thorough property validation: checks required presence, type, enum, pattern,
 * and numeric range for every defined property.
 *
 * Returns null if no rules exist for the layer.
 */
export function validateDeep(
  layer: SourceLayerName,
  props: Record<string, unknown>,
  featureIndex: number
): ValidationResult | null {
  const rules = LAYER_PROPERTIES[layer];
  if (!rules) return null;

  const findings: PropertyFinding[] = [];

  for (const [propName, constraint] of Object.entries(rules)) {
    const rawValue = props[propName];
    const isMissing = rawValue === null || rawValue === undefined;

    if (isMissing) {
      if (constraint.required) {
        findings.push({
          property: propName,
          status: "missing-required",
          message: `Required property "${propName}" is null/undefined.`,
        });
      }
      continue;
    }

    // Type check
    if (typeof rawValue !== constraint.type) {
      findings.push({
        property: propName,
        status: "wrong-type",
        message: `Expected ${constraint.type}, got ${typeof rawValue} (value: ${JSON.stringify(rawValue)}).`,
      });
      continue;
    }

    // String-specific checks
    if (constraint.type === "string") {
      const strVal = rawValue as string;
      if (constraint.enum) {
        if (!(constraint.enum as readonly string[]).includes(strVal)) {
          findings.push({
            property: propName,
            status: "bad-enum",
            message: `Value "${strVal}" not in allowed set: [${constraint.enum.join(", ")}].`,
          });
        } else {
          findings.push({ property: propName, status: "ok", message: "ok" });
        }
      } else if (constraint.pattern) {
        if (!constraint.pattern.test(strVal)) {
          findings.push({
            property: propName,
            status: "bad-pattern",
            message: `Value "${strVal}" does not match pattern ${constraint.pattern}.`,
          });
        } else {
          findings.push({ property: propName, status: "ok", message: "ok" });
        }
      } else {
        findings.push({ property: propName, status: "ok", message: "ok" });
      }
    }

    // Number-specific checks
    if (constraint.type === "number") {
      const numVal = rawValue as number;
      const tooLow = constraint.min !== undefined && numVal < constraint.min;
      const tooHigh = constraint.max !== undefined && numVal > constraint.max;

      if (tooLow || tooHigh) {
        const bounds = [
          constraint.min !== undefined ? `min=${constraint.min}` : null,
          constraint.max !== undefined ? `max=${constraint.max}` : null,
        ].filter(Boolean).join(", ");
        findings.push({
          property: propName,
          status: "out-of-range",
          message: `Value ${numVal} out of range [${bounds}].`,
        });
      } else {
        findings.push({ property: propName, status: "ok", message: "ok" });
      }
    }
  }

  const valid = findings.every((f) => f.status === "ok");
  return { layer, featureIndex, valid, findings };
}
