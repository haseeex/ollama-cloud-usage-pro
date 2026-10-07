/** Cells in a text bar (tooltip usage bars and history rows). */
export const BAR_CELLS = 40;

/**
 * Filled cells for `value` on a linear scale of `max`. Zero (or a zero
 * maximum) stays empty; any positive value is given at least one cell so a
 * small-but-real count stays visible.
 */
export function scaleBarCells(value: number, max: number, cells = BAR_CELLS): number {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(max) || max <= 0) {
    return 0;
  }
  const scaled = Math.round((value / max) * cells);
  return Math.max(1, Math.min(cells, scaled));
}

/** Text bar of `cells` width, e.g. `████░░░░`. */
export function textBar(value: number, max: number, cells = BAR_CELLS): string {
  const filled = scaleBarCells(value, max, cells);
  return '█'.repeat(filled) + '░'.repeat(Math.max(0, cells - filled));
}

const SPARK_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

/** Compact sparkline, one character per value, scaled to the series maximum. */
export function sparkline(values: number[]): string {
  const max = values.reduce((m, v) => (v > m ? v : m), 0);
  if (max <= 0) {
    return SPARK_CHARS[0].repeat(values.length);
  }
  return values
    .map((value) => {
      const level = Math.floor((value / max) * SPARK_CHARS.length);
      return SPARK_CHARS[Math.max(0, Math.min(SPARK_CHARS.length - 1, level))];
    })
    .join('');
}

/** Usage bar colour: blue while comfortable, amber past 75%, red past 90%. */
export function usageColor(usedFraction: number): string {
  if (usedFraction >= 0.9) {
    return '#e5534b';
  }
  if (usedFraction >= 0.75) {
    return '#d29922';
  }
  return '#2563eb';
}
