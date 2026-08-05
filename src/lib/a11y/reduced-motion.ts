let cachedMql: MediaQueryList | null = null;
let cachedMatchMediaFn: typeof window.matchMedia | null = null;

/**
 * SSR-safe, cached check for prefers-reduced-motion.
 * Re-queries when matchMedia identity changes (test mock swap).
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (cachedMql === null || cachedMatchMediaFn !== window.matchMedia) {
    cachedMatchMediaFn = window.matchMedia;
    cachedMql = window.matchMedia("(prefers-reduced-motion: reduce)");
  }
  return cachedMql.matches;
}
