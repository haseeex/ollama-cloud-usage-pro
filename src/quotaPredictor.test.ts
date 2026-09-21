import assert from 'node:assert/strict';
import test from 'node:test';
import { LimitUsage } from './api';
import {
  MAX_ESTIMATE,
  estimateRemainingRequests,
  estimateRemainingRequestsForModel,
  formatEstimate,
  modelWindowShare,
  requestShare,
  windowCapacity,
} from './quotaPredictor';

function limit(usage: number, counts: number[]): LimitUsage {
  return {
    usage,
    models: counts.map((request_count, index) => ({ name: `m${index}`, request_count })),
  };
}

test('estimates remaining requests for the window', () => {
  // 102 requests at 6% → capacity 1700, remaining 1598.
  assert.equal(estimateRemainingRequests(limit(0.06, [102])), 1598);
});

test('returns undefined when there is no usage or no requests', () => {
  assert.equal(estimateRemainingRequests(limit(0, [10])), undefined);
  assert.equal(estimateRemainingRequests(limit(0.5, [])), undefined);
  assert.equal(estimateRemainingRequests(undefined), undefined);
});

test('returns zero when the window is fully used', () => {
  assert.equal(estimateRemainingRequests(limit(1, [100])), 0);
  assert.equal(estimateRemainingRequests(limit(1.2, [100])), 0);
});

test('clamps huge estimates to the display ceiling', () => {
  // 1 request at 0.0000001 usage → enormous capacity, clamped.
  const estimate = estimateRemainingRequests(limit(0.0000001, [1]));
  assert.equal(estimate, MAX_ESTIMATE);
  assert.equal(formatEstimate(MAX_ESTIMATE), `${MAX_ESTIMATE.toLocaleString()}+`);
});

test('model estimate uses window capacity, not the model count alone', () => {
  // 3 requests out of 2100 total at 11.9% usage: capacity 17647, minus this
  // model's 3 → 17644. Using model ÷ usage − model would wrongly give 22.
  const weekly = limit(0.119, [3, 2097]);
  assert.equal(windowCapacity(weekly), 17647);
  assert.equal(estimateRemainingRequestsForModel(weekly, 3), 17644);
  assert.notEqual(estimateRemainingRequestsForModel(weekly, 3), 22);
});

test('model estimate needs a positive model count', () => {
  assert.equal(estimateRemainingRequestsForModel(limit(0.5, [10]), 0), undefined);
  assert.equal(estimateRemainingRequestsForModel(undefined, 5), undefined);
});

test('computes request share and window share', () => {
  const weekly = limit(0.119, [1220, 880]);
  assert.equal(requestShare(weekly, 1220), 1220 / 2100);
  assert.ok(Math.abs((modelWindowShare(weekly, 1220) ?? 0) - 0.119 * (1220 / 2100)) < 1e-12);
});

test('window share needs usage and a positive count', () => {
  assert.equal(modelWindowShare(limit(0, [10]), 10), undefined);
  assert.equal(modelWindowShare(limit(0.5, [10]), 0), undefined);
  assert.equal(requestShare(limit(0.5, []), 1), undefined);
});

test('formats estimates with thousands separators', () => {
  assert.equal(formatEstimate(1598), (1598).toLocaleString());
  assert.equal(formatEstimate(0), '0');
});
