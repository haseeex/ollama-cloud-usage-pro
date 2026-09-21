import * as vscode from 'vscode';
import { fetchUsage, LimitUsage, ModelUsage, UsageResponse } from './api';
import { AccountStore, AccountsState } from './accountStore';
import { nextSessionResetMs, nextWeeklyResetMs } from './resetTime';
import { SharedUsageCache, isCacheFresh } from './sharedCache';
import {
  formatDuration,
  formatIntervalSeconds,
  formatSharePercent,
  formatUsagePercent,
  getRefreshIntervalMs,
  getRefreshIntervalSeconds,
  getUsagePrecision,
  t,
  tf,
} from './config';
import { getLanguage, tPeriod } from './localization';
import { estimateRemainingRequests, estimateRemainingRequestsForModel, formatEstimate, modelWindowShare } from './quotaPredictor';
import { BAR_CELLS, allocateBarCells, barColor } from './barLayout';

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

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

const PERIOD_TYPE_FALLBACK = (type: string): string => type.replaceAll('_', ' ');

function formatPeriodType(type: string): string {
  const localized = tPeriod(type);
  return localized ?? PERIOD_TYPE_FALLBACK(type);
}

function modelNodes(limit: LimitUsage): UsageNode[] {
  if (!limit.models.length) {
    return [{ label: t('Models.None'), icon: 'circle-slash' }];
  }

  return limit.models.map((model) => {
    const parts = [tf('Models.Requests', model.request_count.toLocaleString())];

    // Share of the window quota (window usage × this model's request share).
    const share = modelWindowShare(limit, model.request_count);
    if (share !== undefined) {
      parts.push(`${formatSharePercent(share)}%`);
    }

    // Remaining requests if this model were used exclusively.
    const remaining = estimateRemainingRequestsForModel(limit, model.request_count);
    if (remaining !== undefined) {
      parts.push(`≈${formatEstimate(remaining)}`);
    }

    return {
      label: model.name,
      description: parts.join(' · '),
      icon: 'symbol-method',
    };
  });
}

function limitNode(name: string, limit: LimitUsage): UsageNode {
  const parts = [tf('Tree.Usage', formatUsagePercent(limit.usage) + '%')];
  const remaining = estimateRemainingRequests(limit);
  if (remaining !== undefined) {
    parts.push(`≈${formatEstimate(remaining)}`);
  }

  return {
    label: name,
    description: parts.join(' · '),
    icon: 'dashboard',
    children: modelNodes(limit),
  };
}

function usageNodes(usage: UsageResponse): UsageNode[] {
  const period = usage.activity.period;
  return [
    {
      label: t('Tree.Activity'),
      description: tf('Tree.Cost', usage.activity.cost),
      icon: 'graph',
      children: [
        {
          label: formatPeriodType(period.type),
          description: `${formatDate(period.starting_at)} – ${formatDate(period.ending_at)}`,
          tooltip: tf('Tree.FromTo', period.starting_at, period.ending_at),
          icon: 'calendar',
        },
        {
          label: t('Tree.Models'),
          icon: 'symbol-class',
          children: modelNodes({ usage: usage.limits.session.usage, models: usage.activity.models }),
        },
      ],
    },
    {
      label: t('Tree.Limits'),
      icon: 'meter',
      children: [
        limitNode(t('Hover.SessionWindow'), usage.limits.session),
        limitNode(t('Hover.WeeklyWindow'), usage.limits.weekly),
      ],
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
  usage: UsageResponse | undefined;
  error: string | undefined;
  loading: boolean;
  accounts: AccountsState;
  sessionResetMs: number;
  lastUpdatedMs: number;
  intervalSeconds: number;
  usagePrecision: number;
  language: string;
}

// Stacked bar: each model = one shade of blue. Filled cells = window usage %,
// each model's cells = its share of that filled portion.
function barSegments(models: ModelUsage[], usage: number): string {
  if (!models.length) {
    return '—';
  }
  const total = models.reduce((s, m) => s + m.request_count, 0);
  if (!total) {
    return '—';
  }

  const filledTotal = Math.round(BAR_CELLS * Math.max(0, Math.min(1, usage)));
  const counts = allocateBarCells(models, filledTotal);
  const cells = models.map((_, index) =>
    `<font color="${barColor(index)}">${'█'.repeat(counts[index])}</font>`,
  );
  cells.push(`<font color="#6e6e6e">${'░'.repeat(Math.max(0, BAR_CELLS - filledTotal))}</font>`);
  return cells.join('');
}

function formatClock(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(ms);
}

/**
 * Per-model detail list, mirroring the Visual Studio extension's hover popup:
 * colour dot, name, share of the window quota, request count, and the
 * remaining-request estimate if that model were used exclusively.
 */
function modelListMarkdown(limit: LimitUsage): string[] {
  if (!limit.models.length) {
    return [`- ${t('Models.None')}`];
  }

  return limit.models.map((model, index) => {
    const color = barColor(index);
    const parts = [`<font color="${color}">●</font> ${model.name}`];

    const share = modelWindowShare(limit, model.request_count);
    if (share !== undefined) {
      parts.push(`${formatSharePercent(share)}%`);
    }

    parts.push(tf('Models.Requests', model.request_count.toLocaleString()));

    const remaining = estimateRemainingRequestsForModel(limit, model.request_count);
    if (remaining !== undefined) {
      parts.push(`≈${formatEstimate(remaining)}`);
    }

    // A Markdown list item keeps every model on its own line; a bare `\n`
    // would be treated as a soft break and collapse the whole list into one line.
    return `- ${parts.join(' · ')}`;
  });
}

/** One window section: name, per-model bar, usage %, remaining estimate, reset countdown, model list. */
function windowSection(label: string, limit: LimitUsage, reset: string): string[] {
  const remaining = estimateRemainingRequests(limit);
  const remainingText = remaining === undefined ? '' : `　·　${tf('Hover.Remaining', formatEstimate(remaining))}`;

  // The bar is 40 cells wide and fills the tooltip, so the countdown must be
  // pushed onto its own line with an explicit `<br>`: a bare `\n` would be a
  // soft break (collapsed into the same line) and a blank line would split it
  // into a separate paragraph with an oversized gap.
  return [
    `**${label}** — ${formatUsagePercent(limit.usage)}%${remainingText}`,
    '',
    `${barSegments(limit.models, limit.usage)}<br>*${t('Panel.ResetIn')}${reset}*`,
    '',
    ...modelListMarkdown(limit),
  ];
}

function quotaTooltip(usage: UsageResponse, sessionResetMs: number, lastUpdatedMs: number, intervalSeconds: number): vscode.MarkdownString {
  const now = Date.now();
  const sReset = sessionResetMs ? formatDuration(sessionResetMs - now) : '—';
  const wReset = formatDuration(nextWeeklyResetMs(now) - now);
  const updated = lastUpdatedMs ? tf('Hover.LastUpdated', formatClock(lastUpdatedMs)) : '';

  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.supportHtml = true;
  md.supportThemeIcons = true;
  md.appendMarkdown(`### $(dashboard) ${t('Hover.Title')}\n\n`);
  md.appendMarkdown(windowSection(t('Hover.SessionWindow'), usage.limits.session, sReset).join('\n'));
  md.appendMarkdown(`\n\n---\n\n`);
  md.appendMarkdown(windowSection(t('Hover.WeeklyWindow'), usage.limits.weekly, wReset).join('\n'));
  md.appendMarkdown(`\n\n${tf('Hover.Refresh', formatIntervalSeconds(intervalSeconds))}${updated}`);
  return md;
}

export class UsageTreeProvider implements vscode.TreeDataProvider<UsageTreeItem> {
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<UsageTreeItem | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
  private readonly onDidChangeStatusEmitter = new vscode.EventEmitter<StatusUpdate>();
  readonly onDidChangeStatus = this.onDidChangeStatusEmitter.event;
  private readonly onDidChangeDataEmitter = new vscode.EventEmitter<DataUpdate>();
  readonly onDidChangeData = this.onDidChangeDataEmitter.event;
  private usage: UsageResponse | undefined;
  private error: string | undefined;
  private loading = false;
  private accountsState: AccountsState = { accounts: [] };
  private sessionResetMs = 0;
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
      sessionResetMs: this.sessionResetMs,
      lastUpdatedMs: this.lastUpdatedMs,
      intervalSeconds: getRefreshIntervalSeconds(),
      usagePrecision: getUsagePrecision(),
      language: getLanguage(),
    };
  }

  getUsage(): UsageResponse | undefined {
    return this.usage;
  }

  buildTooltip(): vscode.MarkdownString {
    if (this.usage) {
      return quotaTooltip(this.usage, this.sessionResetMs, this.lastUpdatedMs, getRefreshIntervalSeconds());
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

  private applyUsage(usage: UsageResponse, fetchedAt: number): void {
    this.usage = usage;
    this.lastUpdatedMs = fetchedAt;
    this.emitStatus();
  }

  private emitStatus(): void {
    if (!this.usage) {
      return;
    }
    this.onDidChangeStatusEmitter.fire({
      text: `$(dashboard) ${tf(
        'StatusBar.Text',
        formatUsagePercent(this.usage.limits.session.usage),
        formatUsagePercent(this.usage.limits.weekly.usage),
      )}`,
      tooltip: this.buildTooltip(),
    });
  }

  private emitData(loading: boolean): void {
    this.onDidChangeDataEmitter.fire({
      usage: this.usage,
      error: this.error,
      loading,
      accounts: this.accountsState,
      sessionResetMs: this.sessionResetMs,
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
    this.sessionResetMs = nextSessionResetMs(Date.now());
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
        const usage = await fetchUsage(apiKey);
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
