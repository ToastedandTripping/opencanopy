import { describe, it, expect } from "vitest";
import { createMockMap } from "./mocks/maplibre";

describe("test infrastructure", () => {
  it("vitest runs", () => {
    expect(1 + 1).toBe(2);
  });

  it("mock map creates sources and layers", () => {
    const map = createMockMap();

    map.addSource("test-source", { type: "geojson", data: {} });
    expect(map.getSource("test-source")).toBeDefined();

    map.addLayer({ id: "test-layer", type: "fill", source: "test-source" });
    expect(map.getLayer("test-layer")).toBeDefined();

    map.setPaintProperty("test-layer", "fill-opacity", 0.5);
    expect(map.getPaintProperty("test-layer", "fill-opacity")).toBe(0.5);
  });
});
