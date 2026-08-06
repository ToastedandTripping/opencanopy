/**
 * BC logging company registry for the accountability layer.
 *
 * Maps CLIENT_NUMBER (the reliable government key) to company profiles.
 * Colors chosen for dark-mode contrast and deuteranopia/protanopia safety:
 * primary 7 use high luminance contrast, secondary 8 fill remaining slots.
 *
 * Source: FTEN_CUT_BLOCK_POLY_SVW via BC DataBC WFS.
 * Last verified: 2026-03-21
 */

export interface CompanyProfile {
  /** URL-safe slug: "canfor", "west-fraser" */
  id: string;
  /** All CLIENT_NUMBER values for this entity (zero-padded 8-digit strings) */
  clientNumbers: string[];
  /** Display name */
  displayName: string;
  /** Palette color (hex) */
  color: string;
  /** Whether this company actually appears in the current (v10) tile data.
   *  Drives both the legend and the fill-color expression so the map never
   *  shows a swatch for a company with zero features, nor a real company in
   *  the gray "Other" bucket. Verified against the preprocessed cutblock data
   *  on 2026-06-02 (8 distinct company_id values: 7 named + "other"). */
  present?: boolean;
}

// ── Company registry ───────────────────────────────────────────────
// BC forestry licensees keyed by URL-safe slug. `present` marks the ones that
// occur in the current tile data; the rest are kept as known licensees (with
// their CLIENT_NUMBER mapping) so re-runs of the tile pipeline can flip them on
// without re-deriving colors.

export const COMPANY_REGISTRY: CompanyProfile[] = [
  { id: "canfor", clientNumbers: ["00001271"], displayName: "Canfor", color: "#e11d48", present: true },
  { id: "west-fraser", clientNumbers: ["00142662"], displayName: "West Fraser", color: "#2563eb", present: true },
  { id: "tolko", clientNumbers: ["00147603"], displayName: "Tolko", color: "#eab308", present: true },
  { id: "interfor", clientNumbers: ["00002176"], displayName: "Interfor", color: "#d97706", present: true },
  { id: "western-forest-products", clientNumbers: ["00149081"], displayName: "Western Forest Products", color: "#0891b2", present: true },
  { id: "bc-timber-sales", clientNumbers: ["00109260"], displayName: "BC Timber Sales", color: "#22c55e" },
  { id: "mosaic", clientNumbers: ["00160953"], displayName: "Mosaic Forest Management", color: "#c026d3" },
  { id: "weyerhaeuser", clientNumbers: ["00000230"], displayName: "Weyerhaeuser", color: "#ea580c" },
  { id: "teal-jones", clientNumbers: ["00007629"], displayName: "Teal Jones", color: "#a855f7" },
  { id: "san-group", clientNumbers: ["00148968"], displayName: "San Group", color: "#65a30d" },
  { id: "conifex", clientNumbers: ["00155498"], displayName: "Conifex", color: "#db2777" },
  { id: "dunkley", clientNumbers: ["00001701"], displayName: "Dunkley Lumber", color: "#ca8a04" },
  { id: "carrier", clientNumbers: ["00001297"], displayName: "Carrier Lumber", color: "#16a34a", present: true },
  { id: "gorman", clientNumbers: ["00003248"], displayName: "Gorman Bros", color: "#f97316" },
  { id: "canoe-forest", clientNumbers: ["00166320"], displayName: "Canoe Forest Products", color: "#14b8a6", present: true },
];

/** Companies that actually appear in the current tile data, in registry order. */
export const PRESENT_COMPANIES = COMPANY_REGISTRY.filter((c) => c.present);

/** Gray swatch used for unlisted licensees ("other" / not-yet-mapped). */
export const OTHER_COMPANY_COLOR = "#6b7280";

// ── Client number → slug lookup ────────────────────────────────────────
// Canonical mapping from zero-padded CLIENT_NUMBER to company slug.
// The proxy and extractors keep local copies; consistency tests guard them.

const SLUG_BY_CLIENT_NUMBER = new Map<string, string>();
for (const c of COMPANY_REGISTRY) {
  for (const cn of c.clientNumbers) {
    SLUG_BY_CLIENT_NUMBER.set(cn, c.id);
  }
}

/**
 * Look up a company slug from a CLIENT_NUMBER value.
 * Handles zero-padding internally — callers can pass raw or padded values.
 * Returns "other" for unknown client numbers.
 */
export function lookupCompany(clientNumber: string): string {
  const padded = clientNumber.padStart(8, "0");
  return SLUG_BY_CLIENT_NUMBER.get(padded) ?? "other";
}

const DISPLAY_NAME_BY_ID = new Map(
  COMPANY_REGISTRY.map((c) => [c.id, c.displayName])
);

/**
 * Resolve a company_id slug to a human display name.
 * Falls back to a title-cased slug for "other" and any unmapped id, so popups
 * never show a raw slug like "west-fraser".
 */
export function getCompanyDisplayName(id: string): string {
  const known = DISPLAY_NAME_BY_ID.get(id);
  if (known) return known;
  return id
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Build a MapLibre match expression for fill-color by company_id.
 *  Only present companies get a color; everything else falls to the gray
 *  "Other" swatch (matching the legend). */
export function companyColorExpression(): unknown[] {
  const entries: unknown[] = [];
  for (const company of PRESENT_COMPANIES) {
    entries.push(company.id, company.color);
  }
  return ["match", ["get", "company_id"], ...entries, OTHER_COMPANY_COLOR];
}
