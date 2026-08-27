/**
 * Verify that renamed layer IDs are resolved from localStorage via the alias map.
 * Mutation-verified: removing resolveAliases from readFromStorage causes this to fail.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";

// We need to test the resolution path through the public API.
// resolveAliases is exported for use in useMapState, so we can test it directly
// and also test the integration via resolveInitialLayers.
import { resolveAliases } from "@/hooks/useLayerState";

describe("layer ID alias resolution", () => {
  it("resolves tap-deferrals to old-growth-250", () => {
    const result = resolveAliases(["tap-deferrals", "parks"]);
    expect(result).toEqual(["old-growth-250", "parks"]);
  });

  it("resolves conservation-priority to tap-priority", () => {
    const result = resolveAliases(["conservation-priority"]);
    expect(result).toEqual(["tap-priority"]);
  });

  it("passes through current IDs unchanged", () => {
    const result = resolveAliases(["old-growth-250", "forest-age", "parks"]);
    expect(result).toEqual(["old-growth-250", "forest-age", "parks"]);
  });

  it("resolves both aliases simultaneously", () => {
    const result = resolveAliases(["tap-deferrals", "conservation-priority", "parks"]);
    expect(result).toEqual(["old-growth-250", "tap-priority", "parks"]);
  });
});

describe("localStorage alias integration", () => {
  const STORAGE_KEY = "opencanopy-layers-v2";

  beforeEach(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(["tap-deferrals", "parks"])
    );
  });

  afterEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  it("resolves legacy IDs stored in localStorage", async () => {
    // Import dynamically so localStorage is set before module evaluation
    const { resolveInitialLayers } = await import("@/hooks/useLayerState");
    // resolveInitialLayers falls through: URL hash (empty) -> localStorage -> defaults
    const result = resolveInitialLayers();
    expect(result).toContain("old-growth-250");
    expect(result).toContain("parks");
    expect(result).not.toContain("tap-deferrals");
  });
});
