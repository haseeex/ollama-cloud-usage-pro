import * as path from 'node:path';
import * as vscode from 'vscode';
import { UsageTreeProvider } from './usageTreeProvider';
import { UsagePanel } from './webviewViewProvider';
import { AccountStore } from './accountStore';
import { SharedUsageCache } from './sharedCache';
import {
  LANGUAGE_SETTING,
  MAX_REFRESH_INTERVAL_S,
  MAX_USAGE_PRECISION,
  MIN_REFRESH_INTERVAL_S,
  MIN_USAGE_PRECISION,
  REFRESH_INTERVAL_SETTING,
  USAGE_PRECISION_SETTING,
  formatIntervalSeconds,
  getRefreshIntervalMs,
  getRefreshIntervalSeconds,
  getUsagePrecision,
  syncLanguage,
  t,
  tf,
} from './config';
import { onLanguageChanged } from './localization';

const TOOLTIP_TICK_MS = 1000;

let refreshTimer: NodeJS.Timeout | undefined;
let tooltipTimer: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext): void {
  syncLanguage();

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
      prompt: tf('Dlg.IntervalPrompt', MIN_REFRESH_INTERVAL_S, MAX_REFRESH_INTERVAL_S),
      value: String(current),
      ignoreFocusOut: true,
      validateInput: (v) => {
        const n = Number(v.trim());
        if (!Number.isFinite(n)) {
          return t('Dlg.IntervalInvalid');
        }
        if (n < MIN_REFRESH_INTERVAL_S || n > MAX_REFRESH_INTERVAL_S) {
          return tf('Dlg.IntervalRange', MIN_REFRESH_INTERVAL_S, MAX_REFRESH_INTERVAL_S);
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
    void vscode.window.showInformationMessage(tf('Msg.IntervalSet', formatIntervalSeconds(seconds)));
  };

  const setUsagePrecision = async (): Promise<void> => {
    const current = getUsagePrecision();
    const input = await vscode.window.showInputBox({
      prompt: tf('Dlg.PrecisionPrompt', MIN_USAGE_PRECISION, MAX_USAGE_PRECISION),
      value: String(current),
      ignoreFocusOut: true,
      validateInput: (v) => {
        const n = Number(v.trim());
        if (!Number.isFinite(n)) {
          return t('Dlg.PrecisionInvalid');
        }
        if (n < MIN_USAGE_PRECISION || n > MAX_USAGE_PRECISION) {
          return tf('Dlg.PrecisionRange', MIN_USAGE_PRECISION, MAX_USAGE_PRECISION);
        }
        return undefined;
      },
    });
    if (input === undefined) {
      return;
    }
    const precision = Math.round(Number(input.trim()));
    await vscode.workspace
      .getConfiguration('ollamaCloud')
      .update('usagePrecision', precision, vscode.ConfigurationTarget.Global);
    void vscode.window.showInformationMessage(tf('Msg.PrecisionSet', precision));
  };

  const toggleLanguage = async (): Promise<void> => {
    const next = vscode.workspace
      .getConfiguration('ollamaCloud')
      .get<string>('language', 'auto');
    const target = next === 'zh' ? 'en' : 'zh';
    await vscode.workspace
      .getConfiguration('ollamaCloud')
      .update('language', target, vscode.ConfigurationTarget.Global);
    syncLanguage();
    void vscode.window.showInformationMessage(tf('Msg.LanguageSet'));
  };

  const usageBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  usageBar.name = t('Cmd.OpenPanel');
  usageBar.tooltip = t('StatusBar.Tooltip');
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
        { location: vscode.ProgressLocation.Window, title: t('Panel.Loading') },
        () => provider.refresh(true),
      );
    }),
    vscode.commands.registerCommand('ollamaCloud.setRefreshInterval', setRefreshInterval),
    vscode.commands.registerCommand('ollamaCloud.setUsagePrecision', setUsagePrecision),
    vscode.commands.registerCommand('ollamaCloud.toggleLanguage', toggleLanguage),
    vscode.commands.registerCommand('ollamaCloud.addAccount', async () => {
      const label = await vscode.window.showInputBox({
        prompt: t('Dlg.AccountLabel'),
        ignoreFocusOut: true,
        validateInput: (v) => v.trim() ? undefined : t('Dlg.AccountLabelRequired'),
      });
      if (label === undefined) {
        return;
      }
      const apiKey = await vscode.window.showInputBox({
        prompt: t('Dlg.ApiKey'),
        password: true,
        ignoreFocusOut: true,
        validateInput: (v) => v.trim() ? undefined : t('Dlg.ApiKeyRequired'),
      });
      if (apiKey === undefined) {
        return;
      }
      await store.add(label, apiKey);
      void vscode.window.showInformationMessage(t('Msg.AccountAdded'));
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
        placeHolder: t('Dlg.RemoveAccountTitle'),
        ignoreFocusOut: true,
      });
      if (!picked) {
        return;
      }
      const answer = await vscode.window.showWarningMessage(
        tf('Dlg.RemoveAccountConfirm', picked.label),
        { modal: true },
        t('Dlg.Remove'),
      );
      if (answer !== t('Dlg.Remove')) {
        return;
      }
      await store.remove((picked as vscode.QuickPickItem & { id: string }).id);
      void vscode.window.showInformationMessage(t('Msg.AccountRemoved'));
      await provider.refresh();
    }),
    vscode.commands.registerCommand('ollamaCloud.switchAccount', async (id: string) => {
      await store.setActive(id);
      await provider.refresh();
    }),
    onLanguageChanged(() => {
      // Language is baked into every rendered string, so refresh the views.
      provider.refreshLanguage();
    }),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(LANGUAGE_SETTING)) {
        syncLanguage();
      }
      if (e.affectsConfiguration(REFRESH_INTERVAL_SETTING)) {
        scheduleRefresh();
        // Re-render so the panel/tooltip show the new cadence right away.
        void provider.refresh();
      }
      if (e.affectsConfiguration(USAGE_PRECISION_SETTING)) {
        // Precision only affects rendering; no need to hit the API again.
        provider.refreshLanguage();
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