/**
 * fetchLayerData integration tests for wfs-client.ts
 *
 * Tests debounce, abort supersession, caching, and basic fetch behavior.
 * Uses vitest fake timers and a mocked global fetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BBox } from "@/types/layers";

// We need a fresh module for each test to reset module-level Maps (cache, pending, etc.)
let fetchLayerData: typeof import("@/lib/data/wfs-client").fetchLayerData;
let cacheKey: typeof import("@/lib/data/wfs-client").cacheKey;

const MOCK_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-125, 49] },
      properties: { name: "test" },
    },
  ],
};

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

const TEST_BBOX: BBox = [-126, 48, -124, 50];

function mockFetchSuccess(data: GeoJSON.FeatureCollection = MOCK_FC) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(data),
  });
}

function mockFetchFailure(status = 500, statusText = "Internal Server Error") {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve({ error: statusText }),
  });
}

describe("fetchLayerData", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", mockFetchSuccess());

    // Re-import to reset module-level state (cache, pending, debounceTimers, controllers)
    vi.resetModules();
    const mod = await import("@/lib/data/wfs-client");
    fetchLayerData = mod.fetchLayerData;
    cacheKey = mod.cacheKey;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  // ── Basic fetch ──────────────────────────────────────────────────

  it("fetches data from /api/wfs with correct query params", async () => {
    const promise = fetchLayerData("fish-streams", TEST_BBOX, 10, 0);

    // Advance past debounce (300ms for priority 0)
    await vi.advanceTimersByTimeAsync(300);
    const result = await promise;

    expect(result).toEqual(MOCK_FC);
    expect(fetch).toHaveBeenCalledOnce();

    const url = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("/api/wfs?");
    expect(url).toContain("layer=fish-streams");
    expect(url).toContain("zoom=10");
  });

  it("passes an AbortSignal to fetch", async () => {
    const promise = fetchLayerData("fish-streams", TEST_BBOX, 10, 0);
    await vi.advanceTimersByTimeAsync(300);
    await promise;

    const fetchCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(fetchCall[1]).toHaveProperty("signal");
    expect(fetchCall[1].signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects on HTTP error", async () => {
    vi.stubGlobal("fetch", mockFetchFailure(500, "Server Error"));

    const promise = fetchLayerData("fish-streams", TEST_BBOX, 10, 0);
    // Attach a catch handler immediately to avoid unhandled rejection
    const resultPromise = promise.catch((err: Error) => err);
    await vi.advanceTimersByTimeAsync(300);

    const result = await resultPromise;
    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toBe("Server Error");
  });

  // ── Debounce ─────────────────────────────────────────────────────

  it("debounces rapid calls for the same layer — only one fetch fires", async () => {
    // Three rapid calls for the same layer, different bboxes (same rounded key at zoom 5)
    fetchLayerData("fish-streams", TEST_BBOX, 5, 0);
    fetchLayerData("fish-streams", TEST_BBOX, 5, 0);
    const promise = fetchLayerData("fish-streams", TEST_BBOX, 5, 0);

    await vi.advanceTimersByTimeAsync(300);
    await promise;

    // Only the last debounced call should fire
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("uses longer debounce (800ms) for low-priority layers", async () => {
    const promise = fetchLayerData("fish-streams", TEST_BBOX, 10, 1);

    // At 300ms, should not have fired yet
    await vi.advanceTimersByTimeAsync(300);
    expect(fetch).not.toHaveBeenCalled();

    // At 800ms, should fire
    await vi.advanceTimersByTimeAsync(500);
    await promise;

    expect(fetch).toHaveBeenCalledOnce();
  });

  it("uses 300ms debounce for priority 0 layers", async () => {
    const promise = fetchLayerData("fish-streams", TEST_BBOX, 10, 0);

    await vi.advanceTimersByTimeAsync(299);
    expect(fetch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await promise;

    expect(fetch).toHaveBeenCalledOnce();
  });

  // ── Abort supersession ───────────────────────────────────────────

  it("superseded fetch aborts the previous controller and swallows rejection", async () => {
    // Use different bboxes so the second call doesn't hit cache from the first
    const bbox1: BBox = [-126, 48, -124, 50];
    const bbox2: BBox = [-120, 50, -118, 52];
    const signals: AbortSignal[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((_url: string, opts?: { signal?: AbortSignal }) => {
        if (opts?.signal) signals.push(opts.signal);
        // Slow response — gives time for supersession
        return new Promise((resolve, reject) => {
          const timer = setTimeout(
            () => resolve({ ok: true, json: () => Promise.resolve(MOCK_FC) }),
            5000,
          );
          if (opts?.signal) {
            opts.signal.addEventListener("abort", () => {
              clearTimeout(timer);
              reject(new DOMException("The operation was aborted.", "AbortError"));
            });
          }
        });
      }),
    );

    // First call
    const first = fetchLayerData("fish-streams", bbox1, 10, 0);
    await vi.advanceTimersByTimeAsync(300);
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);

    // Second call with different bbox — supersedes the first via rejectPendingForLayer
    const second = fetchLayerData("fish-streams", bbox2, 10, 0);
    // rejectPendingForLayer runs synchronously inside the new promise constructor,
    // aborting the first controller
    expect(signals[0].aborted).toBe(true);

    // Advance past second debounce
    await vi.advanceTimersByTimeAsync(300);

    // First promise was rejected by rejectPendingForLayer — swallowed by .catch(() => {})
    // It should reject but NOT be an unhandled rejection
    const firstResult = await first.catch((err: Error) => err);
    expect(firstResult).toBeInstanceOf(Error);

    // Let second resolve
    await vi.advanceTimersByTimeAsync(5000);
    const secondResult = await second;
    expect(secondResult).toEqual(MOCK_FC);
  });

  // ── Cache ────────────────────────────────────────────────────────

  it("returns cached data without a new fetch", async () => {
    const promise1 = fetchLayerData("fish-streams", TEST_BBOX, 10, 0);
    await vi.advanceTimersByTimeAsync(300);
    await promise1;

    expect(fetch).toHaveBeenCalledOnce();

    // Same call again — should hit cache
    const promise2 = fetchLayerData("fish-streams", TEST_BBOX, 10, 0);
    // No need to advance timers — cache hit returns synchronously
    const result = await promise2;

    expect(result).toEqual(MOCK_FC);
    // Still only one fetch call
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("cache key distinguishes different layers", async () => {
    const p1 = fetchLayerData("fish-streams", TEST_BBOX, 10, 0);
    await vi.advanceTimersByTimeAsync(300);
    await p1;

    const p2 = fetchLayerData("cutblocks", TEST_BBOX, 10, 0);
    await vi.advanceTimersByTimeAsync(300);
    await p2;

    // Two different layers = two fetches
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("cache key distinguishes significantly different bboxes", async () => {
    const bbox2: BBox = [-120, 50, -118, 52];

    const p1 = fetchLayerData("fish-streams", TEST_BBOX, 10, 0);
    await vi.advanceTimersByTimeAsync(300);
    await p1;

    const p2 = fetchLayerData("fish-streams", bbox2, 10, 0);
    await vi.advanceTimersByTimeAsync(800); // may be debounced
    await p2;

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  // ── Deduplication ────────────────────────────────────────────────

  it("deduplicates concurrent requests for the same cache key", async () => {
    // Two calls with the same key before the debounce fires
    // After the first debounce completes, the second should get the same result
    const p1 = fetchLayerData("fish-streams", TEST_BBOX, 10, 0);
    // Let the debounce fire for the first
    await vi.advanceTimersByTimeAsync(300);

    // Now call again with same key — should get the inflight promise
    const p2 = fetchLayerData("fish-streams", TEST_BBOX, 10, 0);

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(MOCK_FC);
    expect(r2).toEqual(MOCK_FC);
  });
});
