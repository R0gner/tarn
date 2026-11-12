// node --test tests/  ·  filters: matchFilters per data type, chip texts, removing a chip
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLocale, setTimeZone } from '../js/i18n.js';
import { matchFilters, chipsOf, withoutChip, kindOf, presetMs, timeBounds, toMs } from '../js/filters-data.js';

setTimeZone('Europe/Berlin');
const NOW = Date.UTC(2026, 10, 10, 12, 0);                // 10 Nov 2026, 13:00 in Berlin
const H = 3600e3;
const rows = [
  { id: 'a', status: 'bad', tags: ['x', 'y'], failing: true, dur: 12, last: NOW - 0.5 * H },
  { id: 'b', status: 'ok', tags: ['y'], failing: false, dur: 3, last: NOW - 5 * H },
  { id: 'c', status: 'ok', tags: [], failing: 0, dur: null, last: NOW - 30 * H },
  { id: 'd', status: 'warn', tags: ['z'], failing: 1, dur: 10, last: null },
  { id: 'e', status: 'ok', tags: ['x'], failing: false, dur: 40, last: new Date(NOW - 3 * 86400e3).toISOString() },
];
const ids = (f, get) => rows.filter((r) => matchFilters(r, f, get, { now: NOW })).map((r) => r.id).join('');

test('kindOf: the type follows from the value', () => {
  assert.equal(kindOf(['a']), 'options'); assert.equal(kindOf([]), null);
  assert.equal(kindOf(true), 'bool'); assert.equal(kindOf(false), 'bool');
  assert.equal(kindOf({ min: 1 }), 'range'); assert.equal(kindOf({ min: undefined, max: undefined }), null);
  assert.equal(kindOf({ preset: '24h' }), 'time'); assert.equal(kindOf({ from: '2026-11-01' }), 'time'); assert.equal(kindOf({}), null);
  assert.equal(kindOf(undefined), null); assert.equal(kindOf('x'), null);
});

test('options: one of the values, array values, empty = all, old calls without a type', () => {
  assert.equal(ids({}), 'abcde');
  assert.equal(ids({ status: ['ok'] }), 'bce');
  assert.equal(ids({ status: ['ok', 'bad'] }), 'abce');
  assert.equal(ids({ tags: ['y'] }), 'ab');
  assert.equal(ids({ status: [] }), 'abcde');
  assert.equal(ids({ status: ['ok'], tags: ['x'] }), 'e');
  assert.equal(matchFilters({ status: 'ok' }, { status: ['ok'] }), true);   // two arguments, as before
});

test('bool: truthy/falsy rows, key absent = all', () => {
  assert.equal(ids({ failing: true }), 'ad');
  assert.equal(ids({ failing: false }), 'bce');
});

test('range: min, max, both, boundaries, rows without a number', () => {
  const get = (r, k) => (k === 'duration' ? r.dur : r[k]);
  assert.equal(ids({ duration: { min: 10 } }, get), 'ade');
  assert.equal(ids({ duration: { max: 10 } }, get), 'bd');
  assert.equal(ids({ duration: { min: 3, max: 12 } }, get), 'abd');
  assert.equal(ids({ duration: { min: 0 } }, get), 'abde');               // c has no duration → does not match
  assert.equal(ids({ duration: { min: 5, max: 5 } }, get), '');
  assert.equal(matchFilters({ n: '7' }, { n: { min: 5 } }), true);        // numeric string
});

test('time: presets relative to now, custom days in the time zone, open ends, strings and null', () => {
  const get = (r, k) => (k === 'when' ? r.last : r[k]);
  assert.equal(ids({ when: { preset: '1h' } }, get), 'a');
  assert.equal(ids({ when: { preset: '24h' } }, get), 'ab');
  assert.equal(ids({ when: { preset: '7d' } }, get), 'abce');             // d has no time → never matches
  assert.equal(ids({ when: { from: '2026-11-10' } }, get), 'ab');         // since 10 Nov 00:00 Berlin = 9 Nov 23:00 UTC; c is 9 Nov 06:00 UTC
  assert.equal(ids({ when: { to: '2026-11-09' } }, get), 'ce');
  assert.equal(ids({ when: { from: '2026-11-07', to: '2026-11-07' } }, get), 'e');   // e is 7 Nov 12:00 UTC
  assert.equal(presetMs('24h'), 86400000); assert.equal(presetMs('7d'), 7 * 86400000); assert.equal(presetMs('x'), null);
  const b = timeBounds({ from: '2026-11-10', to: '2026-11-10' }, NOW, 'Europe/Berlin');
  assert.equal(b.to - b.from, 24 * H);
  assert.equal(toMs('nope'), null); assert.equal(toMs(null), null); assert.equal(toMs(5), 5); assert.equal(toMs(new Date(5)), 5);
});

test('chip texts: every type readable in every language', () => {
  const defs = [
    { key: 'status', label: 'Status', options: [{ value: 'ok', label: 'OK' }] }, { key: 'failing', label: 'Failed', type: 'bool' },
    { key: 'duration', label: 'Duration', type: 'range', unit: 'min' }, { key: 'last', label: 'Last run', type: 'time' },
  ];
  setLocale('en');
  const txt = (f) => chipsOf(defs, f, 'Europe/Berlin').map((c) => `${c.group}${c.sep} ${c.text}`.replace(': ', ': '));
  assert.deepEqual(txt({ status: ['ok', 'zz'] }), ['Status: OK', 'Status: zz']);
  assert.deepEqual(txt({ failing: true }), ['Failed: Yes']);
  assert.deepEqual(txt({ failing: false }), ['Failed: No']);
  assert.deepEqual(txt({ duration: { min: 10 } }), ['Duration ≥ 10 min']);
  assert.deepEqual(txt({ duration: { max: 5 } }), ['Duration ≤ 5 min']);
  assert.deepEqual(txt({ duration: { min: 10, max: 20 } }), ['Duration 10–20 min']);
  assert.deepEqual(txt({ last: { preset: '24h' } }), ['Last run: last 24 hours']);
  assert.deepEqual(txt({ last: { from: '2026-11-03' } }), ['Last run: since 11/03/2026']);
  assert.deepEqual(txt({ last: { from: '2026-11-03', to: '2026-11-10' } }), ['Last run: 11/03/2026 – 11/10/2026']);
  setLocale('de');
  assert.deepEqual(txt({ failing: true }), ['Failed: Ja']);
  assert.deepEqual(txt({ duration: { min: 10 } }), ['Duration ≥ 10 min']);
  assert.deepEqual(txt({ last: { preset: '7d' } }), ['Last run: letzte 7 Tage']);
  assert.deepEqual(txt({ last: { to: '2026-11-10' } }), ['Last run: bis 10.11.2026']);
  setLocale('fr'); assert.deepEqual(txt({ last: { preset: '1h' } }), ['Last run: dernière heure']);
  setLocale('es'); assert.deepEqual(txt({ failing: true }), ['Failed: Sí']);
  setLocale('en');
});

test('withoutChip: one option value or the whole key', () => {
  const f = { status: ['ok', 'bad'], failing: true, duration: { min: 1 } };
  assert.deepEqual(withoutChip(f, { key: 'status', value: 'ok' }), { status: ['bad'], failing: true, duration: { min: 1 } });
  assert.deepEqual(withoutChip({ status: ['ok'] }, { key: 'status', value: 'ok' }), {});
  assert.deepEqual(withoutChip(f, { key: 'failing' }), { status: ['ok', 'bad'], duration: { min: 1 } });
  assert.deepEqual(f.status, ['ok', 'bad']);   // input untouched
});

test('performance: 1,000 rows with four filters well below the 50 ms budget (plain CPU)', () => {
  const big = Array.from({ length: 1000 }, (_, i) => ({ s: ['ok', 'bad', 'warn'][i % 3], f: i % 5 === 0, d: i % 60, t: NOW - i * 600e3 }));
  const f = { s: ['ok', 'warn'], f: false, d: { min: 5, max: 50 }, t: { from: '2026-11-03', to: '2026-11-10' } };   // custom days: the zone offset is computed once, not per row
  const t0 = performance.now();
  const n = big.filter((r) => matchFilters(r, f, undefined, { now: NOW })).length;
  const ms = performance.now() - t0;
  assert.ok(n > 0 && n < 1000);
  assert.ok(ms < 50, `${ms.toFixed(1)} ms`);
});
