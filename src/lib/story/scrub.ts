/**
 * Nonlinear scrub: map scroll progress [0,1] -> year by inverting a
 * cumulative-disturbed-area curve. Built by scripts/build-scrub-tables.py.
 *
 * The story spends scroll time in proportion to how much was lost in each
 * period: sparse early decades compress, the modern acceleration stretches.
 */

export interface ScrubTable {
  start: number;
  end: number;
  /** Monotonic 0..1, one entry per year; [0]===0 and [last]===1 (pinned at build). */
  cumulativeNorm: number[];
}

/**
 * Inverse-cumulative lookup. Returns the year whose cumulative disturbed
 * fraction first reaches `progress`. Boundary-exact: progress<=0 → start,
 * progress>=1 → end (robust to trailing plateaus in cumulativeNorm).
 */
export function yearFromProgress(table: ScrubTable, progress: number): number {
  if (progress <= 0) return table.start;
  if (progress >= 1) return table.end;

  const arr = table.cumulativeNorm;
  // lowerBound: first index i where arr[i] >= progress
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] < progress) lo = mid + 1;
    else hi = mid;
  }
  return table.start + lo;
}
