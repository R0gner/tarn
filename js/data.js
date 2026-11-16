// @ts-check
// tarn · data sources. Every source has the same state contract and the same methods, so the shell's freshness text, the banners and
// ctx.data work alike for all of them:
//   dataSource     – one JSON URL (collector output, a board backend)
//   promSource     – named PromQL queries against the Prometheus HTTP API (VictoriaMetrics answers it as well)
//   combineSources – several sources as one: data = { name: data of that source }
// The browser handles gzip (Content-Encoding). Polling pauses while the tab is hidden and reloads on return if the interval has elapsed.
import './locales/shell.js';   // texts of the error messages (data.*)
import { t } from './i18n.js';
import { fmtDuration } from './format.js';
import { promMatrix, promVector, promRangeParams, promStep, promInterval, findRange, RANGE_PRESETS } from './prom-data.js';

/** @typedef {{ url: string, interval?: number, staleAfter?: number, parse?: (json: any) => any, ageOf?: ((data: any) => number | null) | null, fetch?: typeof fetch, now?: () => number, timeout?: number, label?: string, note?: string }} DataSourceOptions interval and timeout in ms, staleAfter in seconds; ageOf returns seconds. `label`/`note`: name and one line for the shell's source list (through `t()`). */
/** @typedef {{ data: any, error: string | null, loading: boolean, fetchedAt: number | null, age: number | null, stale: boolean, staleAfter: number, staleParts?: string[], refreshing?: boolean }} DataState State handed to subscribers; `staleParts` only from combineSources (the names of the stale parts); `refreshing`: the data is still that of the previous time range while the new one loads (the shell marks the charts). */
/** @typedef {import('./prom-data.js').TimeRange} TimeRange */
/**
 * @typedef {{
 *   readonly state: DataState,
 *   subscribe: (f: (state: DataState) => void) => () => void,
 *   reload: () => Promise<void>,
 *   start: () => DataSource,
 *   stop: () => DataSource,
 *   readonly ranged?: boolean,
 *   readonly range?: TimeRange | null,
 *   readonly label?: string,
 *   readonly note?: string,
 *   readonly interval?: number,
 *   readonly parts?: [string, DataSource][],
 *   setRange?: (range: TimeRange) => void,
 * }} DataSource `ranged`/`range`/`setRange` only on sources that follow the app's time range (promSource with a range query, combineSources over one). `label`, `note`, `interval` (ms) describe the source in the shell's source list; `parts` only on combineSources.
 */
/** @typedef {{ start: number, end: number, step: number, seconds: number, id: string, window: string }} PromRangeInfo What an `expr` function gets: the current range (seconds since the epoch) and `window` as a PromQL duration (`'21600s'`). */
/** @typedef {{ expr: string | ((r: PromRangeInfo) => string), range?: boolean, legend?: import('./prom-data.js').PromLegend, step?: number }} PromQuery `range: true` = range query (matrix to `{ x, series }`), otherwise instant (rows). `step` fixes the step in seconds. */
/**
 * @typedef {{
 *   base: string, queries: Record<string, PromQuery>, interval?: number, staleAfter?: number, minStep?: number, maxPoints?: number,
 *   range?: TimeRange | string, ranges?: TimeRange[], timeout?: number, fetch?: typeof fetch, now?: () => number, label?: string, note?: string,
 * }} PromSourceOptions `base` = same-origin path in front of `/api/v1/…`; interval/timeout in ms, staleAfter in seconds. Without `interval` the refresh follows the range.
 */

const TIMEOUT = Symbol('timeout');

/** @param {unknown} e @returns {string} */
const msg = (e) => String(/** @type {any} */ (e)?.message || e).replace(/^Error: /, '');

/** Failed queries as one line: equal errors merged with a count (`19 queries: HTTP 502`), a single one named (`cpu: HTTP 502`).
    @param {[string, string][]} failed [query name, error] @returns {string} */
export function mergeErrors(failed) {
  /** @type {Map<string, string[]>} */
  const by = new Map();
  for (const [name, e] of failed) by.set(e, [...(by.get(e) || []), name]);
  return [...by].map(([e, names]) => (names.length > 1 ? t('data.queriesFailed', { count: names.length, error: e }) : `${names[0]}: ${e}`)).join('; ');
}

/**
 * Shared engine of the polling sources: state, subscribers, interval, visibility pause, abort, timeout.
 * `run(signal)` fetches once and returns the new data (or throws); `onResult` may merge partial results itself.
 * @param {{
 *   run: (signal: AbortSignal) => Promise<{ data: any, baseAge?: number | null, error?: string | null, fetchedAt?: number | null }>,
 *   interval: () => number, staleAfter: () => number, now: () => number, timeout: number,
 * }} o
 */
function poller({ run, interval, staleAfter, now, timeout }) {
  /** @type {Set<(state: DataState) => void>} */
  const subs = new Set();
  /** @type {{ data: any, error: string | null, loading: boolean, fetchedAt: number | null, baseAge: number | null, refreshing: boolean }} */
  const st = { data: null, error: null, loading: false, fetchedAt: null, baseAge: null, refreshing: false };
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  let running = false;
  /** @type {Promise<void> | null} */
  let inflight = null;
  /** @type {AbortController | null} */
  let ctrl = null;
  let gen = 0;

  /** @returns {DataState} */
  function snapshot() {
    const age = st.fetchedAt == null ? null : (st.baseAge ?? 0) + (now() - st.fetchedAt) / 1000;
    const sa = staleAfter();
    return { data: st.data, error: st.error, loading: st.loading, fetchedAt: st.fetchedAt, age, stale: st.data == null || age == null || age > sa, staleAfter: sa, refreshing: st.refreshing && st.data != null };
  }
  const emit = () => { const s = snapshot(); for (const f of subs) f(s); };

  /** @returns {Promise<void>} */
  function reload() {
    if (inflight) return inflight;
    const my = ++gen;
    const ac = ctrl = new AbortController();
    const tid = timeout > 0 ? setTimeout(() => ac.abort(TIMEOUT), timeout) : undefined;
    st.loading = true; emit();
    inflight = (async () => {
      try {
        const r = await run(ac.signal);
        if (my !== gen) return;
        st.data = r.data; st.error = r.error ?? null; st.refreshing = false;
        if (r.fetchedAt !== null) st.fetchedAt = r.fetchedAt ?? now();
        st.baseAge = r.baseAge ?? 0;
      } catch (e) {
        if (my !== gen) return;
        st.error = ac.signal.reason === TIMEOUT ? t('data.timeout', { duration: fmtDuration(timeout / 1000) }) : msg(e);
      } finally {
        clearTimeout(tid);
        if (my === gen) { st.loading = false; inflight = null; ctrl = null; schedule(); emit(); }
      }
    })();
    return inflight;
  }
  /** Abort a request in flight; its answer is dropped. */
  function abort() {
    gen++; ctrl?.abort(); ctrl = null; inflight = null; st.loading = false;
  }
  function schedule() {
    clearTimeout(timer);
    const iv = interval();
    if (running && iv > 0 && !document.hidden) timer = setTimeout(reload, st.error ? Math.min(iv, 15_000) : iv);
  }
  function onVis() {
    if (document.hidden) { clearTimeout(timer); return; }
    const due = st.fetchedAt == null || now() - st.fetchedAt >= interval();
    if (running && due) reload(); else schedule();
  }
  return {
    st, emit, snapshot, reload, abort, schedule,
    get running() { return running; },
    /** @param {(state: DataState) => void} f */
    subscribe(f) { subs.add(f); f(snapshot()); return () => { subs.delete(f); }; },
    start() { if (running) return; running = true; document.addEventListener('visibilitychange', onVis); reload(); },
    stop() { running = false; clearTimeout(timer); abort(); document.removeEventListener('visibilitychange', onVis); },
  };
}

/**
 * const ds = dataSource({ url, interval: 60_000, staleAfter: 900, parse?(json) → data, ageOf?(data) → sec.|null, fetch? })
 * ds.subscribe((st) => …) → unsubscribe function; st = { data, error, loading, fetchedAt, age, stale }
 * ds.reload(), ds.start(), ds.stop(), ds.state
 *
 * age: seconds since the data was current. If ageOf(data) returns an age (e.g. snapshot time from the server),
 * it keeps counting from the fetch, otherwise the fetch time applies. stale = age > staleAfter or no data.
 */
/**
 * @param {DataSourceOptions} o
 * @returns {DataSource}
 */
export function dataSource({ url, interval = 60_000, staleAfter = 900, parse = (x) => x, ageOf = null, fetch: fx = globalThis.fetch?.bind(globalThis), now = () => Date.now(), timeout = 30_000, label, note }) {
  const p = poller({
    interval: () => interval, staleAfter: () => staleAfter, now, timeout,
    async run(signal) {
      const r = await fx(url, { cache: 'no-store', headers: { Accept: 'application/json' }, signal });
      const body = await r.json().catch(() => null);
      if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
      if (body == null) throw new Error(t('data.notJson'));
      const data = parse(body);
      return { data, baseAge: ageOf ? ageOf(data) : 0 };
    },
  });
  return {
    get state() { return p.snapshot(); },
    subscribe: p.subscribe,
    reload: p.reload,
    start() { p.start(); return this; },
    stop() { p.stop(); return this; },
    label, note, interval,
  };
}

/**
 * One GET against the Prometheus HTTP API; returns the `data` member or throws with the server's `error` text.
 * @param {typeof fetch} fx
 * @param {string} url
 * @param {AbortSignal} signal
 */
async function promGet(fx, url, signal) {
  const r = await fx(url, { cache: 'no-store', headers: { Accept: 'application/json' }, signal });
  const body = await r.json().catch(() => null);
  if (body?.status === 'error') throw new Error(body.error || body.errorType || `HTTP ${r.status}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  if (body == null || typeof body !== 'object') throw new Error(t('data.notJson'));
  if (body.status !== 'success' || !body.data) throw new Error(t('data.unexpected'));
  return body.data;
}

/**
 * const prom = promSource({ base: '/prom', queries: { cpu: { expr, range: true, legend: '{{instance}}' }, up: { expr: 'up' } } })
 * state.data = { cpu: { x: [ms], series: [{ label, labels, values }] }, up: [{ label, labels, value }] }
 *
 * Range queries follow the app's time range (`setRange`, set by the shell's range control; default the first preset): start/end are the
 * last `range.seconds`, the step keeps a series at most `maxPoints` (300) long and never below `minStep`. Changing the range aborts the
 * request in flight and loads the new range at once; the data of the old range stays until the answer arrives (`state.refreshing`, the
 * shell marks the charts), so the view keeps its layout. Without `interval` the refresh follows the step (15 s … 5 min), and without
 * `staleAfter` data counts as stale after three missed refreshes. One failing query does not take the others down: its last good data
 * stays, the error names it (`cpu: HTTP 502`; equal errors of several queries are merged into one with a count, `19 queries: HTTP 502`),
 * and the age is that of the oldest query.
 * @param {PromSourceOptions} o
 * @returns {DataSource}
 */
export function promSource({ base, queries, interval, staleAfter, minStep = 0, maxPoints = 300, range, ranges = RANGE_PRESETS, timeout = 30_000, fetch: fx = globalThis.fetch?.bind(globalThis), now = () => Date.now(), label, note }) {
  const root = String(base || '').replace(/\/+$/, '');
  const names = Object.keys(queries);
  const ranged = names.some((n) => queries[n].range);
  /** @type {TimeRange} */
  let cur = typeof range === 'object' && range ? range : findRange(/** @type {string | undefined} */ (range), ranges);
  /** @type {Map<string, { data: any, at: number }>} last good answer per query */
  const good = new Map();
  const autoStep = () => promStep(cur.seconds, { minStep, maxPoints });
  const iv = () => interval ?? promInterval(autoStep());
  const sa = () => staleAfter ?? Math.max(60, Math.round((3 * iv()) / 1000));

  const p = poller({
    interval: iv, staleAfter: sa, now, timeout,
    async run(signal) {
      const t = now();
      const shared = promRangeParams(cur, t, { minStep, maxPoints });
      const results = await Promise.allSettled(names.map(async (name) => {
        const q = queries[name];
        const rp = q.step ? promRangeParams(cur, t, { step: q.step }) : shared;
        /** @type {PromRangeInfo} */
        const info = { ...rp, seconds: cur.seconds, id: cur.id, window: `${cur.seconds}s` };
        const expr = typeof q.expr === 'function' ? q.expr(info) : q.expr;
        const qs = new URLSearchParams({ query: expr });
        if (q.range) { qs.set('start', String(rp.start)); qs.set('end', String(rp.end)); qs.set('step', String(rp.step)); }
        else qs.set('time', String(t / 1000));
        const data = await promGet(fx, `${root}/api/v1/${q.range ? 'query_range' : 'query'}?${qs}`, signal);
        return q.range ? promMatrix(data.resultType === 'matrix' ? data.result : [], { legend: q.legend, name }) : promVector(data, { legend: q.legend, name });
      }));
      if (signal.aborted) throw new Error(signal.reason === TIMEOUT ? 'timeout' : 'aborted');
      /** @type {[string, string][]} */
      const failed = [];
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') good.set(names[i], { data: r.value, at: t });
        else failed.push([names[i], msg(r.reason)]);
      });
      if (!good.size) throw new Error(mergeErrors(failed));
      /** @type {Record<string, any>} */
      const data = {};
      for (const n of names) data[n] = good.get(n)?.data ?? null;
      const oldest = Math.min(...names.map((n) => good.get(n)?.at ?? -Infinity));
      return { data, error: failed.length ? mergeErrors(failed) : null, fetchedAt: Number.isFinite(oldest) ? oldest : Math.min(...[...good.values()].map((g) => g.at)) };
    },
  });
  return {
    get state() { return p.snapshot(); },
    subscribe: p.subscribe,
    reload: p.reload,
    start() { p.start(); return this; },
    stop() { p.stop(); return this; },
    label, note,
    get interval() { return iv(); },
    get ranged() { return ranged; },
    get range() { return ranged ? cur : null; },
    setRange(r) {
      if (!r || (r.id === cur.id && r.seconds === cur.seconds)) return;
      cur = r;
      if (!ranged) return;
      p.abort(); good.clear();
      p.st.refreshing = p.st.data != null; p.st.error = null;   // the old range's data stays (marked) until the new one arrives: no loading state, no jump
      if (p.running) p.reload(); else p.emit();
    },
  };
}

/**
 * const src = combineSources({ jobs: dataSource({ url }), metrics: promSource({ … }) })
 * One source over several: state.data = { jobs: data of jobs, metrics: data of metrics } (null while no part has data; a part without
 * data yet is null). It is loading while a part loads, in error when a part is (`metrics: HTTP 502`, one line per part, joined by `; `)
 * and stale when a part is (`staleParts` names them); age is that of the oldest part, and every part keeps its last good data.
 * start/stop/reload act on all parts; setRange reaches the parts that follow the time range.
 * `{ flat: true }` merges the parts' data objects into one (later parts win) and leaves the part names out of the messages; the shell uses
 * it to merge a view's own source with the app's.
 * @param {Record<string, DataSource>} parts
 * @param {{ flat?: boolean }} [o]
 * @returns {DataSource}
 */
export function combineSources(parts, { flat = false } = {}) {
  const names = Object.keys(parts);
  /** @type {Set<(state: DataState) => void>} */
  const subs = new Set();
  /* the combined data object is rebuilt only when a part's data changes, so `state.data !== before` means new data */
  /** @type {any[]} */
  let memoKey = [];
  /** @type {Record<string, any> | null} */
  let memo = null;
  /** @returns {DataState} */
  function snapshot() {
    const states = names.map((n) => /** @type {[string, DataState]} */ ([n, parts[n].state]));
    const withData = states.filter(([, s]) => s.data != null);
    const key = states.map(([, s]) => s.data);
    if (key.some((d, i) => d !== memoKey[i])) {
      memoKey = key;
      memo = !withData.length ? null
        : flat ? Object.assign({}, ...withData.map(([, s]) => (typeof s.data === 'object' && !Array.isArray(s.data) ? s.data : {})))
          : Object.fromEntries(states.map(([n, s]) => [n, s.data]));
    }
    const data = memo;
    const errors = states.filter(([, s]) => s.error).map(([n, s]) => (flat ? String(s.error) : `${n}: ${s.error}`));
    const staleParts = states.filter(([, s]) => s.stale).flatMap(([n, s]) => (flat ? s.staleParts || [] : [n]));
    const dated = states.filter(([, s]) => s.fetchedAt != null && s.age != null);
    const oldest = dated.reduce((/** @type {[string, DataState] | null} */ a, b) => (!a || /** @type {number} */ (b[1].age) > /** @type {number} */ (a[1].age) ? b : a), null);
    const staleOne = states.find(([, s]) => s.stale);
    return {
      data, error: errors.length ? errors.join('; ') : null, loading: states.some(([, s]) => s.loading),
      fetchedAt: oldest ? oldest[1].fetchedAt : null, age: oldest ? oldest[1].age : null,
      stale: states.some(([, s]) => s.stale), staleAfter: (staleOne || oldest || states[0])?.[1].staleAfter ?? 0, staleParts,
      refreshing: states.some(([, s]) => s.refreshing),
    };
  }
  const emit = () => { if (!subs.size) return; const s = snapshot(); for (const f of subs) f(s); };
  let ready = false;
  for (const n of names) parts[n].subscribe(() => { if (ready) emit(); });
  ready = true;
  const rangedParts = () => names.map((n) => parts[n]).filter((p) => p.ranged);
  return {
    get state() { return snapshot(); },
    subscribe(f) { subs.add(f); f(snapshot()); return () => { subs.delete(f); }; },
    async reload() { await Promise.all(names.map((n) => parts[n].reload())); },
    start() { for (const n of names) parts[n].start(); return this; },
    stop() { for (const n of names) parts[n].stop(); return this; },
    get parts() { return names.map((n) => /** @type {[string, DataSource]} */ ([n, parts[n]])); },
    get ranged() { return rangedParts().length > 0; },
    get range() { return rangedParts()[0]?.range ?? null; },
    setRange(r) { for (const p of rangedParts()) p.setRange?.(r); },
  };
}
