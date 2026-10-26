import * as vscode from 'vscode';
import { AppLanguage, setLanguage, t, tf } from './localization';

export const REFRESH_INTERVAL_SETTING = 'ollamaCloud.refreshInterval';
export const USAGE_PRECISION_SETTING = 'ollamaCloud.usagePrecision';
export const LANGUAGE_SETTING = 'ollamaCloud.language';

export const DEFAULT_REFRESH_INTERVAL_S = 60;
export const MIN_REFRESH_INTERVAL_S = 10;
export const MAX_REFRESH_INTERVAL_S = 86_400;

/** Usage percentage decimal places, matching the Visual Studio extension. */
export const DEFAULT_USAGE_PRECISION = 1;
export const MIN_USAGE_PRECISION = 0;
export const MAX_USAGE_PRECISION = 4;

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

export function getUsagePrecision(): number {
  const configured = vscode.workspace
    .getConfiguration('ollamaCloud')
    .get<number>('usagePrecision', DEFAULT_USAGE_PRECISION);
  if (!Number.isFinite(configured)) {
    return DEFAULT_USAGE_PRECISION;
  }
  return Math.min(MAX_USAGE_PRECISION, Math.max(MIN_USAGE_PRECISION, Math.round(configured)));
}

/**
 * Format a usage ratio (0–1) as a percentage number without the `%` sign.
 * precision=1 → "2.3"; precision=0 → "2"; precision=2 → "2.30".
 */
export function formatUsagePercent(usage: number): string {
  const value = usage < 0 ? 0 : usage * 100;
  return value.toFixed(getUsagePrecision());
}

/**
 * Format a share percentage (a model's slice of the window quota). Shares are
 * usually far smaller than total usage (e.g. 0.0167%), so if the configured
 * precision would render it as 0 we raise precision until it is visible
 * (capped at the maximum) rather than showing a misleading "0.0%".
 */
export function formatSharePercent(fraction: number): string {
  const value = fraction < 0 ? 0 : fraction * 100;
  let precision = getUsagePrecision();
  let text = value.toFixed(precision);

  while (value > 0 && precision < MAX_USAGE_PRECISION) {
    if (Number.parseFloat(text) !== 0) {
      break;
    }
    precision++;
    text = value.toFixed(precision);
  }

  return text;
}

export function formatIntervalSeconds(seconds: number): string {
  if (seconds % 3600 === 0 && seconds >= 3600) {
    return tf('Interval.Hours', seconds / 3600);
  }
  if (seconds % 60 === 0 && seconds >= 60) {
    return tf('Interval.Minutes', seconds / 60);
  }
  return tf('Interval.Seconds', seconds);
}

/** Localized relative duration, e.g. "2 小时 30 分钟" / "2 h 30 min". */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days >= 1) {
    return tf('Time.Days', days);
  }
  if (hours >= 1) {
    return minutes % 60 ? tf('Time.HoursMinutes', hours, minutes % 60) : tf('Time.Hours', hours);
  }
  if (minutes >= 1) {
    return tf('Time.Minutes', minutes);
  }
  return tf('Time.Seconds', totalSeconds);
}

/** Re-exported so callers do not need to import localization directly. */
export { t, tf };

/**
 * Resolve the effective language from the setting (`auto` follows VS Code's
 * display language) and push it into the localization module.
 */
export function syncLanguage(): void {
  const configured = vscode.workspace
    .getConfiguration('ollamaCloud')
    .get<AppLanguage | 'auto'>('language', 'auto');
  const resolved: AppLanguage =
    configured === 'zh' || configured === 'en'
      ? configured
      : vscode.env.language.toLowerCase().startsWith('zh')
        ? 'zh'
        : 'en';
  setLanguage(resolved);
}


