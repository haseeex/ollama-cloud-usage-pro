// Window math for the documented balance endpoint.
//
// `resets_at` in `GET /api/balance` is the exclusive end of the current
// window, so the window covers [resets_at − windowLength, resets_at) and the
// requests made so far are the usage buckets overlapping that interval.

/** 5-hour session window used by legacy plans. */
export const SESSION_WINDOW_MS = 5 * 3600_000;

/** 7-day weekly window used by legacy plans. */
export const WEEK_MS = 7 * 86400_000;

/** Start (epoch ms) of the window that ends at `resetAtMs`. */
export function windowStartMs(resetAtMs: number, windowMs: number): number {
  return resetAtMs - windowMs;
}