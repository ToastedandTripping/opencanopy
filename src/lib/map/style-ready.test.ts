/**
 * onStyleReady: the single readiness primitive for map writes (Amendment A).
 *
 * 23. Immediate when the style JSON is parsed (getStyle() defined), even while
 *     tiles are in flight (isStyleLoaded() false, `load` never fired); deferred
 *     to `style.load` when not parsed; cancel removes the pending listener.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockMap, type MockMap } from "@/test/mocks/maplibre";
import { onStyleReady, type StyleReadyMap } from "./style-ready";

let mockMap: MockMap;
const asMap = (m: MockMap) => m as unknown as StyleReadyMap;

beforeEach(() => {
  mockMap = createMockMap();
});

describe("23: onStyleReady", () => {
  it("runs now when the style is parsed, even with tiles pending and no load", () => {
    mockMap._setTilesPending(true);
    expect(mockMap.isStyleLoaded()).toBe(false); // the production condition
    const cb = vi.fn();
    onStyleReady(asMap(mockMap), cb);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("waits for style.load when the style is not parsed, and fires once", () => {
    mockMap._setStyleLoaded(false);
    const cb = vi.fn();
    onStyleReady(asMap(mockMap), cb);
    expect(cb).not.toHaveBeenCalled();
    mockMap._emit("load"); // not the readiness event
    expect(cb).not.toHaveBeenCalled();
    mockMap._setStyleLoaded(true);
    mockMap._emit("style.load");
    mockMap._emit("style.load");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("cancel removes the pending listener", () => {
    mockMap._setStyleLoaded(false);
    const cb = vi.fn();
    const cancel = onStyleReady(asMap(mockMap), cb);
    expect(mockMap._listenerCount("style.load")).toBe(1);
    cancel();
    expect(mockMap._listenerCount("style.load")).toBe(0);
    mockMap._setStyleLoaded(true);
    mockMap._emit("style.load");
    expect(cb).not.toHaveBeenCalled();
  });
});
