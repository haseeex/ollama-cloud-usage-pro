import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { UsageResponse } from './api';

/**
 * A usage snapshot written by whichever VS Code window fetched last.
 *
 * Every window runs its own extension host with its own timers, so without a
 * shared cache N open windows would send N requests per interval. The cache
 * lives in global storage (shared by all windows) and lets a window reuse a
 * fetch that is still fresh instead of polling the API again.
 */
export interface CacheEntry {
  /** Epoch ms of the successful fetch that produced `usage`. */
  fetchedAt: number;
  /** Interval (ms) the fetching window was using. */
  intervalMs: number;
  usage: UsageResponse;
}

interface CacheFile {
  version: 1;
  entries: Record<string, CacheEntry>;
}

/** How long a fetch lock survives when its owner dies mid-request. */
export const FETCH_LOCK_TTL_MS = 30_000;

export class SharedUsageCache {
  constructor(private readonly filePath: string) {}

  /** Path of the cross-window fetch lock for an account key. */
  lockPath(key: string): string {
    return `${this.filePath}.${key}.lock`;
  }

  /**
   * Atomically claim the right to call the API for `key`. Returns false while
   * another window holds a live claim, so this window reuses the shared
   * snapshot instead of sending a duplicate request.
   */
  async tryAcquireFetchLock(key: string): Promise<boolean> {
    const lock = this.lockPath(key);
    await fs.mkdir(path.dirname(lock), { recursive: true }).catch(() => undefined);
    if (await this.createLock(lock)) {
      return true;
    }

    // Live claim -> another window is fetching. Stale claim (crashed window)
    // -> clear it and retry once.
    try {
      const stamp = Number(await fs.readFile(lock, 'utf8'));
      if (Number.isFinite(stamp) && Date.now() - stamp < FETCH_LOCK_TTL_MS) {
        return false;
      }
    } catch {
      // Unreadable lock: treat it as stale.
    }
    await fs.rm(lock, { force: true }).catch(() => undefined);
    return this.createLock(lock);
  }

  async releaseFetchLock(key: string): Promise<void> {
    await fs.rm(this.lockPath(key), { force: true }).catch(() => undefined);
  }

  private async createLock(lock: string): Promise<boolean> {
    try {
      await fs.writeFile(lock, String(Date.now()), { flag: 'wx' });
      return true;
    } catch {
      return false;
    }
  }

  async read(key: string): Promise<CacheEntry | undefined> {
    const file = await this.readFile();
    const entry = file.entries[key];
    if (!entry || typeof entry.fetchedAt !== 'number' || !entry.usage) {
      return undefined;
    }
    return entry;
  }

  async write(key: string, entry: CacheEntry): Promise<void> {
    const file = await this.readFile();
    file.entries[key] = entry;
    await this.writeFile(file);
  }

  private async readFile(): Promise<CacheFile> {
    try {
      const raw = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as CacheFile;
      if (parsed && typeof parsed === 'object' && parsed.entries && typeof parsed.entries === 'object') {
        return parsed;
      }
    } catch {
      // A missing or malformed cache is not an error - it just means "no data".
    }
    return { version: 1, entries: {} };
  }

  private async writeFile(file: CacheFile): Promise<void> {
    const payload = JSON.stringify(file);
    const tmp = `${this.filePath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
    try {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await fs.writeFile(tmp, payload, 'utf8');
      await fs.rename(tmp, this.filePath);
    } catch {
      // Racing windows or a locked file: fall back to a direct write. A lost
      // cache entry is harmless - it only costs one extra request.
      try {
        await fs.writeFile(this.filePath, payload, 'utf8');
      } catch {
        // Best effort only.
      }
    }
  }
}

/**
 * True when `entry` is recent enough that another window's fetch can be reused
 * instead of polling again. The shorter of the two intervals wins so that
 * lowering the setting takes effect immediately.
 */
export function isCacheFresh(entry: CacheEntry | undefined, ownIntervalMs: number, now = Date.now()): boolean {
  if (!entry) {
    return false;
  }
  const threshold = Math.min(ownIntervalMs, entry.intervalMs || ownIntervalMs);
  return now - entry.fetchedAt < threshold;
}
