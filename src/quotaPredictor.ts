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

/**
 * Window capacity: how many requests fit in the window at the current average
 * pace (= requests in window ÷ used fraction).
 * Returns `undefined` when data is insufficient.
 */
export function windowCapacity(requestsInWindow: number, usedFraction: number): number | undefined {
  if (!Number.isFinite(requestsInWindow) || requestsInWindow <= 0) {
    return undefined;
  }
  if (!Number.isFinite(usedFraction) || usedFraction <= 0) {
    return undefined;
  }

  const capacity = requestsInWindow / usedFraction;
  if (!Number.isFinite(capacity) || capacity < 0) {
    return undefined;
  }

  return Math.min(Math.floor(capacity), MAX_ESTIMATE);
}

/**
 * Remaining requests for a single model, assuming it were used exclusively.
 *
 * Formula: window capacity − this model's requests
 *
 * Not `model ÷ usage − model`: that would treat the model's own count as having
 * consumed the entire window's usage. Under flat per-request pricing every
 * model sees the same window capacity; they only differ in how much each has
 * already used.
 */
export function estimateRemainingRequestsForModel(
  modelRequestCount: number,
  requestsInWindow: number,
  usedFraction: number,
): number | undefined {
  if (!Number.isFinite(modelRequestCount) || modelRequestCount <= 0) {
    return undefined;
  }

  const capacity = windowCapacity(requestsInWindow, usedFraction);
  if (capacity === undefined) {
    return undefined;
  }
  if (usedFraction >= 1) {
    return 0;
  }

  const remaining = capacity - modelRequestCount;
  return remaining < 0 ? 0 : remaining;
}

/**
 * A model's share of the window's total requests (for explanatory text).
 * Returns `undefined` when the window has no requests.
 */
export function requestShare(requestsInWindow: number, modelRequestCount: number): number | undefined {
  if (!Number.isFinite(requestsInWindow) || requestsInWindow <= 0) {
    return undefined;
  }
  if (!Number.isFinite(modelRequestCount) || modelRequestCount <= 0) {
    return undefined;
  }
  return modelRequestCount / requestsInWindow;
}

/**
 * A model's share of the window's quota = window usage × request share.
 * E.g. weekly window at 11.9% used with a model holding 58.1% of requests
 * → that model occupies 6.9% of the window quota.
 */
export function modelWindowShare(
  usedFraction: number,
  requestsInWindow: number,
  modelRequestCount: number,
): number | undefined {
  if (!Number.isFinite(usedFraction) || usedFraction <= 0) {
    return undefined;
  }
  const share = requestShare(requestsInWindow, modelRequestCount);
  return share === undefined ? undefined : usedFraction * share;
}
