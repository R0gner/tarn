// @ts-check
// dashkit · dataSource: fetch JSON with interval, age, error state.
// The browser handles gzip (Content-Encoding). Pauses while the tab is hidden,
// and reloads immediately on return if the interval has elapsed.

/** @typedef {{ url: string, interval?: number, staleAfter?: number, parse?: (json: any) => any, ageOf?: ((data: any) => number | null) | null, fetch?: typeof fetch, now?: () => number }} DataSourceOptions interval in ms, staleAfter in seconds; ageOf returns seconds. */
/** @typedef {{ data: any, error: string | null, loading: boolean, fetchedAt: number | null, age: number | null, stale: boolean, staleAfter: number }} DataState State handed to subscribers. */
/** @typedef {{ readonly state: DataState, subscribe: (f: (state: DataState) => void) => () => void, reload: () => Promise<void>, start: () => DataSource, stop: () => DataSource }} DataSource */

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
export function dataSource({ url, interval = 60_000, staleAfter = 900, parse = (x) => x, ageOf = null, fetch: fx = globalThis.fetch?.bind(globalThis), now = () => Date.now() }) {
  /** @type {Set<(state: DataState) => void>} */
  const subs = new Set();
  /** @type {{ data: any, error: string | null, loading: boolean, fetchedAt: number | null, baseAge: number | null }} */
  const st = { data: null, error: null, loading: false, fetchedAt: null, baseAge: null };
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  let running = false;
  /** @type {Promise<void> | null} */
  let inflight = null;

  /** @returns {DataState} */
  function snapshot() {
    const age = st.fetchedAt == null ? null : (st.baseAge ?? 0) + (now() - st.fetchedAt) / 1000;
    return { data: st.data, error: st.error, loading: st.loading, fetchedAt: st.fetchedAt, age, stale: st.data == null || age == null || age > staleAfter, staleAfter };
  }
  const emit = () => { const s = snapshot(); for (const f of subs) f(s); };

  /** @returns {Promise<void>} */
  async function reload() {
    if (inflight) return inflight;
    st.loading = true; emit();
    inflight = (async () => {
      try {
        const r = await fx(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
        const body = await r.json().catch(() => null);
        if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
        if (body == null) throw new Error('Response is not JSON');
        st.data = parse(body); st.error = null; st.fetchedAt = now();
        st.baseAge = ageOf ? ageOf(st.data) : 0;
      } catch (e) {
        st.error = String(/** @type {any} */ (e)?.message || e).replace(/^Error: /, '');
      } finally {
        st.loading = false; inflight = null; schedule(); emit();
      }
    })();
    return inflight;
  }
  function schedule() {
    clearTimeout(timer);
    if (running && interval > 0 && !document.hidden) timer = setTimeout(reload, st.error ? Math.min(interval, 15_000) : interval);
  }
  function onVis() {
    if (document.hidden) { clearTimeout(timer); return; }
    const due = st.fetchedAt == null || now() - st.fetchedAt >= interval;
    if (running && due) reload(); else schedule();
  }
  return {
    get state() { return snapshot(); },
    subscribe(f) { subs.add(f); f(snapshot()); return () => subs.delete(f); },
    reload,
    start() { if (running) return this; running = true; document.addEventListener('visibilitychange', onVis); reload(); return this; },
    stop() { running = false; clearTimeout(timer); document.removeEventListener('visibilitychange', onVis); return this; },
  };
}
