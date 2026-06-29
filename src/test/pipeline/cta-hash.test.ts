/**
 * CTA continuity hash round-trip test.
 *
 * Verifies that buildMapHash(STORY_END_CAMERA) produces a hash string that
 * parseHash() (the /map page's URL reader) correctly deserializes back to the
 * same camera values with forest-age layer on.
 *
 * This is a contract test: if either buildMapHash or parseHash change format,
 * the round-trip breaks and this test fails — ensuring the story-to-map
 * hand-off ("Explore the Map" href) always lands at the correct viewport.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { STORY_END_CAMERA } from "@/data/chapters";
import { buildMapHash } from "@/lib/story/map-hash";
import { parseHash } from "@/hooks/useMapState";

beforeEach(() => {
  window.history.replaceState(null, "", "/"); // clear any existing hash
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("buildMapHash / parseHash round-trip", () => {
  it("buildMapHash produces a non-empty string", () => {
    const hash = buildMapHash(STORY_END_CAMERA);
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });

  it("hash does not include a leading #", () => {
    const hash = buildMapHash(STORY_END_CAMERA);
    expect(hash.startsWith("#")).toBe(false);
  });

  it("hash contains lat, lng, z, and layers params", () => {
    const hash = buildMapHash(STORY_END_CAMERA);
    expect(hash).toContain("lat=");
    expect(hash).toContain("lng=");
    expect(hash).toContain("z=");
    expect(hash).toContain("layers=forest-age");
  });

  it("parseHash restores lat from STORY_END_CAMERA", () => {
    const hash = buildMapHash(STORY_END_CAMERA);
    window.history.replaceState(null, "", `/#${hash}`);

    const parsed = parseHash();
    const [, lat] = STORY_END_CAMERA.center;
    expect(parsed.lat).toBeCloseTo(lat, 4);
  });

  it("parseHash restores lng from STORY_END_CAMERA", () => {
    const hash = buildMapHash(STORY_END_CAMERA);
    window.history.replaceState(null, "", `/#${hash}`);

    const parsed = parseHash();
    const [lng] = STORY_END_CAMERA.center;
    expect(parsed.lng).toBeCloseTo(lng, 4);
  });

  it("parseHash restores zoom from STORY_END_CAMERA", () => {
    const hash = buildMapHash(STORY_END_CAMERA);
    window.history.replaceState(null, "", `/#${hash}`);

    const parsed = parseHash();
    expect(parsed.zoom).toBeCloseTo(STORY_END_CAMERA.zoom, 1);
  });

  it("parseHash returns layers=['forest-age']", () => {
    const hash = buildMapHash(STORY_END_CAMERA);
    window.history.replaceState(null, "", `/#${hash}`);

    const parsed = parseHash();
    expect(parsed.layers).toEqual(["forest-age"]);
  });
});
