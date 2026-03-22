import area from "@turf/area";
import {
  CARBON_MARKETS,
  STUMPAGE_RATE,
  TIMBER_VOLUME,
  ECOSYSTEM_SERVICES_PER_HA,
} from "./markets";

// ── Carbon density methodology ─────────────────────────────────────────
//
// Values represent upper-range estimates for total ecosystem carbon stock
// (above-ground biomass + root systems + soil organic carbon + deadwood)
// expressed as tonnes C per hectare at maturity.
//
// Growth is modeled as a logistic curve: C(age) = C_max * (1 - e^(-k * age))
//
// Sources:
//   - Kurz et al. 2013 (CBM-CFS3 carbon budget model of the Canadian forest sector)
//   - Smithwick et al. 2002 (Pacific Northwest old-growth carbon pools)
//   - BC Carbon Stock Estimation Framework (provincial VRI-based methods)
//
// These values are directionally correct but may overestimate by 10-20%
// compared to conservative published ranges, because they include the full
// ecosystem pool rather than merchantable timber only. The tool produces
// approximate estimates for comparative purposes, not audited carbon
// accounting.
//
// ── Species-specific carbon density ────────────────────────────────────
// Tonnes C per hectare at maturity.
// Logistic growth model: C(age) = C_max * (1 - e^(-k * age))

const CARBON_DENSITY: Record<string, { max: number; k: number }> = {
  CW: { max: 350, k: 0.008 }, // Western Red Cedar
  HW: { max: 400, k: 0.008 }, // Western Hemlock
  FD: { max: 300, k: 0.008 }, // Douglas-fir
  SS: { max: 350, k: 0.008 }, // Sitka Spruce
  PL: { max: 140, k: 0.012 }, // Lodgepole Pine
  SX: { max: 200, k: 0.01 }, // Spruce hybrid
  BA: { max: 250, k: 0.008 }, // Amabilis Fir
  AT: { max: 115, k: 0.012 }, // Trembling Aspen
  YC: { max: 300, k: 0.006 }, // Yellow Cedar
  DEFAULT: { max: 250, k: 0.008 }, // Unknown species fallback
};

// ── Equivalence conversions ────────────────────────────────────────────

const EQUIVALENCES = {
  carsPerYear: 4.61, // tonnes CO2 per car per year (EPA 2024)
  homesPerYear: 7.5, // tonnes CO2 per Canadian home per year
  flightsYvrYyz: 1.6, // tonnes CO2 per Vancouver-Toronto round trip
};

// ── Age classification ─────────────────────────────────────────────────

export type AgeClass = "old-growth" | "mature" | "young" | "harvested" | "unknown";

function classifyAge(
  age: number | null | undefined,
  hasHarvestDate: boolean
): AgeClass {
  if (age === null || age === undefined || age <= 0) {
    return hasHarvestDate ? "harvested" : "unknown";
  }
  if (age >= 250) return "old-growth";
  if (age >= 80) return "mature";
  return "young";
}

// ── Single feature calculation ─────────────────────────────────────────

export interface FeatureCarbon {
  carbonTonnes: number;
  co2eTonnes: number;
  areaHa: number;
  ageClass: AgeClass;
  species: string;
}

export function calculateFeatureCarbon(
  feature: GeoJSON.Feature
): FeatureCarbon {
  // 1. Area: @turf/area returns m^2, convert to hectares
  const areaSqm = feature.geometry ? area(feature) : 0;
  const areaHa = areaSqm / 10000;

  // 2. Species code from VRI properties
  const props = feature.properties ?? {};
  const species: string =
    (props.SPECIES_CD_1 as string) ??
    (props.classification as string) ??
    "DEFAULT";

  // 3. Age from VRI properties
  const rawAge = props.PROJ_AGE_1;
  const age = typeof rawAge === "number" ? rawAge : null;

  // 4. Age class (also read from pre-classified `class` property if available)
  const preClassified = props.class as string | undefined;
  const hasHarvestDate = props.HARVEST_DATE != null;
  const ageClass: AgeClass =
    preClassified &&
    ["old-growth", "mature", "young", "harvested", "unknown"].includes(preClassified)
      ? (preClassified as AgeClass)
      : classifyAge(age, hasHarvestDate);

  // 5. Carbon density calculation
  const density = CARBON_DENSITY[species] ?? CARBON_DENSITY.DEFAULT;
  const effectiveAge = age ?? 0;
  const carbonPerHa =
    density.max * (1 - Math.exp(-density.k * effectiveAge));
  const carbonTonnes = carbonPerHa * areaHa;

  // 6. CO2 equivalent (carbon weight * 3.67 = CO2 weight)
  const co2eTonnes = carbonTonnes * 3.67;

  return {
    carbonTonnes,
    co2eTonnes,
    areaHa,
    ageClass,
    species,
  };
}

// ── Aggregate calculation ──────────────────────────────────────────────

export interface SelectionStats {
  totalCarbonTonnes: number;
  totalCo2eTonnes: number;
  totalAreaHa: number;
  oldGrowthHa: number;
  matureHa: number;
  youngHa: number;
  harvestedHa: number;
  unknownHa: number;
  speciesBreakdown: Record<string, number>;
  equivalences: {
    cars: number;
    homes: number;
    flights: number;
  };
  featureCount: number;
}

export function calculateSelectionStats(
  features: GeoJSON.Feature[]
): SelectionStats {
  const stats: SelectionStats = {
    totalCarbonTonnes: 0,
    totalCo2eTonnes: 0,
    totalAreaHa: 0,
    oldGrowthHa: 0,
    matureHa: 0,
    youngHa: 0,
    harvestedHa: 0,
    unknownHa: 0,
    speciesBreakdown: {},
    equivalences: { cars: 0, homes: 0, flights: 0 },
    featureCount: features.length,
  };

  for (const feature of features) {
    const result = calculateFeatureCarbon(feature);

    stats.totalCarbonTonnes += result.carbonTonnes;
    stats.totalCo2eTonnes += result.co2eTonnes;
    stats.totalAreaHa += result.areaHa;

    // Age class area breakdown
    switch (result.ageClass) {
      case "old-growth":
        stats.oldGrowthHa += result.areaHa;
        break;
      case "mature":
        stats.matureHa += result.areaHa;
        break;
      case "young":
        stats.youngHa += result.areaHa;
        break;
      case "harvested":
        stats.harvestedHa += result.areaHa;
        break;
      case "unknown":
        stats.unknownHa += result.areaHa;
        break;
    }

    // Species breakdown (hectares per species)
    const sp = result.species || "DEFAULT";
    stats.speciesBreakdown[sp] = (stats.speciesBreakdown[sp] ?? 0) + result.areaHa;
  }

  // Equivalence conversions
  stats.equivalences.cars = stats.totalCo2eTonnes / EQUIVALENCES.carsPerYear;
  stats.equivalences.homes = stats.totalCo2eTonnes / EQUIVALENCES.homesPerYear;
  stats.equivalences.flights =
    stats.totalCo2eTonnes / EQUIVALENCES.flightsYvrYyz;

  return stats;
}

// ── Financial value calculation ────────────────────────────────────────

export interface FinancialValue {
  carbonValues: { market: string; value: number }[];
  stumpageRevenue: number; // one-time logging revenue
  ecosystemServicesAnnual: number; // annual ecosystem services (excl. carbon)
}

export function calculateFinancialValue(
  stats: SelectionStats
): FinancialValue {
  // Carbon value: total CO2e * price per tonne
  // This represents AVOIDED EMISSIONS -- the one-time credit value of
  // keeping this carbon stored rather than releasing it through logging.
  // Directly comparable to one-time stumpage revenue.
  const carbonValues = CARBON_MARKETS.map((m) => ({
    market: m.label,
    value: stats.totalCo2eTonnes * m.pricePerTonne,
  }));

  // Stumpage: sum of (hectares * timber volume * stumpage rate) per age class
  const stumpageRevenue =
    stats.oldGrowthHa * TIMBER_VOLUME["old-growth"] * STUMPAGE_RATE.perCubicMetre +
    stats.matureHa * TIMBER_VOLUME["mature"] * STUMPAGE_RATE.perCubicMetre +
    stats.youngHa * TIMBER_VOLUME["young"] * STUMPAGE_RATE.perCubicMetre +
    stats.unknownHa * TIMBER_VOLUME["unknown"] * STUMPAGE_RATE.perCubicMetre;

  // Ecosystem services: total forested area * annual rate
  const forestedHa = stats.totalAreaHa - stats.harvestedHa;
  const ecosystemServicesAnnual = forestedHa * ECOSYSTEM_SERVICES_PER_HA;

  return { carbonValues, stumpageRevenue, ecosystemServicesAnnual };
}
