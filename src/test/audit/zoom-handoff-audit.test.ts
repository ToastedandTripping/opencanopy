/**
 * Part B — Check 6: Zoom Handoff Continuity
 *
 * Every registry layer declares a `zoomRange` — the zooms at which it claims
 * to render. This audit checks that claim against what DataLayer.tsx will
 * actually put on the map, using the registry fields DataLayer reads:
 *
 *   - raster overview:  [rasterOverview.minZoom, rasterOverview.maxZoom]
 *                       (DataLayer passes maxzoom = maxZoom + 1, exclusive)
 *   - PMTiles fill:     [effectiveTileMin, 22] — overzoom to z22. The fill's
 *                       minzoom is `rasterOverview.maxZoom + 1` when an
 *                       overview exists, else `tileSource.minZoom` (the
 *                       province-scale crash gate), else 0
 *                       (DataLayer.tsx: `tileMinZoom={hasRasterOverview ?
 *                       rasterMaxZoom + 1 : layer.tileSource.minZoom}` and
 *                       `minzoom = tileMinZoom ?? 0`).
 *   - WFS-only:         [zoomRange[0], zoomRange[1]] — WfsLayers fetches on
 *                       every moveend inside zoomRange; tile-backed layers
 *                       never mount WfsLayers (D10).
 *
 * The invariants are stated against registry VALUES, not against each other:
 * the pre-2026-09 version of this file derived each tier's minZoom from the
 * previous tier's maxZoom, so its "no gaps" check could not fail for any
 * registry input. Now:
 *
 *   1. Every integer zoom in zoomRange is covered by some tier
 *      (a layer must not claim a zoom at which nothing renders).
 *   2. zoomRange[0] is not below the layer's own lowest tier minimum
 *      (a gated layer must not advertise the zooms its crash-gate hides).
 *   3. The raster overview ends before the tileset's native max zoom, so the
 *      fill takes over on real vector tiles, not on overzoomed ones; and the
 *      overview starts no later than the layer claims to render.
 *
 * Deliberately NOT asserted: raster→fill adjacency (fill minzoom ==
 * rasterOverview.maxZoom + 1). DataLayer constructs it that way, so no
 * registry value can break it and a test of it cannot fail.
 *
 * Mutation-verified 2026-09-01: setting logging-risk zoomRange to [5, 18]
 * (gate at 9) fails invariant 2; setting forest-age rasterOverview.maxZoom to
 * 12 (== PMTILES max) fails invariant 3.
 */

import { describe, it, expect } from "vitest";
import { LAYER_REGISTRY } from "@/lib/layers/registry";
import type { LayerDefinition } from "@/types/layers";

const PMTILES_OVERZOOM_MAX = 22; // DataLayer.addLayersToMap: `const maxzoom = 22`

interface ZoomTier {
  name: "raster" | "pmtiles" | "wfs";
  minZoom: number;
  maxZoom: number; // inclusive
}

/** Tiers from registry fields, with DataLayer's minzoom rule applied verbatim. */
export function computeZoomTiers(layer: LayerDefinition): ZoomTier[] {
  const tiers: ZoomTier[] = [];

  if (layer.rasterOverview) {
    tiers.push({
      name: "raster",
      minZoom: layer.rasterOverview.minZoom,
      maxZoom: layer.rasterOverview.maxZoom,
    });
  }

  if (layer.tileSource) {
    const effectiveTileMin = layer.rasterOverview
      ? layer.rasterOverview.maxZoom + 1
      : (layer.tileSource.minZoom ?? 0);
    tiers.push({
      name: "pmtiles",
      minZoom: effectiveTileMin,
      maxZoom: PMTILES_OVERZOOM_MAX,
    });
  } else if (layer.source.type === "wfs") {
    tiers.push({
      name: "wfs",
      minZoom: layer.zoomRange[0],
      maxZoom: layer.zoomRange[1],
    });
  }

  return tiers;
}

/** Integer zooms in [zoomRange[0], zoomRange[1]] not covered by any tier. */
export function uncoveredZooms(layer: LayerDefinition, tiers: ZoomTier[]): number[] {
  const missing: number[] = [];
  for (let z = layer.zoomRange[0]; z <= layer.zoomRange[1]; z++) {
    if (!tiers.some((t) => z >= t.minZoom && z <= t.maxZoom)) missing.push(z);
  }
  return missing;
}

// satellite is a raster basemap with neither a tileSource nor a WFS source.
const auditLayers = LAYER_REGISTRY.filter((l) => l.id !== "satellite");

describe("Check 6: Zoom handoff continuity", () => {
  it("audits every non-satellite registry layer", () => {
    expect(auditLayers.length).toBe(LAYER_REGISTRY.length - 1);
    for (const layer of auditLayers) {
      expect(computeZoomTiers(layer).length, `${layer.id} produced no tiers`).toBeGreaterThan(0);
    }
  });

  describe("1. every zoom in zoomRange is rendered by some tier", () => {
    for (const layer of auditLayers) {
      it(`${layer.id}: zoomRange [${layer.zoomRange.join(", ")}] fully covered`, () => {
        const tiers = computeZoomTiers(layer);
        const missing = uncoveredZooms(layer, tiers);
        expect(
          missing,
          `layer "${layer.id}" claims zooms ${missing.join(", ")} but no tier renders there ` +
            `(tiers: ${tiers.map((t) => `${t.name} z${t.minZoom}-${t.maxZoom}`).join(", ")})`
        ).toHaveLength(0);
      });
    }
  });

  describe("2. zoomRange does not start below the layer's lowest tier", () => {
    for (const layer of auditLayers) {
      it(`${layer.id}: zoomRange[0] >= lowest tier minZoom`, () => {
        const tiers = computeZoomTiers(layer);
        const lowest = Math.min(...tiers.map((t) => t.minZoom));
        expect(
          layer.zoomRange[0],
          `layer "${layer.id}" advertises z${layer.zoomRange[0]} but nothing renders below z${lowest} ` +
            "(a tileSource.minZoom crash-gate or rasterOverview.minZoom hides those zooms)"
        ).toBeGreaterThanOrEqual(lowest);
      });
    }
  });

  describe("3. raster overview hands off onto native vector tiles", () => {
    const rasterLayers = auditLayers.filter((l) => l.rasterOverview && l.tileSource);

    it("at least one layer has both a raster overview and a tileSource (forest-age)", () => {
      expect(rasterLayers.map((l) => l.id)).toContain("forest-age");
    });

    for (const layer of rasterLayers) {
      it(`${layer.id}: fill begins (rasterOverview.maxZoom + 1) at or below tileSource.maxZoom`, () => {
        expect(
          layer.rasterOverview!.maxZoom + 1,
          `layer "${layer.id}" overview runs to z${layer.rasterOverview!.maxZoom} but native vector ` +
            `tiles stop at z${layer.tileSource!.maxZoom}: the fill would take over on overzoomed tiles only`
        ).toBeLessThanOrEqual(layer.tileSource!.maxZoom);
      });

      it(`${layer.id}: overview starts no later than zoomRange[0]`, () => {
        expect(layer.rasterOverview!.minZoom).toBeLessThanOrEqual(layer.zoomRange[0]);
      });
    }
  });

  describe("tier shape (documents the three rendering families)", () => {
    it("WFS-only layer (fish-streams) has a single wfs tier spanning its zoomRange", () => {
      const layer = LAYER_REGISTRY.find((l) => l.id === "fish-streams")!;
      const tiers = computeZoomTiers(layer);
      expect(tiers.map((t) => t.name)).toEqual(["wfs"]);
      expect([tiers[0].minZoom, tiers[0].maxZoom]).toEqual(layer.zoomRange);
    });

    it("tile-backed layer without overview (parks) has one pmtiles tier from its gate (or z0) to z22", () => {
      const layer = LAYER_REGISTRY.find((l) => l.id === "parks")!;
      const tiers = computeZoomTiers(layer);
      expect(tiers.map((t) => t.name)).toEqual(["pmtiles"]);
      expect(tiers[0].minZoom).toBe(layer.tileSource!.minZoom ?? 0);
      expect(tiers[0].maxZoom).toBe(PMTILES_OVERZOOM_MAX);
    });

    it("gated layer (logging-risk) starts its pmtiles tier at tileSource.minZoom", () => {
      const layer = LAYER_REGISTRY.find((l) => l.id === "logging-risk")!;
      expect(layer.tileSource!.minZoom).toBeDefined();
      const tiers = computeZoomTiers(layer);
      expect(tiers[0].minZoom).toBe(layer.tileSource!.minZoom);
    });

    it("raster + tiles layer (forest-age) has raster then pmtiles", () => {
      const layer = LAYER_REGISTRY.find((l) => l.id === "forest-age")!;
      expect(computeZoomTiers(layer).map((t) => t.name)).toEqual(["raster", "pmtiles"]);
    });
  });
});
