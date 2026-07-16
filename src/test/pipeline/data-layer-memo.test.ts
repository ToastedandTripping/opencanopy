/**
 * DataLayer React.memo render-count guard — Audit P1a.
 *
 * Root cause: CanopyMap.tsx wired onZoom/onMouseMove/onMouseOut straight to
 * setState on CanopyMap itself, so every zoom tick and every mouse pixel
 * re-rendered CanopyMap and, with it, all 18-19 unmemoized <DataLayer>
 * instances — even though DataLayer never reads zoom/cursor at all. Change 2
 * moves that state into MapReadout (its own tiny component) AND wraps
 * DataLayer in React.memo with a custom comparator over layer.id, visible,
 * yearFilter, and classFilters?.[layer.id] (compared by array value, since
 * the parent's classFilters object is a fresh reference on every unrelated
 * change).
 *
 * This test proves the memo comparator directly against the real DataLayer
 * component (not a reimplementation): it renders DataLayer through
 * @testing-library/react and uses `useLoadingContext()` as a render-count
 * proxy. useLoadingContext is called exactly once, unconditionally, as the
 * very first statement of DataLayer's function body (before any branching on
 * layer.source.type) — and nowhere else in the file (SatelliteLayers,
 * PmtilesLayers, WfsLayers don't call it). So its call count increasing is
 * equivalent to "DataLayer's function body actually executed"; count staying
 * flat is equivalent to "React.memo bailed out and never called the function
 * at all" (a real memo bailout skips the function invocation entirely, it
 * does not run-then-discard).
 *
 * Divergences NOT covered: this doesn't exercise CanopyMap's own re-render
 * triggers (MapReadout's mouse listeners) directly — that's proven
 * structurally (state moved off CanopyMap, see CanopyMap.tsx) and by tsc/
 * build. This test isolates and proves the DataLayer memo half of the fix.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { createMockMap } from "../mocks/maplibre";
import type { LayerDefinition } from "@/types/layers";

// ── Module-level mocks (mirrors wfs-layers-d10.test.ts) ────────────────────

vi.mock("react-map-gl/maplibre", () => ({
  useMap: vi.fn(),
  Source: ({ children }: { children?: React.ReactNode }) => children ?? null,
  Layer: () => null,
}));

// useLoadingContext is the render-count proxy — see file header. Mocked as a
// bare vi.fn() (not wrapped) so its own .mock.calls tracks every invocation.
vi.mock("@/contexts/LoadingContext", () => ({
  useLoadingContext: vi.fn(() => ({
    setLayerLoading: vi.fn(),
    setLayerStatus: vi.fn(),
    clearLayerStatus: vi.fn(),
  })),
}));

vi.mock("@/lib/data/wfs-client", () => ({
  fetchLayerData: vi.fn(() => new Promise(() => {})), // never resolves
}));

vi.mock("maplibre-gl", () => ({
  default: {},
}));

// ── Fixture ───────────────────────────────────────────────────────────────

const FOREST_AGE_LAYER: LayerDefinition = {
  id: "forest-age",
  label: "Forest Age",
  category: "forest",
  description: "Test WFS layer for memo render-count guard",
  source: {
    type: "wfs",
    url: "https://openmaps.gov.bc.ca/geo/pub/test/ows",
    typeName: "pub:TEST_FOREST_AGE",
  },
  style: {
    type: "fill",
    opacity: 0.6,
    paint: {
      "fill-color": "#0d5c2a",
      "fill-opacity": 0.6,
    },
  },
  zoomRange: [0, 18],
  defaultEnabled: false,
  interactive: false,
  legendItems: [{ color: "#0d5c2a", label: "Forest Age" }],
};

// A second layer id, used to prove the classFilters comparator scopes to
// THIS layer's slice and ignores changes to an unrelated layer's slice.
const OTHER_LAYER_ID = "cutblocks";

async function importDataLayer() {
  const mod = await import("@/components/map/DataLayer");
  return mod.DataLayer;
}

async function getRenderCount(): Promise<number> {
  const { useLoadingContext } = await import("@/contexts/LoadingContext");
  return (useLoadingContext as ReturnType<typeof vi.fn>).mock.calls.length;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("DataLayer React.memo — render-count guard", () => {
  let map: ReturnType<typeof createMockMap>;

  beforeEach(async () => {
    map = createMockMap();
    const { useMap } = await import("react-map-gl/maplibre");
    (useMap as ReturnType<typeof vi.fn>).mockReturnValue({
      current: {
        getMap: () => map,
        flyTo: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        getBounds: vi.fn(() => ({
          getWest: () => -126,
          getSouth: () => 48,
          getEast: () => -124,
          getNorth: () => 50,
        })),
        getZoom: vi.fn(() => 10),
      },
    });
    const { useLoadingContext } = await import("@/contexts/LoadingContext");
    (useLoadingContext as ReturnType<typeof vi.fn>).mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("re-rendering the parent with IDENTICAL DataLayer props does NOT re-render DataLayer", async () => {
    const DataLayer = await importDataLayer();

    const props1 = {
      layer: FOREST_AGE_LAYER,
      visible: true,
      yearFilter: null as number | null,
      // Fresh object/array references but IDENTICAL values — this is the
      // realistic shape of a re-render from a parent whose own state object
      // is reallocated even when nothing relevant to this layer changed.
      classFilters: { [FOREST_AGE_LAYER.id]: ["old-growth", "mature"] },
    };

    const { rerender } = render(React.createElement(DataLayer, props1));
    // Mount settles at >1 call: DataLayer's own effects (rasterBeforeId sync
    // update, loadData's synchronous setLoading(true) before its first
    // await) trigger cascading re-renders during the initial commit — real
    // React behavior, unrelated to the memo comparator under test here. We
    // only care about the DELTA across the identical-props rerender below.
    const countAfterMount = await getRenderCount();
    expect(countAfterMount).toBeGreaterThan(0);

    // Same values, brand-new object/array references.
    const props2 = {
      layer: FOREST_AGE_LAYER,
      visible: true,
      yearFilter: null as number | null,
      classFilters: { [FOREST_AGE_LAYER.id]: ["old-growth", "mature"] },
    };
    rerender(React.createElement(DataLayer, props2));

    const countAfterIdenticalRerender = await getRenderCount();
    expect(
      countAfterIdenticalRerender,
      "identical props (by value) must not invoke DataLayer's function body again"
    ).toBe(countAfterMount);
  });

  it("changing `visible` DOES re-render DataLayer (guards over-memoization)", async () => {
    const DataLayer = await importDataLayer();

    const { rerender } = render(
      React.createElement(DataLayer, {
        layer: FOREST_AGE_LAYER,
        visible: true,
        yearFilter: null as number | null,
      })
    );
    const countAfterMount = await getRenderCount();

    rerender(
      React.createElement(DataLayer, {
        layer: FOREST_AGE_LAYER,
        visible: false,
        yearFilter: null as number | null,
      })
    );
    const countAfterToggle = await getRenderCount();

    expect(
      countAfterToggle,
      "a relevant prop change (visible) must invoke DataLayer's function body again"
    ).toBeGreaterThan(countAfterMount);
  });

  it("changing THIS layer's classFilters slice DOES re-render DataLayer (guards over-memoization)", async () => {
    const DataLayer = await importDataLayer();

    const { rerender } = render(
      React.createElement(DataLayer, {
        layer: FOREST_AGE_LAYER,
        visible: true,
        yearFilter: null as number | null,
        classFilters: { [FOREST_AGE_LAYER.id]: ["old-growth"] },
      })
    );
    const countAfterMount = await getRenderCount();

    rerender(
      React.createElement(DataLayer, {
        layer: FOREST_AGE_LAYER,
        visible: true,
        yearFilter: null as number | null,
        classFilters: { [FOREST_AGE_LAYER.id]: ["old-growth", "mature"] },
      })
    );
    const countAfterFilterChange = await getRenderCount();

    expect(
      countAfterFilterChange,
      "a value change in this layer's classFilters slice must invoke DataLayer's function body again"
    ).toBeGreaterThan(countAfterMount);
  });

  it("changing an UNRELATED layer's classFilters slice does NOT re-render DataLayer", async () => {
    const DataLayer = await importDataLayer();

    const { rerender } = render(
      React.createElement(DataLayer, {
        layer: FOREST_AGE_LAYER,
        visible: true,
        yearFilter: null as number | null,
        classFilters: { [OTHER_LAYER_ID]: ["young"] },
      })
    );
    const countAfterMount = await getRenderCount();

    // A brand-new classFilters object, but FOREST_AGE_LAYER's own slice
    // (undefined, since only OTHER_LAYER_ID is keyed) is unchanged before
    // and after — only the unrelated layer's entry changed.
    rerender(
      React.createElement(DataLayer, {
        layer: FOREST_AGE_LAYER,
        visible: true,
        yearFilter: null as number | null,
        classFilters: { [OTHER_LAYER_ID]: ["young", "harvested"] },
      })
    );
    const countAfterUnrelatedChange = await getRenderCount();

    expect(
      countAfterUnrelatedChange,
      "an unrelated layer's classFilters change must not invoke this DataLayer's function body — proves the comparator scopes to classFilters?.[layer.id], not the whole object"
    ).toBe(countAfterMount);
  });
});
