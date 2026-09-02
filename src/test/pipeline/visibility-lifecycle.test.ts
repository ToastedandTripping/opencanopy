import { describe, it, expect, beforeEach } from "vitest";
import { createMockMap, type MockMap } from "../mocks/maplibre";
import { setupStoryLayers } from "@/lib/story/setup-layers";
import { applyLayerVisibility } from "@/lib/story/visibility";
import type { ChapterLayer } from "@/data/chapters";

/**
 * Visibility lifecycle tests.
 *
 * These simulate the exact sequence that happens in StoryMap:
 * 1. setupStoryLayers() -- called in onLoad, registers all sources + layers
 * 2. applyLayerVisibility() -- called by the visibility useEffect
 *
 * Phase 1 (2026-07): applyLayerVisibility shrank to forest-base management
 * only (the vector fill/outline/hatch layers it used to also drive were
 * deleted -- minzoom:9 detail layers the story never zoomed past z8 to
 * reach). applyTimelineFilter died with its only consumer
 * (story-cutblocks-fill/outline) and is gone from this suite.
 *
 * The mock map tracks every setPaintProperty call so we can verify the
 * pipeline produces correct paint values.
 */

describe("visibility lifecycle", () => {
  let map: MockMap;

  /** Simulate onLoad: register all layers. */
  function simulateOnLoad() {
    setupStoryLayers(map);
  }

  beforeEach(() => {
    map = createMockMap();
  });

  // ── Basic visibility activation ─────────────────────────────────

  describe("forest-base activation", () => {
    it("shows the green forest base (story-forest-base) when forest-age is active", () => {
      simulateOnLoad();

      const layers: ChapterLayer[] = [{ id: "forest-age", opacity: 0.6 }];
      applyLayerVisibility(map, layers);

      expect(map.getPaintProperty("story-forest-base", "raster-opacity")).toBe(0.7);
    });

    it("hides the green forest base when forest-age is not in layers", () => {
      simulateOnLoad();

      // First activate -> green base shows
      applyLayerVisibility(map, [{ id: "forest-age", opacity: 0.6 }]);
      expect(map.getPaintProperty("story-forest-base", "raster-opacity")).toBe(0.7);

      // Then deactivate (empty layers) -> green base hidden
      applyLayerVisibility(map, []);
      expect(map.getPaintProperty("story-forest-base", "raster-opacity")).toBe(0);
    });

    it("forest-base opacity does not depend on the configured chapter opacity value, only presence", () => {
      simulateOnLoad();

      // Chapters vary forest-age opacity (0.6, 0.5, 0.4, 0.3, 0.25...) but
      // forest-base is always 0.7 when present -- it's a fixed substrate, not
      // scaled by the chapter's `opacity` field.
      applyLayerVisibility(map, [{ id: "forest-age", opacity: 0.25 }]);
      expect(map.getPaintProperty("story-forest-base", "raster-opacity")).toBe(0.7);
    });
  });

  // ── Binary end-reveal (the ending chapter) ──────────────

  describe("revealBinary flag: the ending chapter", () => {
    it("revealBinary=true does NOT write story-binary-reveal (per-frame effect owns it)", () => {
      simulateOnLoad();

      const layers: ChapterLayer[] = [{ id: "forest-age", opacity: 0.7 }];
      map._getCalls().setPaintProperty.length = 0;
      applyLayerVisibility(map, layers, /* revealBinary */ true);

      const binaryCalls = map
        ._getCalls()
        .setPaintProperty.filter(
          (c) =>
            c.layerId === "story-binary-reveal" &&
            c.property === "raster-opacity"
        );
      expect(binaryCalls.length).toBe(0);
    });

    it("revealBinary=true hides story-forest-base (green base)", () => {
      simulateOnLoad();

      const layers: ChapterLayer[] = [{ id: "forest-age", opacity: 0.7 }];
      applyLayerVisibility(map, layers, /* revealBinary */ true);

      expect(map.getPaintProperty("story-forest-base", "raster-opacity")).toBe(0);
    });

    it("revealBinary=false does NOT write story-binary-reveal (per-frame effect owns it)", () => {
      simulateOnLoad();

      const layers: ChapterLayer[] = [{ id: "forest-age", opacity: 0.7 }];
      map._getCalls().setPaintProperty.length = 0;
      applyLayerVisibility(map, layers, /* revealBinary */ false);

      const binaryCalls = map
        ._getCalls()
        .setPaintProperty.filter(
          (c) =>
            c.layerId === "story-binary-reveal" &&
            c.property === "raster-opacity"
        );
      expect(binaryCalls.length).toBe(0);
    });

    it("revealBinary=false restores story-forest-base when forest-age is active", () => {
      simulateOnLoad();

      const layers: ChapterLayer[] = [{ id: "forest-age", opacity: 0.7 }];
      applyLayerVisibility(map, layers, /* revealBinary */ false);

      expect(map.getPaintProperty("story-forest-base", "raster-opacity")).toBe(0.7);
    });

    it("revealBinary=undefined (omitted) does not write story-binary-reveal; restores forest-base", () => {
      simulateOnLoad();

      const layers: ChapterLayer[] = [{ id: "forest-age", opacity: 0.7 }];
      map._getCalls().setPaintProperty.length = 0;
      applyLayerVisibility(map, layers);

      const binaryCalls = map
        ._getCalls()
        .setPaintProperty.filter(
          (c) =>
            c.layerId === "story-binary-reveal" &&
            c.property === "raster-opacity"
        );
      expect(binaryCalls.length).toBe(0);
      expect(map.getPaintProperty("story-forest-base", "raster-opacity")).toBe(0.7);
    });
  });

  // ── TIMING: the critical sequence ───────────────────────────────

  describe("TIMING: onLoad -> visibility -> paint", () => {
    it("full pipeline: onLoad registers layers at opacity 0, then visibility sets paint", () => {
      // Step 1: onLoad -- registers all layers at opacity 0
      simulateOnLoad();

      expect(map.getLayer("story-forest-base")).toBeDefined();
      expect(map.getPaintProperty("story-forest-base", "raster-opacity")).toBe(0);

      // Step 2: isStyleLoaded must be true for visibility to fire
      expect(map.isStyleLoaded()).toBe(true);

      // Step 3: Visibility effect fires (triggered by mapLoaded state change)
      const layers: ChapterLayer[] = [{ id: "forest-age", opacity: 0.6 }];
      applyLayerVisibility(map, layers);

      // Step 4: Verify paint properties were actually set.
      expect(map.getPaintProperty("story-forest-base", "raster-opacity")).toBe(0.7);
    });

    it("style not loaded: paints nothing now, defers via map.once('idle'), and applies on that idle", () => {
      // Guards the deferral branch in visibility.ts. Before 2026-09-01 the
      // test only asserted "no paint" and then re-called the function by hand,
      // so deleting the map.once registration left every test green while
      // production silently never re-applied after a late style load.
      simulateOnLoad();
      map._setStyleLoaded(false);

      const layers: ChapterLayer[] = [{ id: "forest-age", opacity: 0.6 }];
      map._getCalls().setPaintProperty.length = 0;

      applyLayerVisibility(map, layers);

      expect(map._getCalls().setPaintProperty.length).toBe(0);
      expect(map.once).toHaveBeenCalledWith("idle", expect.any(Function));

      // The style finishes loading and MapLibre fires idle: the deferred
      // call must apply the paint with no further call from the component.
      map._setStyleLoaded(true);
      map._emit("idle");

      expect(map.getPaintProperty("story-forest-base", "raster-opacity")).toBe(0.7);
    });

    it("visibility does nothing when layers not yet registered", () => {
      // Don't call simulateOnLoad -- no layers registered
      const layers: ChapterLayer[] = [{ id: "forest-age", opacity: 0.6 }];

      applyLayerVisibility(map, layers);

      // getLayer("story-forest-base") returns undefined -- no visual changes
      const calls = map._getCalls().setPaintProperty;
      expect(calls.length).toBe(0);
    });

    it("simulates complete chapter transition: overview -> logging-timeline -> fire", () => {
      simulateOnLoad();

      // Chapter 0: overview -- forest-age active
      applyLayerVisibility(map, [{ id: "forest-age", opacity: 0.6 }]);
      expect(map.getPaintProperty("story-forest-base", "raster-opacity")).toBe(0.7);

      // Chapter 1: logging-timeline -- forest-age still active (opacity value
      // itself doesn't matter to forest-base, only presence)
      applyLayerVisibility(map, [{ id: "forest-age", opacity: 0.4 }]);
      expect(map.getPaintProperty("story-forest-base", "raster-opacity")).toBe(0.7);

      // Chapter: ending -- revealBinary flips on, forest-base hides
      applyLayerVisibility(map, [{ id: "forest-age", opacity: 0.25 }], true);
      expect(map.getPaintProperty("story-forest-base", "raster-opacity")).toBe(0);
    });
  });

});
