// tarn · gallery view "Data sources": promSource against the simulated Prometheus (gallery/prom-sim.js, no request leaves the page),
// a range query as a line chart over the app's time range, an instant value in a tile, a combined source, and the error and stale states.
import {
  h, card, tiles, statTile, kv, banner, loading, lineChart, t, fmtNum, fmtAgo, fmtDuration,
  dataSource, promSource, combineSources, promValue, promEscape, RANGE_PRESETS,
} from '../js/tarn.js';
import { promSim } from './prom-sim.js';

const code = (txt) => h('pre', { class: 'g-code' }, txt.trim());
const demo = (title, usage, ...stage) => card({ title }, h('div', { class: 'g-demo' }, stage, usage && code(usage)));
const state = (label, el) => h('div', { class: 'g-state' }, el, h('span', { class: 'g-state-l' }, label));
const stage = (...k) => h('div', { class: 'g-stage' }, k);

const sim = promSim({ delay: 60 });   // answers after 60 ms, like a network
const QUEUE = 'ingest';

/** The view's own source: metrics (promSource) and snapshot (the JSON fixture), combined; the shell starts it while the view is shown. */
export const dataSourcesSource = combineSources({
  metrics: promSource({
    base: '/prom', fetch: sim,
    queries: {
      cpu: { expr: 'avg by (instance) (demo_cpu_busy)', range: true, legend: '{{instance}}' },
      queue: { expr: (r) => `max_over_time(demo_queue_depth{queue="${promEscape(QUEUE)}"}[${r.window}])` },
    },
  }),
  snapshot: dataSource({ url: './fixture.json', interval: 60_000, staleAfter: 900 }),
});

/* Two sources that only exist to show the error and the stale state: fetched once, never polled. */
let skew = 0;
const failing = promSource({ base: '/prom', fetch: sim, queries: { cpu: { expr: 'demo_cpu_busy', range: true }, errors: { expr: 'demo_unavailable' } } });
const staleOne = promSource({ base: '/prom', fetch: sim, staleAfter: 300, now: () => Date.now() + skew, queries: { queue: { expr: 'demo_queue_depth' } } });
/** Settles once the two demo sources have their state; the gallery redraws then. */
export const dataSourcesReady = Promise.all([failing.reload(), staleOne.reload()]).then(() => { skew = 2 * 3600e3; });

function stateBanners(s) {
  const out = [];
  if (s.error && s.data) out.push(banner(t('shell.updateFailed', { error: s.error }), { tone: 'warn' }));
  if (s.data && s.stale) out.push(banner(t('shell.dataStale', { age: fmtAgo(s.age) }), { tone: 'bad' }));
  return out;
}

export function viewDataSources(ctx) {
  const m = ctx.data?.metrics;
  const cpu = m?.cpu;
  const presets = RANGE_PRESETS.map((r) => r.id).join(' · ');
  return [
    demo('promSource(): a range query', `const metrics = promSource({ base: '/prom', queries: {
  cpu: { expr: 'avg by (instance) (demo_cpu_busy)', range: true, legend: '{{instance}}' },
} })
// data.cpu = { x: [ms], series: [{ label, labels, values }] } on one time grid, null in gaps: what lineChart takes
// start/end/step follow the time range in the toolbar (${presets}); at most about 300 points per series`,
      cpu ? lineChart({ x: cpu.x, series: cpu.series.map((s) => ({ label: s.label, values: s.values })), yFormat: (v) => `${fmtNum(v, 0)} %`, label: `Busy CPU per node over ${fmtDuration((cpu.x[cpu.x.length - 1] - cpu.x[0]) / 1000)}` })
        : loading({ rows: 2 })),
    demo('An instant query in a tile', `queue: { expr: (r) => \`max_over_time(demo_queue_depth{queue="\${promEscape(name)}"}[\${r.window}])\` }
// data.queue = [{ label, labels, value }]; promValue(data.queue) is the one number`,
      tiles(
        statTile({ label: 'Max queue depth', value: m?.queue ? fmtNum(promValue(m.queue)) : null, sub: ctx.app.range ? `over ${ctx.app.range.id}` : null }),
        statTile({ label: 'Nodes reporting', value: cpu ? fmtNum(cpu.series.length) : null }),
      )),
    demo('combineSources()', `views: [{ id: 'sources', render, source: combineSources({ metrics, snapshot: dataSource({ url }) }) }]
// data = { metrics, snapshot }; stale or in error when a part is (the message names it); age of the oldest part
// a view's own source runs only while the view is shown`,
      h('div', { class: 'g-narrow' }, kv([
        ['Parts', 'metrics, snapshot'],
        ['snapshot', ctx.data?.snapshot ? `${(ctx.data.snapshot.jobs || []).length} jobs` : '–'],
        ['metrics', cpu ? `${cpu.x.length} points × ${cpu.series.length} series` : '–'],
        ['Age (oldest part)', fmtAgo(ctx.src?.age)],
      ]))),
    demo('Error and stale states', `// one query of several fails: the others stay, the banner names the query
// no fresh data for longer than staleAfter: the freshness turns red and a banner says since when`,
      stage(
        state('one query fails', h('div', { class: 'g-narrow' }, stateBanners(failing.state), kv([['cpu', failing.state.data?.cpu ? `${failing.state.data.cpu.series.length} series` : '–'], ['errors', failing.state.data?.errors ? 'ok' : '–']]))),
        state('stale', h('div', { class: 'g-narrow' }, stateBanners(staleOne.state), kv([['queue', fmtNum(promValue(staleOne.state.data?.queue))]]))),
      )),
  ];
}
