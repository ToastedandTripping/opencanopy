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
}

// ── Primary palette (7 companies, highest luminance contrast) ──────
// These are BC's largest forestry licensees by tenure area.

export const COMPANY_REGISTRY: CompanyProfile[] = [
  // Primary 7
  { id: "canfor", clientNumbers: ["00001271"], displayName: "Canfor", color: "#e11d48" },
  { id: "west-fraser", clientNumbers: ["00142662"], displayName: "West Fraser", color: "#2563eb" },
  { id: "tolko", clientNumbers: ["00147603"], displayName: "Tolko", color: "#eab308" },
  { id: "interfor", clientNumbers: ["00002176"], displayName: "Interfor", color: "#d97706" },
  { id: "western-forest-products", clientNumbers: ["00149081"], displayName: "Western Forest Products", color: "#0891b2" },
  { id: "bc-timber-sales", clientNumbers: ["00109260"], displayName: "BC Timber Sales", color: "#22c55e" },
  { id: "mosaic", clientNumbers: ["00160953"], displayName: "Mosaic Forest Management", color: "#c026d3" },

  // Secondary 8
  { id: "weyerhaeuser", clientNumbers: ["00000230"], displayName: "Weyerhaeuser", color: "#ea580c" },
  { id: "teal-jones", clientNumbers: ["00007629"], displayName: "Teal Jones", color: "#a855f7" },
  { id: "san-group", clientNumbers: ["00148968"], displayName: "San Group", color: "#65a30d" },
  { id: "conifex", clientNumbers: ["00155498"], displayName: "Conifex", color: "#db2777" },
  { id: "dunkley", clientNumbers: ["00001701"], displayName: "Dunkley Lumber", color: "#ca8a04" },
  { id: "carrier", clientNumbers: ["00001297"], displayName: "Carrier Lumber", color: "#16a34a" },
  { id: "gorman", clientNumbers: ["00003248"], displayName: "Gorman Bros", color: "#f97316" },
  { id: "canoe-forest", clientNumbers: ["00166320"], displayName: "Canoe Forest Products", color: "#14b8a6" },
];

/** Build a MapLibre match expression for fill-color by company_id */
export function companyColorExpression(): unknown[] {
  const entries: unknown[] = [];
  for (const company of COMPANY_REGISTRY) {
    entries.push(company.id, company.color);
  }
  return ["match", ["get", "company_id"], ...entries, "#6b7280"];
}
