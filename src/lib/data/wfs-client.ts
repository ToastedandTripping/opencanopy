import type { BBox } from "@/types/layers";
import { DataFetchError } from "./fetch-errors";

/**
 * Client-side WFS data fetcher.
 * Proxies requests through the edge function at /api/wfs to avoid
 * CORS issues and enable server-side caching/simplification.
 */

/** Maximum cache entries before evicting oldest */
const MAX_CACHE_SIZE = 50;

/** In-memory cache for fetched layer data, keyed by layer:bbox:zoom */
const cache = new Map<string, GeoJSON.FeatureCollection>();

/** A pending request: its promise, plus the promise's own reject, captured
 *  from the constructor so a superseded caller can be settled. */
interface PendingEntry {
  promise: Promise<GeoJSON.FeatureCollection>;
  reject: (reason: unknown) => void;
}

/** Pending fetch promises to deduplicate concurrent requests */
const pending = new Map<string, PendingEntry>();

/** Debounce timers per layer */
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** AbortControllers per layer -- abort stale requests on new fetch */
const controllers = new Map<string, AbortController>();

/** Evict oldest cache entries when exceeding MAX_CACHE_SIZE */
function evictOldest(): void {
  while (cache.size > MAX_CACHE_SIZE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
    else break;
  }
}

/** Reject and clean up all pending promises for a given layer.
 *  The rejection is a DOMException named "AbortError": the one shape
 *  DataLayer's catch treats as a supersede rather than a failure.
 *  Runs inside the new request's executor, before that request's own
 *  pending.set, so it can never reach the request that superseded it. */
function rejectPendingForLayer(layerId: string): void {
  for (const [key, entry] of pending.entries()) {
    if (key.startsWith(layerId + ":")) {
      pending.delete(key);
      // The no-op catch keeps an unobserved rejection from being reported as
      // unhandled; a caller that awaits the promise still sees the rejection.
      entry.promise.catch(() => {});
      entry.reject(new DOMException("Superseded", "AbortError"));
    }
  }
  // Abort any in-flight fetch for this layer
  const ctrl = controllers.get(layerId);
  if (ctrl) {
    ctrl.abort();
    controllers.delete(layerId);
  }
}

/** Round bbox values to reduce cache misses on minor viewport changes.
 *  Precision adapts to zoom: coarser rounding at low zoom improves cache hits. */
export function roundBBox(bbox: BBox, precision: number): BBox {
  return bbox.map((v) => Math.round(v * 10 ** precision) / 10 ** precision) as BBox;
}

/** Build cache key from request params */
export function cacheKey(layerId: string, bbox: BBox, zoom: number): string {
  const precision = zoom <= 8 ? 1 : zoom <= 12 ? 2 : 3;
  const rb = roundBBox(bbox, precision);
  return `${layerId}:${rb.join(",")}:${Math.floor(zoom)}`;
}

/** Debounce delay based on fetch priority: high-priority layers fire sooner */
const DEBOUNCE_HIGH = 300; // priority 0 (default-enabled layers)
const DEBOUNCE_LOW = 800; // priority 1+ or undefined (secondary layers)

/**
 * Fetch layer data from the WFS proxy edge function.
 *
 * - Debounces requests per layer, staggered by priority:
 *     priority 0 -> 300ms, priority 1+/undefined -> 800ms
 * - Caches responses in memory, keyed by layer + rounded bbox + zoom
 * - Deduplicates concurrent requests for the same key
 */
export function fetchLayerData(
  layerId: string,
  bbox: BBox,
  zoom: number,
  priority?: number
): Promise<GeoJSON.FeatureCollection> {
  const debounceMs = priority === 0 ? DEBOUNCE_HIGH : DEBOUNCE_LOW;
  const key = cacheKey(layerId, bbox, zoom);

  // Return cached data immediately
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);

  // Return in-flight request if one exists
  const inflight = pending.get(key);
  if (inflight) return inflight.promise;

  let rejectThis!: (reason: unknown) => void;
  const promise = new Promise<GeoJSON.FeatureCollection>(
    (resolve, reject) => {
      rejectThis = reject;
      // Clear any existing debounce timer and orphaned promises for this layer
      const existing = debounceTimers.get(layerId);
      if (existing) {
        clearTimeout(existing);
        rejectPendingForLayer(layerId);
      }

      const timer = setTimeout(async () => {
        // Assigned once the fetch starts; the finally only deletes the
        // controller entry if it is still this request's own.
        let controller: AbortController | undefined;
        try {
          // Abort any previous in-flight fetch for this layer
          const prev = controllers.get(layerId);
          if (prev) prev.abort();
          controller = new AbortController();
          controllers.set(layerId, controller);

          const params = new URLSearchParams({
            layer: layerId,
            bbox: bbox.join(","),
            zoom: String(Math.floor(zoom)),
          });

          const res = await fetch(`/api/wfs?${params}`, {
            signal: controller.signal,
          });

          if (!res.ok) {
            const error = await res.json().catch(() => ({
              error: res.statusText,
            }));
            throw new DataFetchError(
              "http",
              (error as { error: string }).error || `HTTP ${res.status}`
            );
          }

          const data =
            (await res.json()) as GeoJSON.FeatureCollection;
          cache.set(key, data);
          evictOldest();
          resolve(data);
        } catch (err) {
          reject(err);
        } finally {
          // Delete only what this request still owns: a newer request for
          // the same layer (or the same key) may have replaced any of these
          // entries while this one was in flight (R2-02).
          if (pending.get(key)?.promise === promise) pending.delete(key);
          if (debounceTimers.get(layerId) === timer) debounceTimers.delete(layerId);
          if (controller && controllers.get(layerId) === controller) {
            controllers.delete(layerId);
          }
        }
      }, debounceMs);
      debounceTimers.set(layerId, timer);
    }
  );

  pending.set(key, { promise, reject: rejectThis });
  return promise;
}

