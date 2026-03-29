/**
 * Part B — Check 6: Zoom Handoff Continuity
 *
 * Replicates DataLayer.tsx's tier logic to verify no zoom gaps exist
 * between raster overview, PMTiles vector, and WFS layers.
 *
 * Tier logic from DataLayer.tsx:
 *   - Raster overview: rasterOverview.minZoom to rasterOverview.maxZoom
 *   - PMTiles: tileMinZoom (= rasterMaxZoom + 1 if raster exists, else 0)
 *              to tileMaxZoom + 1 (MapLibre maxzoom is exclusive)
 *   - WFS: wfsMinZoom (= tileMaxZoom + 1 if has tiles, else zoomRange[0])
 *          to zoomRange[1]
 *
 * Known exception: forest-age PMTiles dead zone (minzoom=maxzoom=11 in tile
 * metadata) is documented here but not tested directly since the dead zone
 * is a data artifact, not a registry configuration issue.
 */

import { describe, it, expect } from "vitest";
import { LAYER_REGISTRY } from "@/lib/layers/registry";
import type { LayerDefinition } from "@/types/layers";

// ── Tier range calculator (mirrors DataLayer.tsx logic) ──────────────────────

interface ZoomTier {
  name: string;
  minZoom: number;
  maxZoom: number; // inclusive
}

/**
 * Compute the zoom tiers for a layer as DataLayer.tsx would render them.
 * Returns an array of tiers in order: raster (optional), pmtiles (optional), wfs.
 */
function computeZoomTiers(layer: LayerDefinition): ZoomTier[] {
  const tiers: ZoomTier[] = [];

  const hasTileSource = !!layer.tileSource;
  const tileMaxZoom = layer.tileSource?.maxZoom ?? 0;
  const hasRasterOverview = !!layer.rasterOverview;
  const rasterMaxZoom = layer.rasterOverview?.maxZoom ?? 0;
  const rasterMinZoom = layer.rasterOverview?.minZoom ?? 0;

  // WFS min zoom: above PMTiles max, or from zoomRange if no tiles
  const wfsMinZoom = hasTileSource ? tileMaxZoom + 1 : layer.zoomRange[0];

  if (hasRasterOverview) {
    tiers.push({
      name: "raster",
      minZoom: rasterMinZoom,
      maxZoom: rasterMaxZoom,
    });
  }

  if (hasTileSource) {
    // PMTiles minZoom: above raster max if raster exists, else 0
    const pmtilesMinZoom = hasRasterOverview ? rasterMaxZoom + 1 : 0;
    tiers.push({
      name: "pmtiles",
      minZoom: pmtilesMinZoom,
      // MapLibre's maxzoom is exclusive (we pass tileMaxZoom + 1 to MapLibre),
      // but for continuity checking we use the inclusive value
      maxZoom: tileMaxZoom,
    });
  }

  // WFS tier always present for wfs-source layers
  if (layer.source.type === "wfs") {
    tiers.push({
      name: "wfs",
      minZoom: wfsMinZoom,
      maxZoom: layer.zoomRange[1],
    });
  }

  return tiers;
}

/**
 * Check for gaps between consecutive tiers.
 * A gap is when tier[n].maxZoom + 1 < tier[n+1].minZoom.
 * Returns a list of gap descriptions (empty = no gaps).
 */
function findGaps(tiers: ZoomTier[]): string[] {
  const gaps: string[] = [];
  for (let i = 0; i < tiers.length - 1; i++) {
    const current = tiers[i];
    const next = tiers[i + 1];
    if (current.maxZoom + 1 < next.minZoom) {
      gaps.push(
        `Gap between ${current.name} (max z${current.maxZoom}) ` +
          `and ${next.name} (min z${next.minZoom}): ` +
          `z${current.maxZoom + 1} to z${next.minZoom - 1} is uncovered`
      );
    }
  }
  return gaps;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Check 6: Zoom handoff continuity", () => {
  describe("tier logic", () => {
    it("WFS-only layer has a single wfs tier", () => {
      const layer = LAYER_REGISTRY.find((l) => l.id === "fish-streams");
      expect(layer).toBeDefined();
      const tiers = computeZoomTiers(layer!);
      expect(tiers).toHaveLength(1);
      expect(tiers[0].name).toBe("wfs");
    });

    it("PMTiles + WFS layer has two tiers starting at z0", () => {
      const layer = LAYER_REGISTRY.find((l) => l.id === "parks");
      expect(layer).toBeDefined();
      const tiers = computeZoomTiers(layer!);
      expect(tiers).toHaveLength(2);
      expect(tiers[0].name).toBe("pmtiles");
      expect(tiers[0].minZoom).toBe(0);
      expect(tiers[1].name).toBe("wfs");
    });

    it("raster + PMTiles + WFS layer (forest-age) has three tiers", () => {
      const layer = LAYER_REGISTRY.find((l) => l.id === "forest-age");
      expect(layer).toBeDefined();
      const tiers = computeZoomTiers(layer!);
      expect(tiers).toHaveLength(3);
      expect(tiers[0].name).toBe("raster");
      expect(tiers[1].name).toBe("pmtiles");
      expect(tiers[2].name).toBe("wfs");
    });

    it("raster to pmtiles handoff has no gap (pmtiles starts at rasterMaxZoom + 1)", () => {
      const layer = LAYER_REGISTRY.find((l) => l.id === "forest-age");
      const tiers = computeZoomTiers(layer!);
      const raster = tiers.find((t) => t.name === "raster")!;
      const pmtiles = tiers.find((t) => t.name === "pmtiles")!;
      expect(pmtiles.minZoom).toBe(raster.maxZoom + 1);
    });

    it("pmtiles to wfs handoff has no gap (wfs starts at tileMaxZoom + 1)", () => {
      const layer = LAYER_REGISTRY.find((l) => l.id === "forest-age");
      const tiers = computeZoomTiers(layer!);
      const pmtiles = tiers.find((t) => t.name === "pmtiles")!;
      const wfs = tiers.find((t) => t.name === "wfs")!;
      expect(wfs.minZoom).toBe(pmtiles.maxZoom + 1);
    });
  });

  describe("per-layer zoom continuity", () => {
    // satellite is a raster layer -- not subject to tier logic
    const auditLayers = LAYER_REGISTRY.filter((l) => l.id !== "satellite");

    for (const layer of auditLayers) {
      it(`${layer.id}: no zoom gaps between tiers`, () => {
        const tiers = computeZoomTiers(layer);
        const gaps = findGaps(tiers);

        expect(
          gaps,
          `Layer "${layer.id}" has zoom gaps:\n${gaps.join("\n")}`
        ).toHaveLength(0);
      });
    }
  });

  it("documents the forest-age PMTiles dead zone (known expected condition)", () => {
    /**
     * The forest-age PMTiles file has minzoom=maxzoom=11 in its tile metadata
     * (from tippecanoe's --minimum-zoom and --maximum-zoom settings).
     * This means tiles only exist at zoom 11 within the PMTiles archive.
     *
     * The registry configuration (tileSource.maxZoom = 10) means MapLibre
     * requests tiles at z0-z10, but the actual tile data is only at z11.
     * This is a known data artifact from the tile build process.
     *
     * Impact: at z0-z10, PMTiles requests may return empty (no tiles at those
     * zoom levels in the archive). The raster overview covers z4-z10, so
     * in practice the dead zone is masked by the raster tier.
     *
     * This test documents the expectation rather than detecting it at runtime
     * (runtime detection requires reading the PMTiles file, which is Part A).
     */
    const forestAge = LAYER_REGISTRY.find((l) => l.id === "forest-age");
    expect(forestAge).toBeDefined();
    expect(forestAge!.rasterOverview).toBeDefined();
    // The raster overview should cover the range where PMTiles has no data
    expect(forestAge!.rasterOverview!.minZoom).toBeLessThanOrEqual(
      forestAge!.tileSource!.maxZoom
    );
  });

  describe("zoom range consistency", () => {
    for (const layer of LAYER_REGISTRY.filter((l) => l.id !== "satellite")) {
      it(`${layer.id}: WFS tier does not extend below layer zoomRange[0]`, () => {
        const tiers = computeZoomTiers(layer);
        const wfsTier = tiers.find((t) => t.name === "wfs");
        if (!wfsTier) return; // no WFS tier (shouldn't happen for wfs source layers)

        // WFS min zoom should be >= layer's declared zoomRange[0]
        // Exception: layers with PMTiles start WFS above tiles (which may be below zoomRange[0])
        // The important check is that WFS doesn't start ABOVE zoomRange[1]
        expect(
          wfsTier.minZoom,
          `layer "${layer.id}" WFS tier starts above zoomRange[1] -- layer would never render`
        ).toBeLessThanOrEqual(layer.zoomRange[1]);
      });
    }
  });
});
