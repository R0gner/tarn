// node --test tests/  ·  pure functions without DOM
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fmtNum, fmtPct, fmtBytes, fmtDuration, fmtAgo, fmtTime, fmtDate, fmtWhen, fmtDay, sortRows, compareValues, matchQuery, STATUS_RANK,
} from '../js/format.js';
import { parseHash, buildHash, resolveViews, viewParamsDiffer } from '../js/router.js';
import { setLocale, setTimeZone, getLocale } from '../js/i18n.js';

setLocale('de');
setTimeZone('Europe/Berlin');

test('numbers in German', () => {
  assert.equal(fmtNum(12345.678), '12.345,68');
  assert.equal(fmtNum(12345.678, 0), '12.346');
  assert.equal(fmtNum(null), '–');
  assert.equal(fmtNum(9.9, 2), '9,9');          // at most two decimals …
  assert.equal(fmtNum(9.9, 2, 2), '9,90');      // … at least two: amounts
  assert.equal(fmtNum(12, 2, 2), '12,00');
  assert.equal(fmtNum(1.234, 1, 2), '1,2');     // min never above digits
  assert.equal(fmtPct(0.4567), '45,7\u00a0%');
  assert.equal(fmtPct(1, 0), '100\u00a0%');
});

test('bytes, binary, German', () => {
  assert.equal(fmtBytes(0), '0 B');
  assert.equal(fmtBytes(1536), '1,5 KB');
  assert.equal(fmtBytes(48318382080), '45 GB');
  assert.equal(fmtBytes(1.2e12), '1,09 TB');
  assert.equal(fmtBytes(-2048), '−2 KB');
  assert.equal(fmtBytes(undefined), '–');
});

test('duration and age', () => {
  assert.equal(fmtDuration(42), '42 s');
  assert.equal(fmtDuration(125), '2 min 5 s');
  assert.equal(fmtDuration(7300), '2 Std. 1 min');
  assert.equal(fmtDuration(200000), '2 T 7 Std.');
  assert.equal(fmtAgo(5), 'jetzt');
  assert.equal(fmtAgo(300), 'vor 5 Min.');
  assert.equal(fmtAgo(7200), 'vor 2 Std.');
  assert.equal(fmtAgo(3 * 86400), 'vor 3 Tagen');
  assert.equal(fmtAgo(null), '–');
});

test('times in Europe/Berlin (summer and winter time)', () => {
  assert.equal(fmtTime(Date.UTC(2026, 10, 9, 6, 15)), '07:15'); // CET
  assert.equal(fmtTime(Date.UTC(2026, 6, 1, 6, 15)), '08:15'); // CEST
  assert.equal(fmtDate(Date.UTC(2026, 10, 9, 23, 30)), '10.11.2026'); // after local midnight
  const now = Date.UTC(2026, 10, 9, 9, 0);
  assert.equal(fmtWhen(Date.UTC(2026, 10, 9, 6, 15), now), '07:15');
  assert.equal(fmtWhen(Date.UTC(2026, 10, 8, 21, 10), now), 'gestern 22:10');
  assert.equal(fmtWhen(Date.UTC(2026, 10, 7, 21, 10), now), '07.11. 22:10');   // no comma after the full stop of the date
  assert.equal(fmtDay(Date.UTC(2026, 10, 9, 23, 30)), '10.11.');                    // short date, local day
  assert.equal(fmtDay(null), '–');
});

test('sorting: stable, natural, empty last', () => {
  const rows = [{ n: 'b10' }, { n: 'B2' }, { n: null }, { n: 'ä' }, { n: 'a' }];
  // ä and a compare equal (sensitivity base) and keep input order
  assert.deepEqual(sortRows(rows, (r) => r.n).map((r) => r.n), ['ä', 'a', 'B2', 'b10', null]);
  assert.deepEqual(sortRows(rows, (r) => r.n, 'desc').map((r) => r.n), ['b10', 'B2', 'ä', 'a', null]);
  const st = ['ok', 'bad', 'warn', 'off'].map((s, i) => ({ s, i }));
  assert.deepEqual(sortRows(st, (r) => STATUS_RANK[r.s]).map((r) => r.s), ['bad', 'warn', 'ok', 'off']);
  const same = [{ k: 1, i: 0 }, { k: 1, i: 1 }, { k: 0, i: 2 }];
  assert.deepEqual(sortRows(same, (r) => r.k).map((r) => r.i), [2, 0, 1]);
  assert.ok(compareValues(new Date(2), new Date(1)) > 0);
  assert.equal(rows[0].n, 'b10', 'no mutation');
});

test('search: all words, case-insensitive, accents, ß', () => {
  assert.ok(matchQuery('Größe Backup nas-a', 'grosse nas'));
  assert.ok(matchQuery('Prüfung', 'PRUF'));
  assert.ok(!matchQuery('Backup Fotos', 'backup doku'));
  assert.ok(matchQuery('irgendwas', '   '));
});

test('router: read and build the hash', () => {
  assert.deepEqual(parseHash('#/jobs?open=offsite-sync', 'x'), { view: 'jobs', params: { open: 'offsite-sync' } });
  assert.deepEqual(parseHash('', 'overview'), { view: 'overview', params: {} });
  assert.deepEqual(parseHash('#/automationen/?open=ct%3Aweb&q=a%20b'), { view: 'automationen', params: { open: 'ct:web', q: 'a b' } });
  assert.equal(buildHash('jobs', { open: 'ct:web', q: '', x: null }), '#/jobs?open=ct%3Aweb');
  assert.equal(buildHash('zeilen & fakten'), '#/zeilen%20%26%20fakten');
  const h = buildHash('jobs', { open: 'a/b?c' });
  assert.deepEqual(parseHash(h), { view: 'jobs', params: { open: 'a/b?c' } });
});

test('router: viewParamsDiffer ignores open and empty values, sees every other parameter', () => {
  assert.equal(viewParamsDiffer({}, {}), false);
  assert.equal(viewParamsDiffer({ tab: 'a' }, { tab: 'a', open: 'x' }), false, 'opening a detail is no view change');
  assert.equal(viewParamsDiffer({ tab: 'a', open: 'x' }, { tab: 'a' }), false, 'closing one neither');
  assert.equal(viewParamsDiffer({ q: '' }, {}), false, 'an empty value never reaches the URL');
  assert.equal(viewParamsDiffer(null, undefined), false);
  assert.equal(viewParamsDiffer({ tab: 'a' }, { tab: 'b' }), true);
  assert.equal(viewParamsDiffer({}, { tab: 'b' }), true);
  assert.equal(viewParamsDiffer({ tab: 'a' }, {}), true);
  assert.equal(viewParamsDiffer({ tab: 'a', sort: 'x' }, { sort: 'x', tab: 'a' }), false, 'order does not matter');
  assert.equal(viewParamsDiffer({ range: '1h' }, { range: '24h', open: 'x' }), true);
});

test('fmtWhen and fmtDay in the other languages keep Intl\'s own patterns', () => {
  const now = Date.UTC(2026, 10, 9, 9, 0), t0 = Date.UTC(2026, 10, 7, 21, 10);
  const was = getLocale();
  try {
    setLocale('en'); assert.equal(fmtDay(t0), '11/07'); assert.equal(fmtWhen(t0, now), '11/07, 10:10 PM');
    setLocale('fr'); assert.equal(fmtDay(t0), '07/11'); assert.equal(fmtWhen(t0, now), '07/11 22:10');
    setLocale('de'); assert.equal(fmtDay(t0), '07.11.'); assert.equal(fmtWhen(t0, now), '07.11. 22:10');
  } finally { setLocale(was); }
});

test('resolveViews: label and group may be functions, evaluated once, after the language is set', () => {
  let calls = 0;
  const lang = () => { calls++; return 'Betrieb'; };
  const views = [{ id: 'a', label: () => 'Übersicht', group: lang, render() {} }, { id: 'b', label: 'Jobs', group: 'Fest', render() {} }, { id: 'c', label: 'Hosts', render() {} }];
  const r = resolveViews(views);
  assert.deepEqual(r.map((v) => [v.id, v.label, v.group]), [['a', 'Übersicht', 'Betrieb'], ['b', 'Jobs', 'Fest'], ['c', 'Hosts', undefined]]);
  assert.equal(calls, 1);
  assert.equal(typeof r[0].render, 'function');     // everything else is carried over
  assert.equal(typeof views[0].label, 'function');   // the input is not changed
});
