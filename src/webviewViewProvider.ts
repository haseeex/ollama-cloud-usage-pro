import * as vscode from 'vscode';
import { UsageResponse } from './api';
import { AccountsState } from './accountStore';

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

function rowHtml(label: string, percent: number, usage: number, resetType: string, extra = ''): string {
  const color = hexFor(percent);
  return `<div class="row">
    <div class="row-head">
      <span class="row-label">${label}</span>
      <span class="row-pct" style="color:${color}">${pct(usage)}% used</span>
    </div>
    ${barHtml(percent)}
    <div class="reset">Resets in <span data-reset="${resetType}"${extra}>…</span>.</div>
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

function accountsHtml(state: AccountsState): string {
  const opts = state.accounts.map((a) =>
    `<option value="${a.id}" ${a.id === state.activeId ? 'selected' : ''}>${escapeHtml(a.label)}</option>`,
  ).join('');
  return `<div class="accounts">
    <select class="account-select" data-cmd="switchAccount">${opts}</select>
    <button class="icon-btn" data-cmd="addAccount" title="Add account">＋</button>
    <button class="icon-btn" data-cmd="removeAccount" title="Remove account" ${state.accounts.length ? '' : 'disabled'}>－</button>
  </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function bodyHtml(usage: UsageResponse | undefined, error: string | undefined, loading: boolean, accounts: AccountsState, sessionResetMs: number): string {
  const toolbar = `<div class="toolbar">
    <h2>☁ Cloud usage</h2>
    <div class="actions">
      <button class="icon-btn" data-cmd="refresh" title="Refresh">⟳</button>
    </div>
  </div>
  ${accountsHtml(accounts)}`;

  if (loading) {
    return `${toolbar}<div class="state">Loading Ollama usage…</div>`;
  }
  if (error) {
    return `${toolbar}<div class="state error">⚠ ${escapeHtml(error)}</div>
      <button class="btn" data-cmd="addAccount">Add API Key</button>`;
  }
  if (!usage) {
    return `${toolbar}<div class="state">No data.</div>`;
  }
  const sp = pct(usage.limits.session.usage);
  const wp = pct(usage.limits.weekly.usage);
  const sResetAttr = sessionResetMs ? ` data-session-base="${sessionResetMs}"` : '';
  return `${toolbar}
    ${rowHtml('Session usage', sp, usage.limits.session.usage, 'session', sResetAttr)}
    <div class="group">
      <div class="group-label">Models used this session</div>
      <div class="models">${modelListHtml(usage.limits.session.models)}</div>
    </div>
    <div class="spacer"></div>
    ${rowHtml('Weekly usage', wp, usage.limits.weekly.usage, 'weekly')}
    <div class="group">
      <div class="group-label">Models used this week</div>
      <div class="models">${modelListHtml(usage.limits.weekly.models)}</div>
    </div>`;
}

const CSS = `
  body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-foreground); margin: 0; max-width: 480px; }
  .toolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
  .toolbar h2 { margin: 0; }
  .actions { display: flex; gap: 4px; }
  .icon-btn { background: none; border: none; cursor: pointer; font-size: 15px; padding: 4px 6px; border-radius: 4px; color: var(--vscode-foreground); opacity: 0.7; line-height: 1; }
  .icon-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground); }
  .icon-btn:disabled { opacity: 0.3; cursor: default; }
  .accounts { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; }
  .account-select { flex: 1; font-family: var(--vscode-font-family); font-size: 12px; padding: 4px 8px; background: var(--vscode-dropdown-background); color: var(--vscode-dropdown-foreground); border: 1px solid var(--vscode-dropdown-border); border-radius: 4px; }
  h2 { font-size: 14px; font-weight: 600; margin: 0 0 18px 0; }
  .row { margin-bottom: 16px; }
  .row-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 6px; }
  .row-label { font-size: 13px; font-weight: 500; }
  .row-pct { font-size: 12px; font-weight: 600; }
  .reset { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px; font-variant-numeric: tabular-nums; }
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

  show(usage: UsageResponse | undefined, error: string | undefined, loading: boolean, accounts: AccountsState, sessionResetMs: number): void {
    if (this.panel) {
      this.panel.reveal();
      this.render(usage, error, loading, accounts, sessionResetMs);
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      'ollamaCloudUsage',
      'Ollama Cloud Usage',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.panel.webview.onDidReceiveMessage((msg) => {
      if (msg.cmd === 'refresh') {
        void vscode.commands.executeCommand('ollamaCloud.refresh');
      } else if (msg.cmd === 'addAccount') {
        void vscode.commands.executeCommand('ollamaCloud.addAccount');
      } else if (msg.cmd === 'removeAccount') {
        void vscode.commands.executeCommand('ollamaCloud.removeAccount');
      } else if (msg.cmd === 'switchAccount') {
        void vscode.commands.executeCommand('ollamaCloud.switchAccount', msg.id);
      }
    });
    this.panel.onDidDispose(() => { this.panel = undefined; });
    this.render(usage, error, loading, accounts, sessionResetMs);
  }

  render(usage: UsageResponse | undefined, error: string | undefined, loading: boolean, accounts: AccountsState, sessionResetMs: number): void {
    if (!this.panel) {
      return;
    }
    const script = `<script>
      const vscode = acquireVsCodeApi();
      document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-cmd]');
        if (btn) { vscode.postMessage({ cmd: btn.dataset.cmd }); }
      });
      const sel = document.querySelector('select[data-cmd]');
      if (sel) { sel.addEventListener('change', (e) => { vscode.postMessage({ cmd: 'switchAccount', id: e.target.value }); }); }

      function nextWeeklyReset() {
        const now = new Date();
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 7, 0, 0);
        const dow = d.getDay();
        const diff = (8 - dow) % 7;
        d.setDate(d.getDate() + diff);
        if (d.getTime() <= now.getTime()) { d.setDate(d.getDate() + 7); }
        return d.getTime();
      }
      function format(ms) {
        const s = Math.round(ms / 1000);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        const days = Math.floor(h / 24);
        if (days >= 1) { return days + ' day' + (days > 1 ? 's' : ''); }
        if (h >= 1) { return h + ' hour' + (h > 1 ? 's' : '') + (m % 60 ? ' ' + (m % 60) + ' min' : ''); }
        if (m >= 1) { return m + ' minute' + (m > 1 ? 's' : ''); }
        return s + ' second' + (s > 1 ? 's' : '');
      }
      function tick() {
        const now = Date.now();
        document.querySelectorAll('[data-reset]').forEach(el => {
          const type = el.dataset.reset;
          if (type === 'session') {
            let base = Number(el.dataset.sessionBase || 0);
            if (!base) { el.textContent = '—'; return; }
            while (base <= now) { base += 5 * 3600000; }
            el.textContent = format(base - now);
          } else {
            el.textContent = format(nextWeeklyReset() - now);
          }
        });
      }
      tick();
      setInterval(tick, 1000);
    </script>`;
    this.panel.webview.html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${CSS}</style></head>
      <body>${bodyHtml(usage, error, loading, accounts, sessionResetMs)}${script}</body></html>`;
  }
}