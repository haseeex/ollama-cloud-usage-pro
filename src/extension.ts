import * as vscode from 'vscode';
import { UsageTreeProvider } from './usageTreeProvider';
import { UsagePanel } from './webviewViewProvider';
import { AccountStore } from './accountStore';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const DOUBLE_CLICK_MS = 350;

let refreshTimer: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const store = new AccountStore(context.secrets);
  const provider = new UsageTreeProvider(store);
  const panel = new UsagePanel();

  let lastClick = 0;

  const statusBar = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusBar.name = 'Ollama Cloud Usage';
  statusBar.tooltip = 'Double-click to open panel · single-click to refresh';
  statusBar.command = 'ollamaCloud.click';
  statusBar.show();

  context.subscriptions.push(
    statusBar,
    provider.onDidChangeStatus(({ text, tooltip, backgroundColor }) => {
      statusBar.text = text;
      statusBar.tooltip = tooltip;
      statusBar.backgroundColor = backgroundColor;
      statusBar.color = undefined;
    }),
    provider.onDidChangeData(({ usage, error, loading, accounts }) => {
      panel.render(usage, error, loading, accounts);
    }),
    vscode.commands.registerCommand('ollamaCloud.click', () => {
      const now = Date.now();
      if (now - lastClick < DOUBLE_CLICK_MS) {
        const d = provider.getData();
        panel.show(d.usage, d.error, d.loading, d.accounts);
        lastClick = 0;
      } else {
        lastClick = now;
        void provider.refresh();
      }
    }),
    vscode.commands.registerCommand('ollamaCloud.openPanel', () => {
      const d = provider.getData();
      panel.show(d.usage, d.error, d.loading, d.accounts);
    }),
    vscode.commands.registerCommand('ollamaCloud.refresh', async () => {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: 'Refreshing Ollama Cloud usage' },
        () => provider.refresh(),
      );
    }),
    vscode.commands.registerCommand('ollamaCloud.addAccount', async () => {
      const label = await vscode.window.showInputBox({
        prompt: 'Account label (e.g. work, personal)',
        ignoreFocusOut: true,
        validateInput: (v) => v.trim() ? undefined : 'Label cannot be empty.',
      });
      if (label === undefined) {
        return;
      }
      const apiKey = await vscode.window.showInputBox({
        prompt: 'Enter Ollama API key',
        password: true,
        ignoreFocusOut: true,
        validateInput: (v) => v.trim() ? undefined : 'API key cannot be empty.',
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
        placeHolder: 'Select account to remove',
        ignoreFocusOut: true,
      });
      if (!picked) {
        return;
      }
      const answer = await vscode.window.showWarningMessage(
        `Remove account "${picked.label}"?`,
        { modal: true },
        'Remove',
      );
      if (answer !== 'Remove') {
        return;
      }
      await store.remove((picked as vscode.QuickPickItem & { id: string }).id);
      await provider.refresh();
    }),
    vscode.commands.registerCommand('ollamaCloud.switchAccount', async (id: string) => {
      await store.setActive(id);
      await provider.refresh();
    }),
  );

  void provider.refresh();
  refreshTimer = setInterval(() => void provider.refresh(), REFRESH_INTERVAL_MS);
}

export function deactivate(): void {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = undefined;
  }
}