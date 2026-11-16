# Data

How a board gets its numbers. For a board author who wires a view to a JSON file, to an API or to a Prometheus-compatible metrics server
(VictoriaMetrics, Prometheus). The kit has no backend and no query editor; every source fetches from a same-origin path, so the CSP stays `'self'`
and no credentials live in the browser.

| Source kind | For | Function |
|---|---|---|
| JSON | a collector that writes a snapshot, a board backend | [`dataSource`](#json-datasource) |
| PromQL | time series and current values from the Prometheus HTTP API | [`promSource`](#promql-promsource) |
| several | a board or a view that needs both | [`combineSources`](#several-sources-combinesources) |
| stream | live events (Server-Sent Events) | planned, not in 0.7 |

Every source has the same [state](#state) and the same methods (`start`, `stop`, `reload`, `subscribe`, `state`), so the shell's freshness text, its
banners and `ctx.data` work the same whichever source is behind a value.

## JSON: dataSource

```js
import { dataSource } from '/tarn/js/tarn.js';

const source = dataSource({
  url: '/api/snapshot',
  interval: 60_000,                 // ms between fetches (default 60 000; 0 = fetch only on reload())
  staleAfter: 900,                  // seconds after which the data counts as stale (default 900)
  parse: (json) => prepare(json),   // raw JSON → display model, run once per fetch (default: identity)
  ageOf: (data) => data.ageSec,     // age of the snapshot at the server, in seconds, or null (default: null)
});
createApp({ source, views });
source.start();                     // the shell subscribes, it does not start the app's source
```

| Member | Does |
|---|---|
| `source.start()` | fetches now, then every `interval`; returns the source |
| `source.stop()` | stops the timer and the visibility listener, aborts a request in flight |
| `source.reload()` | fetches now (a request already in flight is reused); returns a promise |
| `source.subscribe(fn)` | calls `fn(state)` now and on every change; returns the unsubscribe function |
| `source.state` | the current [state](#state) |

More options: `timeout` (ms, default 30 000; the error then reads “Timed out after 30 s” in the active language), and for tests `fetch` (replaces `globalThis.fetch`) and `now`
(replaces `Date.now`).

- The request is `GET url` with `Accept: application/json` and `cache: 'no-store'`; the browser handles `gzip`. A non-2xx answer is an error; if the body is
  JSON with an `error` field, that text is shown, otherwise `HTTP <status>`. A body that is not JSON is an error too.
- While the tab is hidden the timer pauses; on return it fetches at once if the interval has passed.
- After an error the next try comes after the shorter of `interval` and 15 s.
- Prepare raw data once in `parse` (points in time, problems, sorting): views do not calculate.

## PromQL: promSource

Named queries in board code; the kit turns each answer into what a view shows, so a view does not calculate. The kit does not parse or build PromQL.

```js
import { promSource, promEscape, promValue } from '/tarn/js/tarn.js';

const metrics = promSource({
  base: '/metrics-api',             // same-origin path in front of /api/v1/query and /api/v1/query_range
  queries: {
    cpu:   { expr: 'avg by (instance) (rate(node_seconds_busy[5m]))', range: true, legend: '{{instance}}' },
    queue: { expr: (r) => `max_over_time(queue_depth{queue="${promEscape(name)}"}[${r.window}])` },
  },
});
// ctx.data.cpu   = { x: [ms, …], series: [{ label, labels, values: [number | null, …] }, …] }   → lineChart(ctx.data.cpu), barChart
// ctx.data.queue = [{ label, labels, value }, …]                                                 → promValue(ctx.data.queue): the one number
```

| Query option | Meaning |
|---|---|
| `expr` | the PromQL expression, or a function of the current range `{ start, end, step, seconds, id, window }` (`window` is a PromQL duration such as `'21600s'`) |
| `range: true` | range query (`/api/v1/query_range`): the result is `{ x, series }` on **one** time grid, `null` where a series has no sample (a gap in the line). Without it: instant query (`/api/v1/query`), the result is rows `[{ label, labels, value }]` |
| `legend` | label of a series: a template `'{{instance}} {{job}}'` or a function `(labels) => string`; without it the Prometheus form `name{a="x"}`, and the query name for a series without labels |
| `step` | a fixed step in seconds for this query |

| Source option | Default | Meaning |
|---|---|---|
| `base` | – | same-origin path; the source asks `GET {base}/api/v1/query?query=…&time=…` and `GET {base}/api/v1/query_range?query=…&start=…&end=…&step=…` |
| `interval` | follows the range | ms between fetches; without it the step of the current range, at least 15 s and at most 5 min |
| `staleAfter` | three missed refreshes | seconds; without it three intervals, at least 60 s |
| `minStep` | 0 | lower bound of the derived step (seconds), e.g. the scrape interval |
| `maxPoints` | 300 | a range query has at most about this many points per series |
| `range`, `ranges` | first preset | the range at start (id or `{ id, seconds }`); the shell sets it from its [time range control](#time-range) |
| `timeout`, `fetch`, `now` | 30 000, global | as for `dataSource` |

- **Step.** The step is the smallest calm value (1, 2, 5, 10, 15, 30 s, 1, 2, 5, 10, 15, 30 min, 1, 2, 3, 6, 12 h, 1 d) that keeps a series at most
  `maxPoints` long: 1 h → 15 s, 6 h → 2 min, 24 h → 5 min, 7 d → 1 h, 30 d → 3 h. `end` is aligned down to the step, so two fetches within one step
  ask for the same grid.
- **Values.** Sample values arrive as strings and become numbers; `NaN` and `±Inf` become `null`. A scalar result becomes one row; a matrix answer to an
  instant query gives the last value of each series.
- **Escaping.** `promEscape(value)` escapes a value for a double-quoted label matcher (`{job="…"}`): backslash, double quote, line breaks.
  `promEscape(value, { regex: true })` also escapes regex metacharacters for `=~`. Put only escaped values into an expression.
- **Errors.** An HTTP error (`HTTP 502`), `status: "error"` in the body (its `error` text is shown), a body that is not JSON, a timeout: each makes the query
  fail. The kit's own texts (timeout, not JSON) follow the active language; `HTTP <status>` and a server's `error` text are shown as they are. Several queries run in parallel; when one fails the others still update, its last good data stays and `error` names it
  (`queue: HTTP 502`; several are joined by `; `). `age` is that of the oldest query, so a query that keeps failing makes the source stale.
- **Range changes** abort the requests in flight and fetch again; the data of the old range stays until the new answer arrives, marked with
  `state.refreshing: true` (the view keeps its layout, no `loading()` in between). An answer for the old range never lands.

### Time range

One range per app. The shell shows a control in the toolbar (clock, range and chevron – the long form “Last 24 hours” from 600 px, the short “1 d” on the phone – a kit menu with the presets) while the shown view's source follows
the range: a `promSource` with at least one `range: true` query, or a `combineSources` over one. Other boards show no control.

- Presets: 1 h, 6 h, 24 h, 7 d, 30 d (`RANGE_PRESETS`). A board passes its own as `createApp({ ranges: [{ id, seconds, label? }], range: '6h' })`;
  `label` is shown instead of the generated text (pass it through `t()`), `range` is the id at start (default: the first preset).
- The choice is the view parameter `range` (`#/metrics?range=7d`); choosing replaces the history entry like a filter does (Back by levels, see
  [shell](shell.md)). A deep link with `?range=` starts in that range. `app.range` is the current range, `app.setRange(id)` sets it.
- The shell hands the range to the source before the view renders. Until the new range has arrived the view still gets the old range's data
  with `ctx.src.refreshing`; the shell marks the content `aria-busy` and dims its charts, so no block moves or changes size and nothing passes
  for the new range. verify checks it (`overlay-shift`: a scenario that clicks a control which does not change what the view contains must not
  move or resize a block).

## Several sources: combineSources

```js
import { combineSources } from '/tarn/js/tarn.js';
const source = combineSources({ jobs: dataSource({ url: '/api/jobs' }), metrics });
// ctx.data = { jobs: <data of jobs>, metrics: { cpu, queue } }
```

- `data` holds each part's data under its name (`null` for a part without data yet; `data` itself is `null` while no part has data).
- In error when a part is: `error` is `jobs: HTTP 503` (one entry per failing part). Stale when a part is: `staleParts` lists them and the shell's
  banner names them (“Data is stale: jobs …”). `age` and `fetchedAt` are those of the oldest part. Every part keeps its last good data.
- `start`, `stop` and `reload` act on all parts; the time range reaches the parts that follow it.

## Sources of one view

Queries that only one view needs should not run while another view is shown. Give that view its own source:

```js
createApp({ source, views: [
  { id: 'overview', render: overview },
  { id: 'metrics', render: metricsView, source: promSource({ base: '/metrics-api', queries: { … } }) },
] });
```

The shell starts the view's source when the view is shown and stops it when the view is left (a request in flight is aborted). While the view is shown
its source is merged with the app's: `ctx.data` holds the keys of both (the view's win), the reload button, the source list and the banners cover
both; the freshness text shows the age of the view's own source (what the view mainly shows; `views[].freshness: 'app'` switches it to the app's). Pick key names that do not collide with the app's data. A view source can itself be a `combineSources`. Counters in the sidebar (`count(ctx)`)
only see the app's source.

## State

`{ data, error, loading, fetchedAt, age, stale, staleAfter }` (`combineSources` adds `staleParts`).

- `data` is the prepared data, and **stays** when a later fetch fails: the last good state remains visible, `error` carries the message.
- `age` is the age in seconds. With `ageOf` it is the age the server reports plus the time since the fetch; without it, the time since the fetch.
  `stale` is true when there is no data or `age > staleAfter`.

### What the shell does with it

- The toolbar shows “Updated … ago” of the source the view mainly shows (its own source, else the app's); from `staleAfter` it reads “Stale · … ago”
  in red. A tap opens the source list: every source of the view with its name, age and refresh interval, stale ones marked, and a reload button.
  `label` and `note` on `dataSource`/`promSource` name a source there and add one line about it (e.g. “Written every 5 minutes by the collector;
  reloading fetches the same file until then.”, through `t()`); parts of a `combineSources` are listed one by one under their key or `label`.
- Reload (the toolbar button, or the one in the source list) turns its icon while it runs, at least about half a second, then the text shows the
  new age at once. When it brought nothing newer (the age did not drop, e.g. a snapshot file that is only rewritten every 5 minutes) a toast says
  so and the source list names the source that stayed and shows its note.
- A warning banner appears when a fetch failed but data exists; an error banner when the data is stale. The views keep showing the last state.
- A view gets the state as `ctx.src` and the data as `ctx.data`. Handle `!ctx.data` with `loading()` (first load) or `error({ onRetry:
  () => source.reload() })`, and a part or query that is `null` the same way. The view is rebuilt on every new data, see [shell](shell.md#views).
- The freshness text refreshes itself every 15 s without a fetch.

## What the server has to give

### A JSON snapshot

One JSON document with everything the views need. When a collector writes it now and then, put the time it was made into the document
(`generatedAt`, epoch milliseconds) and let the source compute the age from it: `ageOf: (d) => (Date.now() - d.generatedAt) / 1000`. A fixed `ageSec` in a file
would go stale, because the source only counts on from the moment of the fetch; a server that builds the document on request can send the real `ageSec`.
Keep display decisions (status of a job, which rows are problems) in `parse` on the client or in the document, not in the view code. The sample board's
`example/fixture.json` is a complete invented snapshot (`schemaVersion`, `ageSec`, jobs with their run history and timestamps relative to the fetch, which
suits a fixture); `example/board.js` shows `prepare()` turning it into the display model. Use it as the template for your own.

A board that only reads JSON files can be served by any static server with the same-origin rule and a CSP of `'self'` (`tools/serve.py` is an example);
a board that runs processes, validates forms or sends push messages needs a backend for those calls: [inputs and actions](inputs-and-actions.md) and
[notifications](notifications.md) describe the contracts the browser half expects.

### The Prometheus HTTP API, same origin

`promSource` needs exactly two GET endpoints under its `base`: `/api/v1/query` and `/api/v1/query_range`, answering as Prometheus does
(`{ status: "success", data: { resultType, result } }`; VictoriaMetrics does). The metrics server is not exposed to the browser directly, and no
credentials go to the browser. Two ways:

1. **A reverse-proxy route** in the server that serves the board, passing only those two GET endpoints to the metrics server (and adding credentials
   there if the metrics server needs them). Everything else under `base` answers 404; other methods 405. Example for nginx, with placeholder names:

   ```nginx
   location = /metrics-api/api/v1/query       { limit_except GET { deny all; } proxy_pass http://metrics.example.internal:8428/api/v1/query; }
   location = /metrics-api/api/v1/query_range { limit_except GET { deny all; } proxy_pass http://metrics.example.internal:8428/api/v1/query_range; }
   location ^~ /metrics-api/ { return 404; }
   ```

   Any user who can open the board can then run any read query against the metrics server through it; put a limit on query time and series at the
   metrics server if that matters.
2. **A board backend** that answers the same two paths itself and accepts only its own expressions (a fixed list by name or exact text), forwarding them
   to the metrics server. Use it when the board must not be a general query endpoint. The board code stays the same.

## From a Grafana panel to a Tarn view

1. **Take the query.** In the panel editor copy the PromQL expression and the legend format (`{{instance}}`). Grafana variables become code: `$__range`
   is `r.window` in an `expr` function, `$__rate_interval` a fixed window such as `[5m]`, a dashboard variable a value you pass in with `promEscape()`.
2. **Name it.** One entry per panel query in `queries`: `cpu: { expr, range: true, legend: '{{instance}}' }` for a time series panel, `{ expr }` for a
   stat or gauge panel.
3. **Choose the block.** Time series panel → `lineChart(ctx.data.cpu)` (the units and thresholds go into `yFormat` and the status of the tile, not into
   the query); stat panel → `statTile({ value: fmtNum(promValue(ctx.data.load)) })`; table panel → `table()` over the rows; bar gauge →
   `barChart({ horizontal: true })` over the rows.
4. **Decide where it runs.** Queries every view needs go into the app's source; queries of one view into that view's `source`. A board that also has
   collector JSON combines both with `combineSources`.
5. **Drop what Tarn does not do.** There is no query editor, no ad-hoc exploring and (in 0.7) no zoom by dragging; the board shows the questions it was
   built for. The time range comes from the toolbar control.

## Snapshots and the fixed clock

The checks need the same data every time. A board that is verified gets a fixture it can serve and a fixed clock (`clock` in `tarn-board.json`), so
relative times such as “3 h ago” render the same in every run; see [checks](checks.md#a-board-outside-the-kit). In the kit's own tests the clock is fixed to
2026-11-09 10:00. For a `promSource` use a simulated server as the `fetch` option: `gallery/prom-sim.js` answers both endpoints from series computed from
the time asked for, so a fixed clock gives the same chart every run; the gallery's “Data sources” view and the unit tests use it, and no request
reaches a real metrics server.
