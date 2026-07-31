import * as https from 'node:https';

const USAGE_URL = 'https://ollama.com/api/usage';
const MAX_RESPONSE_BYTES = 1_048_576;

type UnknownRecord = Record<string, unknown>;

export interface ModelUsage {
  name: string;
  request_count: number;
}

export interface UsageResponse {
  activity: {
    cost: string;
    period: {
      type: string;
      starting_at: string;
      ending_at: string;
    };
    models: ModelUsage[];
  };
  limits: {
    session: LimitUsage;
    weekly: LimitUsage;
  };
}

export interface LimitUsage {
  usage: number;
  models: ModelUsage[];
}

export class UsageApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageApiError';
  }
}

function asRecord(value: unknown, name: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new UsageApiError(`Invalid ${name} in Ollama response.`);
  }

  return value as UnknownRecord;
}

function asString(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    throw new UsageApiError(`Invalid ${name} in Ollama response.`);
  }

  return value;
}

function asNumber(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new UsageApiError(`Invalid ${name} in Ollama response.`);
  }

  return value;
}

function parseModels(value: unknown, name: string): ModelUsage[] {
  if (!Array.isArray(value)) {
    throw new UsageApiError(`Invalid ${name} in Ollama response.`);
  }

  return value.map((model, index) => {
    const record = asRecord(model, `${name}[${index}]`);
    return {
      name: asString(record.name, `${name}[${index}].name`),
      request_count: asNumber(record.request_count, `${name}[${index}].request_count`),
    };
  });
}

function parseLimit(value: unknown, name: string): LimitUsage {
  const record = asRecord(value, name);
  return {
    usage: asNumber(record.usage, `${name}.usage`),
    models: parseModels(record.models, `${name}.models`),
  };
}

export function parseUsage(value: unknown): UsageResponse {
  const response = asRecord(value, 'response');
  const activity = asRecord(response.activity, 'activity');
  const period = asRecord(activity.period, 'activity.period');
  const limits = asRecord(response.limits, 'limits');

  return {
    activity: {
      cost: asString(activity.cost, 'activity.cost'),
      period: {
        type: asString(period.type, 'activity.period.type'),
        starting_at: asString(period.starting_at, 'activity.period.starting_at'),
        ending_at: asString(period.ending_at, 'activity.period.ending_at'),
      },
      models: parseModels(activity.models, 'activity.models'),
    },
    limits: {
      session: parseLimit(limits.session, 'limits.session'),
      weekly: parseLimit(limits.weekly, 'limits.weekly'),
    },
  };
}

export async function fetchUsage(apiKey: string): Promise<UsageResponse> {
  if (!apiKey.trim()) {
    throw new UsageApiError('Ollama API key is empty.');
  }

  return new Promise((resolve, reject) => {
    const request = https.request(USAGE_URL, {
      headers: {
        Accept: 'application/json',
        Authorization: apiKey.trim(),
      },
    }, (response) => {
      let size = 0;
      let body = '';

      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        size += Buffer.byteLength(chunk);
        if (size > MAX_RESPONSE_BYTES) {
          response.destroy(new UsageApiError('Ollama response is too large.'));
          return;
        }
        body += chunk;
      });
      response.on('error', reject);
      response.on('end', () => {
        if (response.statusCode !== 200) {
          reject(new UsageApiError(`Ollama returned HTTP ${response.statusCode ?? 'unknown'}.`));
          return;
        }

        try {
          resolve(parseUsage(JSON.parse(body)));
        } catch (error) {
          reject(error instanceof Error ? error : new UsageApiError('Invalid Ollama response.'));
        }
      });
    });

    request.setTimeout(10_000, () => request.destroy(new UsageApiError('Ollama request timed out.')));
    request.on('error', reject);
    request.end();
  });
}
