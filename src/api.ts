import * as https from 'node:https';
import { t, tf } from './localization';

const USAGE_URL = 'https://ollama.com/api/usage';
const BALANCE_URL = 'https://ollama.com/api/balance';
const MAX_RESPONSE_BYTES = 1_048_576;

/** Time ranges accepted by `GET /api/usage` (documented cloud usage endpoint). */
export type UsageRange = '24h' | '7d' | '30d';

type UnknownRecord = Record<string, unknown>;

/** Usage metrics shared by totals and buckets; legacy plans only report request counts. */
export interface UsageMetrics {
  request_count: number;
  usage_usd?: number;
  input_tokens?: number;
  cached_input_tokens?: number;
  output_tokens?: number;
}

export interface UsageBucket extends UsageMetrics {
  from: string;
  until: string;
  partial?: boolean;
}

/** Response of `GET /api/usage?range=…`. */
export interface UsageResponse {
  range: string;
  scope: string;
  granularity: string;
  from: string;
  until: string;
  totals: UsageMetrics;
  buckets: UsageBucket[];
}

/** One legacy quota window (5-hour session or weekly), in percent remaining. */
export interface BalanceWindow {
  remaining_percent: number;
  resets_at: string;
}

/** Legacy plan balance: session and weekly windows. */
export interface LegacyIncludedBalance {
  session: BalanceWindow;
  weekly: BalanceWindow;
}

/** Credit plan balance: included allowance and its period. */
export interface CreditsIncludedBalance {
  balance_usd: number;
  allowance_usd: number;
  period: {
    from: string;
    until: string;
  };
}

export type IncludedBalance = LegacyIncludedBalance | CreditsIncludedBalance;

/** Response of `GET /api/balance`. */
export interface BalanceResponse {
  included: IncludedBalance;
  purchased: {
    balance_usd: number;
  };
}

/** Everything one refresh needs: hourly and daily request history plus the quota balance. */
export interface UsageSnapshot {
  hourly: UsageResponse;
  daily: UsageResponse;
  balance: BalanceResponse;
}

/** Narrow an included balance to the legacy session/weekly shape. */
export function isLegacyIncluded(included: IncludedBalance): included is LegacyIncludedBalance {
  return 'session' in included && 'weekly' in included;
}

/**
 * Sum the request counts of every bucket overlapping `[fromMs, untilMs)`.
 *
 * Window boundaries are derived from the balance's `resets_at` and align with
 * the bucket grid (whole hours for `24h`, midnight UTC for `7d`), so in
 * practice each bucket is either fully inside or fully outside the window.
 * A partially overlapping bucket is counted in full - a conservative
 * approximation that keeps the estimate from under-reporting.
 */
export function sumRequestsInRange(buckets: UsageBucket[], fromMs: number, untilMs: number): number {
  let total = 0;
  for (const bucket of buckets) {
    const bucketFrom = Date.parse(bucket.from);
    const bucketUntil = Date.parse(bucket.until);
    if (Number.isNaN(bucketFrom) || Number.isNaN(bucketUntil)) {
      continue;
    }
    if (bucketUntil > fromMs && bucketFrom < untilMs) {
      total += bucket.request_count;
    }
  }
  return total;
}

/** Parse an ISO-8601 timestamp into epoch ms; returns 0 when unusable. */
export function parseTimestampMs(value: string | undefined): number {
  if (!value) {
    return 0;
  }
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? 0 : ms;
}

export class UsageApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageApiError';
  }
}

function asRecord(value: unknown, name: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new UsageApiError(tf('Err.InvalidField', name));
  }

  return value as UnknownRecord;
}

function asString(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    throw new UsageApiError(tf('Err.InvalidField', name));
  }

  return value;
}

function asNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new UsageApiError(tf('Err.InvalidField', name));
  }

  return value;
}

/** Optional finite number: absent or malformed optional fields are simply dropped. */
function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function parseMetrics(value: unknown, name: string): UsageMetrics {
  const record = asRecord(value, name);
  const metrics: UsageMetrics = {
    request_count: asNumber(record.request_count, `${name}.request_count`),
  };

  // Cost and token counts are omitted for legacy plans, so they stay optional.
  const usd = optionalNumber(record.usage_usd);
  if (usd !== undefined) {
    metrics.usage_usd = usd;
  }
  const input = optionalNumber(record.input_tokens);
  if (input !== undefined) {
    metrics.input_tokens = input;
  }
  const cached = optionalNumber(record.cached_input_tokens);
  if (cached !== undefined) {
    metrics.cached_input_tokens = cached;
  }
  const output = optionalNumber(record.output_tokens);
  if (output !== undefined) {
    metrics.output_tokens = output;
  }

  return metrics;
}

function parseBuckets(value: unknown, name: string): UsageBucket[] {
  if (!Array.isArray(value)) {
    throw new UsageApiError(tf('Err.InvalidField', name));
  }

  return value.map((bucket, index) => {
    const record = asRecord(bucket, `${name}[${index}]`);
    const parsed: UsageBucket = {
      ...parseMetrics(record, `${name}[${index}]`),
      from: asString(record.from, `${name}[${index}].from`),
      until: asString(record.until, `${name}[${index}].until`),
    };
    if (record.partial === true) {
      parsed.partial = true;
    }
    return parsed;
  });
}

export function parseUsage(value: unknown): UsageResponse {
  const response = asRecord(value, 'response');

  return {
    range: asString(response.range, 'range'),
    scope: asString(response.scope, 'scope'),
    granularity: asString(response.granularity, 'granularity'),
    from: asString(response.from, 'from'),
    until: asString(response.until, 'until'),
    totals: parseMetrics(response.totals, 'totals'),
    buckets: parseBuckets(response.buckets, 'buckets'),
  };
}

function parseBalanceWindow(value: unknown, name: string): BalanceWindow {
  const record = asRecord(value, name);
  return {
    remaining_percent: asNumber(record.remaining_percent, `${name}.remaining_percent`),
    resets_at: asString(record.resets_at, `${name}.resets_at`),
  };
}

export function parseBalance(value: unknown): BalanceResponse {
  const response = asRecord(value, 'response');
  const included = asRecord(response.included, 'included');
  const purchased = asRecord(response.purchased, 'purchased');

  // Legacy plans carry session/weekly windows; credit plans carry a USD allowance.
  let includedBalance: IncludedBalance;
  if (included.session !== undefined && included.weekly !== undefined) {
    includedBalance = {
      session: parseBalanceWindow(included.session, 'included.session'),
      weekly: parseBalanceWindow(included.weekly, 'included.weekly'),
    };
  } else {
    const period = asRecord(included.period, 'included.period');
    includedBalance = {
      balance_usd: asNumber(included.balance_usd, 'included.balance_usd'),
      allowance_usd: asNumber(included.allowance_usd, 'included.allowance_usd'),
      period: {
        from: asString(period.from, 'included.period.from'),
        until: asString(period.until, 'included.period.until'),
      },
    };
  }

  return {
    included: includedBalance,
    purchased: {
      balance_usd: asNumber(purchased.balance_usd, 'purchased.balance_usd'),
    },
  };
}

function httpGetJson(url: string, apiKey: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    }, (response) => {
      let size = 0;
      let body = '';

      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        size += Buffer.byteLength(chunk);
        if (size > MAX_RESPONSE_BYTES) {
          response.destroy(new UsageApiError(t('Err.ResponseTooLarge')));
          return;
        }
        body += chunk;
      });
      response.on('error', reject);
      response.on('end', () => {
        if (response.statusCode === 429) {
          const retry = response.headers['retry-after'];
          reject(new UsageApiError(tf('Err.RateLimited', typeof retry === 'string' ? retry : '?')));
          return;
        }
        if (response.statusCode !== 200) {
          reject(new UsageApiError(tf('Err.HttpStatus', response.statusCode ?? '?')));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error instanceof Error ? error : new UsageApiError(t('Err.InvalidResponse')));
        }
      });
    });

    request.setTimeout(10_000, () => request.destroy(new UsageApiError(t('Err.Timeout'))));
    request.on('error', reject);
    request.end();
  });
}

function requireKey(apiKey: string): string {
  const key = apiKey.trim();
  if (!key) {
    throw new UsageApiError(t('Err.EmptyKey'));
  }
  return key;
}

export async function fetchUsage(apiKey: string, range: UsageRange = '7d'): Promise<UsageResponse> {
  const key = requireKey(apiKey);
  return parseUsage(await httpGetJson(`${USAGE_URL}?range=${range}`, key));
}

export async function fetchBalance(apiKey: string): Promise<BalanceResponse> {
  const key = requireKey(apiKey);
  return parseBalance(await httpGetJson(BALANCE_URL, key));
}

/**
 * Fetch everything one refresh needs in parallel: hourly buckets for the
 * 5-hour session window, daily buckets for the weekly window, and the balance
 * that carries the authoritative usage percentages and reset times.
 */
export async function fetchSnapshot(apiKey: string): Promise<UsageSnapshot> {
  const key = requireKey(apiKey);
  const [hourly, daily, balance] = await Promise.all([
    fetchUsage(key, '24h'),
    fetchUsage(key, '7d'),
    fetchBalance(key),
  ]);
  return { hourly, daily, balance };
}
