import { ModelUsage } from './api';

/** Width of the tooltip usage bar in cells. Higher = finer per-model resolution. */
export const BAR_CELLS = 40;

/**
 * Allocate `filledTotal` cells across models by request share.
 *
 * Uses largest-remainder so the cells add up exactly, then guarantees every
 * model with requests gets at least one cell (stealing from the widest segment)
 * so no model silently vanishes from the bar. Text tooltips only have whole
 * cells to work with, unlike the WPF star-sized bars in the VS extension.
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
