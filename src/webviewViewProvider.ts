import * as vscode from 'vscode';
import { LimitUsage, ModelUsage } from './api';
import { AccountsState } from './accountStore';
import { DataUpdate } from './usageTreeProvider';
import { formatIntervalSeconds, formatSharePercent, formatUsagePercent, t, tf } from './config';
import { estimateRemainingRequests, estimateRemainingRequestsForModel, formatEstimate, modelWindowShare, windowCapacity } from './quotaPredictor';
import { barColor } from './barLayout';

function segmentsHtml(models: ModelUsage[], usage: number): string {
  if (!models.length) {
    return '<div class="bar"></div>';
  }
  const total = models.reduce((s, m) => s + m.request_count, 0);
  if (!total) {
    return '<div class="bar"></div>';
  }
  const fillWidth = Math.max(0, Math.min(1, usage)) * 100; // filled portion = window usage %
  const segs = models.map((m, i) => {
    const w = (m.request_count / total) * fillWidth;
    return `<div class="seg" style="width:${w}%;background:${barColor(i)}" data-name="${escapeHtml(m.name)}" data-count="${tf('Models.Requests', m.request_count.toLocaleString())}"></div>`;
  }).join('');
  return `<div class="bar">${segs}</div>`;
}

function rowHtml(label: string, limit: LimitUsage, resetType: string): string {
  const remaining = estimateRemainingRequests(limit);
  const remainingHtml = remaining === undefined
    ? ''
    : `<span class="row-remain" title="${escapeHtml(tf('Panel.RemainingTip', formatEstimate(remaining)))}">${escapeHtml(tf('Panel.Remaining', formatEstimate(remaining)))}</span>`;
  return `<div class="row">
    <div class="row-head">
      <span class="row-label">${label}</span>
      <span class="row-right">${remainingHtml}<span class="row-pct">${escapeHtml(tf('Panel.Used', formatUsagePercent(limit.usage)))}</span></span>
    </div>
    ${segmentsHtml(limit.models, limit.usage)}
    <div class="reset">${t('Panel.ResetIn')}<span data-reset="${resetType}">…</span></div>
  </div>`;
}

function modelListHtml(limit: LimitUsage): string {
  if (!limit.models.length) {
    return `<div class="empty">${t('Models.None')}</div>`;
  }
  return limit.models.map((m, i) => {
    const share = modelWindowShare(limit, m.request_count);
    const shareHtml = share === undefined
      ? ''
      : `<span class="model-share" title="${escapeHtml(tf('Models.WindowShareTip', formatSharePercent(share), formatUsagePercent(limit.usage)))}">${escapeHtml(tf('Models.WindowShare', formatSharePercent(share)))}</span>`;

    const remaining = estimateRemainingRequestsForModel(limit, m.request_count);
    const remainingHtml = remaining === undefined
      ? ''
      : `<span class="model-remain" title="${escapeHtml(tf('Models.RemainingTip', formatEstimate(windowCapacity(limit) ?? 0), formatEstimate(remaining)))}">${escapeHtml(tf('Models.Remaining', formatEstimate(remaining)))}</span>`;

    return `<div class="model">
      <span class="dot" style="color:${barColor(i)}">●</span>
      <span class="model-name">${escapeHtml(m.name)}</span>
      ${shareHtml}
      <span class="model-count">${escapeHtml(tf('Models.Requests', m.request_count.toLocaleString()))}</span>
      ${remainingHtml}
    </div>`;
  }).join('');
}

function accountsHtml(state: AccountsState): string {
  const opts = state.accounts.map((a) =>
    `<option value="${a.id}" ${a.id === state.activeId ? 'selected' : ''}>${escapeHtml(a.label)}</option>`,
  ).join('');
  return `<div class="accounts">
    <select class="account-select" data-cmd="switchAccount">${opts}</select>
    <button class="icon-btn" data-cmd="addAccount" title="${t('Panel.AddAccount')}">＋</button>
    <button class="icon-btn" data-cmd="removeAccount" title="${t('Panel.RemoveAccount')}" ${state.accounts.length ? '' : 'disabled'}>－</button>
  </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function footerHtml(data: DataUpdate): string {
  const parts = [tf('Panel.AutoRefresh', formatIntervalSeconds(data.intervalSeconds))];
  if (data.lastUpdatedMs) {
    parts.push(tf('Panel.LastUpdated', new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(data.lastUpdatedMs)));
  }
  return `<div class="footer">${parts.join(' · ')}</div>`;
}

function bodyHtml(data: DataUpdate): string {
  const { usage, error, loading, accounts } = data;
  const toolbar = `<div class="toolbar">
    <h2>${t('Panel.Title')}</h2>
    <div class="actions">
      <button class="icon-btn" data-cmd="refresh" title="${t('Panel.Refresh')}">⟳</button>
      <button class="icon-btn" data-cmd="setRefreshInterval" title="${t('Panel.Settings')}">⚙</button>
    </div>
  </div>
  ${accountsHtml(accounts)}`;

  let content: string;
  if (loading) {
    content = `<div class="state">${t('Panel.Loading')}</div>`;
  } else if (error) {
    content = `<div class="state error">⚠ ${escapeHtml(error)}</div>
      <button class="btn" data-cmd="addAccount">${t('Panel.AddKey')}</button>`;
  } else if (!usage) {
    content = `<div class="state">${t('Panel.NoData')}</div>`;
  } else {
    content = `
    ${rowHtml(t('Panel.SessionWindow'), usage.limits.session, 'session')}
    <div class="group">
      <div class="group-label">${t('Panel.SessionModels')}</div>
      <div class="models">${modelListHtml(usage.limits.session)}</div>
    </div>
    <div class="spacer"></div>
    ${rowHtml(t('Panel.WeeklyWindow'), usage.limits.weekly, 'weekly')}
    <div class="group">
      <div class="group-label">${t('Panel.WeeklyModels')}</div>
      <div class="models">${modelListHtml(usage.limits.weekly)}</div>
    </div>`;
  }
  return `${toolbar}${content}${footerHtml(data)}`;
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
  .row-right { display: flex; align-items: baseline; gap: 8px; }
  .row-remain { font-size: 11px; color: var(--vscode-descriptionForeground); font-variant-numeric: tabular-nums; cursor: help; }
  .row-pct { font-size: 12px; font-weight: 600; font-variant-numeric: tabular-nums; }
  .reset { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 4px; font-variant-numeric: tabular-nums; }
  .bar { background: var(--vscode-scrollbarSlider-background); border-radius: 6px; height: 6px; overflow: hidden; display: flex; }
  .seg { height: 6px; transition: width .3s ease; cursor: default; }
  #tip { display: none; position: fixed; z-index: 10; background: var(--vscode-editorHoverWidget-background); color: var(--vscode-editorHoverWidget-foreground); border: 1px solid var(--vscode-editorHoverWidget-border); border-radius: 4px; padding: 6px 8px; font-size: 12px; font-variant-numeric: tabular-nums; pointer-events: none; box-shadow: 0 2px 8px rgba(0,0,0,.3); }
  .group { margin-top: 20px; }
  .spacer { height: 20px; }
  .group-label { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; color: var(--vscode-descriptionForeground); margin-bottom: 8px; }
  .models { display: flex; flex-direction: column; gap: 6px; }
  .model { display: flex; align-items: center; gap: 8px; font-size: 12px; padding: 3px 0; }
  .dot { font-size: 10px; line-height: 1; }
  .model-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .model-share, .model-count, .model-remain { color: var(--vscode-descriptionForeground); font-variant-numeric: tabular-nums; cursor: help; }
  .model-remain { min-width: 68px; text-align: right; }
  .state { padding: 20px 0; text-align: center; color: var(--vscode-descriptionForeground); }
  .state.error { color: #f48771; }
  .btn { margin-top: 12px; padding: 6px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
  .btn:hover { background: var(--vscode-button-hoverBackground); }
  .footer { margin-top: 18px; font-size: 11px; color: var(--vscode-descriptionForeground); text-align: center; }
`;

export class UsagePanel {
  private panel: vscode.WebviewPanel | undefined;

  show(data: DataUpdate): void {
    if (this.panel) {
      this.panel.reveal();
      this.render(data);
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      'ollamaCloudUsage',
      t('Window.Title'),
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.panel.webview.onDidReceiveMessage((msg) => {
      if (msg.cmd === 'refresh') {
        void vscode.commands.executeCommand('ollamaCloud.refresh');
      } else if (msg.cmd === 'setRefreshInterval') {
        void vscode.commands.executeCommand('ollamaCloud.setRefreshInterval');
      } else if (msg.cmd === 'addAccount') {
        void vscode.commands.executeCommand('ollamaCloud.addAccount');
      } else if (msg.cmd === 'removeAccount') {
        void vscode.commands.executeCommand('ollamaCloud.removeAccount');
      } else if (msg.cmd === 'switchAccount') {
        void vscode.commands.executeCommand('ollamaCloud.switchAccount', msg.id);
      }
    });
    this.panel.onDidDispose(() => { this.panel = undefined; });
    this.render(data);
  }

  render(data: DataUpdate): void {
    if (!this.panel) {
      return;
    }
    this.panel.title = t('Window.Title');
    // The webview runs in its own context and cannot import our modules, so
    // the countdown strings it needs are injected as a JSON literal.
    const countdown = {
      days: t('Time.Days'),
      hours: t('Time.Hours'),
      hoursMinutes: t('Time.HoursMinutes'),
      minutes: t('Time.Minutes'),
      seconds: t('Time.Seconds'),
    };
    const script = `<script>
      const vscode = acquireVsCodeApi();
      const CD = ${JSON.stringify(countdown)};
      function fill(template, value, extra) {
        return template.replace('{0}', value).replace('{1}', extra === undefined ? '' : extra);
      }
      document.body.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-cmd]');
        if (btn) { vscode.postMessage({ cmd: btn.dataset.cmd }); }
      });
      const sel = document.querySelector('select[data-cmd]');
      if (sel) { sel.addEventListener('change', (e) => { vscode.postMessage({ cmd: 'switchAccount', id: e.target.value }); }); }

      const tip = document.getElementById('tip');
      document.addEventListener('mouseover', (e) => {
        const seg = e.target.closest('.seg');
        if (!seg || !tip) { return; }
        tip.innerHTML = '<strong>' + seg.dataset.name + '</strong><br>' + seg.dataset.count;
        tip.style.display = 'block';
      });
      document.addEventListener('mousemove', (e) => {
        if (!tip || tip.style.display === 'block') { tip.style.left = (e.clientX + 12) + 'px'; tip.style.top = (e.clientY + 12) + 'px'; }
      });
      document.addEventListener('mouseout', (e) => {
        if (e.target.closest('.seg') && tip) { tip.style.display = 'none'; }
      });

      // Epoch-aligned UTC boundaries: session 5h (00/05/10/15/20 UTC),
      // weekly 7d anchored to Monday 00:00 UTC (epoch Thursday shifted -4d).
      const SESSION_WINDOW_MS = 5 * 3600000;
      const WEEK_MS = 7 * 86400000;
      const WEEK_ANCHOR_OFFSET_MS = 4 * 86400000;
      function nextSessionReset(now) { return now + (SESSION_WINDOW_MS - (now % SESSION_WINDOW_MS)); }
      function nextWeeklyReset(now) { return now + (WEEK_MS - ((now - WEEK_ANCHOR_OFFSET_MS) % WEEK_MS)); }
      function format(ms) {
        const s = Math.round(ms / 1000);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        const days = Math.floor(h / 24);
        if (days >= 1) { return fill(CD.days, days); }
        if (h >= 1) { return m % 60 ? fill(CD.hoursMinutes, h, m % 60) : fill(CD.hours, h); }
        if (m >= 1) { return fill(CD.minutes, m); }
        return fill(CD.seconds, s);
      }
      function tick() {
        const now = Date.now();
        document.querySelectorAll('[data-reset]').forEach(el => {
          const type = el.dataset.reset;
          if (type === 'session') {
            el.textContent = format(nextSessionReset(now) - now);
          } else {
            el.textContent = format(nextWeeklyReset(now) - now);
          }
        });
      }
      tick();
      setInterval(tick, 1000);
    </script>`;
    this.panel.webview.html = `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><style>${CSS}</style></head>
      <body>${bodyHtml(data)}<div id="tip"></div>${script}</body></html>`;
  }
}