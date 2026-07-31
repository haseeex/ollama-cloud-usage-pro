import * as vscode from 'vscode';
import { UsageTreeProvider } from './usageTreeProvider';
import { UsagePanel } from './webviewViewProvider';

const SECRET_KEY = 'ollamaCloud.apiKey';
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const DOUBLE_CLICK_MS = 350;

let refreshTimer: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const provider = new UsageTreeProvider(context.secrets);
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
    provider.onDidChangeData(({ usage, error, loading }) => {
      panel.render(usage, error, loading);
    }),
    vscode.commands.registerCommand('ollamaCloud.click', () => {
      const now = Date.now();
      if (now - lastClick < DOUBLE_CLICK_MS) {
        const d = provider.getData();
        panel.show(d.usage, d.error, d.loading);
        lastClick = 0;
      } else {
        lastClick = now;
        void provider.refresh();
      }
    }),
    vscode.commands.registerCommand('ollamaCloud.openPanel', () => {
      const d = provider.getData();
      panel.show(d.usage, d.error, d.loading);
    }),
    vscode.commands.registerCommand('ollamaCloud.refresh', async () => {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Window, title: 'Refreshing Ollama Cloud usage' },
        () => provider.refresh(),
      );
    }),
    vscode.commands.registerCommand('ollamaCloud.setApiKey', async () => {
      const apiKey = await vscode.window.showInputBox({
        prompt: 'Enter Ollama API key',
        password: true,
        ignoreFocusOut: true,
        validateInput: (value) => value.trim() ? undefined : 'API key cannot be empty.',
      });
      if (apiKey === undefined) {
        return;
      }

      await context.secrets.store(SECRET_KEY, apiKey.trim());
      await provider.refresh();
    }),
    vscode.commands.registerCommand('ollamaCloud.clearApiKey', async () => {
      const answer = await vscode.window.showWarningMessage(
        'Clear stored Ollama API key? OLLAMA_API_KEY environment variable remains unchanged.',
        { modal: true },
        'Clear',
      );
      if (answer !== 'Clear') {
        return;
      }

      await context.secrets.delete(SECRET_KEY);
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