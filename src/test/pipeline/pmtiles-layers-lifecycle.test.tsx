/**
 * PmtilesLayers + DataLayer status lifecycle (R1-03, R1-05), rendered.
 *
 * R1-05: PmtilesLayers adds its layers after waiting for `load` and then
 * `sourcedata`, from a closure captured at mount. A toggle, class filter or
 * timeline switch made during that wait used to be lost. Tests 1-5 and 9
 * assert the EFFECTIVE state MapLibre would draw (mock getLayoutProperty /
 * getFilter / getPaintProperty, seeded from addLayer and overwritten by the
 * setters), not which calls were made.
 *
 * R1-03: layer status is a function of (visible, failed). Tests 6-8 and 10 use
 * the REAL LoadingProvider and read `layerStatuses` after advancing fake timers
 * past its 250 ms terminal-status debounce. A recording mock is not used: one
 * that hands out fresh setters per render re-runs DataLayer's unmount-cleanup
 * effect and would turn test 6 green on the unfixed code.
 *
 * Harness: React.StrictMode; `useMap` mocked to return one stable handle over
 * the mock map (a fresh handle per render would re-run every map effect);
 * `maplibre-gl` mocked at module level; `fetchLayerData` controllable.
 *
 * "Emit" in tests 1-5 means: emit `load`, flip sources pending off, then emit
 * `sourcedata {sourceId}` (the handler adds layers only once
 * `isSourceLoaded` is true).
 *
 * Divergences NOT covered: a real MapLibre map (happy-dom, no WebGL), real
 * PMTiles header fetches and real tile loading. The release's agent live
 * checks own that.
 */

import React, { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { createMockMap, type MockMap } from "../mocks/maplibre";
import type { LayerDefinition } from "@/types/layers";
import type { LayerStatus } from "@/contexts/LoadingContext";
import { buildAgeGradedOpacity } from "@/lib/timeline/filter-expressions";

const harness = vi.hoisted(() => ({
  mapHandle: null as unknown,
}));

vi.mock("react-map-gl/maplibre", () => ({
  useMap: () => ({ current: harness.mapHandle }),
  Source: ({ children }: { children?: React.ReactNode }) => children ?? null,
  Layer: () => null,
}));

vi.mock("@/lib/data/wfs-client", () => ({
  fetchLayerData: vi.fn(() => new Promise(() => {})),
}));

vi.mock("maplibre-gl", () => ({
  default: {},
}));

import { fetchLayerData } from "@/lib/data/wfs-client";
import { LoadingProvider, useLoadingContext } from "@/contexts/LoadingContext";
import { DataLayer } from "@/components/map/DataLayer";
import { PMTILES_SOURCE_ID } from "@/lib/layers/registry";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function tileFill(id: string, extra: Partial<LayerDefinition> = {}): LayerDefinition {
  return {
    id,
    label: id,
    category: "forest",
    description: "Test tile-backed fill layer",
    source: {
      type: "wfs",
      url: "https://openmaps.gov.bc.ca/geo/pub/test/ows",
      typeName: "pub:TEST",
    },
    tileSource: {
      url: "pmtiles://https://tiles.opencanopy.ca/test.pmtiles",
      sourceLayer: id,
      minZoom: 4,
      maxZoom: 12,
    },
    style: {
      type: "fill",
      opacity: 0.7,
      paint: { "fill-color": "#0d5c2a", "fill-opacity": 0.7 },
    },
    zoomRange: [0, 18],
    defaultEnabled: false,
    interactive: false,
    legendItems: [{ color: "#0d5c2a", label: id }],
    ...extra,
  };
}

const FILL = tileFill("tile-fill");
const FILL_B = tileFill("tile-fill-b");
const TIMELINE_FILL = tileFill("tile-timeline", {
  timelineField: "harvest_year",
  timelineRange: [1950, 2025],
});

const LINE: LayerDefinition = {
  ...tileFill("tile-line"),
  style: {
    type: "line",
    opacity: 0.6,
    paint: { "line-color": "#3b82f6", "line-opacity": 0.6, "line-width": 1.5 },
  },
};

const WFS_ONLY: LayerDefinition = {
  id: "wfs-only",
  label: "WFS only",
  category: "water",
  description: "Test WFS-only layer",
  source: {
    type: "wfs",
    url: "https://openmaps.gov.bc.ca/geo/pub/test/ows",
    typeName: "pub:TEST_STREAMS",
  },
  style: {
    type: "line",
    opacity: 0.8,
    paint: { "line-color": "#3b82f6", "line-opacity": 0.8, "line-width": 1.5 },
  },
  zoomRange: [0, 18],
  defaultEnabled: false,
  interactive: false,
  legendItems: [{ color: "#3b82f6", label: "WFS only" }],
};

const fillId = (l: LayerDefinition) => `layer-${l.id}-tiles-fill`;
const outlineId = (l: LayerDefinition) => `layer-${l.id}-tiles-outline`;
const lineId = (l: LayerDefinition) => `layer-${l.id}-tiles-line`;

// ── Harness ──────────────────────────────────────────────────────────────────

let mockMap: MockMap;
let statuses: Map<string, LayerStatus> = new Map();

function StatusProbe() {
  statuses = useLoadingContext().layerStatuses;
  return null;
}

interface LayerProps {
  layer: LayerDefinition;
  visible: boolean;
  yearFilter?: number | null;
  classFilters?: Record<string, string[]>;
}

function tree(layers: LayerProps[]) {
  return (
    <StrictMode>
      <LoadingProvider>
        {layers.map((p) => (
          <DataLayer key={p.layer.id} {...p} />
        ))}
        <StatusProbe />
      </LoadingProvider>
    </StrictMode>
  );
}

function mount(layers: LayerProps[]) {
  const utils = render(tree(layers));
  return {
    rerender: (next: LayerProps[]) => utils.rerender(tree(next)),
  };
}

/** load, then the PMTiles header resolves. */
function emitReady() {
  act(() => {
    mockMap._setStyleLoaded(true);
    mockMap._emit("load");
    mockMap._setSourcesPending(false);
    mockMap._emit("sourcedata", { sourceId: PMTILES_SOURCE_ID });
  });
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  mockMap = createMockMap();
  harness.mapHandle = { getMap: () => mockMap, ...mockMap };
  statuses = new Map();
  vi.mocked(fetchLayerData).mockReset();
  vi.mocked(fetchLayerData).mockImplementation(() => new Promise(() => {}));
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── R1-05: state changed while the layers are being waited for ───────────────

describe("PmtilesLayers re-applies current state when its layers are added (R1-05)", () => {
  beforeEach(() => {
    mockMap._setStyleLoaded(false);
    mockMap._setSourcesPending(true);
  });

  it("1: shown during the wait -> fill and outline are visible once added", () => {
    const { rerender } = mount([{ layer: FILL, visible: false }]);
    rerender([{ layer: FILL, visible: true }]);
    expect(mockMap.getLayer(fillId(FILL))).toBeUndefined(); // still waiting
    emitReady();
    expect(mockMap.getLayoutProperty(fillId(FILL), "visibility")).toBe("visible");
    expect(mockMap.getLayoutProperty(outlineId(FILL), "visibility")).toBe("visible");
  });

  it("2: hidden during the wait -> fill and outline are hidden once added", () => {
    const { rerender } = mount([{ layer: FILL, visible: true }]);
    rerender([{ layer: FILL, visible: false }]);
    emitReady();
    expect(mockMap.getLayoutProperty(fillId(FILL), "visibility")).toBe("none");
    expect(mockMap.getLayoutProperty(outlineId(FILL), "visibility")).toBe("none");
  });

  it("3: class filter set during the wait is on the added layers", () => {
    const { rerender } = mount([{ layer: FILL, visible: true }]);
    rerender([{ layer: FILL, visible: true, classFilters: { [FILL.id]: ["old"] } }]);
    emitReady();
    const classExpr = JSON.stringify(["in", ["get", "class"], ["literal", ["old"]]]);
    expect(JSON.stringify(mockMap.getFilter(fillId(FILL)) ?? null)).toContain(classExpr);
    expect(JSON.stringify(mockMap.getFilter(outlineId(FILL)) ?? null)).toContain(classExpr);
  });

  it("4: timeline switched on during the wait -> year filter and age-graded opacity", () => {
    const { rerender } = mount([{ layer: TIMELINE_FILL, visible: true, yearFilter: null }]);
    rerender([{ layer: TIMELINE_FILL, visible: true, yearFilter: 2000 }]);
    emitReady();
    expect(JSON.stringify(mockMap.getFilter(fillId(TIMELINE_FILL)) ?? null)).toContain(
      JSON.stringify(["global-state", "currentYear"]),
    );
    expect(mockMap.getPaintProperty(fillId(TIMELINE_FILL), "fill-opacity")).toEqual(
      buildAgeGradedOpacity("harvest_year"),
    );
  });

  it("5: line layer shown during the wait carries the registry line-opacity", () => {
    const { rerender } = mount([{ layer: LINE, visible: false }]);
    rerender([{ layer: LINE, visible: true }]);
    emitReady();
    expect(mockMap.getPaintProperty(lineId(LINE), "line-opacity")).toBe(0.6);
  });
});

describe("PmtilesLayers under StrictMode with the style loaded and the header pending", () => {
  it("9: one addLayer per id, the discarded handler is removed, current visibility applied", () => {
    mockMap._setStyleLoaded(true);
    mockMap._setSourcesPending(true);

    const { rerender } = mount([{ layer: FILL, visible: false }]);
    rerender([{ layer: FILL, visible: true }]);

    const sourcedataOns = mockMap.on.mock.calls.filter(([event]) => event === "sourcedata");
    expect(sourcedataOns.length).toBe(2); // StrictMode: mount, cleanup, mount
    const discarded = sourcedataOns[0][1];
    // Removed by the StrictMode cleanup, before the header resolves.
    expect(mockMap.off).toHaveBeenCalledWith("sourcedata", discarded);

    act(() => {
      mockMap._setSourcesPending(false);
      mockMap._emit("sourcedata", { sourceId: PMTILES_SOURCE_ID });
    });

    const added = mockMap._getCalls().addLayer.map((c) => c.config.id as string);
    expect(added.filter((id) => id === fillId(FILL))).toHaveLength(1);
    expect(added.filter((id) => id === outlineId(FILL))).toHaveLength(1);
    expect(mockMap.getLayoutProperty(fillId(FILL), "visibility")).toBe("visible");
  });
});

// ── R1-03: status is a function of (visible, failed) ─────────────────────────

describe("DataLayer status follows (visible, failed) on the real LoadingProvider (R1-03)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockMap._setStyleLoaded(true);
    mockMap._setSourcesPending(true); // the header never resolves: 15 s timeout
  });

  it("6: hiding a failed layer clears its status", () => {
    const { rerender } = mount([{ layer: FILL, visible: true }]);
    advance(15_000);
    advance(300);
    expect(statuses.get(FILL.id)).toBe("error");

    rerender([{ layer: FILL, visible: false }]);
    advance(300);
    expect(statuses.has(FILL.id)).toBe(false);
  });

  it("7: on the shared source only the visible layer reports; showing the other reports it", () => {
    const { rerender } = mount([
      { layer: FILL, visible: true },
      { layer: FILL_B, visible: false },
    ]);
    advance(15_000);
    advance(300);
    expect(statuses.get(FILL.id)).toBe("error");
    expect(statuses.has(FILL_B.id)).toBe(false);

    rerender([
      { layer: FILL, visible: true },
      { layer: FILL_B, visible: true },
    ]);
    advance(300);
    expect(statuses.get(FILL_B.id)).toBe("error");
  });

  it("8: a clear inside the debounce window is not overtaken by the queued error", () => {
    const { rerender } = mount([{ layer: FILL, visible: true }]);
    advance(15_000); // error queued, 250 ms debounce pending
    advance(100);
    rerender([{ layer: FILL, visible: false }]);
    advance(300);
    expect(statuses.has(FILL.id)).toBe(false);
  });
});

describe("WFS-only statuses survive the status effect (fixture; none mounted on /map)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("10: loading and error from the WFS path stand; hide clears; show reports empty", async () => {
    vi.mocked(fetchLayerData).mockImplementation(() => Promise.reject(new Error("WFS 502")));

    const { rerender } = mount([{ layer: WFS_ONLY, visible: true }]);
    // The WFS path's synchronous "loading" write, in the same commit as the
    // status effect, must stand: the effect has no else branch.
    expect(statuses.get(WFS_ONLY.id)).toBe("loading");

    await act(async () => {
      await Promise.resolve();
    });
    advance(300);
    expect(statuses.get(WFS_ONLY.id)).toBe("error");

    rerender([{ layer: WFS_ONLY, visible: true }]);
    advance(300);
    expect(statuses.get(WFS_ONLY.id)).toBe("error");

    vi.mocked(fetchLayerData).mockClear();
    rerender([{ layer: WFS_ONLY, visible: false }]);
    advance(300);
    expect(statuses.has(WFS_ONLY.id)).toBe(false);
    expect(fetchLayerData).not.toHaveBeenCalled(); // no fetch while hidden

    vi.mocked(fetchLayerData).mockImplementation(() =>
      Promise.resolve({ type: "FeatureCollection", features: [] }),
    );
    rerender([{ layer: WFS_ONLY, visible: true }]);
    await act(async () => {
      await Promise.resolve();
    });
    advance(300);
    expect(statuses.get(WFS_ONLY.id)).toBe("empty");
    expect(fetchLayerData).toHaveBeenCalled();
  });
});
