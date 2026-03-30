/**
 * Per-layer property validation rules for the OpenCanopy tile audit pipeline.
 *
 * Rules are verified against the property extractors in build-tiles.ts.
 * Each rule describes what properties a feature in that layer should have,
 * what type they should be, what range or enum they should fall in, and
 * whether the property is required.
 *
 * Usage:
 *   import { TILE_PROPERTY_RULES, validateTileFeatureProperties } from "./property-validators";
 */

import type { SourceLayerName } from "./bc-sample-grid";

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single property constraint. */
export interface PropertyRule {
  /** Whether the property must be non-null/non-undefined in every feature. */
  required: boolean;
  /** Expected JS type (after MVT decode). */
  type: "string" | "number";
  /** For "string" type: optionally validate against this regex. */
  pattern?: RegExp;
  /** For "number" type: inclusive min bound. */
  min?: number;
  /** For "number" type: inclusive max bound. */
  max?: number;
  /**
   * For "string" type: if set, the value must be one of these strings.
   * Takes precedence over `pattern`.
   */
  enum?: readonly string[];
}

/** Full validation spec for one source layer. */
export interface PropertyValidationRule {
  /** Source layer name. */
  layer: SourceLayerName;
  /** Map of property name → constraint. */
  properties: Record<string, PropertyRule>;
}

/** Result of validating a single feature's properties. */
export interface PropertyValidationResult {
  /** Layer the feature came from. */
  layer: SourceLayerName;
  /** Index of the feature within the tile (for debugging). */
  featureIndex: number;
  /** Whether all checks passed. */
  valid: boolean;
  /** Individual property findings. */
  findings: PropertyFinding[];
}

export interface PropertyFinding {
  property: string;
  /** "ok" | "missing-required" | "wrong-type" | "out-of-range" | "bad-enum" | "bad-pattern" */
  status:
    | "ok"
    | "missing-required"
    | "wrong-type"
    | "out-of-range"
    | "bad-enum"
    | "bad-pattern";
  message: string;
}

// ── Known company_id values ───────────────────────────────────────────────────

export const KNOWN_COMPANY_IDS = [
  "canfor",
  "west-fraser",
  "tolko",
  "interfor",
  "western-forest-products",
  "bc-timber-sales",
  "mosaic",
  "weyerhaeuser",
  "teal-jones",
  "san-group",
  "conifex",
  "dunkley",
  "carrier",
  "gorman",
  "canoe-forest",
  "other",
] as const;

export type CompanyId = typeof KNOWN_COMPANY_IDS[number];

// ── Validation rules (one entry per source layer) ─────────────────────────────

export const TILE_PROPERTY_RULES: PropertyValidationRule[] = [
  {
    layer: "forest-age",
    properties: {
      class: {
        required: true,
        type: "string",
        enum: ["old-growth", "mature", "young", "harvested"],
      },
      age: {
        required: false,
        type: "number",
        min: 0,
        max: 2000,
      },
      species: {
        required: false,
        type: "string",
      },
    },
  },
  {
    layer: "tenure-cutblocks",
    properties: {
      company_id: {
        required: true,
        type: "string",
        enum: KNOWN_COMPANY_IDS,
      },
      PLANNED_GROSS_BLOCK_AREA: {
        required: true,
        type: "number",
        min: 0.01,
        max: 100000,
      },
      DISTURBANCE_START_DATE: {
        required: false,
        type: "string",
        pattern: /^\d{4}/,
      },
    },
  },
  {
    layer: "fire-history",
    properties: {
      FIRE_YEAR: {
        required: true,
        type: "string",
        pattern: /^\d{4}/,
      },
      FIRE_SIZE_HECTARES: {
        required: false,
        type: "number",
        min: 0,
        max: 10000000,
      },
      FIRE_CAUSE: {
        required: false,
        type: "string",
      },
    },
  },
  {
    layer: "parks",
    properties: {
      name: {
        required: true,
        type: "string",
      },
      designation: {
        required: false,
        type: "string",
      },
    },
  },
  {
    layer: "conservancies",
    properties: {
      name: {
        required: true,
        type: "string",
      },
    },
  },
  {
    layer: "ogma",
    properties: {
      OGMA_TYPE: {
        required: false,
        type: "string",
      },
      LANDSCAPE_UNIT_NAME: {
        required: false,
        type: "string",
      },
    },
  },
  {
    layer: "wildlife-habitat-areas",
    properties: {
      COMMON_SPECIES_NAME: {
        required: false,
        type: "string",
      },
      HABITAT_AREA_ID: {
        required: false,
        type: "number",
        min: 0,
        max: 99999999,
      },
    },
  },
  {
    layer: "ungulate-winter-range",
    properties: {
      SPECIES_1: {
        required: false,
        type: "string",
      },
      UWR_TAG: {
        required: false,
        type: "string",
      },
    },
  },
  {
    layer: "community-watersheds",
    properties: {
      CW_NAME: {
        // Required with WARN semantics: the caller should treat a missing
        // CW_NAME as a warning rather than a hard failure. The validator
        // marks it required so callers see the finding; the audit script
        // decides the severity.
        required: true,
        type: "string",
      },
      AREA_HA: {
        required: false,
        type: "number",
        min: 0,
        max: 1000000,
      },
    },
  },
  {
    layer: "mining-claims",
    properties: {
      TENURE_TYPE_DESCRIPTION: {
        required: true,
        type: "string",
      },
      OWNER_NAME: {
        required: false,
        type: "string",
      },
      TENURE_STATUS: {
        required: false,
        type: "string",
      },
    },
  },
  {
    layer: "forestry-roads",
    properties: {
      ROAD_SECTION_NAME: {
        required: false,
        type: "string",
      },
      CLIENT_NAME: {
        required: false,
        type: "string",
      },
    },
  },
  {
    layer: "conservation-priority",
    properties: {
      TAP_CLASSIFICATION_LABEL: {
        required: false,
        type: "string",
      },
      LANDSCAPE_UNIT_NAME: {
        required: false,
        type: "string",
      },
      ANCIENT_FOREST_IND: {
        required: false,
        type: "string",
      },
      PRIORITY_BIG_TREED_OG_IND: {
        required: false,
        type: "string",
      },
      BGC_LABEL: {
        required: false,
        type: "string",
      },
      FIELD_VERIFIED_IND: {
        required: false,
        type: "string",
      },
      FEATURE_AREA_SQM: {
        required: false,
        type: "number",
        min: 0,
        max: 100000000000,
      },
    },
  },
];

// Build a lookup map for fast access by layer name.
const RULES_BY_LAYER = new Map<SourceLayerName, PropertyValidationRule>(
  TILE_PROPERTY_RULES.map((r) => [r.layer, r])
);

// ── Validation function ───────────────────────────────────────────────────────

/**
 * Validate a single MVT feature's properties against the rule for its layer.
 *
 * @param layer        - The source layer name.
 * @param props        - The decoded properties from the MVT feature.
 * @param featureIndex - Feature position within the tile (for reporting only).
 * @returns            PropertyValidationResult, or null if no rule exists.
 */
export function validateTileFeatureProperties(
  layer: SourceLayerName,
  props: Record<string, unknown>,
  featureIndex: number
): PropertyValidationResult | null {
  const rule = RULES_BY_LAYER.get(layer);
  if (!rule) return null;

  const findings: PropertyFinding[] = [];

  for (const [propName, constraint] of Object.entries(rule.properties)) {
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
      // Optional missing values are fine — no finding.
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
        ]
          .filter(Boolean)
          .join(", ");
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

  return {
    layer,
    featureIndex,
    valid,
    findings,
  };
}
