// Reset boundaries are epoch-aligned in UTC (server-side model).
// Session: 5h rolling window anchored at 00:00 UTC (boundaries 00/05/10/15/20 UTC).
// Weekly: 7-day window. Unix epoch (1970-01-01) is Thursday 00:00 UTC, so we shift
// the anchor back 4 days to Monday 00:00 UTC.
const SESSION_WINDOW_MS = 5 * 3600_000;
const WEEK_MS = 7 * 86400_000;
const WEEK_ANCHOR_OFFSET_MS = 4 * 86400_000;

export function nextSessionResetMs(now: number): number {
  return now + (SESSION_WINDOW_MS - (now % SESSION_WINDOW_MS));
}

export function nextWeeklyResetMs(now: number): number {
  return now + (WEEK_MS - ((now - WEEK_ANCHOR_OFFSET_MS) % WEEK_MS));
}