import * as vscode from 'vscode';
import {
  CreditsIncludedBalance,
  UsageBucket,
  UsageMetrics,
  UsageSnapshot,
  fetchSnapshot,
  isLegacyIncluded,
  parseTimestampMs,
  sumRequestsInRange,
} from './api';
import { AccountStore, AccountsState } from './accountStore';
import { SESSION_WINDOW_MS, WEEK_MS, windowStartMs } from './resetTime';
import { SharedUsageCache, isCacheFresh } from './sharedCache';
import {
  formatDuration,
  formatIntervalSeconds,
  formatUsagePercent,
  getRefreshIntervalMs,
  getRefreshIntervalSeconds,
  getUsagePrecision,
  t,
  tf,
} from './config';
import { getLanguage } from './localization';
import { estimateRemainingRequests, formatEstimate } from './quotaPredictor';
import { textBar, usageColor } from './barLayout';

// How long a window waits for the lock holder's fetch before falling back to
// stale data (or fetching itself when nothing is cached yet).
const FETCH_WAIT_MS = 600;
const FETCH_WAIT_ROUNDS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type UsageNode = {
  label: string;
  description?: string;
  tooltip?: string;
  icon?: string;
  command?: vscode.Command;
  children?: UsageNode[];
};

class UsageTreeItem extends vscode.TreeItem {
  constructor(readonly node: UsageNode) {
    super(
      node.label,
      node.children?.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
    );
    this.description = node.description;
    this.tooltip = node.tooltip ?? node.label;
    this.iconPath = node.icon ? new vscode.ThemeIcon(node.icon) : undefined;
    this.command = node.command;
  }
}

/** A quota window distilled from the balance endpoint plus the usage buckets. */
interface WindowSummary {
  /** Used fraction (0–1), derived from the balance's `remaining_percent`. */
  used: number;
  /** Requests recorded inside the current window (from the matching bucket range). */
  requests: number;
  /** Epoch ms of the next reset, or 0 when the timestamp is unusable. */
  resetMs: number;
  /** Estimated remaining requests at the current pace, when computable. */
  estimate: number | undefined;
}

/** Used fraction (0–1) from a legacy balance window's remaining percentage. */
function usedFraction(remainingPercent: number): number {
  return Math.max(0, Math.min(1, (100 - remainingPercent) / 100));
}

/**
 * Combine one legacy balance window (percent + reset time) with the matching
 * usage buckets: the window covers [resets_at − windowMs, resets_at), so its
 * request count is the sum of the overlapping hourly or daily buckets.
 */
function summarizeWindow(
  remainingPercent: number,
  resetsAt: string,
  windowMs: number,
  buckets: UsageBucket[],
): WindowSummary {
  const resetMs = parseTimestampMs(resetsAt);
  const used = usedFraction(remainingPercent);
  const requests = resetMs ? sumRequestsInRange(buckets, windowStartMs(resetMs, windowMs), resetMs) : 0;
  return {
    used,
    requests,
    resetMs,
    estimate: estimateRemainingRequests(requests, used),
  };
}

/** ` · $0.05` when the plan reports a cost, otherwise nothing. */
function costText(metrics: UsageMetrics): string {
  return metrics.usage_usd === undefined ? '' : tf('Usage.Cost', metrics.usage_usd.toFixed(2));
}

/** Tree row for one quota window. */
function windowNode(label: string, summary: WindowSummary): UsageNode {
  const parts = [tf('Tree.Usage', formatUsagePercent(summary.used) + '%')];
  if (summary.estimate !== undefined) {
    parts.push(`≈${formatEstimate(summary.estimate)}`);
  }

  const reset = summary.resetMs ? formatDuration(summary.resetMs - Date.now()) : '—';
  return {
    label,
    description: parts.join(' · '),
    icon: 'dashboard',
    children: [
      { label: `${t('Panel.ResetIn')}${reset}`, icon: 'clock' },
      { label: tf('Usage.Requests', summary.requests.toLocaleString()), icon: 'pulse' },
    ],
  };
}

function usageNodes(snapshot: UsageSnapshot): UsageNode[] {
  const { hourly, daily, balance } = snapshot;

  const activity: UsageNode = {
    label: t('Tree.Activity'),
    icon: 'graph',
    children: [
      {
        label: t('Usage.24h'),
        description: tf('Usage.Requests', hourly.totals.request_count.toLocaleString()) + costText(hourly.totals),
        icon: 'pulse',
      },
      {
        label: t('Usage.7d'),
        description: tf('Usage.Requests', daily.totals.request_count.toLocaleString()) + costText(daily.totals),
        icon: 'calendar',
      },
    ],
  };

  let limitChildren: UsageNode[];
  if (isLegacyIncluded(balance.included)) {
    limitChildren = [
      windowNode(
        t('Hover.SessionWindow'),
        summarizeWindow(
          balance.included.session.remaining_percent,
          balance.included.session.resets_at,
          SESSION_WINDOW_MS,
          hourly.buckets,
        ),
      ),
      windowNode(
        t('Hover.WeeklyWindow'),
        summarizeWindow(
          balance.included.weekly.remaining_percent,
          balance.included.weekly.resets_at,
          WEEK_MS,
          daily.buckets,
        ),
      ),
    ];
  } else {
    const included = balance.included;
    limitChildren = [
      {
        label: t('Panel.IncludedCredits'),
        description: tf('Usage.IncludedShort', included.balance_usd.toFixed(2), included.allowance_usd.toFixed(2)),
        icon: 'credit-card',
      },
      {
        label: t('Usage.Credits'),
        description: tf('Usage.Balance', balance.purchased.balance_usd.toFixed(2)),
        icon: 'wallet',
      },
    ];
  }

  return [
    activity,
    {
      label: t('Tree.Limits'),
      icon: 'meter',
      children: limitChildren,
    },
  ];
}

export interface StatusUpdate {
  text: string;
  tooltip: string | vscode.MarkdownString;
  color?: string;
  backgroundColor?: vscode.ThemeColor;
}

export interface DataUpdate {
  usage: UsageSnapshot | undefined;
  error: string | undefined;
  loading: boolean;
  accounts: AccountsState;
  lastUpdatedMs: number;
  intervalSeconds: number;
  usagePrecision: number;
  language: string;
}

function formatClock(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(ms);
}

/** One window section: name, usage % + remaining estimate, colored bar, reset countdown, request count. */
function windowSection(label: string, summary: WindowSummary): string[] {
  const remainingText =
    summary.estimate === undefined ? '' : `　·　${tf('Hover.Remaining', formatEstimate(summary.estimate))}`;
  const reset = summary.resetMs ? formatDuration(summary.resetMs - Date.now()) : '—';

  // The bar fills 40 cells and the countdown must land on its own line, so it
  // is joined with `<br>`: a bare `\n` is a soft break and would collapse the
  // countdown back onto the bar's line.
  return [
    `**${label}** — ${formatUsagePercent(summary.used)}%${remainingText}`,
    '',
    `<font color="${usageColor(summary.used)}">${textBar(summary.used, 1)}</font><br>*${t('Panel.ResetIn')}${reset}*`,
    '',
    `- ${tf('Usage.Requests', summary.requests.toLocaleString())}`,
  ];
}

/** Credit-plan section: included allowance progress and purchased balance. */
function creditsSection(included: CreditsIncludedBalance, purchasedUsd: number): string[] {
  const total = included.allowance_usd;
  const used = total > 0 ? Math.max(0, Math.min(1, (total - included.balance_usd) / total)) : 0;
  const periodEnd = parseTimestampMs(included.period.until);
  const reset = periodEnd ? formatDuration(periodEnd - Date.now()) : '—';

  return [
    `**${t('Panel.IncludedCredits')}** — ${formatUsagePercent(used)}%`,
    '',
    `<font color="${usageColor(used)}">${textBar(used, 1)}</font><br>*${t('Panel.ResetIn')}${reset}*`,
    '',
    `- ${tf('Usage.Included', included.balance_usd.toFixed(2), total.toFixed(2))}`,
    `- ${tf('Usage.Balance', purchasedUsd.toFixed(2))}`,
  ];
}

function quotaTooltip(snapshot: UsageSnapshot, lastUpdatedMs: number, intervalSeconds: number): vscode.MarkdownString {
  const { hourly, daily, balance } = snapshot;

  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.supportHtml = true;
  md.supportThemeIcons = true;
  md.appendMarkdown(`### $(dashboard) ${t('Hover.Title')}\n\n`);

  if (isLegacyIncluded(balance.included)) {
    const session = summarizeWindow(
      balance.included.session.remaining_percent,
      balance.included.session.resets_at,
      SESSION_WINDOW_MS,
      hourly.buckets,
    );
    md.appendMarkdown(windowSection(t('Hover.SessionWindow'), session).join('\n'));
    md.appendMarkdown(`\n\n---\n\n`);
    const weekly = summarizeWindow(
      balance.included.weekly.remaining_percent,
      balance.included.weekly.resets_at,
      WEEK_MS,
      daily.buckets,
    );
    md.appendMarkdown(windowSection(t('Hover.WeeklyWindow'), weekly).join('\n'));
  } else {
    md.appendMarkdown(creditsSection(balance.included, balance.purchased.balance_usd).join('\n'));
  }

  const updated = lastUpdatedMs ? tf('Hover.LastUpdated', formatClock(lastUpdatedMs)) : '';
  md.appendMarkdown(`\n\n${tf('Hover.Refresh', formatIntervalSeconds(intervalSeconds))}${updated}`);
  return md;
}

/** Status bar text: 5-hour and weekly used percentages for legacy plans. */
function statusText(snapshot: UsageSnapshot): string {
  const { balance } = snapshot;
  if (isLegacyIncluded(balance.included)) {
    return `$(dashboard) ${tf(
      'StatusBar.Text',
      formatUsagePercent(usedFraction(balance.included.session.remaining_percent)),
      formatUsagePercent(usedFraction(balance.included.weekly.remaining_percent)),
    )}`;
  }

  const included = balance.included;
  const used = included.allowance_usd > 0
    ? Math.max(0, Math.min(1, (included.allowance_usd - included.balance_usd) / included.allowance_usd))
    : 0;
  return `$(dashboard) ${tf('StatusBar.Credits', formatUsagePercent(used))}`;
}

export class UsageTreeProvider implements vscode.TreeDataProvider<UsageTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<UsageTreeItem | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private readonly onDidChangeStatusEmitter = new vscode.EventEmitter<StatusUpdate>();
  readonly onDidChangeStatus = this.onDidChangeStatusEmitter.event;
  private readonly onDidChangeDataEmitter = new vscode.EventEmitter<DataUpdate>();
  readonly onDidChangeData = this.onDidChangeDataEmitter.event;
  private usage: UsageSnapshot | undefined;
  private error: string | undefined;
  private loading = false;
  private accountsState: AccountsState = { accounts: [] };
  private lastUpdatedMs = 0;
  private inFlight: Promise<void> | undefined;

  constructor(
    private readonly store: AccountStore,
    private readonly cache: SharedUsageCache,
  ) {}

  getData(): DataUpdate {
    return {
      usage: this.usage,
      error: this.error,
      loading: this.loading,
      accounts: this.accountsState,
      lastUpdatedMs: this.lastUpdatedMs,
      intervalSeconds: getRefreshIntervalSeconds(),
      usagePrecision: getUsagePrecision(),
      language: getLanguage(),
    };
  }

  getUsage(): UsageSnapshot | undefined {
    return this.usage;
  }

  buildTooltip(): vscode.MarkdownString {
    if (this.usage) {
      return quotaTooltip(this.usage, this.lastUpdatedMs, getRefreshIntervalSeconds());
    }
    return new vscode.MarkdownString(t('StatusBar.NoData'));
  }

  async getAccounts(): Promise<AccountsState> {
    this.accountsState = await this.store.load();
    return this.accountsState;
  }

  getTreeItem(element: UsageTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: UsageTreeItem): UsageTreeItem[] {
    if (element) {
      return (element.node.children ?? []).map((node) => new UsageTreeItem(node));
    }

    if (this.loading) {
      return [new UsageTreeItem({ label: t('Panel.Loading'), icon: 'loading~spin' })];
    }

    if (this.error) {
      return [new UsageTreeItem({
        label: this.error,
        description: t('Cmd.AddAccount'),
        icon: 'warning',
        command: {
          command: 'ollamaCloud.addAccount',
          title: t('Cmd.AddAccount'),
        },
      })];
    }

    return this.usage ? usageNodes(this.usage).map((node) => new UsageTreeItem(node)) : [];
  }

  refresh(force = false): Promise<void> {
    if (this.inFlight) {
      return this.inFlight;
    }
    this.inFlight = this.doRefresh(force).finally(() => {
      this.inFlight = undefined;
    });
    return this.inFlight;
  }

  /**
   * Re-render every view from cached data. Used when a display-only setting
   * (language, usage precision) changes — no API call is needed because the
   * underlying numbers did not change.
   */
  refreshLanguage(): void {
    this.emitStatus();
    this.onDidChangeTreeDataEmitter.fire(undefined);
    this.emitData(this.loading);
  }

  private applyUsage(usage: UsageSnapshot, fetchedAt: number): void {
    this.usage = usage;
    this.lastUpdatedMs = fetchedAt;
    this.emitStatus();
  }

  private emitStatus(): void {
    if (!this.usage) {
      return;
    }
    this.onDidChangeStatusEmitter.fire({
      text: statusText(this.usage),
      tooltip: this.buildTooltip(),
    });
  }

  private emitData(loading: boolean): void {
    this.onDidChangeDataEmitter.fire({
      usage: this.usage,
      error: this.error,
      loading,
      accounts: this.accountsState,
      lastUpdatedMs: this.lastUpdatedMs,
      intervalSeconds: getRefreshIntervalSeconds(),
      usagePrecision: getUsagePrecision(),
      language: getLanguage(),
    });
  }

  private async doRefresh(force: boolean): Promise<void> {
    this.loading = true;
    this.error = undefined;
    this.onDidChangeTreeDataEmitter.fire(undefined);
    this.onDidChangeStatusEmitter.fire({ text: `$(loading~spin) ${t('StatusBar.Loading')}`, tooltip: t('Panel.Loading') });
    this.accountsState = await this.store.load();
    this.emitData(true);

    try {
      const active = await this.store.getActive();
      const apiKey = active?.key ?? process.env.OLLAMA_API_KEY;
      if (!apiKey) {
        throw new Error(t('Err.NoApiKey'));
      }

      const cacheKey = active?.id ?? 'env';
      const intervalMs = getRefreshIntervalMs();
      let lockHeld = false;

      // Each window runs its own timers, so without coordination N windows
      // would send N requests per interval. The shared cache lets a window
      // reuse a fresh snapshot, and the fetch lock keeps the windows that are
      // due in sync: one fetches, the rest reuse what is already on disk.
      if (!force) {
        const cached = await this.cache.read(cacheKey);
        if (cached && isCacheFresh(cached, intervalMs)) {
          this.applyUsage(cached.usage, cached.fetchedAt);
          return;
        }

        // The lock holder is fetching right now: give it a few rounds to land
        // the snapshot in the shared cache before falling back to fetching
        // ourselves (which covers a crashed or stuck peer).
        for (let attempt = 0; attempt < FETCH_WAIT_ROUNDS; attempt++) {
          lockHeld = await this.cache.tryAcquireFetchLock(cacheKey);
          if (lockHeld) {
            break;
          }
          await sleep(FETCH_WAIT_MS);
          const shared = await this.cache.read(cacheKey);
          if (shared) {
            this.applyUsage(shared.usage, shared.fetchedAt);
            return;
          }
        }
      }

      try {
        const usage = await fetchSnapshot(apiKey);
        const fetchedAt = Date.now();
        this.applyUsage(usage, fetchedAt);
        await this.cache.write(cacheKey, { fetchedAt, intervalMs, usage });
      } finally {
        if (lockHeld) {
          await this.cache.releaseFetchLock(cacheKey);
        }
      }
    } catch (error) {
      this.usage = undefined;
      this.error = error instanceof Error ? error.message : t('Err.LoadFailed');
      const errMd = new vscode.MarkdownString();
      errMd.supportHtml = true;
      errMd.supportThemeIcons = true;
      errMd.appendMarkdown(`$(warning) **${this.error}**\n\n[${t('Cmd.AddAccount')}](command:ollamaCloud.addAccount)`);
      this.onDidChangeStatusEmitter.fire({
        text: `$(warning) ${t('StatusBar.NoData')}`,
        tooltip: errMd,
        backgroundColor: new vscode.ThemeColor('statusBarItem.errorBackground'),
      });
    } finally {
      this.loading = false;
      this.onDidChangeTreeDataEmitter.fire(undefined);
      this.emitData(false);
    }
  }
}
