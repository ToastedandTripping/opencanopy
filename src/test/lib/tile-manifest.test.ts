/**
 * Tests for the fail-open tile-presence manifest (src/lib/story/tile-manifest.ts).
 *
 * Two layers:
 *  1. Pure logic (parseTileManifest / isKnownMissingTile) -- exhaustive,
 *     no mocking required. This is the part that actually decides whether a
 *     request is suppressed, so it gets the most scrutiny: every failure mode
 *     (missing, malformed, wrong version, non-array, non-string entries) MUST
 *     resolve to fail-open (null / "not known missing"), never fail-closed.
 *  2. The addProtocol wrapper -- mocks maplibre-gl's addProtocol to capture
 *     the registered loadFn, then drives it directly (no real MapLibre map
 *     needed) to prove: known-missing tiles short-circuit without a network
 *     call, everything else falls through to a real fetch reconstructing the
 *     exact BINARY_RASTER_URL, and a missing/unparseable manifest never
 *     blocks a real tile.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BINARY_RASTER_URL } from "@/lib/r2-config";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { PNG } = require("pngjs");

// ── maplibre-gl mock: capture the registered protocol handler ───────────────

type LoadFn = (
  params: { url: string },
  abortController: AbortController
) => Promise<{ data: ArrayBuffer; cacheControl?: string; expires?: string }>;

const registeredProtocols = new Map<string, LoadFn>();

vi.mock("maplibre-gl", () => ({
  addProtocol: vi.fn((name: string, fn: LoadFn) => {
    registeredProtocols.set(name, fn);
  }),
}));

describe("parseTileManifest", () => {
  it("parses a well-formed, current-version manifest", async () => {
    const { parseTileManifest } = await import("@/lib/story/tile-manifest");
    const result = parseTileManifest(
      { version: "v3", tiles: ["4/2/3", "5/10/12"] },
      "v3"
    );
    expect(result).not.toBeNull();
    expect(result!.has("4/2/3")).toBe(true);
    expect(result!.has("9/9/9")).toBe(false);
  });

  it("fails open (null) when the payload is missing / not an object", async () => {
    const { parseTileManifest } = await import("@/lib/story/tile-manifest");
    expect(parseTileManifest(null, "v3")).toBeNull();
    expect(parseTileManifest(undefined, "v3")).toBeNull();
    expect(parseTileManifest("not an object", "v3")).toBeNull();
    expect(parseTileManifest(42, "v3")).toBeNull();
  });

  it("fails open when the version doesn't match (stale manifest)", async () => {
    const { parseTileManifest } = await import("@/lib/story/tile-manifest");
    const result = parseTileManifest({ version: "v2", tiles: ["4/2/3"] }, "v3");
    expect(result).toBeNull();
  });

  it("fails open when tiles is missing or not an array", async () => {
    const { parseTileManifest } = await import("@/lib/story/tile-manifest");
    expect(parseTileManifest({ version: "v3" }, "v3")).toBeNull();
    expect(parseTileManifest({ version: "v3", tiles: "4/2/3" }, "v3")).toBeNull();
    expect(parseTileManifest({ version: "v3", tiles: { a: 1 } }, "v3")).toBeNull();
  });

  it("fails open when tiles contains non-string entries", async () => {
    const { parseTileManifest } = await import("@/lib/story/tile-manifest");
    const result = parseTileManifest({ version: "v3", tiles: ["4/2/3", 42] }, "v3");
    expect(result).toBeNull();
  });

  it("an empty tiles array parses to an empty (valid) set, not fail-open", async () => {
    // Distinguishing "genuinely no tiles" from "couldn't parse" matters --
    // the generator script itself refuses to emit an empty manifest, but the
    // parser's job is only to validate shape, not business rules.
    const { parseTileManifest } = await import("@/lib/story/tile-manifest");
    const result = parseTileManifest({ version: "v3", tiles: [] }, "v3");
    expect(result).not.toBeNull();
    expect(result!.size).toBe(0);
  });
});

describe("isKnownMissingTile", () => {
  it("fail-open: a null manifest never reports a tile as known-missing", async () => {
    const { isKnownMissingTile } = await import("@/lib/story/tile-manifest");
    expect(isKnownMissingTile(null, 4, 2, 3)).toBe(false);
    expect(isKnownMissingTile(null, 999, 999, 999)).toBe(false);
  });

  it("returns false for a tile present in the manifest", async () => {
    const { isKnownMissingTile } = await import("@/lib/story/tile-manifest");
    const manifest = new Set(["4/2/3"]);
    expect(isKnownMissingTile(manifest, 4, 2, 3)).toBe(false);
  });

  it("returns true for a tile absent from a valid, non-null manifest", async () => {
    const { isKnownMissingTile } = await import("@/lib/story/tile-manifest");
    const manifest = new Set(["4/2/3"]);
    expect(isKnownMissingTile(manifest, 4, 9, 9)).toBe(true);
  });
});

describe("the embedded empty-tile PNG", () => {
  it("decodes as a valid 1x1 fully-transparent image", async () => {
    // Round-trips the exact bytes the protocol handler returns for a
    // known-missing tile through a real PNG decoder (pngjs) -- this is not a
    // hand-verified base64 string, it's independently checked here.
    vi.resetModules();
    registeredProtocols.clear();
    const { registerBinaryTileProtocol } = await import("@/lib/story/tile-manifest");
    registerBinaryTileProtocol();

    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/raster/binary-tile-manifest.json") {
        return { ok: true, json: async () => ({ version: "v3", tiles: [] }) };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const handler = registeredProtocols.get("ocbin")!;
    const result = await handler({ url: "ocbin://4/2/3" }, new AbortController());

    const png = new PNG();
    await new Promise<void>((resolve, reject) => {
      png.on("parsed", () => resolve());
      png.on("error", reject);
      png.parse(Buffer.from(result.data));
    });

    expect(png.width).toBe(1);
    expect(png.height).toBe(1);
    expect(Array.from(png.data.slice(0, 4))).toEqual([0, 0, 0, 0]);

    vi.unstubAllGlobals();
  });
});

describe("registerBinaryTileProtocol", () => {
  beforeEach(() => {
    vi.resetModules();
    registeredProtocols.clear();
    // Clear call history (not implementations) on the shared addProtocol mock
    // -- vi.resetModules() gives tile-manifest.ts a fresh `protocolRegistered`
    // flag, but the mocked maplibre-gl module (and its vi.fn() call history)
    // is NOT reset by resetModules, so counts would otherwise accumulate
    // across tests in this file.
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is idempotent: calling it twice registers addProtocol only once", async () => {
    const maplibre = await import("maplibre-gl");
    const { registerBinaryTileProtocol } = await import("@/lib/story/tile-manifest");

    registerBinaryTileProtocol();
    registerBinaryTileProtocol();

    expect(maplibre.addProtocol).toHaveBeenCalledTimes(1);
  });

  it("known-missing tile (valid manifest, tile absent): resolves with synthetic data, no real-tile fetch", async () => {
    const { registerBinaryTileProtocol, CURRENT_BINARY_RASTER_VERSION } = await import(
      "@/lib/story/tile-manifest"
    );
    registerBinaryTileProtocol();

    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/raster/binary-tile-manifest.json") {
        return {
          ok: true,
          json: async () => ({
            version: CURRENT_BINARY_RASTER_VERSION,
            tiles: ["4/2/3"], // does NOT include 4/9/9
          }),
        };
      }
      throw new Error(`should not fetch a real tile for a known-missing request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const handler = registeredProtocols.get("ocbin")!;
    const result = await handler({ url: "ocbin://4/9/9" }, new AbortController());

    expect(result.data).toBeInstanceOf(ArrayBuffer);
    // Only the manifest was fetched -- never a real-tile URL.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith("/raster/binary-tile-manifest.json");
  });

  it("present tile: falls through to a real fetch of the reconstructed BINARY_RASTER_URL", async () => {
    const { registerBinaryTileProtocol, CURRENT_BINARY_RASTER_VERSION } = await import(
      "@/lib/story/tile-manifest"
    );
    registerBinaryTileProtocol();

    const expectedUrl = BINARY_RASTER_URL.replace("{z}", "4")
      .replace("{x}", "2")
      .replace("{y}", "3");

    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/raster/binary-tile-manifest.json") {
        return {
          ok: true,
          json: async () => ({ version: CURRENT_BINARY_RASTER_VERSION, tiles: ["4/2/3"] }),
        };
      }
      if (url === expectedUrl) {
        return {
          ok: true,
          headers: new Map([["cache-control", "public, max-age=3600"]]),
          arrayBuffer: async () => new ArrayBuffer(8),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const handler = registeredProtocols.get("ocbin")!;
    const result = await handler({ url: "ocbin://4/2/3" }, new AbortController());

    expect(fetchMock).toHaveBeenCalledWith(expectedUrl, expect.anything());
    expect(result.data).toBeInstanceOf(ArrayBuffer);
    expect((result.data as ArrayBuffer).byteLength).toBe(8);
  });

  it("fail-open: manifest fetch 404s -> tile still fetched from the real URL", async () => {
    const { registerBinaryTileProtocol } = await import("@/lib/story/tile-manifest");
    registerBinaryTileProtocol();

    const expectedUrl = BINARY_RASTER_URL.replace("{z}", "4")
      .replace("{x}", "9")
      .replace("{y}", "9");

    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/raster/binary-tile-manifest.json") {
        return { ok: false, status: 404 };
      }
      if (url === expectedUrl) {
        return { ok: true, headers: new Map(), arrayBuffer: async () => new ArrayBuffer(4) };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const handler = registeredProtocols.get("ocbin")!;
    const result = await handler({ url: "ocbin://4/9/9" }, new AbortController());

    expect(fetchMock).toHaveBeenCalledWith(expectedUrl, expect.anything());
    expect((result.data as ArrayBuffer).byteLength).toBe(4);
  });

  it("fail-open: manifest JSON is malformed (wrong version) -> tile still fetched from the real URL", async () => {
    const { registerBinaryTileProtocol } = await import("@/lib/story/tile-manifest");
    registerBinaryTileProtocol();

    const expectedUrl = BINARY_RASTER_URL.replace("{z}", "4")
      .replace("{x}", "9")
      .replace("{y}", "9");

    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/raster/binary-tile-manifest.json") {
        // Wrong version -- treated as stale, parseTileManifest returns null.
        return { ok: true, json: async () => ({ version: "v0", tiles: ["4/2/3"] }) };
      }
      if (url === expectedUrl) {
        return { ok: true, headers: new Map(), arrayBuffer: async () => new ArrayBuffer(4) };
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const handler = registeredProtocols.get("ocbin")!;
    const result = await handler({ url: "ocbin://4/9/9" }, new AbortController());

    expect(fetchMock).toHaveBeenCalledWith(expectedUrl, expect.anything());
    expect((result.data as ArrayBuffer).byteLength).toBe(4);
  });

  it("rejects a malformed ocbin:// url without touching fetch", async () => {
    const { registerBinaryTileProtocol } = await import("@/lib/story/tile-manifest");
    registerBinaryTileProtocol();

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const handler = registeredProtocols.get("ocbin")!;
    await expect(handler({ url: "ocbin://not-a-tile" }, new AbortController())).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates a real-tile fetch failure as an error (unchanged from today's direct-fetch behavior)", async () => {
    const { registerBinaryTileProtocol, CURRENT_BINARY_RASTER_VERSION } = await import(
      "@/lib/story/tile-manifest"
    );
    registerBinaryTileProtocol();

    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/raster/binary-tile-manifest.json") {
        return {
          ok: true,
          json: async () => ({ version: CURRENT_BINARY_RASTER_VERSION, tiles: ["4/2/3"] }),
        };
      }
      return { ok: false, statusText: "Not Found" };
    });
    vi.stubGlobal("fetch", fetchMock);

    const handler = registeredProtocols.get("ocbin")!;
    await expect(handler({ url: "ocbin://4/2/3" }, new AbortController())).rejects.toThrow(
      /Tile fetch error/
    );
  });
});
