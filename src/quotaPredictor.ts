import { LimitUsage } from './api';

/**
 * Remaining-request estimator, ported from the Visual Studio extension.
 *
 * Window-level formula:
 *     window capacity = total requests ÷ usage ratio
 *     remaining       = window capacity − total requests
 *                     = total × (1 − usage) ÷ usage
 *
 * Example: 102 requests in the 5-hour window at 6% usage → 102 / 0.06 = 1700
 * (capacity), so about 1598 more requests fit before the reset.
 *
 * The estimate assumes usage continues at the window's current average pace,
 * and it uses the precise `usage` ratio from the API (not the rounded percent
 * shown in the UI).
 */

/** Display ceiling: larger estimates are clamped to avoid absurd numbers at tiny usage. */
export const MAX_ESTIMATE = 999_999;

function totalRequests(limit: LimitUsage): number {
  return limit.models.reduce((sum, model) => sum + model.request_count, 0);
}

/**
 * Remaining requests for the window as a whole (independent of any model).
 * Returns `undefined` when there is not enough data (no requests, or zero usage).
 */
export function estimateRemainingRequests(limit: LimitUsage | undefined): number | undefined {
  if (!limit) {
    return undefined;
  }

  const usage = limit.usage;
  if (usage <= 0) {
    return undefined;
  }
  if (usage >= 1) {
    return 0;
  }

  const total = totalRequests(limit);
  if (total <= 0) {
    return undefined;
  }

  const estimate = total / usage - total;
  if (!Number.isFinite(estimate) || estimate < 0) {
    return undefined;
  }

  return Math.min(Math.floor(estimate), MAX_ESTIMATE);
}

/**
 * Remaining requests for a single model, assuming it were used exclusively.
 *
 * Formula: window capacity − this model's requests
 *        = total requests ÷ usage − this model's requests
 *
 * Not `model ÷ usage − model`: that would treat the model's own count as having
 * consumed the entire window's usage. E.g. a model with 3 requests (0.14% of the
 * week) would claim "22 remaining", which is nonsense. Under flat per-request
 * pricing every model sees the same window capacity (total ÷ usage); they only
 * differ in how much each has already used.
 */
export function estimateRemainingRequestsForModel(
  limit: LimitUsage | undefined,
  modelRequestCount: number,
): number | undefined {
  if (!limit || modelRequestCount <= 0) {
    return undefined;
  }

  const usage = limit.usage;
  if (usage <= 0) {
    return undefined;
  }
  if (usage >= 1) {
    return 0;
  }

  const total = totalRequests(limit);
  if (total <= 0) {
    return undefined;
  }

  const estimate = total / usage - modelRequestCount;
  if (!Number.isFinite(estimate) || estimate < 0) {
    return undefined;
  }

  return Math.min(Math.floor(estimate), MAX_ESTIMATE);
}

/**
 * Window capacity: how many requests fit in the window at the current average
 * pace (= total requests ÷ usage). Returns `undefined` when data is insufficient.
 */
export function windowCapacity(limit: LimitUsage | undefined): number | undefined {
  if (!limit) {
    return undefined;
  }

  const usage = limit.usage;
  if (usage <= 0) {
    return undefined;
  }

  const total = totalRequests(limit);
  if (total <= 0) {
    return undefined;
  }

  const capacity = total / usage;
  if (!Number.isFinite(capacity) || capacity < 0) {
    return undefined;
  }

  return Math.min(Math.floor(capacity), MAX_ESTIMATE);
}

/**
 * A model's share of the window's total requests (for explanatory text).
 * Returns `undefined` when the window has no requests.
 */
export function requestShare(limit: LimitUsage | undefined, modelRequestCount: number): number | undefined {
  if (!limit || modelRequestCount <= 0) {
    return undefined;
  }
  const total = totalRequests(limit);
  return total > 0 ? modelRequestCount / total : undefined;
}

/**
 * A model's share of the window's quota = window usage × request share.
 * E.g. weekly window at 11.9% with a model holding 58.1% of requests
 * → that model occupies 6.9% of the window quota.
 * Returns `undefined` when the window has no usage or the model has no requests.
 */
export function modelWindowShare(limit: LimitUsage | undefined, modelRequestCount: number): number | undefined {
  if (!limit || limit.usage <= 0) {
    return undefined;
  }
  const share = requestShare(limit, modelRequestCount);
  return share === undefined ? undefined : limit.usage * share;
}

/** Format an estimate for display (thousands separators; `+` when clamped). */
export function formatEstimate(estimate: number): string {
  const text = estimate.toLocaleString();
  return estimate >= MAX_ESTIMATE ? `${text}+` : text;
}
