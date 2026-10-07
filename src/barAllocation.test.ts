import assert from 'node:assert/strict';
import test from 'node:test';
import { BAR_CELLS, scaleBarCells, sparkline, textBar, usageColor } from './barLayout';

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
