import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createMockMap } from "../mocks/maplibre";
import {
  setupStoryLayers,
  STORY_LAYER_IDS,
  STORY_SOURCE_IDS,
} from "@/lib/story/setup-layers";

describe("source + layer registration", () => {
  let map: ReturnType<typeof createMockMap>;

  beforeEach(() => {
    map = createMockMap();
  });

  // ── Source registration ─────────────────────────────────────────

  it("registers story-forest-base source", () => {
    setupStoryLayers(map);
    expect(map.getSource("story-forest-base")).toBeDefined();
    const call = map._getCalls().addSource.find((c) => c.id === "story-forest-base");
    expect(call).toBeDefined();
    expect(call!.config.type).toBe("image");
  });

  it("registers story-year-overlay and story-fire-overlay image sources", () => {
    setupStoryLayers(map);
    expect(map.getSource("story-year-overlay")).toBeDefined();
    expect(map.getSource("story-fire-overlay")).toBeDefined();
  });

  it("registers story-binary-reveal raster source with bounds", () => {
    setupStoryLayers(map);
    expect(map.getSource("story-binary-reveal")).toBeDefined();
    const call = map._getCalls().addSource.find((c) => c.id === "story-binary-reveal");
    expect(call).toBeDefined();
    expect(call!.config.type).toBe("raster");
    expect(call!.config.minzoom).toBe(4);
    expect(call!.config.maxzoom).toBe(9);
    // 404-quieting (Phase 1, Part C): bounds clips off-bbox tile requests.
    expect(call!.config.bounds).toBeDefined();
    expect(Array.isArray(call!.config.bounds)).toBe(true);
    expect((call!.config.bounds as number[]).length).toBe(4);
  });

  it("story-binary-reveal uses the ocbin:// custom protocol, not a raw https URL", () => {
    setupStoryLayers(map);
    const call = map._getCalls().addSource.find((c) => c.id === "story-binary-reveal");
    const tiles = call!.config.tiles as string[];
    expect(tiles[0]).toMatch(/^ocbin:\/\//);
  });

  it("does NOT register a PMTiles vector source (Phase 1: story's vector detail layers removed)", () => {
    setupStoryLayers(map);
    expect(map.getSource("opencanopy")).toBeUndefined();
  });

  // Phase 1 correction (2026-07): story-hillshade/terrain-rgb are NOT dead --
  // Phase 1 mis-classified them. They're gated on TERRAIN_SOURCE.enabled
  // (mapConfig.ts), and production HAS a MapTiler key configured, so they DO
  // render live. This sandbox/test env has no NEXT_PUBLIC_MAPTILER_KEY, so
  // the static (unmocked) import above reflects the "no key" branch here --
  // see the "terrain hillshade" describe block below for both branches,
  // exercised directly via env stubbing + a fresh module import.
  it("does NOT register terrain-rgb or story-hillshade when no MapTiler key is configured (this test env)", () => {
    setupStoryLayers(map);
    expect(map.getSource("terrain-rgb")).toBeUndefined();
    expect(map.getLayer("story-hillshade")).toBeUndefined();
  });

  // ── Layer creation ──────────────────────────────────────────────

  it("creates exactly the 4 STORY_LAYER_IDS, nothing more (no MapTiler key in this test env)", () => {
    setupStoryLayers(map);

    for (const layerId of STORY_LAYER_IDS) {
      expect(map.getLayer(layerId)).toBeDefined();
    }

    const addLayerCalls = map._getCalls().addLayer;
    expect(addLayerCalls.length).toBe(STORY_LAYER_IDS.length);
    expect(STORY_LAYER_IDS.length).toBe(4);
  });

  it("does not create the deleted vector/hatch/forest-age-raster layers", () => {
    setupStoryLayers(map);
    const deleted = [
      "story-hillshade",
      "story-forest-age-raster",
      "story-harvested-hatch",
      "story-forest-age-fill",
      "story-forest-age-outline",
      "story-cutblocks-fill",
      "story-cutblocks-outline",
      "story-fire-history-fill",
      "story-fire-history-outline",
      "story-parks-fill",
      "story-parks-outline",
    ];
    for (const layerId of deleted) {
      expect(map.getLayer(layerId)).toBeUndefined();
    }
  });

  // ── Initial opacity ─────────────────────────────────────────────

  it("all raster layers start at opacity 0", () => {
    setupStoryLayers(map);

    for (const layerId of STORY_LAYER_IDS) {
      const opacity = map.getPaintProperty(layerId, "raster-opacity");
      expect(opacity).toBe(0);
    }
  });

  // ── Insert order ────────────────────────────────────────────────

  it("layers inserted below first symbol (basemap-label)", () => {
    setupStoryLayers(map);

    const addLayerCalls = map._getCalls().addLayer;
    for (const call of addLayerCalls) {
      expect(call.beforeId).toBe("basemap-label");
    }
  });

  // ── Idempotency ─────────────────────────────────────────────────

  it("calling setupStoryLayers twice does not throw", () => {
    setupStoryLayers(map);
    // Second call should be a no-op, not throw "already exists"
    expect(() => setupStoryLayers(map)).not.toThrow();
  });

  it("calling setupStoryLayers twice does not duplicate layers", () => {
    setupStoryLayers(map);
    const firstCallCount = map._getCalls().addLayer.length;
    setupStoryLayers(map);
    // No new addLayer calls on second run
    expect(map._getCalls().addLayer.length).toBe(firstCallCount);
  });

  // ── Source IDs export ───────────────────────────────────────────

  it("STORY_SOURCE_IDS matches registered sources", () => {
    setupStoryLayers(map);
    for (const sourceId of STORY_SOURCE_IDS) {
      expect(map.getSource(sourceId)).toBeDefined();
    }
  });

  it("STORY_SOURCE_IDS no longer includes the PMTiles or forest-age-raster sources (permanently deleted, not key-gated)", () => {
    const sourceIds = [...STORY_SOURCE_IDS];
    expect(sourceIds).not.toContain("opencanopy");
    expect(sourceIds).not.toContain("story-forest-age-raster");
  });
});

// ── Terrain hillshade (Phase 1 correction: restored, gated on MapTiler key) ──
//
// story-hillshade/terrain-rgb are gated on TERRAIN_SOURCE.enabled, which is
// itself derived from process.env.NEXT_PUBLIC_MAPTILER_KEY at module load
// (mapConfig.ts). Both STORY_LAYER_IDS/STORY_SOURCE_IDS and the runtime
// addSource/addLayer calls read that same module-scope constant, so we stub
// the env var and re-import the module fresh (vi.resetModules) to exercise
// both branches -- this test env itself has no key configured (see the
// describe block above), so this is the only way to prove the "key present"
// path (the one that's actually live in production) still works.
describe("terrain hillshade (gated on MapTiler key presence)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("registers terrain-rgb (raster-dem) + story-hillshade when NEXT_PUBLIC_MAPTILER_KEY is set", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "test-key");
    vi.resetModules();
    const { createMockMap: freshCreateMockMap } = await import("../mocks/maplibre");
    const {
      setupStoryLayers: freshSetupStoryLayers,
      STORY_LAYER_IDS: freshLayerIds,
      STORY_SOURCE_IDS: freshSourceIds,
    } = await import("@/lib/story/setup-layers");

    const freshMap = freshCreateMockMap();
    freshSetupStoryLayers(freshMap);

    expect(freshLayerIds).toContain("story-hillshade");
    expect(freshSourceIds).toContain("terrain-rgb");

    const sourceCall = freshMap._getCalls().addSource.find((c) => c.id === "terrain-rgb");
    expect(sourceCall).toBeDefined();
    expect(sourceCall!.config.type).toBe("raster-dem");
    expect(sourceCall!.config.tileSize).toBe(256);
    expect(sourceCall!.config.url).toContain("terrain-rgb-v2");

    const layerCall = freshMap._getCalls().addLayer.find(
      (c) => c.config.id === "story-hillshade"
    );
    expect(layerCall).toBeDefined();
    expect(layerCall!.config.type).toBe("hillshade");
    expect(layerCall!.config.source).toBe("terrain-rgb");
    expect(layerCall!.config.paint).toEqual({
      "hillshade-illumination-direction": 315,
      "hillshade-shadow-color": "#000000",
      "hillshade-highlight-color": "#1a1a2e",
      "hillshade-exaggeration": 0.3,
      "hillshade-illumination-anchor": "viewport",
    });

    // Registered first -- bottom of the story's z-order, exactly as before
    // the Phase 1 cleanup mis-removed it.
    expect(freshMap._getCalls().addLayer[0].config.id).toBe("story-hillshade");
  });

  it("skips terrain-rgb + story-hillshade when no MapTiler key is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_MAPTILER_KEY", "");
    vi.resetModules();
    const { createMockMap: freshCreateMockMap } = await import("../mocks/maplibre");
    const {
      setupStoryLayers: freshSetupStoryLayers,
      STORY_LAYER_IDS: freshLayerIds,
      STORY_SOURCE_IDS: freshSourceIds,
    } = await import("@/lib/story/setup-layers");

    const freshMap = freshCreateMockMap();
    freshSetupStoryLayers(freshMap);

    expect(freshLayerIds).not.toContain("story-hillshade");
    expect(freshSourceIds).not.toContain("terrain-rgb");
    expect(freshMap.getSource("terrain-rgb")).toBeUndefined();
    expect(freshMap.getLayer("story-hillshade")).toBeUndefined();
  });
});
