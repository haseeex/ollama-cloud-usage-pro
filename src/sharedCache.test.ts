import assert from 'node:assert/strict';
import test from 'node:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { UsageSnapshot } from './api';
import { CacheEntry, FETCH_LOCK_TTL_MS, SharedUsageCache, isCacheFresh } from './sharedCache';

const usage: UsageSnapshot = {
  hourly: {
    range: '24h',
    scope: 'self',
    granularity: 'hour',
    from: '2026-10-06T01:00:00Z',
    until: '2026-10-07T01:00:00Z',
    totals: { request_count: 5 },
    buckets: [],
  },
  daily: {
    range: '7d',
    scope: 'self',
    granularity: 'day',
    from: '2026-09-30T00:00:00Z',
    until: '2026-10-07T01:00:00Z',
    totals: { request_count: 748 },
    buckets: [],
  },
  balance: {
    included: {
      session: { remaining_percent: 92.9, resets_at: '2026-10-07T03:00:00Z' },
      weekly: { remaining_percent: 92.49, resets_at: '2026-10-12T00:00:00Z' },
    },
    purchased: { balance_usd: 0 },
  },
};

async function tempFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ollama-cache-'));
  return path.join(dir, 'usage-cache.json');
}

test('isCacheFresh returns false without an entry', () => {
  assert.equal(isCacheFresh(undefined, 60_000), false);
});

test('isCacheFresh honours the stored interval', () => {
  const entry: CacheEntry = { fetchedAt: 1_000, intervalMs: 60_000, usage };
  assert.equal(isCacheFresh(entry, 60_000, 1_000 + 59_999), true);
  assert.equal(isCacheFresh(entry, 60_000, 1_000 + 60_000), false);
});

test('isCacheFresh uses the smaller of the two intervals', () => {
  const entry: CacheEntry = { fetchedAt: 1_000, intervalMs: 300_000, usage };
  // Own interval is shorter -> stale after 60s even though the writer waited 300s.
  assert.equal(isCacheFresh(entry, 60_000, 1_000 + 60_000), false);
  assert.equal(isCacheFresh(entry, 60_000, 1_000 + 30_000), true);
});

test('round-trips entries per account key', async () => {
  const cache = new SharedUsageCache(await tempFile());
  assert.equal(await cache.read('a'), undefined);

  const entry: CacheEntry = { fetchedAt: 42, intervalMs: 60_000, usage };
  await cache.write('a', entry);

  assert.deepEqual(await cache.read('a'), entry);
  assert.equal(await cache.read('b'), undefined);
});

test('keeps other keys when writing', async () => {
  const cache = new SharedUsageCache(await tempFile());
  await cache.write('a', { fetchedAt: 1, intervalMs: 60_000, usage });
  await cache.write('b', { fetchedAt: 2, intervalMs: 30_000, usage });

  assert.equal((await cache.read('a'))?.fetchedAt, 1);
  assert.equal((await cache.read('b'))?.fetchedAt, 2);
});

test('treats malformed cache files as empty', async () => {
  const file = await tempFile();
  await fs.writeFile(file, 'not json', 'utf8');
  const cache = new SharedUsageCache(file);

  assert.equal(await cache.read('a'), undefined);
  await cache.write('a', { fetchedAt: 1, intervalMs: 60_000, usage });
  assert.equal((await cache.read('a'))?.fetchedAt, 1);
});

test('ignores cache files written by an older snapshot version', async () => {
  const file = await tempFile();
  await fs.writeFile(file, JSON.stringify({ version: 1, entries: { a: { fetchedAt: 1, intervalMs: 1, usage } } }), 'utf8');
  const cache = new SharedUsageCache(file);

  assert.equal(await cache.read('a'), undefined);
});

test('creates the cache directory when missing', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ollama-cache-'));
  const cache = new SharedUsageCache(path.join(dir, 'nested', 'usage-cache.json'));

  await cache.write('a', { fetchedAt: 7, intervalMs: 60_000, usage });
  assert.equal((await cache.read('a'))?.fetchedAt, 7);
});

test('fetch lock is exclusive per key and released after use', async () => {
  const file = await tempFile();
  const windowA = new SharedUsageCache(file);
  const windowB = new SharedUsageCache(file);

  assert.equal(await windowA.tryAcquireFetchLock('acct'), true);
  assert.equal(await windowB.tryAcquireFetchLock('acct'), false);
  // A different account is not blocked by another account's lock.
  assert.equal(await windowB.tryAcquireFetchLock('other'), true);

  await windowA.releaseFetchLock('acct');
  assert.equal(await windowB.tryAcquireFetchLock('acct'), true);
});

test('stale fetch lock from a dead window is reclaimed', async () => {
  const file = await tempFile();
  const cache = new SharedUsageCache(file);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(cache.lockPath('acct'), String(Date.now() - FETCH_LOCK_TTL_MS - 1_000), 'utf8');

  assert.equal(await cache.tryAcquireFetchLock('acct'), true);
});

test('unreadable fetch lock is treated as stale', async () => {
  const file = await tempFile();
  const cache = new SharedUsageCache(file);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(cache.lockPath('acct'), 'garbage', 'utf8');

  assert.equal(await cache.tryAcquireFetchLock('acct'), true);
});
