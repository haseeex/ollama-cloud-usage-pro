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
  'Panel.SessionModels': 'Models this window',
  'Panel.WeeklyModels': 'Models this week',
  'Panel.Used': 'Used {0}%',
  'Panel.Remaining': '≈{0} req. left',
  'Panel.RemainingTip':
    "Estimated from this window's average consumption: about {0} more requests available before reset",
  'Panel.Loading': 'Loading Ollama usage…',
  'Panel.NoData': 'No data.',
  'Panel.ResetIn': 'Resets in: ',
  'Panel.AutoRefresh': 'Auto-refresh every {0}',
  'Panel.LastUpdated': 'Last updated {0}',

  // Models
  'Models.None': 'No model requests',
  'Models.Requests': '{0} req.',
  'Models.WindowShare': '{0}%',
  'Models.WindowShareTip':
    "This model accounts for {0}% of the window's quota (window usage {1}% × this model's share of requests)",
  'Models.Remaining': '· ≈{0} left',
  'Models.RemainingTip':
    'If this model were used exclusively: window capacity {0} − requests already made by this model = about {1} more requests left',

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

  // Period types
  'Period.last_4_weeks': 'Last 4 weeks',
  'Period.last_7_days': 'Last 7 days',
  'Period.last_24_hours': 'Last 24 hours',
  'Period.daily': 'Daily',
  'Period.weekly': 'Weekly',
  'Period.monthly': 'Monthly',

  // Tree
  'Tree.Activity': 'Activity',
  'Tree.Cost': 'Cost: ${0}',
  'Tree.Models': 'Models',
  'Tree.Limits': 'Limits',
  'Tree.Usage': 'Usage: {0}',
  'Tree.FromTo': 'From {0} to {1}',
};

const ZH: Record<string, string> = {
  // Status bar
  'StatusBar.Text': 'Ollama  5时: {0}%  周: {1}%',
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
  'Panel.SessionModels': '本窗口使用的模型',
  'Panel.WeeklyModels': '本周使用的模型',
  'Panel.Used': '已用 {0}%',
  'Panel.Remaining': '剩余约 {0} 次',
  'Panel.RemainingTip': '按当前窗口平均消耗估算：重置前还可请求约 {0} 次（总请求数 ÷ 已用比例 − 总请求数）',
  'Panel.Loading': '正在加载 Ollama 用量…',
  'Panel.NoData': '暂无数据。',
  'Panel.ResetIn': '重置倒计时：',
  'Panel.AutoRefresh': '每 {0}自动刷新',
  'Panel.LastUpdated': '上次更新 {0}',

  // Models
  'Models.None': '无模型请求',
  'Models.Requests': '{0} 次',
  'Models.WindowShare': '{0}%',
  'Models.WindowShareTip': '该模型占用窗口 {0}% 的配额（窗口用量 {1}% × 该模型请求占比）',
  'Models.Remaining': '· 剩余约 {0} 次',
  'Models.RemainingTip': '若仅使用该模型：窗口容量 {0} 次 − 该模型已用次数 = 还可请求约 {1} 次',

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

  // Period types
  'Period.last_4_weeks': '最近 4 周',
  'Period.last_7_days': '最近 7 天',
  'Period.last_24_hours': '最近 24 小时',
  'Period.daily': '每日',
  'Period.weekly': '每周',
  'Period.monthly': '每月',

  // Tree
  'Tree.Activity': '活动',
  'Tree.Cost': '费用: ${0}',
  'Tree.Models': '模型',
  'Tree.Limits': '限额',
  'Tree.Usage': '用量: {0}',
  'Tree.FromTo': '从 {0} 到 {1}',
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

/** Localized period type, falling back to a prettified raw value. */
export function tPeriod(type: string): string {
  const key = `Period.${type}`;
  const localized = t(key);
  return localized === key ? type.replaceAll('_', ' ') : localized;
}
