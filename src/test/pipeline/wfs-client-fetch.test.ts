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

  it("returns cached result on repeated call with same key", async () => {
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

// ── Cleanup ownership and supersede settlement (R2-02) ─────────────────
//
// Each debounced request's `finally` used to delete the layer's pending,
// debounce-timer and controller entries unconditionally, so an older
// request's cleanup could delete a newer request's bookkeeping. And a
// request superseded during its debounce never settled. These scenarios
// pin both fixes, one row per check (plan 2026-11-small-routed-fixes, item 3).

const BBOX_A: BBox = [-126, 48, -124, 50];
const BBOX_B: BBox = [-120, 50, -118, 52];
const BBOX_C: BBox = [-116, 52, -114, 54];

/** A FeatureCollection tagged with a label, so a survivor's result can be
 *  told apart from any other request's. */
function taggedFc(tag: string): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-125, 49] },
        properties: { tag },
      },
    ],
  };
}

interface FetchCall {
  url: string;
  signal: AbortSignal;
  respond: (data: GeoJSON.FeatureCollection) => void;
}

/** A fetch mock whose responses the test releases by hand. By default a
 *  call rejects with an AbortError when its signal aborts (as real fetch
 *  does); `ignoreAbort(i)` makes call i ignore its signal and settle late. */
function controllableFetch(ignoreAbort: (i: number) => boolean = () => false) {
  const calls: FetchCall[] = [];
  const fn = vi.fn((url: string, init?: { signal?: AbortSignal }) => {
    return new Promise((resolve, reject) => {
      const i = calls.length;
      const signal = init!.signal!;
      calls.push({
        url,
        signal,
        respond: (data) => resolve({ ok: true, json: () => Promise.resolve(data) }),
      });
      if (!ignoreAbort(i)) {
        signal.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        );
      }
    });
  });
  vi.stubGlobal("fetch", fn);
  return { fn, calls };
}

/** Drain the microtask queue without advancing fake time. */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

/** Record how a promise settles, without awaiting it. */
function track<T>(p: Promise<T>) {
  const state: { status: "pending" | "resolved" | "rejected"; value?: T; error?: unknown } = {
    status: "pending",
  };
  p.then(
    (value) => {
      state.status = "resolved";
      state.value = value;
    },
    (error) => {
      state.status = "rejected";
      state.error = error;
    },
  );
  return state;
}

describe("fetchLayerData cleanup ownership (R2-02)", () => {
  // Imported after resetModules, from the same fresh module graph as
  // wfs-client, so instanceof compares against the class it actually throws.
  let DataFetchError: typeof import("@/lib/data/fetch-errors").DataFetchError;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    const mod = await import("@/lib/data/wfs-client");
    fetchLayerData = mod.fetchLayerData;
    DataFetchError = (await import("@/lib/data/fetch-errors")).DataFetchError;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("realistic: C issued during B's debounce fires exactly 2 fetches (A and C), and C resolves with its own data", async () => {
    const { fn, calls } = controllableFetch();

    const a = track(fetchLayerData("fish-streams", BBOX_A, 10, 0));
    await vi.advanceTimersByTimeAsync(300); // A's debounce flushed: A is fetching
    expect(calls).toHaveLength(1);

    const b = track(fetchLayerData("fish-streams", BBOX_B, 10, 0)); // aborts A
    await vi.advanceTimersByTimeAsync(100); // inside B's debounce; A's finally runs
    const cPromise = fetchLayerData("fish-streams", BBOX_C, 10, 0);

    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(2);

    calls[calls.length - 1].respond(taggedFc("C"));
    await expect(cPromise).resolves.toEqual(taggedFc("C"));
    expect(a.status).toBe("rejected");
    expect(b.status).toBe("rejected");
  });

  it("late settle: an older request settling after B started does not strip B's bookkeeping; C aborts B at once", async () => {
    const { calls } = controllableFetch((i) => i === 0); // A ignores its abort

    const a = track(fetchLayerData("fish-streams", BBOX_A, 10, 0));
    await vi.advanceTimersByTimeAsync(300); // A fetching
    const b = track(fetchLayerData("fish-streams", BBOX_B, 10, 0));
    await vi.advanceTimersByTimeAsync(300); // B fetching
    expect(calls).toHaveLength(2);

    calls[0].respond(taggedFc("A")); // A settles late
    await flushMicrotasks(); // A's finally runs

    const c = track(fetchLayerData("fish-streams", BBOX_C, 10, 0));
    // Before any timer advance: C's call must have aborted B's fetch.
    expect(calls[1].signal.aborted).toBe(true);

    await vi.advanceTimersByTimeAsync(300);
    calls[calls.length - 1].respond(taggedFc("C"));
    await flushMicrotasks();
    expect(c.status).toBe("resolved");
    expect(a.status).not.toBe("pending");
    expect(b.status).toBe("rejected");
  });

  it("same key: A's cleanup leaves A' (same key, issued after A was superseded) in place, so a fourth call dedupes to A'", async () => {
    controllableFetch();

    const a = fetchLayerData("fish-streams", BBOX_A, 10, 0);
    a.catch(() => {});
    await vi.advanceTimersByTimeAsync(300); // A fetching

    // B (other key) and A' (A's key) in one tick.
    const b = fetchLayerData("fish-streams", BBOX_B, 10, 0);
    b.catch(() => {});
    const aPrime = fetchLayerData("fish-streams", BBOX_A, 10, 0);
    aPrime.catch(() => {});
    expect(aPrime).not.toBe(a);

    await flushMicrotasks(); // A's abort rejection and finally run

    const fourth = fetchLayerData("fish-streams", BBOX_A, 10, 0);
    expect(fourth).toBe(aPrime);
  });

  it("debounced away: call 1 superseded inside its debounce rejects with a DOMException AbortError; call 2 resolves with its data", async () => {
    const { fn, calls } = controllableFetch();

    const p1 = track(fetchLayerData("fish-streams", BBOX_A, 10, 0));
    const p2 = fetchLayerData("fish-streams", BBOX_B, 10, 0);

    await vi.advanceTimersByTimeAsync(300);
    expect(fn).toHaveBeenCalledTimes(1);
    calls[0].respond(taggedFc("B"));
    await expect(p2).resolves.toEqual(taggedFc("B"));
    await flushMicrotasks();

    expect(p1.status).toBe("rejected");
    expect(p1.error).toBeInstanceOf(DOMException);
    expect((p1.error as DOMException).name).toBe("AbortError");
  });

  it("in-flight supersede: A (fetching) rejects with a DOMException AbortError, not a DataFetchError; B resolves with its data", async () => {
    const { calls } = controllableFetch();

    const a = track(fetchLayerData("fish-streams", BBOX_A, 10, 0));
    await vi.advanceTimersByTimeAsync(300); // A fetching
    const bPromise = fetchLayerData("fish-streams", BBOX_B, 10, 0);
    await flushMicrotasks();

    expect(a.status).toBe("rejected");
    expect(a.error).toBeInstanceOf(DOMException);
    expect((a.error as DOMException).name).toBe("AbortError");
    expect(a.error).not.toBeInstanceOf(DataFetchError);

    await vi.advanceTimersByTimeAsync(300);
    calls[calls.length - 1].respond(taggedFc("B"));
    await expect(bPromise).resolves.toEqual(taggedFc("B"));
  });

  it("leak: a request that fails with HTTP 500 frees its key, so the same key fetches again", async () => {
    const fn = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Server Error",
        json: () => Promise.resolve({ error: "Server Error" }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(MOCK_FC) });
    vi.stubGlobal("fetch", fn);

    const p1 = fetchLayerData("fish-streams", BBOX_A, 10, 0);
    const p1Settled = p1.catch((err: Error) => err);
    await vi.advanceTimersByTimeAsync(300);
    expect(await p1Settled).toBeInstanceOf(DataFetchError);

    const p2 = fetchLayerData("fish-streams", BBOX_A, 10, 0);
    p2.catch(() => {});
    await vi.advanceTimersByTimeAsync(300);
    await expect(p2).resolves.toEqual(MOCK_FC);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
