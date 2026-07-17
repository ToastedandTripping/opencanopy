/**
 * MapLegend D2 regression test (P2 a11y relay).
 *
 * The expanded per-class legend rows double as toggle buttons (class
 * filtering) but previously communicated on/off state with opacity alone --
 * invisible to a screen reader and to sighted keyboard users relying on the
 * focus ring. Guards: aria-pressed tracks isActive, and the button carries
 * the same focus-visible ring pattern already used by MapLegend's sibling
 * buttons (expand/collapse chevron, dismiss).
 *
 * happy-dom env, no jest-dom matchers -- plain DOM queries, per the
 * sibling LayerPanel.test.tsx / CalculatorPanel.test.tsx convention.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { MapLegend } from "./MapLegend";
import { LoadingProvider } from "@/contexts/LoadingContext";
import type { LayerDefinition } from "@/types/layers";

afterEach(cleanup);

// A minimal filterable layer: a class-based fill-color expression
// containing "class" (MapLegend's own isFilterable check greps the
// stringified paint expression for that literal token).
const FILTERABLE_LAYER: LayerDefinition = {
  id: "forest-age",
  label: "Forest Age",
  category: "forest",
  description: "test fixture",
  source: { type: "tiles" },
  style: {
    type: "fill",
    paint: {
      "fill-color": ["match", ["get", "class"], "old-growth", "#d4a017", "#71717a"],
    },
  },
  zoomRange: [0, 22],
  defaultEnabled: true,
  interactive: true,
  legendItems: [
    { color: "#d4a017", label: "Old growth" },
    { color: "#71717a", label: "Unknown" },
  ],
};

function renderLegend(classFilters?: Record<string, string[]>, onToggleClassFilter = vi.fn()) {
  const result = render(
    <LoadingProvider>
      <MapLegend
        enabledLayers={[FILTERABLE_LAYER.id]}
        onToggleLayer={vi.fn()}
        layerPanelOpen={false}
        classFilters={classFilters}
        onToggleClassFilter={onToggleClassFilter}
      />
    </LoadingProvider>
  );
  return { ...result, onToggleClassFilter };
}

/** MapLegend renders legend rows from the registry's getLayer() lookup, not
 *  directly from a prop -- mock the registry accessor to return our fixture
 *  layer for "forest-age" regardless of the real registry contents. */
vi.mock("@/lib/layers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/layers")>();
  return {
    ...actual,
    getLayer: (id: string) => (id === "forest-age" ? FILTERABLE_LAYER : actual.getLayer(id)),
  };
});

function expandLayer(container: HTMLElement) {
  const expandButton = Array.from(container.querySelectorAll("button")).find(
    (b) => b.textContent?.includes("Forest Age")
  );
  expandButton && fireEvent.click(expandButton);
}

describe("MapLegend class-filter buttons (D2)", () => {
  it("sets aria-pressed=true on an active class and false on a filtered-out class", () => {
    const { container } = renderLegend({ "forest-age": ["Old growth"] });
    expandLayer(container);

    const oldGrowthBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Old growth")
    );
    const unknownBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Unknown")
    );

    expect(oldGrowthBtn?.getAttribute("aria-pressed")).toBe("true");
    expect(unknownBtn?.getAttribute("aria-pressed")).toBe("false");
  });

  it("aria-pressed defaults to true for every class when no filter is set (all active)", () => {
    const { container } = renderLegend(undefined);
    expandLayer(container);

    const buttons = Array.from(container.querySelectorAll("button")).filter((b) =>
      b.textContent?.match(/Old growth|Unknown/)
    );
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) {
      expect(b.getAttribute("aria-pressed")).toBe("true");
    }
  });

  it("clicking a class-filter button still invokes onToggleClassFilter (behavior unchanged)", () => {
    const { container, onToggleClassFilter } = renderLegend({ "forest-age": ["Old growth"] });
    expandLayer(container);

    const unknownBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Unknown")
    );
    fireEvent.click(unknownBtn!);
    expect(onToggleClassFilter).toHaveBeenCalledWith("forest-age", "Unknown");
  });

  it("carries the sibling focus-visible ring pattern used elsewhere in this file", () => {
    const { container } = renderLegend({ "forest-age": ["Old growth"] });
    expandLayer(container);

    const oldGrowthBtn = Array.from(container.querySelectorAll("button")).find((b) =>
      b.textContent?.includes("Old growth")
    );
    expect(oldGrowthBtn?.className).toMatch(/focus-visible:ring-2/);
    expect(oldGrowthBtn?.className).toMatch(/focus-visible:ring-white\/20/);
  });
});
