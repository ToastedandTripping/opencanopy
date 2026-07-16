/**
 * CalculatorPanel status-gating + honesty regression tests (relay plan
 * jazzy-gathering-codd, critic X3/X4).
 *
 * Covers:
 *   - Share/Export are disabled outside calcStatus === "ok" (X4 gate-blocker).
 *   - Share text uses the rounded/banded figure, never full precision.
 *   - The headline number never renders in loading/no-data/error/too-large.
 *
 * happy-dom env, no jest-dom matchers -- assert via plain DOM queries, as
 * the sibling LayerPanel.test.tsx does.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { CalculatorPanel } from "./CalculatorPanel";
import type { SelectionStats } from "@/lib/carbon";

afterEach(cleanup);

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
  equivalences: { cars: 267805, homes: 164609, flights: 771605 },
  featureCount: 42,
};

function stubClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  // Ensure the Web Share API branch isn't taken so the clipboard path (which
  // we can inspect) is exercised.
  Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
  return writeText;
}

beforeEach(() => {
  stubClipboard();
});

function getButtons(container: HTMLElement) {
  const buttons = Array.from(container.querySelectorAll("button"));
  return {
    export: buttons.find((b) => b.textContent === "Export"),
    share: buttons.find((b) => b.textContent === "Share"),
  };
}

describe("CalculatorPanel status gating (X4)", () => {
  it("disables Export and Share while loading", () => {
    const { container } = render(
      <CalculatorPanel
        calcStatus="loading"
        stats={null}
        areaHa={null}
        visible
        onClose={vi.fn()}
        onExport={vi.fn()}
      />
    );
    // Two copies render (desktop + mobile), assert every one is disabled.
    const buttons = Array.from(container.querySelectorAll("button")).filter(
      (b) => b.textContent === "Export" || b.textContent === "Share"
    );
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) expect(b.disabled).toBe(true);
  });

  it("disables Export and Share in no-data", () => {
    const { container } = render(
      <CalculatorPanel
        calcStatus="no-data"
        stats={null}
        areaHa={null}
        visible
        onClose={vi.fn()}
        onExport={vi.fn()}
      />
    );
    const { export: exportBtn, share } = getButtons(container);
    expect(exportBtn?.disabled).toBe(true);
    expect(share?.disabled).toBe(true);
  });

  it("disables Export and Share in error", () => {
    const { container } = render(
      <CalculatorPanel
        calcStatus="error"
        stats={null}
        areaHa={null}
        visible
        onClose={vi.fn()}
        onExport={vi.fn()}
        errorInfo={{ message: "Forest data unavailable — try again." }}
      />
    );
    const { export: exportBtn, share } = getButtons(container);
    expect(exportBtn?.disabled).toBe(true);
    expect(share?.disabled).toBe(true);
  });

  it("disables Export and Share in too-large (guard-refused draw)", () => {
    const { container } = render(
      <CalculatorPanel
        calcStatus="too-large"
        stats={null}
        areaHa={null}
        visible
        onClose={vi.fn()}
        onExport={vi.fn()}
      />
    );
    const { export: exportBtn, share } = getButtons(container);
    expect(exportBtn?.disabled).toBe(true);
    expect(share?.disabled).toBe(true);
    // Never a number in this state.
    expect(container.textContent).not.toMatch(/tonnes/);
  });

  it("enables Export and Share once calcStatus is ok", () => {
    const { container } = render(
      <CalculatorPanel
        calcStatus="ok"
        stats={FULL_PRECISION_STATS}
        areaHa={FULL_PRECISION_STATS.totalAreaHa}
        visible
        onClose={vi.fn()}
        onExport={vi.fn()}
      />
    );
    const { export: exportBtn, share } = getButtons(container);
    expect(exportBtn?.disabled).toBe(false);
    expect(share?.disabled).toBe(false);
  });

  it("Share text uses the rounded/banded figure, never the full-precision tonnage", async () => {
    const writeText = stubClipboard();
    const { container } = render(
      <CalculatorPanel
        calcStatus="ok"
        stats={FULL_PRECISION_STATS}
        areaHa={FULL_PRECISION_STATS.totalAreaHa}
        visible
        onClose={vi.fn()}
      />
    );
    const { share } = getButtons(container);
    expect(share).toBeTruthy();
    fireEvent.click(share!);
    // Allow the async handler's microtasks to flush.
    await Promise.resolve();
    await Promise.resolve();

    expect(writeText).toHaveBeenCalled();
    const text = writeText.mock.calls[0][0] as string;
    // Rounded to ~3 sig figs (1,234,567.89 -> 1,230,000), never the raw figure.
    expect(text).toContain("1,230,000");
    expect(text).not.toContain("1,234,567");
    expect(text).not.toContain("1,234,568");
    // Carries the one-sided (not symmetric +/-) honesty disclosure.
    expect(text).toMatch(/up to ~20% lower/);
    expect(text).not.toMatch(/±/);
  });

  it("Export callback is never invoked while not ok, even if the button is clicked programmatically", () => {
    const onExport = vi.fn();
    const { container } = render(
      <CalculatorPanel
        calcStatus="loading"
        stats={null}
        areaHa={null}
        visible
        onClose={vi.fn()}
        onExport={onExport}
      />
    );
    const { export: exportBtn } = getButtons(container);
    fireEvent.click(exportBtn!);
    expect(onExport).not.toHaveBeenCalled();
  });

  it("Export callback fires when calcStatus is ok", () => {
    const onExport = vi.fn();
    const { container } = render(
      <CalculatorPanel
        calcStatus="ok"
        stats={FULL_PRECISION_STATS}
        areaHa={FULL_PRECISION_STATS.totalAreaHa}
        visible
        onClose={vi.fn()}
        onExport={onExport}
      />
    );
    const { export: exportBtn } = getButtons(container);
    fireEvent.click(exportBtn!);
    expect(onExport).toHaveBeenCalledTimes(1);
  });

  it("never renders the headline number outside calcStatus ok (no-data)", () => {
    const { container } = render(
      <CalculatorPanel
        calcStatus="no-data"
        stats={null}
        areaHa={null}
        visible
        onClose={vi.fn()}
      />
    );
    expect(container.textContent).toContain("No forest data in this area");
    expect(container.textContent).not.toMatch(/tonnes CO/);
  });

  it("shows the one-sided band (not animation-dependent) with the rounded, not raw, figure", () => {
    // The headline itself animates via requestAnimationFrame (untestable
    // synchronously without a rAF fixture), but the band line renders
    // directly off presentCo2Tonnes(...) with no animation involved --
    // 1,234,567.89 -> rounded 1,230,000 -> bandLow 984,000.
    const { container } = render(
      <CalculatorPanel
        calcStatus="ok"
        stats={FULL_PRECISION_STATS}
        areaHa={FULL_PRECISION_STATS.totalAreaHa}
        visible
        onClose={vi.fn()}
      />
    );
    expect(container.textContent).toContain("may be as low as 984,000 tonnes");
    expect(container.textContent).not.toContain("1,234,567");
  });
});
