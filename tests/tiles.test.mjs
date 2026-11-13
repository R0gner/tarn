// node --test tests/  ·  tiles(): rows close for any number of tiles (fitTiles), the spans add up per row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitTiles } from '../js/tiles-data.js';

/** rows as [tiles, share of the width per tile] for a result */
const rows = (r) => { const out = []; let i = 0; while (i < r.spans.length) { let used = 0, n = 0; while (i < r.spans.length && used < r.grid) { used += r.spans[i++]; n++; } out.push({ n, used }); } return out; };
const shape = (n, w) => rows(fitTiles(n, w)).map((r) => r.n).join('+');

test('five tiles: wide 5 in a row, medium 3 + 2, phone 2 + 2 + 1', () => {
  assert.equal(shape(5, 1200), '5');
  assert.equal(shape(5, 700), '3+2');      // 4 would fit: balanced 3 + 2 instead of 4 + 1
  assert.equal(shape(5, 366), '2+2+1');    // phone
  assert.equal(shape(5, 316), '2+2+1');    // narrow phone
});

test('every row closes: the spans of a row add up to the whole grid, for any number of tiles and width', () => {
  for (let n = 1; n <= 14; n++) for (const w of [200, 316, 366, 520, 700, 900, 1144, 1600]) {
    const r = fitTiles(n, w);
    assert.equal(r.spans.length, n);
    for (const row of rows(r)) assert.equal(row.used, r.grid, `${n} tiles, ${w} px`);
    assert.ok(r.cols >= 1 && r.cols <= Math.max(n, 1));
  }
});

test('the incomplete last row gets the wider tiles; full rows keep equal tiles', () => {
  const r = fitTiles(5, 700);
  assert.deepEqual([r.cols, r.grid], [3, 6]);
  assert.deepEqual(r.spans, [2, 2, 2, 3, 3]);
  assert.deepEqual(fitTiles(4, 1200).spans, [1, 1, 1, 1]);     // nothing to stretch: the old look
  assert.deepEqual(fitTiles(5, 366).spans, [1, 1, 1, 1, 2]);
  assert.deepEqual(fitTiles(1, 400).spans, [1]);
  assert.deepEqual(fitTiles(0, 400).spans, []);
});

test('columns: at least min wide, two on a phone even when narrower, never more than tiles; balanced rows', () => {
  assert.equal(fitTiles(10, 1200).cols, 5);                     // 7 fit at 150 + 8 gap, balanced 5 + 5
  assert.equal(fitTiles(7, 700).cols, 4);                       // 4 + 3
  assert.equal(fitTiles(3, 120).cols, 2);                       // minCols
  assert.equal(fitTiles(3, 120, { minCols: 1 }).cols, 1);
  assert.equal(fitTiles(2, 2000).cols, 2);
  assert.equal(fitTiles(6, 2000, { min: 300 }).cols, 6);
});
