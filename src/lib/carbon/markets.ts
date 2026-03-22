// ── Carbon market pricing ────────────────────────────────────────────
//
// Reference pricing for BC carbon markets and timber stumpage.
// Carbon values represent AVOIDED EMISSIONS -- the CO2e that would be
// released if the forest were logged. This is a one-time credit value,
// comparable to one-time logging revenue (stumpage).
//
// Sources:
//   - BC GGIRCA 2026 (compliance carbon price)
//   - Verra / Gold Standard voluntary market averages
//   - FLNRORD stumpage tables (BC average)
//   - Costanza et al. 2014 (ecosystem services, excl. carbon)

export interface CarbonMarket {
  id: string;
  label: string;
  pricePerTonne: number; // $/tonne CO2e
  source: string;
}

export interface StumpageRate {
  id: string;
  label: string;
  perCubicMetre: number; // $/m³
  source: string;
}

export const CARBON_MARKETS: CarbonMarket[] = [
  {
    id: "bc-compliance",
    label: "BC Compliance",
    pricePerTonne: 94,
    source: "BC GGIRCA 2026",
  },
  {
    id: "voluntary-high",
    label: "Voluntary (premium)",
    pricePerTonne: 40,
    source: "Nature-based voluntary avg",
  },
  {
    id: "voluntary-low",
    label: "Voluntary (standard)",
    pricePerTonne: 25,
    source: "Verra/Gold Standard avg",
  },
];

export const STUMPAGE_RATE: StumpageRate = {
  id: "bc-avg",
  label: "BC Average Stumpage",
  perCubicMetre: 24,
  source: "FLNRORD stumpage tables",
};

// Approximate merchantable timber volume (m³/ha) by age class
export const TIMBER_VOLUME: Record<string, number> = {
  "old-growth": 800,
  mature: 500,
  young: 150,
  harvested: 0,
  unknown: 200,
};

// Annual ecosystem services value ($/ha/year) EXCLUDING carbon
// Uses non-carbon services only (water filtration, habitat, recreation)
// to avoid double-counting with the carbon credit values above.
// Source: Costanza et al. 2014, temperate forest avg (~$3,800/ha/yr total
// ecosystem services); carbon component removed (~40%), leaving ~$2,300.
export const ECOSYSTEM_SERVICES_PER_HA = 2300;
