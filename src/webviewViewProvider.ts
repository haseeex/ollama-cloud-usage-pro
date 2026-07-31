import * as vscode from 'vscode';
import { UsageResponse } from './api';

function hexFor(percent: number): string {
  if (percent >= 80) {
    return '#f48771';
  }
  if (percent >= 60) {
    return '#cca700';
  }
  return '#73c991';
}

function pct(usage: number): number {
  return Math.round(usage * 100);
}

function barHtml(percent: number): string {
  const color = hexFor(percent);
  return `<div class="bar"><div class="fill" style="width:${percent}%;background:${color}"></div></div>`;
}

function rowHtml(label: string, percent: number, usage: number): string {
  const color = hexFor(percent);
  return `<div class="row">
    <div class="row-head">
      <span class="row-label">${label}</span>
      <span class="row-pct" style="color:${color}">${pct(usage)}% used</span>
    </div>
    ${barHtml(percent)}
  </div>`;
}

function modelListHtml(models: UsageResponse['limits']['weekly']['models']): string {
  if (!models.length) {
    return '<div class="empty">No model requests</div>';
  }
  const sorted = [...models].sort((a, b) => b.request_count - a.request_count);
  return sorted.map((m) =>
    `<div class="model">
      <span class="dot">●</span>
      <span class="model-name">${m.name}</span>
      <span class="model-count">${m.request_count.toLocaleString()} requests</span>
    </div>`,
  ).join('');
}

function bodyHtml(usage: UsageResponse | undefined, error: string | undefined, loading: boolean): string {
  if (loading) {
    return `<div class="state">Loading Ollama usage…</div>`;
  }
  if (error) {
    return `<div class="state error">⚠ ${error}</div>
      <button class="btn" data-cmd="setApiKey">Set API Key</button>`;
  }
  if (!usage) {
    return '<div class="state">No data.</div>';
  }
  const sp = pct(usage.limits.session.usage);
  const wp = pct(usage.limits.weekly.usage);
  return `<div class="toolbar">
      <h2>☁ Cloud usage</h2>
      <div class="actions">
        <button class="icon-btn" data-cmd="refresh" title="Refresh">⟳</button>
        <button class="icon-btn" data-cmd="setApiKey" title="Set API Key">🔑</button>
        <button class="icon-btn" data-cmd="clearApiKey" title="Clear API Key">🗑</button>
      </div>
    </div>
    ${rowHtml('Session usage', sp, usage.limits.session.usage)}
    <div class="group">
      <div class="group-label">Models used this session</div>
      <div class="models">${modelListHtml(usage.limits.session.models)}</div>
    </div>
    <div class="spacer"></div>
    ${rowHtml('Weekly usage', wp, usage.limits.weekly.usage)}
    <div class="group">
      <div class="group-label">Models used this week</div>
      <div class="models">${modelListHtml(usage.limits.weekly.models)}</div>
    </div>`;
}

const CSS = `
  body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); margin: 0; max-width: 480px; }
  .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 18px; }
  .toolbar h2 { margin: 0; }
  .actions { display: flex; gap: 4px; }
  .icon-btn { background: none; border: none; cursor: pointer; font-size: 15px; padding: 4px 6px; border-radius: 4px; color: var(--vscode-foreground); opacity: 0.7; line-height: 1; }
  .icon-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
  h2 { font-size: 14px; font-weight: 600; margin: 0 0 18px 0; }
  .row { margin-bottom: 16px; }
  .row-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
  .row-label { font-size: 13px; font-weight: 500; }
  .row-pct { font-size: 12px; font-weight: 600; }
  .bar { background: var(--vscode-scrollbarSlider-background); border-radius: 6px; height: 6px; overflow: hidden; }
  .fill { height: 6px; border-radius: 6px; transition: width .3s ease; }
  .group { margin-top: 20px; }
  .spacer { height: 20px; }
  .group-label { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; color: var(--vscode-descriptionForeground); margin-bottom: 8px; }
  .models { display: flex; flex-direction: column; gap: 6px; }
  .model { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 3px 0; }
  .dot { color: #73c991; font-size: 7px; line-height: 1; }
  .model-name { flex: 1; }
  .model-count { color: var(--vscode-descriptionForeground); font-variant-numeric: tabular-nums; }
  .state { padding: 20px 0; text-align: center; color: var(--vscode-descriptionForeground); }
  .state.error { color: #f48771; }
  .btn { margin-top: 12px; padding: 6px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
  .btn:hover { background: var(--vscode-button-hoverBackground); }
`;

export class UsagePanel {
  private panel: vscode.WebviewPanel | undefined;

  show(usage: UsageResponse | undefined, error: string | undefined, loading: boolean): void {
    if (this.panel) {
      this.panel.reveal();
      this.render(usage, error, loading);
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      'ollamaCloudUsage',
      'Ollama Cloud Usage',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.panel.webview.onDidReceiveMessage((msg) => {
      if (msg.cmd === 'setApiKey') {
        void vscode.commands.executeCommand('ollamaCloud.setApiKey');
      } else if (msg.cmd === 'refresh') {
        void vscode.commands.executeCommand('ollamaCloud.refresh');
      } else if (msg.cmd === 'clearApiKey') {
        void vscode.commands.executeCommand('ollamaCloud.clearApiKey');
      }
    });
    this.panel.onDidDispose(() => { this.panel = undefined; });
    this.render(usage, error, loading);
  }

  render(usage: UsageResponse | undefined, error: string | undefined, loading: boolean): void {
    if (!this.panel) {
      return;
    }
    const script = `<script>
      const vscode = acquireVsCodeApi();
      document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-cmd]');
        if (btn) { vscode.postMessage({ cmd: btn.dataset.cmd }); }
      });
    </script>`;
    this.panel.webview.html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS}</style></head>
      <body>${bodyHtml(usage, error, loading)}${script}</body></html>`;
  }
}