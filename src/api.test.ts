import assert from 'node:assert/strict';
import test from 'node:test';
import { parseUsage, UsageApiError } from './api';

const response = {
  activity: {
    cost: '0.00000',
    period: {
      type: 'last_4_weeks',
      starting_at: '2026-07-06T00:00:00Z',
      ending_at: '2026-07-31T01:55:05.109801096Z',
    },
    models: [],
  },
  limits: {
    session: { usage: 0, models: [] },
    weekly: {
      usage: 0.34,
      models: [{ name: 'glm-5.2', request_count: 740 }],
    },
  },
};

test('parses Ollama usage response', () => {
  assert.deepEqual(parseUsage(response), response);
});

test('rejects malformed Ollama usage response', () => {
  assert.throws(() => parseUsage({}), UsageApiError);
});
