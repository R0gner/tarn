// @ts-check
// tarn · simulated Prometheus HTTP API as a `fetch` replacement, for the gallery and the unit tests. Series are computed from the
// time the query asks for (start/end/step or time), so a fixed clock gives the same answer every run. No request leaves the page.
// The expressions and metric names are invented; the simulator matches an expression by a substring of the `match` list below.

/** @typedef {{ metric: Record<string, string>, at: (t: number) => number | null }} SimSeries `at(t)` = value at t (seconds), null = no sample. */
/**
 * @typedef {{ match: string, series?: SimSeries[], status?: number, error?: string, html?: boolean, hang?: boolean }} SimMetric
 * `status` answers with that HTTP status, `error` with `status: "error"`, `html` with a page that is not JSON, `hang` never answers (until aborted).
 */

const wave = (/** @type {number} */ base, /** @type {number} */ amp, /** @type {number} */ period, /** @type {number} */ phase) => (/** @type {number} */ t) =>
  Math.round((base + amp * Math.sin((t / period) * 2 * Math.PI + phase) + (amp / 4) * Math.sin(t / 997 + phase * 3)) * 100) / 100;

/** The default catalog: three nodes with a CPU curve (node-c has a gap), a queue depth, a request rate and the failure cases. @type {SimMetric[]} */
export const SIM_METRICS = [
  { match: 'demo_cpu_busy', series: [
    { metric: { instance: 'node-a', job: 'demo' }, at: wave(42, 18, 86400, 0) },
    { metric: { instance: 'node-b', job: 'demo' }, at: wave(28, 10, 43200, 1.3) },
    { metric: { instance: 'node-c', job: 'demo' }, at: (t) => (Math.floor(t / 5400) % 4 === 1 ? null : wave(61, 14, 21600, 2.1)(t)) },
  ] },
  { match: 'demo_queue_depth', series: [{ metric: { __name__: 'demo_queue_depth', queue: 'ingest' }, at: (t) => Math.round(30 + 25 * Math.abs(Math.sin(t / 7200))) }] },
  { match: 'demo_requests', series: [
    { metric: { route: '/api/a' }, at: wave(120, 40, 86400, 0.4) },
    { metric: { route: '/api/b' }, at: wave(60, 25, 86400, 2.4) },
  ] },
  { match: 'demo_unavailable', status: 503 },
  { match: 'demo_bad_query', status: 400, error: 'parse error: unexpected end of input' },
  { match: 'demo_html', status: 200, html: true },
  { match: 'demo_slow', hang: true },
];

/**
 * fetch replacement answering GET {base}/api/v1/query and /api/v1/query_range from `metrics`.
 * @param {{ metrics?: SimMetric[], log?: string[] }} [o] `log` collects the requested URLs (tests)
 * @returns {typeof fetch}
 */
export function promSim({ metrics = SIM_METRICS, log } = {}) {
  /** @param {unknown} body @param {number} [status] */
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  return /** @type {typeof fetch} */ (async (input, init) => {
    const href = String(input instanceof Request ? input.url : input);
    log?.push(href);
    const u = new URL(href, 'http://sim.invalid');
    const kind = u.pathname.endsWith('/api/v1/query_range') ? 'range' : u.pathname.endsWith('/api/v1/query') ? 'instant' : null;
    if (!kind) return json({ status: 'error', errorType: 'not_found', error: 'not found' }, 404);
    const expr = u.searchParams.get('query') || '';
    const m = metrics.find((x) => expr.includes(x.match));
    if (!m) return json({ status: 'error', errorType: 'bad_data', error: `unknown expression: ${expr}` }, 400);
    if (m.hang) return new Promise((_, reject) => {
      const s = init?.signal;
      s?.addEventListener('abort', () => reject(s.reason instanceof Error ? s.reason : new DOMException('Aborted', 'AbortError')), { once: true });
    });
    if (m.html) return new Response('<html><body>Bad gateway</body></html>', { status: m.status ?? 200, headers: { 'Content-Type': 'text/html' } });
    if (m.error) return json({ status: 'error', errorType: 'bad_data', error: m.error }, m.status ?? 400);
    if (m.status && m.status >= 400) return new Response('', { status: m.status });
    const series = m.series || [];
    if (kind === 'instant') {
      const t = Number(u.searchParams.get('time'));
      const result = series.map((s) => ({ metric: s.metric, value: [t, String(s.at(t))] })).filter((r) => r.value[1] !== 'null');
      return json({ status: 'success', data: { resultType: 'vector', result } });
    }
    const start = Number(u.searchParams.get('start')), end = Number(u.searchParams.get('end')), step = Number(u.searchParams.get('step'));
    if (!(step > 0) || !(end >= start)) return json({ status: 'error', errorType: 'bad_data', error: 'invalid range' }, 400);
    const result = series.map((s) => {
      /** @type {[number, string][]} */
      const values = [];
      for (let t = start; t <= end; t += step) { const v = s.at(t); if (v != null) values.push([t, String(v)]); }
      return { metric: s.metric, values };
    }).filter((r) => r.values.length);
    return json({ status: 'success', data: { resultType: 'matrix', result } });
  });
}
