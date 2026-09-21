import * as vscode from 'vscode';
import { fetchUsage, LimitUsage, ModelUsage, UsageResponse } from './api';
import { AccountStore, AccountsState } from './accountStore';
import { nextSessionResetMs, nextWeeklyResetMs } from './resetTime';
import { SharedUsageCache, isCacheFresh } from './sharedCache';
import { formatIntervalSeconds, getRefreshIntervalMs, getRefreshIntervalSeconds } from './config';

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

const PERIOD_TYPE_ZH: Record<string, string> = {
  last_4_weeks: '最近 4 周',
  last_7_days: '最近 7 天',
  last_24_hours: '最近 24 小时',
  daily: '每日',
  weekly: '每周',
  monthly: '每月',
};

function formatPeriodType(type: string): string {
  return PERIOD_TYPE_ZH[type] ?? type.replaceAll('_', ' ');
}

function modelNodes(models: ModelUsage[]): UsageNode[] {
  if (!models.length) {
    return [{ label: '无模型请求', icon: 'circle-slash' }];
  }

  return models.map((model) => ({
    label: model.name,
    description: `${model.request_count.toLocaleString()} 次请求`,
    icon: 'symbol-method',
  }));
}

function limitNode(name: string, limit: LimitUsage): UsageNode {
  return {
    label: name,
    description: `用量: ${limit.usage}`,
    icon: 'dashboard',
    children: modelNodes(limit.models),
  };
}

function usageNodes(usage: UsageResponse): UsageNode[] {
  const period = usage.activity.period;
  return [
    {
      label: '活动',
      description: `费用: $${usage.activity.cost}`,
      icon: 'graph',
      children: [
        {
          label: formatPeriodType(period.type),
          description: `${formatDate(period.starting_at)} – ${formatDate(period.ending_at)}`,
          tooltip: `从 ${period.starting_at} 到 ${period.ending_at}`,
          icon: 'calendar',
        },
        {
          label: '模型',
          icon: 'symbol-class',
          children: modelNodes(usage.activity.models),
        },
      ],
    },
    {
      label: '限额',
      icon: 'meter',
      children: [
        limitNode('5 小时窗口', usage.limits.session),
        limitNode('每周窗口', usage.limits.weekly),
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
}

const BLUE_PALETTE = ['#2563eb', '#3b82f6', '#4f46e5', '#60a5fa', '#1d4ed8', '#6366f1', '#818cf8', '#93c5fd'];

function formatPercent(usage: number): string {
  return `${Math.round(usage * 100)}%`;
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
  const filledTotal = Math.round(18 * usage);
  let allocated = 0;
  const cells = models.map((m, i) => {
    const isLast = i === models.length - 1;
    const filled = isLast ? Math.max(0, filledTotal - allocated) : Math.round((filledTotal * m.request_count) / total);
    allocated += filled;
    return `<font color="${BLUE_PALETTE[i % BLUE_PALETTE.length]}">${'█'.repeat(filled)}</font>`;
  });
  cells.push(`<font color="#6e6e6e">${'░'.repeat(Math.max(0, 18 - filledTotal))}</font>`);
  return cells.join('');
}

function formatReset(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const days = Math.floor(h / 24);
  if (days >= 1) {
    return `${days} 天`;
  }
  if (h >= 1) {
    return `${h} 小时${m % 60 ? ` ${m % 60} 分钟` : ''}`;
  }
  if (m >= 1) {
    return `${m} 分钟`;
  }
  return `${s} 秒`;
}

function formatClock(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(ms);
}

function quotaTooltip(usage: UsageResponse, sessionResetMs: number, lastUpdatedMs: number, intervalSeconds: number): vscode.MarkdownString {
  const now = Date.now();
  const sReset = sessionResetMs ? formatReset(sessionResetMs - now) : '—';
  const wReset = formatReset(nextWeeklyResetMs(now) - now);
  const updated = lastUpdatedMs ? `上次更新 ${formatClock(lastUpdatedMs)} · ` : '';
  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.supportHtml = true;
  md.supportThemeIcons = true;
  md.appendMarkdown(`### $(dashboard) 配额\n\n`);
  md.appendMarkdown(`| 窗口 | 占比 | 重置 |\n|:--|:--|:--|\n`);
  md.appendMarkdown(`| 5 小时 | ${barSegments(usage.limits.session.models, usage.limits.session.usage)} **${formatPercent(usage.limits.session.usage)}** | ${sReset} |\n`);
  md.appendMarkdown(`| 每周 | ${barSegments(usage.limits.weekly.models, usage.limits.weekly.usage)} **${formatPercent(usage.limits.weekly.usage)}** | ${wReset} |\n\n`);
  md.appendMarkdown(`*${updated}每 ${formatIntervalSeconds(intervalSeconds)}自动刷新 · 点击打开详情。*`);
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
    };
  }

  getUsage(): UsageResponse | undefined {
    return this.usage;
  }

  buildTooltip(): vscode.MarkdownString {
    if (this.usage) {
      return quotaTooltip(this.usage, this.sessionResetMs, this.lastUpdatedMs, getRefreshIntervalSeconds());
    }
    return new vscode.MarkdownString('Ollama Cloud 用量');
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
      return [new UsageTreeItem({ label: '正在加载 Ollama 用量…', icon: 'loading~spin' })];
    }

    if (this.error) {
      return [new UsageTreeItem({
        label: this.error,
        description: '添加账户',
        icon: 'warning',
        command: {
          command: 'ollamaCloud.addAccount',
          title: 'Ollama Cloud: 添加账户',
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

  private applyUsage(usage: UsageResponse, fetchedAt: number): void {
    this.usage = usage;
    this.lastUpdatedMs = fetchedAt;
    this.emitStatus();
  }

  private emitStatus(): void {
    if (!this.usage) {
      return;
    }
    const sessionPct = Math.round(this.usage.limits.session.usage * 100);
    const weeklyPct = Math.round(this.usage.limits.weekly.usage * 100);
    this.onDidChangeStatusEmitter.fire({
      text: `$(dashboard) 5时:${sessionPct}% 周:${weeklyPct}%`,
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
    });
  }

  private async doRefresh(force: boolean): Promise<void> {
    this.loading = true;
    this.error = undefined;
    this.onDidChangeTreeDataEmitter.fire(undefined);
    this.onDidChangeStatusEmitter.fire({ text: '$(loading~spin) Ollama', tooltip: '正在加载 Ollama 用量…' });
    this.accountsState = await this.store.load();
    this.sessionResetMs = nextSessionResetMs(Date.now());
    this.emitData(true);

    try {
      const active = await this.store.getActive();
      const apiKey = active?.key ?? process.env.OLLAMA_API_KEY;
      if (!apiKey) {
        throw new Error('未找到 Ollama API 密钥。');
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
      this.error = error instanceof Error ? error.message : '无法加载 Ollama 用量。';
      const errMd = new vscode.MarkdownString();
      errMd.supportHtml = true;
      errMd.supportThemeIcons = true;
      errMd.appendMarkdown(`$(warning) **${this.error}**\n\n[添加账户](command:ollamaCloud.addAccount)`);
      this.onDidChangeStatusEmitter.fire({
        text: '$(warning) Ollama',
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
