import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_ESTIMATE,
  estimateRemainingRequests,
  formatEstimate,
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
