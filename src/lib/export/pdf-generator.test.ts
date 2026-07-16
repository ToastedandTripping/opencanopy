/**
 * PDF export self-consistency regression tests (Razor residual NOTE on
 * src/lib/export/pdf-generator.ts:248-256, from the co2-calculator-redesign
 * relay).
 *
 * The exported Conservation Report's headline tonnage is the rounded figure
 * (co2.rounded = presentCo2Tonnes(stats.totalCo2eTonnes).rounded), but the
 * cars/homes/flights equivalences directly below it were still being read
 * off the raw stats.equivalences (computed off the un-rounded tonnage) --
 * the same self-consistency bug CalculatorPanel.tsx (panel + Share) already
 * had fixed. This mirrors CalculatorPanel.test.tsx's regression guards for
 * that same class of bug, applied to the PDF generator.
 *
 * `generateReport` is the only exported entry point (`buildReportHtml` is
 * intentionally private) -- so these tests drive it through its real public
 * API and capture the HTML string handed to `document.write` via a mocked
 * `window.open`, rather than reaching into module internals.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { generateReport } from "./pdf-generator";
import type { SelectionStats } from "@/lib/carbon";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const FULL_PRECISION_STATS: SelectionStats = {
  totalCarbonTonnes: 336_367.9,
  totalCo2eTonnes: 1_234_567.89, // deliberately NOT a round number
  totalAreaHa: 4321.6,
  oldGrowthHa: 3000,
  matureHa: 1000,
  youngHa: 321.6,
  harvestedHa: 0,
  unknownHa: 0,
  speciesBreakdown: { CW: 3000, FD: 1321.6 },
  // Deliberately computed off the raw 1,234,567.89 total (not the rounded
  // 1,230,000 headline) -- these must NOT appear anywhere in the report.
  equivalences: { cars: 267805, homes: 164609, flights: 771605 },
  featureCount: 42,
};

/** Drives generateReport() through a mocked window.open and returns the HTML
 *  string passed to document.write. */
function captureReportHtml(
  overrides: Partial<Parameters<typeof generateReport>[0]> = {}
): string {
  let captured = "";
  const fakeWindow = {
    document: {
      write: (html: string) => {
        captured = html;
      },
      close: vi.fn(),
    },
    print: vi.fn(),
  };
  vi.spyOn(window, "open").mockReturnValue(fakeWindow as unknown as Window);
  vi.useFakeTimers();

  generateReport({
    mapImageDataUrl: "data:image/png;base64,",
    stats: FULL_PRECISION_STATS,
    financial: null,
    enabledLayers: [],
    timestamp: "July 16, 2026",
    ...overrides,
  });

  vi.runAllTimers();
  return captured;
}

describe("pdf-generator equivalences self-consistency (critic X4)", () => {
  it("derives cars/homes/flights from the rounded tonnage, not the raw stats.equivalences", () => {
    const html = captureReportHtml();

    // 1,234,567.89 -> presentCo2Tonnes -> rounded 1,230,000 (3 sig figs).
    const carsFromRounded = Math.round(1_230_000 / 4.61).toLocaleString("en-CA");
    const homesFromRounded = Math.round(1_230_000 / 7.5).toLocaleString("en-CA");
    const flightsFromRounded = Math.round(1_230_000 / 1.6).toLocaleString("en-CA");

    expect(html).toContain(carsFromRounded);
    expect(html).toContain(homesFromRounded);
    expect(html).toContain(flightsFromRounded);

    // The raw-fixture-derived figures (computed off the un-rounded total)
    // must not leak into the report anywhere.
    const carsFromRawFixture = FULL_PRECISION_STATS.equivalences.cars.toLocaleString("en-CA");
    const homesFromRawFixture = FULL_PRECISION_STATS.equivalences.homes.toLocaleString("en-CA");
    const flightsFromRawFixture = FULL_PRECISION_STATS.equivalences.flights.toLocaleString("en-CA");
    expect(html).not.toContain(carsFromRawFixture);
    expect(html).not.toContain(homesFromRawFixture);
    expect(html).not.toContain(flightsFromRawFixture);
  });

  it("still shows the rounded headline tonnage, never the raw full-precision figure", () => {
    const html = captureReportHtml();
    expect(html).toContain("1,230,000");
    expect(html).not.toContain("1,234,567");
    expect(html).not.toContain("1,234,568");
  });
});

describe("pdf-generator watershed area label", () => {
  it('labels the non-watershed area "hectares (forested area analyzed)"', () => {
    const html = captureReportHtml();
    expect(html).toContain("hectares (forested area analyzed)");
  });

  // ReportOptions never carries the watershed's own official AREA_HA -- only
  // `stats`, whose totalAreaHa is always the summed/clipped forest-polygon
  // area from calculateSelectionStats. A bare "hectares" label on the
  // watershed path would imply the unclipped official area, which the PDF
  // never actually prints.
  it('labels the watershed area "hectares (forested area analyzed)" too, since stats.totalAreaHa is always the clipped forest area, not the official watershed AREA_HA', () => {
    const html = captureReportHtml({ watershedName: "Seymour Watershed" });
    expect(html).toContain("hectares (forested area analyzed)");
    expect(html).not.toMatch(/>\s*4,321\.6\s*<span[^>]*>\s*hectares\s*</);
  });
});
