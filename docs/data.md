# Data

How a board gets its numbers: `dataSource()` fetches JSON on an interval and tells the shell how fresh it is. For a board author who wires a view to
an API or to a JSON file. The kit has no backend and no query language of its own; it expects a same-origin URL that answers with JSON.

## dataSource

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
source.start();                     // the shell subscribes, it does not start the source
```

| Member | Does |
|---|---|
| `source.start()` | fetches now, then every `interval`; returns the source |
| `source.stop()` | stops the timer and the visibility listener |
| `source.reload()` | fetches now (a request already in flight is reused); returns a promise |
| `source.subscribe(fn)` | calls `fn(state)` now and on every change; returns the unsubscribe function |
| `source.state` | the current [state](#state) |

Two more options exist for tests: `fetch` (replaces `globalThis.fetch`) and `now` (replaces `Date.now`).

- The request is `GET url` with `Accept: application/json` and `cache: 'no-store'`; the browser handles `gzip`. A non-2xx answer is an error; if the body is
  JSON with an `error` field, that text is shown, otherwise `HTTP <status>`. A body that is not JSON is an error too.
- While the tab is hidden the timer pauses; on return it fetches at once if the interval has passed.
- After an error the next try comes after the shorter of `interval` and 15 s.
- Prepare raw data once in `parse` (points in time, problems, sorting): views do not calculate.

### State

`{ data, error, loading, fetchedAt, age, stale, staleAfter }`

- `data` is the result of `parse`, and **stays** when a later fetch fails: the last good state remains visible, `error` carries the message.
- `age` is the age in seconds. With `ageOf` it is the age the server reports plus the time since the fetch; without it, the time since the fetch.
  `stale` is true when there is no data or `age > staleAfter`.

### What the shell does with it

- The toolbar shows “Updated … ago” (a button: tap to reload); from `staleAfter` it reads “Stale · … ago” in red.
- A warning banner appears when a fetch failed but data exists; an error banner when the data is stale. The views keep showing the last state.
- A view gets the state as `ctx.src` and the parsed data as `ctx.data`. Handle `!ctx.data` with `loading()` (first load) or `error({ onRetry:
  () => source.reload() })`. The view is rebuilt on every new data, see [shell](shell.md#views).
- The freshness text refreshes itself every 15 s without a fetch.

## What the server has to give

A snapshot endpoint: one JSON document with everything the views need. When a collector writes it now and then, put the time it was made into the document
(`generatedAt`, epoch milliseconds) and let the source compute the age from it: `ageOf: (d) => (Date.now() - d.generatedAt) / 1000`. A fixed `ageSec` in a file
would go stale, because the source only counts on from the moment of the fetch; a server that builds the document on request can send the real `ageSec`.
Keep display decisions (status of a job, which rows are problems) in `parse` on the client or in the document, not in the view code. The sample board's
`example/fixture.json` is a complete invented snapshot (`schemaVersion`, `ageSec`, jobs with their run history and timestamps relative to the fetch, which
suits a fixture); `example/board.js` shows `prepare()` turning it into the display model. Use it as the template for your own.

For several endpoints use several sources and `app.refresh()`, or one source whose `parse` merges them. A board that only reads JSON files can be served
by any static server with the same-origin rule and a CSP of `'self'` (`tools/serve.py` is an example); a board that runs processes, validates forms or
sends push messages needs a backend for those calls: [inputs and actions](inputs-and-actions.md) and [notifications](notifications.md) describe the
contracts the browser half expects.

## Snapshots and the fixed clock

The checks need the same data every time. A board that is verified gets a fixture it can serve and a fixed clock (`clock` in `tarn-board.json`), so
relative times such as “3 h ago” render the same in every run; see [checks](checks.md#a-board-outside-the-kit). In the kit's own tests the clock is fixed to
2026-11-09 10:00.
