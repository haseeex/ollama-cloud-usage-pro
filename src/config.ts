import * as vscode from 'vscode';

export const REFRESH_INTERVAL_SETTING = 'ollamaCloud.refreshInterval';
export const DEFAULT_REFRESH_INTERVAL_S = 60;
export const MIN_REFRESH_INTERVAL_S = 10;
export const MAX_REFRESH_INTERVAL_S = 86_400;

export function getRefreshIntervalSeconds(): number {
  const configured = vscode.workspace
    .getConfiguration('ollamaCloud')
    .get<number>('refreshInterval', DEFAULT_REFRESH_INTERVAL_S);
  if (!Number.isFinite(configured)) {
    return DEFAULT_REFRESH_INTERVAL_S;
  }
  return Math.min(MAX_REFRESH_INTERVAL_S, Math.max(MIN_REFRESH_INTERVAL_S, Math.round(configured)));
}

export function getRefreshIntervalMs(): number {
  return getRefreshIntervalSeconds() * 1000;
}

export function formatIntervalSeconds(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} 秒`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return seconds % 60 ? `${minutes} 分 ${seconds % 60} 秒` : `${minutes} 分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours} 小时 ${restMinutes} 分钟` : `${hours} 小时`;
}
