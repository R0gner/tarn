import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listPlaces, listLabelled, sortChoices, nextSort, opensRow } from '../js/table-data.js';

test('list places: defaults of 0.10 stay (title, last right-aligned value, rest sub)', () => {
  assert.deepEqual(listPlaces([{}, {}, { align: 'right' }, { align: 'right' }]), ['title', 'sub', 'sub', 'value']);
  assert.deepEqual(listPlaces([{ mobile: 'hide' }, { mobile: 'title' }, {}]), ['hide', 'title', 'sub']);
});
test('list places: with a metric column no value is chosen by itself', () => {
  assert.deepEqual(listPlaces([{}, { align: 'right', mobile: 'metric' }, { align: 'right' }, { mobile: 'action' }]), ['title', 'metric', 'sub', 'action']);
});
test('list labels: metric labelled by default, value and sub not; listLabel wins', () => {
  assert.equal(listLabelled({}, 'metric'), true);
  assert.equal(listLabelled({}, 'sub'), false);
  assert.equal(listLabelled({ listLabel: true }, 'value'), true);
  assert.equal(listLabelled({ listLabel: false }, 'metric'), false);
});
test('sort choices: sortable columns with a label, current one checked', () => {
  const cols = [{ key: 'a', label: 'Name' }, { key: 'b', label: 'CPU' }, { key: 'w', label: 'Watch', sortable: false }, { key: 'x', label: '' }];
  assert.deepEqual(sortChoices(cols, { key: 'b', dir: 'desc' }), [{ key: 'a', label: 'Name', checked: false }, { key: 'b', label: 'CPU', checked: true }]);
});
test('next sort: same column flips, numbers start descending, text ascending', () => {
  assert.deepEqual(nextSort({ key: 'b', dir: 'desc' }, { key: 'b' }), { key: 'b', dir: 'asc' });
  assert.deepEqual(nextSort(null, { key: 'c', align: 'right' }), { key: 'c', dir: 'desc' });
  assert.deepEqual(nextSort({ key: 'b', dir: 'desc' }, { key: 'a' }), { key: 'a', dir: 'asc' });
});
test('a control inside a row does not open the row', () => {
  const row = { tag: 'tr' };
  const btn = { tag: 'button' };
  assert.equal(opensRow({ closest: () => btn }, row), false);
  assert.equal(opensRow({ closest: () => null }, row), true);
  assert.equal(opensRow({ closest: () => row }, row), true);
  assert.equal(opensRow(null, row), true);
});
