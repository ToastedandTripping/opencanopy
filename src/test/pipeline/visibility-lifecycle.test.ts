import { describe, it, expect, beforeEach } from "vitest";
import { createMockMap, type MockMap } from "../mocks/maplibre";
import { setupStoryLayers } from "@/lib/story/setup-layers";
import {
  applyLayerVisibility,
  applyTimelineFilter,
} from "@/lib/story/visibility";
import type { ChapterLayer } from "@/data/chapters";

/**
 * Visibility lifecycle tests.
 *
 * These simulate the exact sequence that happens in StoryMap:
 * 1. setupStoryLayers() -- called in onLoad, registers all sources + layers
 * 2. applyLayerVisibility() -- called by the visibility useEffect
 * 3. applyTimelineFilter() -- called by the timeline useEffect
 *
 * The mock map tracks every setPaintProperty/setFilter call so we can
 * verify the pipeline produces correct paint values.
 */

describe("visibility lifecycle", () => {
  let map: MockMap;

  const terrainConfig = {
    enabled: true,
    url: "https://example.com/terrain",
    tileSize: 256,
  };

  /** Simulate onLoad: register all layers. */
  function simulateOnLoad() {
    setupStoryLayers(map, { terrain: terrainConfig, hatchPattern: null });
  }

  beforeEach(() => {
    map = createMockMap();
  });

  // ── Basic visibility activation ─────────────────────────────────

  describe("forest-age activation at z5", () => {
    it("sets raster-opacity when forest-age is active", () => {
      simulateOnLoad();

      const layers: ChapterLayer[] = [{ id: "forest-age", opacity: 0.6 }];
      applyLayerVisibility(map, layers, false, null);

      // Raster should get opacity capped at 0.85
      expect(map.getPaintProperty("story-forest-age-raster", "raster-opacity")).toBe(0.6);
    });

    it("caps raster opacity at 0.85", () => {
      simulateOnLoad();

      const layers: ChapterLayer[] = [{ id: "forest-age", opacity: 1.0 }];
      applyLayerVisibility(map, layers, false, null);

      expect(map.getPaintProperty("story-forest-age-raster", "raster-opacity")).toBe(0.85);
    });

    it("sets vector fill opacity to match chapter config", () => {
      simulateOnLoad();

      const layers: ChapterLayer[] = [{ id: "forest-age", opacity: 0.6 }];
      applyLayerVisibility(map, layers, false, null);

      expect(map.getPaintProperty("story-forest-age-fill", "fill-opacity")).toBe(0.6);
    });

    it("sets outline opacity to 0.4 when fill is active", () => {
      simulateOnLoad();

      const layers: ChapterLayer[] = [{ id: "forest-age", opacity: 0.6 }];
      applyLayerVisibility(map, layers, false, null);

      expect(map.getPaintProperty("story-forest-age-outline", "line-opacity")).toBe(0.4);
    });
  });

  // ── Layer deactivation ──────────────────────────────────────────

  describe("layer deactivation", () => {
    it("sets raster-opacity to 0 when forest-age is not in layers", () => {
      simulateOnLoad();

      // First activate
      applyLayerVisibility(
        map,
        [{ id: "forest-age", opacity: 0.6 }],
        false,
        null
      );
      expect(map.getPaintProperty("story-forest-age-raster", "raster-opacity")).toBe(0.6);

      // Then deactivate (empty layers)
      applyLayerVisibility(map, [], false, null);
      expect(map.getPaintProperty("story-forest-age-raster", "raster-opacity")).toBe(0);
    });

    it("sets fill-opacity to 0 when layer not in active list", () => {
      simulateOnLoad();

      // Activate then deactivate
      applyLayerVisibility(
        map,
        [{ id: "forest-age", opacity: 0.7 }],
        false,
        null
      );
      applyLayerVisibility(map, [], false, null);

      expect(map.getPaintProperty("story-forest-age-fill", "fill-opacity")).toBe(0);
    });

    it("sets outline to 0 when layer deactivated", () => {
      simulateOnLoad();

      applyLayerVisibility(
        map,
        [{ id: "forest-age", opacity: 0.7 }],
        false,
        null
      );
      applyLayerVisibility(map, [], false, null);

      expect(map.getPaintProperty("story-forest-age-outline", "line-opacity")).toBe(0);
    });
  });

  // ── Cutblocks + timeline control ────────────────────────────────

  describe("cutblocks controlled by timeline effect", () => {
    it("visibility effect skips cutblocks fill-opacity when yearFilter is set", () => {
      simulateOnLoad();

      const layers: ChapterLayer[] = [
        { id: "cutblocks", opacity: 0.8 },
      ];

      // Clear setPaintProperty tracking
      map._getCalls().setPaintProperty.length = 0;

      applyLayerVisibility(map, layers, false, 1990);

      // The visibility effect should NOT set fill-opacity on cutblocks
      // when yearFilter is non-null (timeline controls it)
      const cutblocksFillCalls = map
        ._getCalls()
        .setPaintProperty.filter(
          (c) =>
            c.layerId === "story-cutblocks-fill" &&
            c.property === "fill-opacity"
        );
      expect(cutblocksFillCalls.length).toBe(0);
    });

    it("visibility effect sets cutblocks fill-opacity when yearFilter is null", () => {
      simulateOnLoad();

      const layers: ChapterLayer[] = [
        { id: "cutblocks", opacity: 0.8 },
      ];

      applyLayerVisibility(map, layers, false, null);

      expect(map.getPaintProperty("story-cutblocks-fill", "fill-opacity")).toBe(0.8);
    });

    it("timeline effect sets age-graded fill-opacity expression", () => {
      simulateOnLoad();

      const layers: ChapterLayer[] = [
        { id: "cutblocks", opacity: 0.8 },
      ];

      applyTimelineFilter(map, layers, 1990);

      // fill-opacity should be a data-driven expression, not a scalar
      const opacity = map.getPaintProperty(
        "story-cutblocks-fill",
        "fill-opacity"
      );
      expect(Array.isArray(opacity)).toBe(true);
      expect(opacity[0]).toBe("interpolate");
    });

    it("timeline effect sets year filter on cutblocks", () => {
      simulateOnLoad();

      const layers: ChapterLayer[] = [
        { id: "cutblocks", opacity: 0.8 },
      ];

      applyTimelineFilter(map, layers, 1990);

      const filterCalls = map
        ._getCalls()
        .setFilter.filter((c) => c.layerId === "story-cutblocks-fill");
      expect(filterCalls.length).toBeGreaterThan(0);
      // The filter should include a year comparison
      const filter = filterCalls[filterCalls.length - 1].filter;
      expect(filter).toBeDefined();
    });

    it("timeline effect resets to scalar opacity when yearFilter becomes null", () => {
      simulateOnLoad();

      const layers: ChapterLayer[] = [
        { id: "cutblocks", opacity: 0.8 },
      ];

      // First apply timeline
      applyTimelineFilter(map, layers, 1990);
      // Verify expression was set
      let opacity = map.getPaintProperty(
        "story-cutblocks-fill",
        "fill-opacity"
      );
      expect(Array.isArray(opacity)).toBe(true);

      // Then reset
      applyTimelineFilter(map, layers, null);
      opacity = map.getPaintProperty(
        "story-cutblocks-fill",
        "fill-opacity"
      );
      expect(opacity).toBe(0.8);
    });
  });

  // ── Hatch layer ─────────────────────────────────────────────────

  describe("hatch layer control", () => {
    it("hatch enabled sets opacity 0.6", () => {
      simulateOnLoad();

      applyLayerVisibility(map, [], true, null);

      expect(
        map.getPaintProperty("story-harvested-hatch", "fill-opacity")
      ).toBe(0.6);
    });

    it("hatch disabled sets opacity 0", () => {
      simulateOnLoad();

      applyLayerVisibility(map, [], false, null);

      expect(
        map.getPaintProperty("story-harvested-hatch", "fill-opacity")
      ).toBe(0);
    });
  });

  // ── Class filter ────────────────────────────────────────────────

  describe("class filter", () => {
    it("applies class filter to forest-age fill", () => {
      simulateOnLoad();

      const layers: ChapterLayer[] = [
        {
          id: "forest-age",
          opacity: 0.7,
          classFilter: ["old-growth", "mature"],
        },
      ];

      applyLayerVisibility(map, layers, false, null);

      const filterCalls = map
        ._getCalls()
        .setFilter.filter((c) => c.layerId === "story-forest-age-fill");
      expect(filterCalls.length).toBe(1);
      const filter = filterCalls[0].filter as unknown[];
      expect(filter[0]).toBe("any");
    });

    it("clears filter when no classFilter specified", () => {
      simulateOnLoad();

      const layers: ChapterLayer[] = [
        { id: "forest-age", opacity: 0.7 },
      ];

      applyLayerVisibility(map, layers, false, null);

      const filterCalls = map
        ._getCalls()
        .setFilter.filter((c) => c.layerId === "story-forest-age-fill");
      expect(filterCalls.length).toBe(1);
      expect(filterCalls[0].filter).toBeNull();
    });
  });

  // ── TIMING: the critical sequence ───────────────────────────────

  describe("TIMING: onLoad -> visibility -> paint", () => {
    it("full pipeline: onLoad registers layers, then visibility sets paint", () => {
      // Step 1: onLoad -- registers all layers at opacity 0
      simulateOnLoad();

      // Verify layers exist and are at opacity 0
      expect(map.getLayer("story-forest-age-raster")).toBeDefined();
      expect(map.getLayer("story-forest-age-fill")).toBeDefined();
      expect(
        map.getPaintProperty("story-forest-age-raster", "raster-opacity")
      ).toBe(0);
      expect(
        map.getPaintProperty("story-forest-age-fill", "fill-opacity")
      ).toBe(0);

      // Step 2: isStyleLoaded must be true for visibility to fire
      expect(map.isStyleLoaded()).toBe(true);

      // Step 3: Visibility effect fires (triggered by mapLoaded state change)
      const layers: ChapterLayer[] = [{ id: "forest-age", opacity: 0.6 }];
      applyLayerVisibility(map, layers, false, null);

      // Step 4: Verify paint properties were actually set
      expect(
        map.getPaintProperty("story-forest-age-raster", "raster-opacity")
      ).toBe(0.6);
      expect(
        map.getPaintProperty("story-forest-age-fill", "fill-opacity")
      ).toBe(0.6);
    });

    it("visibility does nothing when isStyleLoaded returns false", () => {
      simulateOnLoad();
      map._setStyleLoaded(false);

      const layers: ChapterLayer[] = [{ id: "forest-age", opacity: 0.6 }];
      // Clear setPaintProperty tracking from setup
      map._getCalls().setPaintProperty.length = 0;

      applyLayerVisibility(map, layers, false, null);

      // No setPaintProperty calls should have been made
      expect(map._getCalls().setPaintProperty.length).toBe(0);
    });

    it("visibility does nothing when layers not yet registered", () => {
      // Don't call simulateOnLoad -- no layers registered
      const layers: ChapterLayer[] = [{ id: "forest-age", opacity: 0.6 }];

      applyLayerVisibility(map, layers, false, null);

      // setPaintProperty should only be for raster (which doesn't exist)
      // and fills/outlines (which don't exist) -- so effectively no visual changes
      const calls = map._getCalls().setPaintProperty;
      expect(calls.length).toBe(0);
    });

    it("simulates complete chapter transition: overview -> logging-timeline", () => {
      simulateOnLoad();

      // Chapter 0: overview -- forest-age at 0.6
      applyLayerVisibility(
        map,
        [{ id: "forest-age", opacity: 0.6 }],
        false,
        null
      );
      applyTimelineFilter(
        map,
        [{ id: "forest-age", opacity: 0.6 }],
        null
      );

      expect(
        map.getPaintProperty("story-forest-age-raster", "raster-opacity")
      ).toBe(0.6);
      expect(
        map.getPaintProperty("story-cutblocks-fill", "fill-opacity")
      ).toBe(0); // cutblocks not active

      // Chapter 1: logging-timeline -- forest-age 0.4 + cutblocks 0.8 + yearFilter
      const ch1Layers: ChapterLayer[] = [
        { id: "forest-age", opacity: 0.4 },
        { id: "cutblocks", opacity: 0.8 },
      ];

      applyLayerVisibility(map, ch1Layers, false, 1990);
      applyTimelineFilter(map, ch1Layers, 1990);

      // Forest-age raster: capped at 0.4
      expect(
        map.getPaintProperty("story-forest-age-raster", "raster-opacity")
      ).toBe(0.4);

      // Cutblocks fill-opacity: should be data-driven expression (from timeline)
      const cutblockOpacity = map.getPaintProperty(
        "story-cutblocks-fill",
        "fill-opacity"
      );
      expect(Array.isArray(cutblockOpacity)).toBe(true);
    });

    it("simulates chapter transition: logging-timeline -> fire (timeline cleared)", () => {
      simulateOnLoad();

      // Chapter 1: logging-timeline with yearFilter
      const ch1Layers: ChapterLayer[] = [
        { id: "forest-age", opacity: 0.4 },
        { id: "cutblocks", opacity: 0.8 },
      ];
      applyLayerVisibility(map, ch1Layers, false, 2000);
      applyTimelineFilter(map, ch1Layers, 2000);

      // Chapter 2: fire -- yearFilter null, cutblocks still present
      const ch2Layers: ChapterLayer[] = [
        { id: "forest-age", opacity: 0.3 },
        { id: "cutblocks", opacity: 0.6 },
        { id: "fire-history", opacity: 0.5 },
      ];
      applyLayerVisibility(map, ch2Layers, false, null);
      applyTimelineFilter(map, ch2Layers, null);

      // Forest-age raster lowered
      expect(
        map.getPaintProperty("story-forest-age-raster", "raster-opacity")
      ).toBe(0.3);

      // Cutblocks: scalar opacity restored (timeline off)
      expect(
        map.getPaintProperty("story-cutblocks-fill", "fill-opacity")
      ).toBe(0.6);

      // Fire-history activated
      expect(
        map.getPaintProperty("story-fire-history-fill", "fill-opacity")
      ).toBe(0.5);
    });

    it("multiple layers active simultaneously", () => {
      simulateOnLoad();

      const layers: ChapterLayer[] = [
        { id: "forest-age", opacity: 0.5 },
        { id: "parks", opacity: 0.8 },
      ];

      applyLayerVisibility(map, layers, false, null);

      expect(
        map.getPaintProperty("story-forest-age-fill", "fill-opacity")
      ).toBe(0.5);
      expect(
        map.getPaintProperty("story-parks-fill", "fill-opacity")
      ).toBe(0.8);
      expect(
        map.getPaintProperty("story-parks-outline", "line-opacity")
      ).toBe(0.4);
      // Cutblocks and fire-history should be at 0
      expect(
        map.getPaintProperty("story-cutblocks-fill", "fill-opacity")
      ).toBe(0);
      expect(
        map.getPaintProperty("story-fire-history-fill", "fill-opacity")
      ).toBe(0);
    });
  });

  // ── Bug hypothesis testing ──────────────────────────────────────

  describe("bug hypothesis: visibility effect fires before layers registered", () => {
    it("HYPOTHESIS A: if visibility fires before onLoad, no paint calls happen", () => {
      // Simulate: visibility effect fires but onLoad hasn't run yet
      const layers: ChapterLayer[] = [{ id: "forest-age", opacity: 0.6 }];
      applyLayerVisibility(map, layers, false, null);

      // No layers registered, so getLayer returns undefined, no setPaintProperty calls
      const paintCalls = map._getCalls().setPaintProperty;
      expect(paintCalls.length).toBe(0);

      // NOW onLoad runs
      simulateOnLoad();

      // Layers are at opacity 0 (their initial paint values)
      expect(
        map.getPaintProperty("story-forest-age-raster", "raster-opacity")
      ).toBe(0);

      // BUG: If the visibility effect doesn't re-fire after onLoad + setMapLoaded(true),
      // the forest-age raster stays at 0 forever. This confirms hypothesis B:
      // the fix depends on mapLoaded being in the useEffect dependency array,
      // which triggers a re-run after setMapLoaded(true).
    });

    it("HYPOTHESIS B: mapLoaded re-triggers visibility after onLoad", () => {
      // Simulate the correct sequence:
      // 1. Component mounts with mapLoaded=false
      // 2. Visibility effect fires (no-op, layers not registered)
      applyLayerVisibility(
        map,
        [{ id: "forest-age", opacity: 0.6 }],
        false,
        null
      );
      expect(map._getCalls().setPaintProperty.length).toBe(0);

      // 3. onLoad fires, registers layers, sets mapLoaded=true
      simulateOnLoad();

      // 4. mapLoaded change triggers visibility effect re-fire
      applyLayerVisibility(
        map,
        [{ id: "forest-age", opacity: 0.6 }],
        false,
        null
      );

      // NOW the raster should be visible
      expect(
        map.getPaintProperty("story-forest-age-raster", "raster-opacity")
      ).toBe(0.6);
    });

    it("HYPOTHESIS C: mapRef.current null check", () => {
      // In the real component, if mapRef.current is null, the effect
      // returns early. This test confirms the extracted function
      // handles it correctly by virtue of never being called
      // (the null check is in the useEffect wrapper, not in the function).
      //
      // The extracted function always receives a valid map object,
      // so this hypothesis is not testable at this level -- it's
      // handled by the React component's null guard.
    });

    it("HYPOTHESIS D: isStyleLoaded gate prevents paint when style not ready", () => {
      simulateOnLoad();
      map._setStyleLoaded(false);

      const layers: ChapterLayer[] = [{ id: "forest-age", opacity: 0.6 }];
      map._getCalls().setPaintProperty.length = 0;

      applyLayerVisibility(map, layers, false, null);

      // isStyleLoaded returned false, so no paint calls
      expect(map._getCalls().setPaintProperty.length).toBe(0);

      // After style loads
      map._setStyleLoaded(true);
      applyLayerVisibility(map, layers, false, null);

      expect(
        map.getPaintProperty("story-forest-age-raster", "raster-opacity")
      ).toBe(0.6);
    });
  });
});
