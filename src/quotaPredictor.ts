/**
 * Remaining-request estimator for the documented usage and balance endpoints.
 *
 * The balance reports how much of a window is left (`remaining_percent`) and
 * the usage endpoint reports how many requests were made. Combining the two:
 *
 *     used fraction = 1 − remaining_percent ÷ 100
 *     capacity      = requests in window ÷ used fraction
 *     remaining     = capacity − requests in window
 *                   = requests × (1 − used fraction) ÷ used fraction
 *
 * Example: 102 requests in the 5-hour window at 6% used → 102 ÷ 0.06 = 1700
 * (capacity), so about 1598 more requests fit before the reset.
 *
 * The estimate assumes usage continues at the window's current average pace.
 */

/** Display ceiling: larger estimates are clamped to avoid absurd numbers at tiny usage. */
export const MAX_ESTIMATE = 999_999;

/**
 * Remaining requests for a window, given the requests observed in it so far
 * and the used fraction (0–1) reported by the balance endpoint.
 * Returns `undefined` when there is not enough data (no requests, or nothing used).
 */
export function estimateRemainingRequests(requestsInWindow: number, usedFraction: number): number | undefined {
  if (!Number.isFinite(requestsInWindow) || requestsInWindow <= 0) {
    return undefined;
  }
  if (!Number.isFinite(usedFraction) || usedFraction <= 0) {
    return undefined;
  }
  if (usedFraction >= 1) {
    return 0;
  }

  const estimate = (requestsInWindow * (1 - usedFraction)) / usedFraction;
  if (!Number.isFinite(estimate) || estimate < 0) {
    return undefined;
  }

  return Math.min(Math.floor(estimate), MAX_ESTIMATE);
}

/** Format an estimate for display (thousands separators; `+` when clamped). */
export function formatEstimate(estimate: number): string {
  const text = estimate.toLocaleString();
  return estimate >= MAX_ESTIMATE ? `${text}+` : text;
}
