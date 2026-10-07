/**
 * Localization center: every UI string's Chinese/English pair.
 *
 * Deliberately free of any `vscode` dependency so that modules like `api.ts`
 * (which are unit-tested under plain Node) can localize their messages. The
 * VS Code setting is read in `config.ts`, which calls `setLanguage()`.
 */

export type AppLanguage = 'zh' | 'en';

let current: AppLanguage = 'zh';
const listeners = new Set<() => void>();

/** Current effective language. */
export function getLanguage(): AppLanguage {
  return current;
}

/** Set the language and notify subscribers when it actually changed. */
export function setLanguage(language: AppLanguage): void {
  if (language === current) {
    return;
  }
  current = language;
  for (const listener of listeners) {
    listener();
  }
}

export function onLanguageChanged(listener: () => void): { dispose(): void } {
  listeners.add(listener);
  return {
    dispose: () => {
      listeners.delete(listener);
    },
  };
}

export function isChinese(): boolean {
  return current === 'zh';
}

const EN: Record<string, string> = {
  // Status bar
  'StatusBar.Text': 'Ollama  5h: {0}%  Wk: {1}%',
  'StatusBar.Credits': 'Ollama  Credits: {0}%',
  'StatusBar.Loading': 'Ollama …',
  'StatusBar.NoData': 'Ollama —',
  'StatusBar.Tooltip': 'Open Ollama Cloud usage panel',

  // Tooltip
  'Hover.Title': '☁ Ollama Cloud Usage',
  'Hover.NoData': 'No usage data.',
  'Hover.SessionWindow': '5-hour window',
  'Hover.Remaining': '≈{0} left',
  'Hover.RemainingTip':
    "Estimated from this window's average consumption: about {0} more requests available before reset",
  'Hover.WeeklyWindow': 'Weekly window',
  'Hover.ResetIn': 'Resets in: ',
  'Hover.Refresh': 'Auto-refresh every {0}',
  'Hover.LastUpdated': ' · Last {0}',
  'Hover.ClickToOpen': '\nClick to open detail panel',

  // Panel
  'Panel.Title': '☁ Cloud Usage',
  'Window.Title': 'Ollama Cloud Usage',
  'Panel.Refresh': 'Refresh',
  'Panel.Settings': 'Set auto-refresh interval',
  'Panel.RemoveAccount': 'Remove account',
  'Panel.AddAccount': 'Add account',
  'Panel.AddKey': 'Add API key',
  'Panel.SessionWindow': '5-hour window usage',
  'Panel.WeeklyWindow': 'Weekly window usage',
  'Panel.Used': 'Used {0}%',
  'Panel.Remaining': '≈{0} req. left',
  'Panel.RemainingTip':
    "Estimated from this window's average consumption: about {0} more requests available before reset",
  'Panel.Loading': 'Loading Ollama usage…',
  'Panel.NoData': 'No data.',
  'Panel.ResetIn': 'Resets in: ',
  'Panel.AutoRefresh': 'Auto-refresh every {0}',
  'Panel.LastUpdated': 'Last updated {0}',
  'Panel.IncludedCredits': 'Included credits',

  // Models
  'Models.Requests': '{0} req.',

  // Cloud usage (documented /api/usage + /api/balance)
  'Usage.24h': 'Last 24 hours',
  'Usage.7d': 'Last 7 days',
  'Usage.Requests': '{0} requests',
  'Usage.Cost': ' · ${0}',
  'Usage.HourlyTitle': 'Requests per hour',
  'Usage.DailyTitle': 'Requests per day',
  'Usage.Credits': 'Purchased credits',
  'Usage.Balance': 'Balance ${0}',
  'Usage.Included': 'Included ${0} of ${1}',
  'Usage.IncludedShort': 'Included ${0} / ${1}',  'Usage.Peak': 'Peak {0}',
  // Time
  'Time.Days': '{0} d',
  'Time.Hours': '{0} h',
  'Time.HoursMinutes': '{0} h {1} min',
  'Time.Minutes': '{0} min',
  'Time.Seconds': '{0} s',
  'Interval.Hours': '{0} h',
  'Interval.Minutes': '{0} min',
  'Interval.Seconds': '{0} s',

  // Commands
  'Cmd.Refresh': 'Refresh Usage',
  'Cmd.OpenPanel': 'Open Usage Panel',
  'Cmd.AddAccount': 'Add Account',
  'Cmd.RemoveAccount': 'Remove Account',
  'Cmd.SetInterval': 'Set Refresh Interval',
  'Cmd.ToggleLang': 'Switch Language (中/EN)',
  'Cmd.SetPrecision': 'Set Usage Display Precision',

  // Dialogs
  'Dlg.AddAccountTitle': 'Add Account',
  'Dlg.AccountLabel': 'Account name (e.g. Work, Personal)',
  'Dlg.AccountLabelRequired': 'Name cannot be empty.',
  'Dlg.ApiKey': 'Enter Ollama API key',
  'Dlg.ApiKeyRequired': 'API key cannot be empty.',
  'Dlg.RemoveAccountTitle': 'Select account to remove',
  'Dlg.RemoveAccountConfirm': 'Remove account "{0}"?',
  'Dlg.Remove': 'Remove',
  'Dlg.IntervalTitle': 'Set Auto-refresh Interval',
  'Dlg.IntervalPrompt': 'Auto-refresh interval (seconds), range {0}–{1}',
  'Dlg.IntervalInvalid': 'Please enter a number.',
  'Dlg.IntervalRange': 'Interval must be between {0} and {1} seconds.',
  'Dlg.PrecisionTitle': 'Set Usage Display Precision',
  'Dlg.PrecisionPrompt': 'Decimal places for usage percentage, range {0}–{1} (default 1)',
  'Dlg.PrecisionInvalid': 'Please enter a number.',
  'Dlg.PrecisionRange': 'Precision must be between {0} and {1}.',

  // Messages
  'Msg.AccountAdded': 'Account added.',
  'Msg.AccountRemoved': 'Account removed.',
  'Msg.IntervalSet': 'Auto-refresh interval set to {0}.',
  'Msg.LanguageSet': 'Language switched to English.',
  'Msg.PrecisionSet': 'Usage display precision set to {0} decimal place(s).',

  // Errors
  'Err.NoApiKey': 'No Ollama API key configured. Please add an account first.',
  'Err.LoadFailed': 'Failed to load Ollama usage.',
  'Err.EmptyKey': 'Ollama API key is empty.',
  'Err.Timeout': 'Ollama request timed out.',
  'Err.HttpStatus': 'Ollama returned HTTP {0}.',
  'Err.ResponseTooLarge': 'Ollama response too large.',
  'Err.InvalidResponse': 'Invalid Ollama response.',
  'Err.InvalidField': 'Invalid {0} in Ollama response.',
  'Err.RateLimited': 'Ollama rate limit reached. Retry in {0}s.',

  // Period types

  // Tree
  'Tree.Activity': 'Activity',
  'Tree.Limits': 'Limits',
  'Tree.Usage': 'Usage: {0}',
};

const ZH: Record<string, string> = {
  // Status bar
  'StatusBar.Text': 'Ollama  5时: {0}%  周: {1}%',
  'StatusBar.Credits': 'Ollama  额度: {0}%',
  'StatusBar.Loading': 'Ollama …',
  'StatusBar.NoData': 'Ollama —',
  'StatusBar.Tooltip': '打开 Ollama Cloud 用量面板',

  // Tooltip
  'Hover.Title': '☁ Ollama Cloud 用量',
  'Hover.NoData': '暂无用量数据。',
  'Hover.SessionWindow': '5 小时窗口',
  'Hover.Remaining': '剩余约 {0} 次',
  'Hover.RemainingTip': '按当前窗口平均消耗估算：重置前还可请求约 {0} 次（总请求数 ÷ 已用比例 − 总请求数）',
  'Hover.WeeklyWindow': '每周窗口',
  'Hover.ResetIn': '重置倒计时：',
  'Hover.Refresh': '每 {0}自动刷新',
  'Hover.LastUpdated': ' · 上次 {0}',
  'Hover.ClickToOpen': '\n点击打开详细面板',

  // Panel
  'Panel.Title': '☁ 云端用量',
  'Window.Title': 'Ollama Cloud 用量',
  'Panel.Refresh': '刷新',
  'Panel.Settings': '设置自动刷新间隔',
  'Panel.RemoveAccount': '移除账户',
  'Panel.AddAccount': '添加账户',
  'Panel.AddKey': '添加 API 密钥',
  'Panel.SessionWindow': '5 小时窗口用量',
  'Panel.WeeklyWindow': '每周窗口用量',
  'Panel.Used': '已用 {0}%',
  'Panel.Remaining': '剩余约 {0} 次',
  'Panel.RemainingTip': '按当前窗口平均消耗估算：重置前还可请求约 {0} 次（总请求数 ÷ 已用比例 − 总请求数）',
  'Panel.Loading': '正在加载 Ollama 用量…',
  'Panel.NoData': '暂无数据。',
  'Panel.ResetIn': '重置倒计时：',
  'Panel.AutoRefresh': '每 {0}自动刷新',
  'Panel.LastUpdated': '上次更新 {0}',
  'Panel.IncludedCredits': '包含额度',

  // Models
  'Models.Requests': '{0} 次',

  // Cloud usage (documented /api/usage + /api/balance)
  'Usage.24h': '最近 24 小时',
  'Usage.7d': '最近 7 天',
  'Usage.Requests': '{0} 次请求',
  'Usage.Cost': ' · ${0}',
  'Usage.HourlyTitle': '每小时请求数',
  'Usage.DailyTitle': '每天请求数',
  'Usage.Credits': '购买的额度',
  'Usage.Balance': '余额 ${0}',
  'Usage.Included': '包含额度 ${0} / ${1}',
  'Usage.IncludedShort': '包含额度 ${0} / {1}',
  'Usage.Peak': '峰值 {0}',

  // Time
  'Time.Days': '{0} 天',
  'Time.Hours': '{0} 小时',
  'Time.HoursMinutes': '{0} 小时 {1} 分钟',
  'Time.Minutes': '{0} 分钟',
  'Time.Seconds': '{0} 秒',
  'Interval.Hours': '{0} 小时',
  'Interval.Minutes': '{0} 分钟',
  'Interval.Seconds': '{0} 秒',

  // Commands
  'Cmd.Refresh': '刷新用量',
  'Cmd.OpenPanel': '打开用量面板',
  'Cmd.AddAccount': '添加账户',
  'Cmd.RemoveAccount': '移除账户',
  'Cmd.SetInterval': '设置自动刷新间隔',
  'Cmd.ToggleLang': '切换语言 (中/EN)',
  'Cmd.SetPrecision': '设置用量显示精度',

  // Dialogs
  'Dlg.AddAccountTitle': '添加账户',
  'Dlg.AccountLabel': '账户名称（例如：工作、个人）',
  'Dlg.AccountLabelRequired': '名称不能为空。',
  'Dlg.ApiKey': '输入 Ollama API 密钥',
  'Dlg.ApiKeyRequired': 'API 密钥不能为空。',
  'Dlg.RemoveAccountTitle': '选择要移除的账户',
  'Dlg.RemoveAccountConfirm': '确定移除账户「{0}」？',
  'Dlg.Remove': '移除',
  'Dlg.IntervalTitle': '设置自动刷新间隔',
  'Dlg.IntervalPrompt': '自动刷新间隔（秒），范围 {0}–{1}',
  'Dlg.IntervalInvalid': '请输入数字。',
  'Dlg.IntervalRange': '间隔需在 {0}–{1} 秒之间。',
  'Dlg.PrecisionTitle': '设置用量显示精度',
  'Dlg.PrecisionPrompt': '用量百分比小数位数，范围 {0}–{1}（默认 1）',
  'Dlg.PrecisionInvalid': '请输入数字。',
  'Dlg.PrecisionRange': '精度需在 {0}–{1} 之间。',

  // Messages
  'Msg.AccountAdded': '账户已添加。',
  'Msg.AccountRemoved': '账户已移除。',
  'Msg.IntervalSet': '自动刷新间隔已设为 {0}。',
  'Msg.LanguageSet': '界面语言已切换为中文。',
  'Msg.PrecisionSet': '用量显示精度已设为 {0} 位小数。',

  // Errors
  'Err.NoApiKey': '尚未配置 Ollama API 密钥，请先添加账户。',
  'Err.LoadFailed': '无法加载 Ollama 用量。',
  'Err.EmptyKey': 'Ollama API 密钥为空。',
  'Err.Timeout': 'Ollama 请求超时。',
  'Err.HttpStatus': 'Ollama 返回 HTTP {0}。',
  'Err.ResponseTooLarge': 'Ollama 响应过大。',
  'Err.InvalidResponse': 'Ollama 响应无效。',
  'Err.InvalidField': 'Ollama 响应中的 {0} 无效。',
  'Err.RateLimited': 'Ollama 请求频率超限，请 {0} 秒后重试。',

  // Period types

  // Tree
  'Tree.Activity': '活动',
  'Tree.Limits': '限额',
  'Tree.Usage': '用量: {0}',
};

/** Look up a localized string (no arguments). */
export function t(key: string): string {
  const table = isChinese() ? ZH : EN;
  return table[key] ?? key;
}

/** Look up a localized string and substitute `{0}`, `{1}`, … placeholders. */
export function tf(key: string, ...args: (string | number)[]): string {
  const format = t(key);
  return format.replace(/\{(\d+)\}/g, (match, index: string) => {
    const value = args[Number(index)];
    return value === undefined ? match : String(value);
  });
}
