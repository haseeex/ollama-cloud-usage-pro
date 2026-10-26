import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_ESTIMATE,
  estimateRemainingRequests,
  estimateRemainingRequestsForModel,
  formatEstimate,
  modelWindowShare,
  requestShare,
  windowCapacity,
} from './quotaPredictor';

test('estimates remaining requests from requests and used fraction', () => {
  // 102 requests at 6% used → capacity 1700, remaining 1598.
  assert.equal(estimateRemainingRequests(102, 0.06), 1598);
});

test('returns undefined when there is no usage or no requests', () => {
  assert.equal(estimateRemainingRequests(0, 0.5), undefined);
  assert.equal(estimateRemainingRequests(10, 0), undefined);
  assert.equal(estimateRemainingRequests(-1, 0.5), undefined);
  assert.equal(estimateRemainingRequests(10, Number.NaN), undefined);
});

test('returns zero when the window is fully used', () => {
  assert.equal(estimateRemainingRequests(100, 1), 0);
  assert.equal(estimateRemainingRequests(100, 1.2), 0);
});

test('clamps huge estimates to the display ceiling', () => {
  // 1 request at a tiny used fraction → enormous capacity, clamped.
  const estimate = estimateRemainingRequests(1, 0.0000001);
  assert.equal(estimate, MAX_ESTIMATE);
  assert.equal(formatEstimate(MAX_ESTIMATE), `${MAX_ESTIMATE.toLocaleString()}+`);
});

test('formats estimates with thousands separators', () => {
  assert.equal(formatEstimate(1598), (1598).toLocaleString());
  assert.equal(formatEstimate(0), '0');
});

// ── per-model estimates ──

test('window capacity divides requests by the used fraction', () => {
  assert.equal(windowCapacity(102, 0.06), 1700);
  assert.equal(windowCapacity(0, 0.06), undefined);
  assert.equal(windowCapacity(102, 0), undefined);
});

test('model estimate uses window capacity, not the model count alone', () => {
  // 3 requests out of 2100 total at 11.9% used: capacity 17647, minus this
  // model's 3 → 17644. Using model ÷ usage − model would wrongly give 22.
  assert.equal(windowCapacity(2100, 0.119), 17647);
  assert.equal(estimateRemainingRequestsForModel(3, 2100, 0.119), 17644);
  assert.notEqual(estimateRemainingRequestsForModel(3, 2100, 0.119), 22);
});

test('model estimate needs a positive model count', () => {
  assert.equal(estimateRemainingRequestsForModel(0, 2100, 0.5), undefined);
  assert.equal(estimateRemainingRequestsForModel(5, 0, 0.5), undefined);
});

test('model estimate never goes negative once the window is exhausted', () => {
  assert.equal(estimateRemainingRequestsForModel(500, 1000, 1), 0);
});

test('computes request share and window share', () => {
  assert.equal(requestShare(2100, 1220), 1220 / 2100);
  assert.ok(Math.abs((modelWindowShare(0.119, 2100, 1220) ?? 0) - 0.119 * (1220 / 2100)) < 1e-12);
});

test('window share needs usage and a positive count', () => {
  assert.equal(modelWindowShare(0, 2100, 10), undefined);
  assert.equal(modelWindowShare(0.5, 2100, 0), undefined);
  assert.equal(requestShare(0, 10), undefined);
});
