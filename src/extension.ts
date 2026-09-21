import * as path from 'node:path';
import * as vscode from 'vscode';
import { UsageTreeProvider } from './usageTreeProvider';
import { UsagePanel } from './webviewViewProvider';
import { AccountStore } from './accountStore';
import { SharedUsageCache } from './sharedCache';
import {
  MAX_REFRESH_INTERVAL_S,
  MIN_REFRESH_INTERVAL_S,
  REFRESH_INTERVAL_SETTING,
  formatIntervalSeconds,
  getRefreshIntervalMs,
  getRefreshIntervalSeconds,
} from './config';

const TOOLTIP_TICK_MS = 1000;

let refreshTimer: NodeJS.Timeout | undefined;
let tooltipTimer: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const store = new AccountStore(context.secrets);
  const cache = new SharedUsageCache(path.join(context.globalStorageUri.fsPath, 'usage-cache.json'));
  const provider = new UsageTreeProvider(store, cache);
  const panel = new UsagePanel();

  // Every window polls on its own timer, so the schedule has to follow the
  // configured interval instead of a hardcoded one.
  const scheduleRefresh = (): void => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }
    refreshTimer = setInterval(() => void provider.refresh(), getRefreshIntervalMs());
  };

  const setRefreshInterval = async (): Promise<void> => {
    const current = getRefreshIntervalSeconds();
    const input = await vscode.window.showInputBox({
      prompt: `自动刷新间隔（秒），范围 ${MIN_REFRESH_INTERVAL_S}–${MAX_REFRESH_INTERVAL_S}`,
      value: String(current),
      ignoreFocusOut: true,
      validateInput: (v) => {
        const n = Number(v.trim());
        if (!Number.isFinite(n)) {
          return '请输入数字。';
        }
        if (n < MIN_REFRESH_INTERVAL_S || n > MAX_REFRESH_INTERVAL_S) {
          return `间隔需在 ${MIN_REFRESH_INTERVAL_S}–${MAX_REFRESH_INTERVAL_S} 秒之间。`;
        }
        return undefined;
      },
    });
    if (input === undefined) {
      return;
    }
    const seconds = Math.round(Number(input.trim()));
    await vscode.workspace
      .getConfiguration('ollamaCloud')
      .update('refreshInterval', seconds, vscode.ConfigurationTarget.Global);
    void vscode.window.showInformationMessage(`Ollama Cloud 刷新间隔已设为 ${formatIntervalSeconds(seconds)}。`);
  };

  const usageBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  usageBar.name = 'Ollama Cloud 用量';
  usageBar.tooltip = '点击打开详情面板';
  usageBar.command = 'ollamaCloud.openPanel';
  usageBar.show();

  context.subscriptions.push(
    usageBar,
    provider.onDidChangeStatus(({ text, tooltip, backgroundColor }) => {
      usageBar.text = text;
      usageBar.tooltip = tooltip;
      usageBar.backgroundColor = backgroundColor;
      usageBar.color = undefined;
    }),
    provider.onDidChangeData((data) => {
      panel.render(data);
    }),
    vscode.commands.registerCommand('ollamaCloud.openPanel', () => {
      panel.show(provider.getData());
    }),
    vscode.commands.registerCommand('ollamaCloud.refresh', async () => {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: '正在刷新 Ollama Cloud 用量' },
        () => provider.refresh(true),
      );
    }),
    vscode.commands.registerCommand('ollamaCloud.setRefreshInterval', setRefreshInterval),
    vscode.commands.registerCommand('ollamaCloud.addAccount', async () => {
      const label = await vscode.window.showInputBox({
        prompt: '账户名称（例如：工作、个人）',
        ignoreFocusOut: true,
        validateInput: (v) => v.trim() ? undefined : '名称不能为空。',
      });
      if (label === undefined) {
        return;
      }
      const apiKey = await vscode.window.showInputBox({
        prompt: '输入 Ollama API 密钥',
        password: true,
        ignoreFocusOut: true,
        validateInput: (v) => v.trim() ? undefined : 'API 密钥不能为空。',
      });
      if (apiKey === undefined) {
        return;
      }
      await store.add(label, apiKey);
      await provider.refresh();
    }),
    vscode.commands.registerCommand('ollamaCloud.removeAccount', async () => {
      const state = await provider.getAccounts();
      if (!state.accounts.length) {
        return;
      }
      const items = state.accounts.map((a) => ({
        label: a.label,
        id: a.id,
      } as vscode.QuickPickItem & { id: string }));
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: '选择要移除的账户',
        ignoreFocusOut: true,
      });
      if (!picked) {
        return;
      }
      const answer = await vscode.window.showWarningMessage(
        `确定移除账户「${picked.label}」？`,
        { modal: true },
        '移除',
      );
      if (answer !== '移除') {
        return;
      }
      await store.remove((picked as vscode.QuickPickItem & { id: string }).id);
      await provider.refresh();
    }),
    vscode.commands.registerCommand('ollamaCloud.switchAccount', async (id: string) => {
      await store.setActive(id);
      await provider.refresh();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(REFRESH_INTERVAL_SETTING)) {
        scheduleRefresh();
        // Re-render so the panel/tooltip show the new cadence right away.
        void provider.refresh();
      }
    }),
  );

  void provider.refresh();
  scheduleRefresh();
  tooltipTimer = setInterval(() => {
    if (provider.getUsage()) {
      usageBar.tooltip = provider.buildTooltip();
    }
  }, TOOLTIP_TICK_MS);
}

export function deactivate(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
  if (tooltipTimer) {
    clearInterval(tooltipTimer);
    tooltipTimer = undefined;
  }
}