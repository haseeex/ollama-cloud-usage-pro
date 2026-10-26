import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BAR_CELLS,
  allocateBarCells,
  barColor,
  scaleBarCells,
  sparkline,
  textBar,
  usageColor,
} from './barLayout';

function models(...counts: number[]): { name: string; request_count: number }[] {
  return counts.map((request_count, index) => ({ name: `m${index}`, request_count }));
}

test('scales a value onto the cell width', () => {
  assert.equal(scaleBarCells(50, 100), BAR_CELLS / 2);
  assert.equal(scaleBarCells(100, 100), BAR_CELLS);
  assert.equal(scaleBarCells(0, 100), 0);
});

test('keeps any positive value visible with at least one cell', () => {
  assert.equal(scaleBarCells(1, 1_000_000), 1);
});

test('clamps values above the maximum to the full width', () => {
  assert.equal(scaleBarCells(200, 100), BAR_CELLS);
});

test('returns zero for invalid input', () => {
  assert.equal(scaleBarCells(-5, 100), 0);
  assert.equal(scaleBarCells(5, 0), 0);
  assert.equal(scaleBarCells(Number.NaN, 100), 0);
  assert.equal(scaleBarCells(5, Number.NaN), 0);
});

test('renders a text bar of the requested width', () => {
  const bar = textBar(1, 1, 10);
  assert.equal(bar, '█'.repeat(10));
  assert.equal(bar.length, 10);

  const empty = textBar(0, 1, 10);
  assert.equal(empty, '░'.repeat(10));
  assert.equal(empty.length, 10);
});

test('renders a sparkline scaled to the series maximum', () => {
  const line = sparkline([0, 1, 2, 4]);
  assert.equal(line.length, 4);
  assert.equal(line[0], '▁');
  assert.equal(line[3], '█');
});

test('sparkline handles an all-zero series', () => {
  assert.equal(sparkline([0, 0, 0]), '▁▁▁');
  assert.equal(sparkline([]), '');
});

test('usage colour turns amber past 75% and red past 90%', () => {
  assert.equal(usageColor(0.1), '#2563eb');
  assert.equal(usageColor(0.8), '#d29922');
  assert.equal(usageColor(0.95), '#e5534b');
});

// ── per-model cell allocation ──

test('allocates cells in proportion to request share', () => {
  // 740 : 200 : 60 of 1000, 34 cells → 25.16 : 6.8 : 2.04
  const cells = allocateBarCells(models(740, 200, 60), 34);
  assert.equal(cells.reduce((a, b) => a + b, 0), 34);
  assert.ok(cells[0] > cells[1] && cells[1] > cells[2]);
});

test('total allocated cells always equals the filled count', () => {
  for (const filled of [0, 1, 5, 17, 34, 40]) {
    const cells = allocateBarCells(models(7, 3, 1, 9), filled);
    assert.equal(cells.reduce((a, b) => a + b, 0), filled, `filled=${filled}`);
  }
});

test('gives every model with requests at least one cell', () => {
  // A 1000:1 split still shows the tiny model.
  const cells = allocateBarCells(models(1000, 1), 12);
  assert.equal(cells[0] + cells[1], 12);
  assert.ok(cells[1] >= 1, 'tiny model must stay visible');
  assert.ok(cells[0] >= 1, 'big model must stay visible');
});

test('ignores models with zero requests when guaranteeing visibility', () => {
  const cells = allocateBarCells(models(10, 0), 10);
  assert.equal(cells[1], 0);
  assert.equal(cells[0], 10);
});

test('returns zeros when nothing is filled', () => {
  assert.deepEqual(allocateBarCells(models(5, 3), 0), [0, 0]);
});

test('handles a single model', () => {
  assert.deepEqual(allocateBarCells(models(42), 20), [20]);
});

test('handles empty input', () => {
  assert.deepEqual(allocateBarCells([], 10), []);
});

test('colours cycle through the palette', () => {
  assert.equal(barColor(0), '#2563eb');
  assert.equal(barColor(8), barColor(0));
  assert.notEqual(barColor(1), barColor(0));
});
