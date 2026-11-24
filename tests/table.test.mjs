import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metricLayout, metricTemplate, metricNeed, listPlaces, listLabelled, sortChoices, nextSort, pickSort, flipSort, opensRow } from '../js/table-data.js';

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
test('phone sort: the menu picks a column (the current one keeps its direction), the arrow button flips', () => {
  assert.deepEqual(pickSort({ key: 'b', dir: 'desc' }, { key: 'b' }), { key: 'b', dir: 'desc' });
  assert.deepEqual(pickSort({ key: 'b', dir: 'asc' }, { key: 'c', align: 'right' }), { key: 'c', dir: 'desc' });
  assert.deepEqual(pickSort(null, { key: 'a' }), { key: 'a', dir: 'asc' });
  assert.deepEqual(flipSort({ key: 'a', dir: 'asc' }), { key: 'a', dir: 'desc' });
  assert.deepEqual(flipSort({ key: 'a', dir: 'desc' }), { key: 'a', dir: 'asc' });
});
test('a control inside a row does not open the row', () => {
  const row = { tag: 'tr' };
  const btn = { tag: 'button' };
  assert.equal(opensRow({ closest: () => btn }, row), false);
  assert.equal(opensRow({ closest: () => null }, row), true);
  assert.equal(opensRow({ closest: () => row }, row), true);
  assert.equal(opensRow(null, row), true);
});

test('measurement grid: as many per line as fit, balanced, at most six', () => {
  assert.equal(metricLayout([70, 80, 90], 300, 12).cols, 3);                 // three fit in one line
  assert.equal(metricLayout([70, 80, 90, 100, 85], 300, 12).cols, 3);        // 3 + 2, tracks per position
  assert.deepEqual(metricLayout([70, 80, 90, 100, 85], 300, 12).tracks, [100, 85, 90]);
  assert.equal(metricLayout([60, 60, 60, 60, 60], 300, 12).cols, 3);         // four fit, 4 + 1 is balanced to 3 + 2
  assert.equal(metricLayout([70, 80, 125, 95, 90], 252, 12).cols, 2);        // a long label widens only its own track
  assert.equal(metricLayout([200, 80], 150, 12).cols, 1);                    // nothing fits: one per line
  assert.equal(metricLayout(Array(6).fill(40), 2000, 12).cols, 6);           // six in one line
  assert.equal(metricLayout(Array(8).fill(40), 2000, 12).cols, 4);           // never more than six: 8 → 4 + 4
  assert.equal(metricLayout([50], 300, 12).cols, 1);
});
test('measurement grid: the template is fr shares (no px), cells never narrower than 0', () => {
  assert.equal(metricTemplate([100, 85.4]), 'minmax(0, 100fr) minmax(0, 85fr)');
});

test('measurement need: label + the value 80 % of the rows reach; an outlier moves below its label, it does not widen the grid; never narrower than an unbreakable piece', () => {
  assert.equal(metricNeed(90, [20, 25, 22, 70, 24], 4), 90 + 4 + 25);       // five rows: the second widest value
  assert.equal(metricNeed(30, [40], 4), 74);
  assert.equal(metricNeed(30, [], 4), 30);
  assert.equal(metricNeed(30, [10, 10, 10, 10, 90], 4, 60), 60);          // never narrower than the longest unbreakable piece (a number is never broken)
  assert.equal(metricNeed(55, [14, 14, 14, 14, 32], 4, 32), 55 + 4 + 14);  // the outlier itself does not widen the track, it moves below its label
});
