import { ModelUsage } from './api';

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

/**
 * Allocate `filledTotal` cells across models by request share.
 *
 * Uses largest-remainder so the cells add up exactly, then guarantees every
 * model with requests gets at least one cell (stealing from the widest segment)
 * so no model silently vanishes from the bar.
 */
export function allocateBarCells(models: ModelUsage[], filledTotal: number): number[] {
  const counts = models.map(() => 0);
  if (filledTotal <= 0) {
    return counts;
  }

  const total = models.reduce((sum, model) => sum + model.request_count, 0);
  if (total <= 0) {
    return counts;
  }

  const exact = models.map((model) => (filledTotal * model.request_count) / total);
  exact.forEach((value, index) => {
    counts[index] = Math.floor(value);
  });

  // Hand out the leftover cells to the largest fractional parts.
  let leftover = filledTotal - counts.reduce((sum, value) => sum + value, 0);
  const byFraction = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let i = 0; i < byFraction.length && leftover > 0; i++) {
    counts[byFraction[i].index]++;
    leftover--;
  }

  // Guarantee visibility for every model that actually has requests.
  for (let i = 0; i < models.length; i++) {
    if (models[i].request_count <= 0 || counts[i] > 0) {
      continue;
    }
    let widest = -1;
    for (let j = 0; j < counts.length; j++) {
      if (counts[j] > (widest === -1 ? 1 : counts[widest])) {
        widest = j;
      }
    }
    if (widest !== -1) {
      counts[widest]--;
      counts[i]++;
    }
  }

  return counts;
}

/** Blue palette, one shade per model (by index). */
export const BAR_PALETTE = [
  '#2563eb', '#3b82f6', '#4f46e5', '#60a5fa', '#1d4ed8', '#6366f1', '#818cf8', '#93c5fd',
];

/** Colour for the model at `index`. */
export function barColor(index: number): string {
  return BAR_PALETTE[index % BAR_PALETTE.length];
}
