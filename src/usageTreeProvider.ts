import * as vscode from 'vscode';
import { fetchUsage, LimitUsage, ModelUsage, UsageResponse } from './api';
import { AccountStore, AccountsState } from './accountStore';
import { nextSessionResetMs, nextWeeklyResetMs } from './resetTime';

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

function formatPeriodType(type: string): string {
  return type.replaceAll('_', ' ');
}

function modelNodes(models: ModelUsage[]): UsageNode[] {
  if (!models.length) {
    return [{ label: 'No model requests', icon: 'circle-slash' }];
  }

  return models.map((model) => ({
    label: model.name,
    description: `${model.request_count.toLocaleString()} requests`,
    icon: 'symbol-method',
  }));
}

function limitNode(name: string, limit: LimitUsage): UsageNode {
  return {
    label: name,
    description: `Usage: ${limit.usage}`,
    icon: 'dashboard',
    children: modelNodes(limit.models),
  };
}

function usageNodes(usage: UsageResponse): UsageNode[] {
  const period = usage.activity.period;
  return [
    {
      label: 'Activity',
      description: `Cost: $${usage.activity.cost}`,
      icon: 'graph',
      children: [
        {
          label: formatPeriodType(period.type),
          description: `${formatDate(period.starting_at)} – ${formatDate(period.ending_at)}`,
          tooltip: `From ${period.starting_at} to ${period.ending_at}`,
          icon: 'calendar',
        },
        {
          label: 'Models',
          icon: 'symbol-class',
          children: modelNodes(usage.activity.models),
        },
      ],
    },
    {
      label: 'Limits',
      icon: 'meter',
      children: [
        limitNode('Session', usage.limits.session),
        limitNode('Weekly', usage.limits.weekly),
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
    return `${days} day${days > 1 ? 's' : ''}`;
  }
  if (h >= 1) {
    return `${h} hour${h > 1 ? 's' : ''}${m % 60 ? ` ${m % 60} min` : ''}`;
  }
  if (m >= 1) {
    return `${m} minute${m > 1 ? 's' : ''}`;
  }
  return `${s} second${s > 1 ? 's' : ''}`;
}

function quotaTooltip(usage: UsageResponse, sessionResetMs: number): vscode.MarkdownString {
  const now = Date.now();
  const sReset = sessionResetMs ? formatReset(sessionResetMs - now) : '—';
  const wReset = formatReset(nextWeeklyResetMs(now) - now);
  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.supportHtml = true;
  md.supportThemeIcons = true;
  md.appendMarkdown(`### $(dashboard) Quota\n\n`);
  md.appendMarkdown(`| Window | Share | Reset |\n|:--|:--|:--|\n`);
  md.appendMarkdown(`| 5 hour | ${barSegments(usage.limits.session.models, usage.limits.session.usage)} **${formatPercent(usage.limits.session.usage)}** | ${sReset} |\n`);
  md.appendMarkdown(`| Week | ${barSegments(usage.limits.weekly.models, usage.limits.weekly.usage)} **${formatPercent(usage.limits.weekly.usage)}** | ${wReset} |\n\n`);
  md.appendMarkdown(`*Auto-refresh every 60s · Click to open detail.*`);
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
  private lastRefreshMs = 0;

  constructor(private readonly store: AccountStore) {}

  getData(): DataUpdate {
    return { usage: this.usage, error: this.error, loading: this.loading, accounts: this.accountsState, sessionResetMs: this.sessionResetMs };
  }

  getUsage(): UsageResponse | undefined {
    return this.usage;
  }

  buildTooltip(): vscode.MarkdownString {
    if (this.usage) {
      return quotaTooltip(this.usage, this.sessionResetMs);
    }
    return new vscode.MarkdownString('Ollama Cloud Usage');
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
      return [new UsageTreeItem({ label: 'Loading Ollama usage…', icon: 'loading~spin' })];
    }

    if (this.error) {
      return [new UsageTreeItem({
        label: this.error,
        description: 'Set API Key',
        icon: 'warning',
        command: {
          command: 'ollamaCloud.setApiKey',
          title: 'Ollama Cloud: Set API Key',
        },
      })];
    }

    return this.usage ? usageNodes(this.usage).map((node) => new UsageTreeItem(node)) : [];
  }

  async refresh(): Promise<void> {
    this.loading = true;
    this.error = undefined;
    this.onDidChangeTreeDataEmitter.fire(undefined);
    this.onDidChangeStatusEmitter.fire({ text: '$(loading~spin) Ollama', tooltip: 'Loading Ollama usage…' });
    this.accountsState = await this.store.load();
    this.sessionResetMs = nextSessionResetMs(Date.now());
    this.onDidChangeDataEmitter.fire({ usage: this.usage, error: this.error, loading: true, accounts: this.accountsState, sessionResetMs: this.sessionResetMs });

    try {
      const active = await this.store.getActive();
      const apiKey = active?.key ?? process.env.OLLAMA_API_KEY;
      if (!apiKey) {
        throw new Error('No Ollama API key found.');
      }
      this.usage = await fetchUsage(apiKey);
      this.lastRefreshMs = Date.now();
      const sessionPct = Math.round(this.usage.limits.session.usage * 100);
      const weeklyPct = Math.round(this.usage.limits.weekly.usage * 100);
      this.onDidChangeStatusEmitter.fire({
        text: `$(dashboard) 5H:${sessionPct}% W:${weeklyPct}%`,
        tooltip: this.buildTooltip(),
      });
    } catch (error) {
      this.usage = undefined;
      this.error = error instanceof Error ? error.message : 'Unable to load Ollama usage.';
      const errMd = new vscode.MarkdownString();
      errMd.supportHtml = true;
      errMd.supportThemeIcons = true;
      errMd.appendMarkdown(`$(warning) **${this.error}**\n\n[Set API key](command:ollamaCloud.setApiKey)`);
      this.onDidChangeStatusEmitter.fire({
        text: '$(warning) Ollama',
        tooltip: errMd,
        backgroundColor: new vscode.ThemeColor('statusBarItem.errorBackground'),
      });
    } finally {
      this.loading = false;
      this.onDidChangeTreeDataEmitter.fire(undefined);
      this.onDidChangeDataEmitter.fire({ usage: this.usage, error: this.error, loading: this.loading, accounts: this.accountsState, sessionResetMs: this.sessionResetMs });
    }
  }
}
