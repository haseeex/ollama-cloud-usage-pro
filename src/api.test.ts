import assert from 'node:assert/strict';
import test from 'node:test';
import {
  UsageApiError,
  isLegacyIncluded,
  parseBalance,
  parseTimestampMs,
  parseUsage,
  sumRequestsInRange,
} from './api';

const usage = {
  range: '7d',
  scope: 'self',
  granularity: 'day',
  from: '2026-09-30T00:00:00Z',
  until: '2026-10-07T01:10:09Z',
  totals: {
    request_count: 3998,
    usage_usd: 1.25,
    input_tokens: 106000,
    cached_input_tokens: 46000,
    output_tokens: 13600,
  },
  buckets: [
    {
      from: '2026-09-30T00:00:00Z',
      until: '2026-10-01T00:00:00Z',
      request_count: 748,
      usage_usd: 0.2,
      input_tokens: 20000,
      cached_input_tokens: 5000,
      output_tokens: 2000,
    },
    {
      from: '2026-10-01T00:00:00Z',
      until: '2026-10-02T00:00:00Z',
      request_count: 219,
    },
    {
      from: '2026-10-07T00:00:00Z',
      until: '2026-10-07T01:10:09Z',
      partial: true,
      request_count: 73,
    },
  ],
};

const legacyBalance = {
  included: {
    session: { remaining_percent: 92.9, resets_at: '2026-10-07T03:00:00Z' },
    weekly: { remaining_percent: 92.49, resets_at: '2026-10-12T00:00:00Z' },
  },
  purchased: { balance_usd: 0 },
};

const creditsBalance = {
  included: {
    balance_usd: 72.5,
    allowance_usd: 100,
    period: { from: '2026-09-15T09:30:00Z', until: '2026-10-15T09:30:00Z' },
  },
  purchased: { balance_usd: 25 },
};

test('parses a documented cloud usage response', () => {
  const parsed = parseUsage(usage);
  assert.equal(parsed.range, '7d');
  assert.equal(parsed.granularity, 'day');
  assert.equal(parsed.totals.request_count, 3998);
  assert.equal(parsed.totals.usage_usd, 1.25);
  assert.equal(parsed.buckets.length, 3);
  assert.equal(parsed.buckets[2].partial, true);
});

test('drops absent or malformed optional metrics', () => {
  const parsed = parseUsage({
    range: '24h',
    scope: 'self',
    granularity: 'hour',
    from: '2026-10-06T00:00:00Z',
    until: '2026-10-07T00:00:00Z',
    totals: { request_count: 3, usage_usd: 'nope', input_tokens: null },
    buckets: [],
  });
  assert.equal(parsed.totals.request_count, 3);
  assert.equal(parsed.totals.usage_usd, undefined);
  assert.equal(parsed.totals.input_tokens, undefined);
});

test('rejects a malformed usage response', () => {
  assert.throws(() => parseUsage({}), UsageApiError);
  assert.throws(() => parseUsage({ ...usage, totals: {} }), UsageApiError);
  assert.throws(() => parseUsage({ ...usage, buckets: 'nope' }), UsageApiError);
});

test('parses a legacy balance with session and weekly windows', () => {
  const parsed = parseBalance(legacyBalance);
  assert.ok(isLegacyIncluded(parsed.included));
  if (isLegacyIncluded(parsed.included)) {
    assert.equal(parsed.included.session.remaining_percent, 92.9);
    assert.equal(parsed.included.weekly.resets_at, '2026-10-12T00:00:00Z');
  }
  assert.equal(parsed.purchased.balance_usd, 0);
});

test('parses a credit balance with allowance period', () => {
  const parsed = parseBalance(creditsBalance);
  assert.equal(isLegacyIncluded(parsed.included), false);
  if (!isLegacyIncluded(parsed.included)) {
    assert.equal(parsed.included.balance_usd, 72.5);
    assert.equal(parsed.included.allowance_usd, 100);
    assert.equal(parsed.included.period.until, '2026-10-15T09:30:00Z');
  }
  assert.equal(parsed.purchased.balance_usd, 25);
});

test('rejects a malformed balance response', () => {
  assert.throws(() => parseBalance({}), UsageApiError);
  assert.throws(() => parseBalance({ included: { session: {} }, purchased: {} }), UsageApiError);
});

test('sums requests of buckets overlapping a window', () => {
  const buckets = parseUsage(usage).buckets;
  // The 7d window ends at 2026-10-07T01:10Z and starts 7 days earlier.
  const total = sumRequestsInRange(
    buckets,
    Date.parse('2026-09-30T00:00:00Z'),
    Date.parse('2026-10-07T01:10:09Z'),
  );
  assert.equal(total, 748 + 219 + 73);
});

test('ignores buckets outside the window and unparsable timestamps', () => {
  const buckets = [
    { from: 'not a date', until: 'also not', request_count: 5 },
    { from: '2026-09-01T00:00:00Z', until: '2026-09-02T00:00:00Z', request_count: 100 },
  ];
  const total = sumRequestsInRange(buckets, Date.parse('2026-09-30T00:00:00Z'), Date.parse('2026-10-07T00:00:00Z'));
  assert.equal(total, 0);
});

test('parseTimestampMs handles bad input', () => {
  assert.equal(parseTimestampMs(undefined), 0);
  assert.equal(parseTimestampMs('nope'), 0);
  assert.equal(parseTimestampMs('2026-10-07T03:00:00Z'), Date.parse('2026-10-07T03:00:00Z'));
});
