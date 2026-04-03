import { describe, it, expect, beforeEach } from "vitest";
import { createMockMap } from "../mocks/maplibre";
import {
  setupStoryLayers,
  STORY_LAYER_IDS,
  STORY_SOURCE_IDS,
} from "@/lib/story/setup-layers";

describe("source + layer registration", () => {
  let map: ReturnType<typeof createMockMap>;

  const terrainConfig = {
    enabled: true,
    url: "https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=TEST",
    tileSize: 256,
  };

  beforeEach(() => {
    map = createMockMap();
  });

  // ── Source registration ─────────────────────────────────────────

  it("registers terrain-rgb source", () => {
    setupStoryLayers(map, { terrain: terrainConfig, hatchPattern: null });
    expect(map.getSource("terrain-rgb")).toBeDefined();
    const call = map._getCalls().addSource.find((c) => c.id === "terrain-rgb");
    expect(call).toBeDefined();
    expect(call!.config.type).toBe("raster-dem");
  });

  it("registers story-forest-age-raster source", () => {
    setupStoryLayers(map, { terrain: terrainConfig, hatchPattern: null });
    expect(map.getSource("story-forest-age-raster")).toBeDefined();
    const call = map._getCalls().addSource.find(
      (c) => c.id === "story-forest-age-raster"
    );
    expect(call).toBeDefined();
    expect(call!.config.type).toBe("raster");
    expect(call!.config.minzoom).toBe(4);
    expect(call!.config.maxzoom).toBe(9);
  });

  it("registers opencanopy shared PMTiles source", () => {
    setupStoryLayers(map, { terrain: terrainConfig, hatchPattern: null });
    expect(map.getSource("opencanopy")).toBeDefined();
    const call = map._getCalls().addSource.find(
      (c) => c.id === "opencanopy"
    );
    expect(call).toBeDefined();
    expect(call!.config.type).toBe("vector");
    expect((call!.config.url as string).startsWith("pmtiles://")).toBe(true);
  });

  it("skips terrain-rgb when terrain is disabled", () => {
    setupStoryLayers(map, {
      terrain: { ...terrainConfig, enabled: false },
      hatchPattern: null,
    });
    expect(map.getSource("terrain-rgb")).toBeUndefined();
  });

  // ── Layer creation ──────────────────────────────────────────────

  it("creates all 10 story layer IDs", () => {
    setupStoryLayers(map, { terrain: terrainConfig, hatchPattern: null });

    for (const layerId of STORY_LAYER_IDS) {
      expect(map.getLayer(layerId)).toBeDefined();
    }
  });

  it("creates exactly 11 layers (plus terrain-controlled hillshade)", () => {
    setupStoryLayers(map, { terrain: terrainConfig, hatchPattern: null });
    const addLayerCalls = map._getCalls().addLayer;
    // 11 story layers including hillshade
    expect(addLayerCalls.length).toBe(11);
  });

  // ── Initial opacity ─────────────────────────────────────────────

  it("all fill layers start at opacity 0", () => {
    setupStoryLayers(map, { terrain: terrainConfig, hatchPattern: null });

    const fillLayers = [
      "story-forest-age-fill",
      "story-cutblocks-fill",
      "story-fire-history-fill",
      "story-parks-fill",
      "story-harvested-hatch",
    ];

    for (const layerId of fillLayers) {
      const opacity = map.getPaintProperty(layerId, "fill-opacity");
      expect(opacity).toBe(0);
    }
  });

  it("all line layers start at opacity 0", () => {
    setupStoryLayers(map, { terrain: terrainConfig, hatchPattern: null });

    const lineLayers = [
      "story-forest-age-outline",
      "story-cutblocks-outline",
      "story-fire-history-outline",
      "story-parks-outline",
    ];

    for (const layerId of lineLayers) {
      const opacity = map.getPaintProperty(layerId, "line-opacity");
      expect(opacity).toBe(0);
    }
  });

  it("raster layer starts at opacity 0", () => {
    setupStoryLayers(map, { terrain: terrainConfig, hatchPattern: null });
    const opacity = map.getPaintProperty(
      "story-forest-age-raster",
      "raster-opacity"
    );
    expect(opacity).toBe(0);
  });

  // ── Insert order ────────────────────────────────────────────────

  it("layers inserted below first symbol (basemap-label)", () => {
    setupStoryLayers(map, { terrain: terrainConfig, hatchPattern: null });

    const addLayerCalls = map._getCalls().addLayer;
    for (const call of addLayerCalls) {
      expect(call.beforeId).toBe("basemap-label");
    }
  });

  // ── Idempotency ─────────────────────────────────────────────────

  it("calling setupStoryLayers twice does not throw", () => {
    const opts = { terrain: terrainConfig, hatchPattern: null };
    setupStoryLayers(map, opts);
    // Second call should be a no-op, not throw "already exists"
    expect(() => setupStoryLayers(map, opts)).not.toThrow();
  });

  it("calling setupStoryLayers twice does not duplicate layers", () => {
    const opts = { terrain: terrainConfig, hatchPattern: null };
    setupStoryLayers(map, opts);
    const firstCallCount = map._getCalls().addLayer.length;
    setupStoryLayers(map, opts);
    // No new addLayer calls on second run
    expect(map._getCalls().addLayer.length).toBe(firstCallCount);
  });

  // ── Hatch pattern ───────────────────────────────────────────────

  it("adds hatch-pattern image when hatchPattern provided", () => {
    const fakePattern = { width: 16, height: 16 };
    setupStoryLayers(map, {
      terrain: terrainConfig,
      hatchPattern: fakePattern,
    });
    expect(map.addImage).toHaveBeenCalledWith(
      "hatch-pattern",
      fakePattern,
      { sdf: false }
    );
  });

  it("skips hatch-pattern image when hatchPattern is null", () => {
    setupStoryLayers(map, { terrain: terrainConfig, hatchPattern: null });
    expect(map.addImage).not.toHaveBeenCalled();
  });

  // ── Source IDs export ───────────────────────────────────────────

  it("STORY_SOURCE_IDS matches registered sources", () => {
    setupStoryLayers(map, { terrain: terrainConfig, hatchPattern: null });
    for (const sourceId of STORY_SOURCE_IDS) {
      expect(map.getSource(sourceId)).toBeDefined();
    }
  });
});
