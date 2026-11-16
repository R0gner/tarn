// promSource: pure conversion (matrix/vector to chart data, grid with gaps, legend, step, escape) and the source against the simulator.
import test from 'node:test';
import assert from 'node:assert/strict';
import { promMatrix, promVector, promLegend, promStep, promRangeParams, promEscape, promValue, findRange, promInterval, RANGE_PRESETS } from '../js/prom-data.js';
import { promSim } from '../gallery/prom-sim.js';

globalThis.document ??= /** @type {any} */ ({ hidden: false, documentElement: {}, addEventListener() {}, removeEventListener() {} });
const { promSource, dataSource } = await import('../js/data.js');

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

test('promStep: at most about 300 points, calm values, minimum step', () => {
  assert.equal(promStep(3600), 15);
  assert.equal(promStep(6 * 3600), 120);
  assert.equal(promStep(86400), 300);
  assert.equal(promStep(7 * 86400), 3600);
  assert.equal(promStep(30 * 86400), 10800);
  for (const r of RANGE_PRESETS) assert.ok(r.seconds / promStep(r.seconds) <= 300, r.id);
  assert.equal(promStep(3600, { minStep: 60 }), 60);
  assert.equal(promStep(60), 1);
});

test('promRangeParams: end aligned to the step, fixed step wins', () => {
  const p = promRangeParams({ seconds: 3600 }, NOW + 7_000);
  assert.deepEqual(p, { start: NOW / 1000 - 3600, end: NOW / 1000, step: 15 });
  assert.equal(promRangeParams({ seconds: 3600 }, NOW, { step: 60 }).step, 60);
  assert.equal(promInterval(15), 15_000);
  assert.equal(promInterval(10800), 300_000);
});

test('promEscape: quotes, backslashes, line breaks; regex mode', () => {
  assert.equal(promEscape('a"b\\c\nd'), 'a\\"b\\\\c\\nd');
  assert.equal(promEscape('web.1'), 'web.1');
  assert.equal(promEscape('web.1', { regex: true }), 'web\\\\.1');
  assert.equal(promEscape(null), '');
});

test('promLegend: template, function, default form', () => {
  const l = { __name__: 'up', job: 'api', instance: 'h1:9100' };
  assert.equal(promLegend(l, '{{instance}} ({{ job }})'), 'h1:9100 (api)');
  assert.equal(promLegend(l, '{{missing}}x'), 'x');
  assert.equal(promLegend(l, (x) => x.job.toUpperCase()), 'API');
  assert.equal(promLegend(l, undefined), 'up{instance="h1:9100", job="api"}');
  assert.equal(promLegend({}, undefined, 'cpu'), 'cpu');
  assert.equal(promLegend({ __name__: 'up' }, undefined, 'cpu'), 'up');
});

test('promMatrix: one common grid, gaps as null, non-finite as null', () => {
  const m = promMatrix([
    { metric: { instance: 'a' }, values: [[100, '1'], [115, '2'], [130, '3']] },
    { metric: { instance: 'b' }, values: [[115, '5'], [145, 'NaN']] },
  ], { legend: '{{instance}}' });
  assert.deepEqual(m.x, [100_000, 115_000, 130_000, 145_000]);
  assert.deepEqual(m.series.map((s) => s.label), ['a', 'b']);
  assert.deepEqual(m.series[0].values, [1, 2, 3, null]);
  assert.deepEqual(m.series[1].values, [null, 5, null, null]);
  assert.deepEqual(promMatrix([]), { x: [], series: [] });
});

test('promVector: vector, scalar, matrix (last value); promValue picks the one number', () => {
  const rows = promVector({ resultType: 'vector', result: [{ metric: { q: 'a' }, value: [1, '3.5'] }, { metric: { q: 'b' }, value: [1, '+Inf'] }] }, { legend: '{{q}}' });
  assert.deepEqual(rows, [{ label: 'a', labels: { q: 'a' }, value: 3.5 }, { label: 'b', labels: { q: 'b' }, value: null }]);
  assert.deepEqual(promVector({ resultType: 'scalar', result: [1, '7'] }, { name: 'n' }), [{ label: 'n', labels: {}, value: 7 }]);
  assert.equal(promVector({ resultType: 'matrix', result: [{ metric: {}, values: [[1, '1'], [2, '9']] }] })[0].value, 9);
  assert.equal(promValue(rows), 3.5);
  assert.equal(promValue(rows, { q: 'b' }), null);
  assert.equal(promValue([], undefined), null);
  assert.equal(promValue(null), null);
});

test('findRange: id, fallback, default', () => {
  assert.equal(findRange('7d').seconds, 7 * 86400);
  assert.equal(findRange('nope').id, '1h');
  assert.equal(findRange('nope', RANGE_PRESETS, '24h').id, '24h');
});

test('promSource: range and instant queries against the simulator', async () => {
  const log = [];
  const src = promSource({
    base: '/prom/', fetch: promSim({ log }), now: () => NOW, range: '6h',
    queries: {
      cpu: { expr: 'demo_cpu_busy', range: true, legend: '{{instance}}' },
      queue: { expr: (r) => `max_over_time(demo_queue_depth[${r.window}])` },
    },
  });
  assert.equal(src.ranged, true);
  assert.equal(src.range?.id, '6h');
  await src.reload();
  const { data, error, stale } = src.state;
  assert.equal(error, null);
  assert.equal(stale, false);
  assert.ok(log[0].startsWith('/prom/api/v1/query_range?'), log[0]);
  assert.match(log[1], /\/prom\/api\/v1\/query\?query=max_over_time%28demo_queue_depth%5B21600s%5D%29&time=/);
  assert.equal(data.cpu.x.length, 181, '6 h at step 120 s');
  assert.deepEqual(data.cpu.series.map((s) => s.label), ['node-a', 'node-b', 'node-c']);
  assert.ok(data.cpu.series[2].values.includes(null), 'node-c has a gap on the common grid');
  assert.equal(data.cpu.series[2].values.length, data.cpu.x.length);
  assert.equal(typeof promValue(data.queue), 'number');
});

test('promSource: errors per query, the others stay; status error text; non-JSON; HTTP', async () => {
  let t = NOW;
  const src = promSource({
    base: '/prom', fetch: promSim(), now: () => t, staleAfter: 600,
    queries: { cpu: { expr: 'demo_cpu_busy', range: true }, bad: { expr: 'demo_bad_query' }, html: { expr: 'demo_html' }, down: { expr: 'demo_unavailable' } },
  });
  await src.reload();
  const s = src.state;
  assert.ok(s.data.cpu.series.length, 'cpu stays');
  assert.equal(s.data.bad, null);
  assert.match(s.error, /bad: parse error: unexpected end of input/);
  assert.match(s.error, /html: Response is not JSON/);
  assert.match(s.error, /down: HTTP 503/);
  // all failing: no data at all, error set
  const all = promSource({ base: '/prom', fetch: promSim(), now: () => t, queries: { bad: { expr: 'demo_bad_query' } } });
  await all.reload();
  assert.equal(all.state.data, null);
  assert.equal(all.state.error, 'bad: parse error: unexpected end of input');
});

test('promSource: last good data per query stays, age is the oldest query', async () => {
  let t = NOW, fail = false;
  const sim = promSim();
  /** @type {typeof fetch} */
  const fx = async (u, i) => (fail && String(u).includes('demo_queue_depth') ? new Response('', { status: 502 }) : sim(u, i));
  const src = promSource({ base: '/prom', fetch: fx, now: () => t, staleAfter: 100, queries: { cpu: { expr: 'demo_cpu_busy', range: true }, queue: { expr: 'demo_queue_depth' } } });
  await src.reload();
  const first = src.state.data.queue;
  fail = true; t += 60_000;
  await src.reload();
  assert.equal(src.state.data.queue, first, 'last good answer of the failing query stays');
  assert.match(src.state.error, /^queue: HTTP 502$/);
  assert.equal(src.state.age, 60, 'age counts from the oldest good answer');
  t += 50_000;
  assert.equal(src.state.stale, true);
});

test('promSource: timeout, and a range change aborts and drops the old data', async () => {
  const src = promSource({ base: '/p', fetch: promSim(), now: () => NOW, timeout: 20, queries: { slow: { expr: 'demo_slow', range: true } } });
  await src.reload();
  assert.match(src.state.error, /^Timed out after/);
  // range change while a request is in flight: the old answer never lands
  let release = /** @type {(() => void) | null} */ (null);
  const sim = promSim();
  const log = [];
  /** @type {typeof fetch} */
  const gated = async (u, i) => { log.push(String(u)); if (!release) await new Promise((r) => { release = () => r(undefined); }); return sim(u, i); };
  const s2 = promSource({ base: '/p', fetch: gated, now: () => NOW, range: '1h', queries: { cpu: { expr: 'demo_cpu_busy', range: true } } });
  const p = s2.reload();
  s2.setRange(findRange('7d'));
  assert.equal(s2.state.data, null);
  /** @type {any} */ (release)();
  await p;
  assert.equal(s2.state.data, null, 'answer of the old range is dropped');
  await s2.reload();
  assert.equal(s2.state.data.cpu.x.length, 169, '7 d at step 3600 s');
  assert.match(log.at(-1), /step=3600/);
});

test('promSource: a range change keeps the old data marked refreshing until the new range arrives', async () => {
  const s = promSource({ base: '/p', fetch: promSim(), now: () => NOW, range: '1h', queries: { cpu: { expr: 'demo_cpu_busy', range: true } } });
  await s.reload();
  const old = s.state.data;
  assert.ok(old?.cpu && s.state.refreshing === false);
  s.setRange(findRange('7d'));
  assert.equal(s.state.data, old, 'the old range stays while the new one loads (no loading state, no jump)');
  assert.equal(s.state.refreshing, true);
  await s.reload();
  assert.notEqual(s.state.data, old);
  assert.equal(s.state.refreshing, false);
  assert.equal(s.state.data.cpu.x.length, 169);
});

test('promSource: interval and staleAfter follow the range unless set; no range query = not ranged', () => {
  const src = promSource({ base: '/p', fetch: promSim(), now: () => NOW, range: '24h', queries: { q: { expr: 'demo_queue_depth' } } });
  assert.equal(src.ranged, false);
  assert.equal(src.range, null);
  assert.equal(src.state.staleAfter, 900, '24 h: step 300 s, three missed refreshes');
});

test('source error texts go through the kit catalog; HTTP status and server texts stay as they are', async () => {
  const { setLocale } = await import('../js/i18n.js');
  setLocale('de');
  try {
    const src = promSource({ base: '/p', fetch: promSim(), now: () => NOW, timeout: 20, queries: { slow: { expr: 'demo_slow' }, html: { expr: 'demo_html' }, down: { expr: 'demo_unavailable' }, bad: { expr: 'demo_bad_query' } } });
    await src.reload();
    assert.match(src.state.error, /^Keine Antwort nach/);
    const ds = dataSource({ url: '/x', fetch: async () => new Response('<html>'), now: () => NOW });
    await ds.reload();
    assert.equal(ds.state.error, 'Antwort ist kein JSON');
    const all = promSource({ base: '/p', fetch: promSim(), now: () => NOW, queries: { html: { expr: 'demo_html' }, down: { expr: 'demo_unavailable' }, bad: { expr: 'demo_bad_query' } } });
    await all.reload();
    assert.equal(all.state.error, 'html: Antwort ist kein JSON; down: HTTP 503; bad: parse error: unexpected end of input');
  } finally { setLocale('en'); }
});
