// node --test tests/  ·  growList bookkeeping (growlist-data.js): a list is never cut – it draws every known row step by step and loads the rest by itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROW_STEP, growAction, loadResult, newRows, nextShown } from '../js/growlist-data.js';

test('steps draw at most all known rows; a small rest is drawn at once; step 0 draws everything', () => {
  assert.equal(nextShown(0, 66), GROW_STEP);
  assert.equal(nextShown(50, 66), 66);
  assert.equal(nextShown(0, 55), 55);          // a rest of 5 (< a fifth of a step) comes with the first step
  assert.equal(nextShown(0, 40), 40);
  assert.equal(nextShown(0, 300, 0), 300);
  assert.equal(nextShown(120, 100), 100);
});

test('the end of the list: draw known rows first, then load, wait, show the failure, or stop', () => {
  assert.equal(growAction({ shown: 40, known: 66 }), 'draw');
  assert.equal(growAction({ shown: 66, known: 66, more: true }), 'load');
  assert.equal(growAction({ shown: 66, known: 66, more: true, loading: true }), 'wait');
  assert.equal(growAction({ shown: 66, known: 66, more: true, failed: true }), 'failed');
  assert.equal(growAction({ shown: 66, known: 66 }), 'done');
});

test('a whole list is never left with an unreachable rest: stepping always ends at all rows', () => {
  for (const n of [0, 1, 40, 66, 300, 1234]) {
    let shown = 0, steps = 0;
    while (growAction({ shown, known: n }) === 'draw') { shown = nextShown(shown, n); steps++; assert.ok(steps < 100); }
    assert.equal(shown, n);
  }
});

test('load answers: an array ends the list, { items, more } may go on; an empty page ends it as well', () => {
  assert.deepEqual(loadResult([1, 2]), { items: [1, 2], more: false });
  assert.deepEqual(loadResult({ items: [1], more: true }), { items: [1], more: true });
  assert.deepEqual(loadResult({ items: [], more: true }), { items: [], more: false });
  assert.deepEqual(loadResult(null), { items: [], more: false });
});

test('rows that arrive twice (the list moved while loading) are dropped by key', () => {
  const k = (x) => x.id;
  assert.deepEqual(newRows([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }, { id: 3 }], k), [{ id: 3 }]);
  assert.deepEqual(newRows([1], [1, 2], undefined), [1, 2]);
});
