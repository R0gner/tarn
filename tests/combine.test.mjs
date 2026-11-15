// combineSources: one source over several; data per part, error/stale name the part, age of the oldest part, last good data stays.
import test from 'node:test';
import assert from 'node:assert/strict';
import { promSim } from '../gallery/prom-sim.js';

globalThis.document ??= /** @type {any} */ ({ hidden: false, addEventListener() {}, removeEventListener() {} });
const { dataSource, promSource, combineSources } = await import('../js/data.js');

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

test('combineSources: data per part, error names the part, last good data stays, age of the oldest', async () => {
  let t = NOW, fail = false;
  const jobsFetch = async () => (fail ? new Response(JSON.stringify({ error: 'maintenance' }), { status: 503 }) : new Response(JSON.stringify({ n: 3 }), { status: 200 }));
  const jobs = dataSource({ url: '/jobs.json', fetch: jobsFetch, now: () => t, staleAfter: 120 });
  const metrics = promSource({ base: '/prom', fetch: promSim(), now: () => t, staleAfter: 600, queries: { cpu: { expr: 'demo_cpu_busy', range: true } } });
  const src = combineSources({ jobs, metrics });
  const seen = [];
  src.subscribe((s) => seen.push(s));
  assert.equal(src.state.data, null);
  assert.equal(src.state.stale, true);
  await jobs.reload();
  assert.deepEqual(src.state.data, { jobs: { n: 3 }, metrics: null }, 'a part without data is null');
  assert.deepEqual(src.state.staleParts, ['metrics']);
  await src.reload();
  assert.equal(src.state.stale, false);
  assert.equal(src.state.error, null);
  assert.ok(src.state.data.metrics.cpu.series.length);
  assert.ok(seen.length >= 4, 'parts emit through the combined source');
  t += 30_000;
  await metrics.reload();
  assert.equal(src.state.age, 30, 'age is that of the oldest part');
  assert.equal(src.state.fetchedAt, NOW);
  fail = true;
  await jobs.reload();
  assert.equal(src.state.error, 'jobs: maintenance');
  assert.deepEqual(src.state.data.jobs, { n: 3 }, 'last good data of the part stays');
  t += 100_000;
  assert.equal(src.state.stale, true);
  assert.deepEqual(src.state.staleParts, ['jobs']);
  assert.equal(src.state.staleAfter, 120, 'staleAfter of the stale part');
});

test('combineSources: range reaches the ranged parts only; start/stop act on all', async () => {
  const calls = [];
  const fake = (name, ranged) => ({
    get state() { return { data: null, error: null, loading: false, fetchedAt: null, age: null, stale: true, staleAfter: 60 }; },
    subscribe(f) { f(this.state); return () => {}; }, reload: async () => { calls.push(`${name}.reload`); },
    start() { calls.push(`${name}.start`); return this; }, stop() { calls.push(`${name}.stop`); return this; },
    ranged, range: ranged ? { id: '1h', seconds: 3600 } : null, setRange(r) { calls.push(`${name}.range=${r.id}`); },
  });
  const src = combineSources({ a: fake('a', false), b: fake('b', true) });
  assert.equal(src.ranged, true);
  assert.equal(src.range?.id, '1h');
  src.setRange?.({ id: '7d', seconds: 604800 });
  src.start(); src.stop(); await src.reload();
  assert.deepEqual(calls, ['b.range=7d', 'a.start', 'b.start', 'a.stop', 'b.stop', 'a.reload', 'b.reload']);
  assert.equal(combineSources({ a: fake('a', false) }).ranged, false);
});

test('combineSources flat: data objects merged, no part names in messages, inner staleParts kept', async () => {
  const mk = (data, extra = {}) => ({
    get state() { return { data, error: null, loading: false, fetchedAt: 1, age: 5, stale: false, staleAfter: 60, ...extra }; },
    subscribe(f) { f(this.state); return () => {}; }, reload: async () => {}, start() { return this; }, stop() { return this; },
  });
  const src = combineSources({ app: mk({ jobs: [1], n: 1 }), view: mk({ cpu: 'x', n: 2 }, { error: 'cpu: HTTP 502', stale: true, staleParts: ['metrics'] }) }, { flat: true });
  assert.deepEqual(src.state.data, { jobs: [1], n: 2, cpu: 'x' });
  assert.equal(src.state.error, 'cpu: HTTP 502');
  assert.equal(src.state.stale, true);
  assert.deepEqual(src.state.staleParts, ['metrics']);
});
