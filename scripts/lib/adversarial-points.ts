/**
 * Adversarial test points for the OpenCanopy audit pipeline.
 *
 * Each point targets a specific real-world location where we have strong
 * prior knowledge about what the data should (or should not) contain.
 * These are "ground truth" checks -- if the tile data disagrees with known
 * reality, something is wrong with the pipeline or source data.
 *
 * expectedValue types:
 *   string         -- exact match on a property value
 *   RegExp         -- pattern match on a property value
 *   { gt: number } -- numeric range check (value must be greater than)
 *   null           -- absence check: NO features expected at this location
 */

export type ExpectedValue = string | RegExp | { gt: number } | null;

export interface AdversarialPoint {
  /** Human-readable name for reporting */
  name: string;
  lat: number;
  lon: number;
  /** The MVT source layer to inspect */
  layer: string;
  /**
   * What we expect to find (or not find) at this location.
   * null = absence check: the layer should have NO features here.
   */
  expectedValue: ExpectedValue;
  /**
   * The property key to check when expectedValue is a string/RegExp/range.
   * Not needed for absence checks (expectedValue === null).
   */
  propertyKey?: string;
  /** Human-readable description of what this check verifies */
  description: string;
}

/**
 * 9 adversarial test locations covering BC's key conservation, forestry,
 * and resource-management contexts.
 *
 * Selection rationale:
 * - Mix of presence checks (we know data must be here) and absence checks
 *   (we know data must NOT be here -- e.g. water body for forest age)
 * - Covers all major layer types in the OpenCanopy archive
 * - Real high-stakes locations where data errors would matter most
 */
export const ADVERSARIAL_POINTS: AdversarialPoint[] = [
  {
    name: "Garibaldi Provincial Park",
    lat: 49.92,
    lon: -122.73,
    layer: "parks",
    expectedValue: /Garibaldi/i,
    propertyKey: "name",
    description: "Park boundary must be present at Garibaldi Provincial Park",
  },
  {
    name: "Fairy Creek Watershed",
    lat: 48.66,
    lon: -124.52,
    layer: "tenure-cutblocks",
    expectedValue: /./,   // any non-empty value -- active cutblocks exist here
    propertyKey: "company_id",
    description: "Active cutblocks must be present in Fairy Creek watershed",
  },
  {
    name: "Great Bear Rainforest",
    lat: 52.5,
    lon: -128.2,
    layer: "conservancies",
    expectedValue: /./,   // any value -- conservancy boundary must exist
    propertyKey: "name",
    description: "Conservancy boundary must be present in Great Bear Rainforest",
  },
  {
    name: "Revelstoke Logging Area",
    lat: 51.0,
    lon: -118.2,
    layer: "tenure-cutblocks",
    expectedValue: /./,   // company_id present (any non-empty value)
    propertyKey: "company_id",
    description: "Cutblocks with company identifier must be present near Revelstoke",
  },
  {
    name: "Pacific Ocean (West Vancouver Island)",
    lat: 49.5,
    lon: -128.5,
    layer: "forest-age",
    expectedValue: null,  // absence check -- open Pacific Ocean, no land
    propertyKey: undefined,
    description: "NO forest-age features expected in open Pacific Ocean",
  },
  {
    name: "Lytton 2021 Fire",
    lat: 50.23,
    lon: -121.58,
    layer: "fire-history",
    expectedValue: { gt: 2019 }, // FIRE_YEAR should be ~2021
    propertyKey: "FIRE_YEAR",
    description: "Fire history must show FIRE_YEAR ~2021 near Lytton",
  },
  {
    name: "Highland Valley Mine",
    lat: 50.48,
    lon: -121.05,
    layer: "mining-claims",
    expectedValue: /./,   // any value -- mining tenure exists here
    propertyKey: "TENURE_TYPE_DESCRIPTION",
    description: "Mining tenure must be present at Highland Valley copper mine",
  },
  {
    name: "Vancouver Watershed",
    lat: 49.41,
    lon: -122.9,
    layer: "community-watersheds",
    expectedValue: /./,   // watershed name present
    propertyKey: "CW_NAME",
    description: "Watershed name must be present in Greater Vancouver watershed",
  },
  {
    name: "Strathcona Provincial Park",
    lat: 49.63,
    lon: -125.75,
    layer: "parks",
    expectedValue: /Strathcona/i,
    propertyKey: "name",
    description: "Park boundary must be present at Strathcona Provincial Park",
  },
];
