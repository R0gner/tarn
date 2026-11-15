# Building a board

A guide for a coding agent, or a person, who uses Tarn to build something: a dashboard, a tool that starts processes, a small tracker, an admin page. It
goes from nothing to a board that has passed its own checks: decisions first, then the steps, then the rules that keep a board consistent with every
other one. The commands below were run against this repository; the board they produce is small on purpose. Reference for every option is in the
[index](README.md). If you are here to change the kit itself, read [AGENTS.md](../AGENTS.md) instead.

## 1. Decide first

Answer these before you write a line.

**What is being built?** Name the views (a start view with the status of everything, then one view per thing the user looks at or does) and what a row
opens (a detail). A board with no actions only displays; one that starts a process, saves a setting or sends a message needs forms and a backend.

**Where does the data come from?** Three ways exist; pick one per board, or combine them.

| Way | Fits when | What you build |
|---|---|---|
| A collector writes a JSON snapshot next to a static server | numbers that change every few minutes, a read-only board, the data already exists as files or a script can produce it | a script (cron, a timer, anything) that writes one JSON document atomically (write a temp file, rename it), a static file server with the strict CSP, the board folder. `dataSource` fetches the file |
| A Prometheus-compatible metrics server (Prometheus, VictoriaMetrics) | time series and current values that already live there, a board that replaces dashboards of a monitoring tool | a same-origin route that passes only `GET /api/v1/query` and `/api/v1/query_range` (reverse proxy, or a backend that allows only its own expressions), named queries in `promSource` |
| An active backend | actions (start, stop, save), forms with server-side validation, running jobs with a live log, push notifications | a small server that answers the JSON calls the views need, takes the form posts, serves the kit and the board files, and (for push) answers the five notification calls |

Both end at the same place: the browser fetches JSON from its own origin. Pick the first one when it is enough; a backend can come later without
changing the views. Metrics come through `promSource`: declare each panel's query by name in board code (`queries: { cpu: { expr, range: true,
legend: '{{instance}}' } }`), and the view gets chart-ready data (`ctx.data.cpu` goes straight into `lineChart`, `promValue(ctx.data.load)` into a tile)
over the time range the toolbar control sets. Queries only one view needs go into that view's own `source`, so they do not run while another view is
shown; collector JSON and metrics are joined with `combineSources`. The server options, a reverse-proxy sample and a walk-through from a Grafana panel are in
[data](data.md#promql-promsource).

**One board or several?** One board is the default. Several boards on one host get the same icon in the header and a switcher between them
([several boards](shell.md#several-boards)); decide the shared `boards.json` once, not per board.

**Which language?** `createApp({ locale: 'de' })` forces one language and removes the language menu. Without `locale`, the browser's language is matched
against the offered `locales`, English being the fallback (`fallbackLocale` changes that). Kit texts exist in en, de, es and fr; your board texts need the
same languages you offer.

## 2. Steps

All paths are relative to a folder for the board, `my-board/`. `<kit>` is a checkout of this repository (`git clone https://github.com/R0gner/tarn`).

### Vendor the kit

```sh
node <kit>/tools/vendor.mjs --to my-board/tarn          # a fixed copy of the runtime files, served as /tarn/
node <kit>/tools/vendor.mjs --to my-board/tarn --check  # later: unchanged? which version?
```

Never edit anything in this copy. A board with its own backend usually keeps the copy in `vendor/tarn/` and serves it under `/tarn/`; the folder name is
yours, the URL `/tarn/` is what the page uses. Details: [getting started](getting-started.md#include-the-kit-in-a-project).

### Page skeleton

`my-board/index.html`:

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="dark light">
  <title>Lab status</title>
  <link rel="icon" type="image/svg+xml" href="favicon.svg">
  <link rel="apple-touch-icon" href="apple-touch-icon.png">
  <link rel="manifest" href="manifest.webmanifest" crossorigin="use-credentials">
  <script src="/tarn/js/theme-init.js"></script>
  <link rel="stylesheet" href="/tarn/css/tokens.css">
  <link rel="stylesheet" href="/tarn/css/fonts.css">
  <link rel="stylesheet" href="/tarn/css/base.css">
  <link rel="stylesheet" href="/tarn/css/core.css">
  <link rel="stylesheet" href="/tarn/css/components.css">
  <link rel="stylesheet" href="/tarn/css/charts.css">
  <script type="module" src="board.js"></script>
</head>
<body></body>
</html>
```

No inline script or style: the server's CSP is `default-src 'self'`.

### Identity

```sh
node <kit>/tools/brand.mjs --name "Lab status" --icon server --accent green --out my-board
```

writes `favicon.svg`, the app icons and `manifest.webmanifest`, and prints the `<head>` lines used above (it needs a Chromium-based browser). Every board gets
its own icon and a descriptive title; never reuse another board's or the kit's. See [identity](identity.md).

### Texts

`my-board/messages.js`, one catalog per language, keys prefixed with the board name. Visible text never goes into code.

```js
export default {
  en: { 'lab.title': 'Lab status', 'lab.overview': 'Overview', 'lab.hosts': 'Hosts', 'lab.up': 'Up', 'lab.cpu': 'CPU load', 'lab.host': 'Host', 'lab.load': 'Load' },
  de: { 'lab.title': 'Labor-Status', 'lab.overview': 'Übersicht', 'lab.hosts': 'Hosts', 'lab.up': 'Online', 'lab.cpu': 'CPU-Last', 'lab.host': 'Host', 'lab.load': 'Last' },
};
```

### Data and views

`my-board/board.js`:

```js
import { createApp, dataSource, tiles, statTile, card, table, lineChart, loading, error, stack, fmtPct, t } from '/tarn/js/tarn.js';
import messages from './messages.js';

const source = dataSource({ url: './data.json', interval: 30_000, staleAfter: 300, ageOf: (d) => (Date.now() - d.generatedAt) / 1000 });

function overview(ctx) {
  if (!ctx.data) return ctx.src?.error ? error({ onRetry: () => source.reload() }) : loading({ tiles: 2, rows: 3 });
  const up = ctx.data.hosts.filter((h) => h.up).length;
  return stack(
    tiles(statTile({ label: t('lab.up'), value: `${up} / ${ctx.data.hosts.length}`, status: up === ctx.data.hosts.length ? 'ok' : 'bad' })),
    card({ title: t('lab.cpu') }, lineChart({ x: ctx.data.times, series: ctx.data.hosts.map((h) => ({ label: h.name, values: h.cpu })), yFormat: (v) => fmtPct(v, 0) })),
  );
}

function hosts(ctx) {
  if (!ctx.data) return loading({ rows: 4 });
  return card({ flush: true }, table({
    columns: [
      { key: 'name', label: t('lab.host') },
      { key: 'load', label: t('lab.load'), align: 'right', get: (h) => h.cpu.at(-1), render: (h) => fmtPct(h.cpu.at(-1), 0) },
    ],
    rows: ctx.data.hosts, rowKey: (h) => h.name, status: (h) => (h.up ? 'ok' : 'bad'),
  }));
}

createApp({
  title: () => t('lab.title'),
  icon: './favicon.svg',
  messages,
  source,
  views: [
    { id: 'overview', label: () => t('lab.overview'), icon: 'house', render: overview },
    { id: 'hosts', label: () => t('lab.hosts'), icon: 'server', render: hosts },
  ],
});
source.start();
```

How the pieces fit:

- The start view shows status first (tiles, then what is wrong), as in the sample board's `example/board.js`. Every view handles `!ctx.data` with `loading()` or
  `error({ onRetry })`.
- A row that stands for a thing opens its detail: `table({ onRow })` or `metricRow({ onClick })`, and a view declares `detail: (id, ctx) => ({ title, sub, body })`.
  The shell chooses inspector, panel or bottom sheet. A row in a view that does not own the thing opens the owner's detail in place
  ([detail in place](shell.md#detail-in-place)). Detail layout: banner, facts, history, events, technical facts, actions.
- Do the arithmetic once in `parse` (`dataSource({ parse })`), not in every view.
- `data.json` is whatever your collector writes. This one holds `generatedAt` (epoch ms), `times` (epoch ms) and `hosts: [{ name, up, cpu: [0..1, …] }]`.
- Choose the block from the table in [AGENTS.md](../AGENTS.md#choosing-building-blocks) and the [gallery](https://r0gner.github.io/tarn/gallery/); options are in
  [components](components.md), [charts](charts.md) and [inputs and actions](inputs-and-actions.md).

### Serve it

A static board: any file server that sends the strict CSP. The kit's own server does:

```sh
python3 <kit>/tools/serve.py --root my-board --port 18861     # http://127.0.0.1:18861/
```

A board with a backend serves the same files and its JSON calls, and maps `GET /tarn/<path>` to `vendor/tarn/<path>` (same path check as for its own static
files, `Cache-Control: no-cache`). Use the CSP of `tools/serve.py` as the model (`default-src 'self'`, no inline script or style, `img-src 'self' data:`).
Same origin means no CORS.

### Actions, forms, notifications (only if the board needs them)

- A change the user can make: `form({ fields, onSubmit })`, in a sheet with `openSheet({ body: f, footer: f.buttons() })`. A dangerous step asks first with
  `confirm({ danger: true })`; every action ends in a `toast` or an `actionRun`. A backend validates again and returns `{ errors }` or `{ error }`.
  See [inputs and actions](inputs-and-actions.md).
- Push notifications: `createApp({ notifications: { api: '/api/push' } })`, five server calls, `push-sw.js` served from the board's root:
  [notifications](notifications.md). The kit does not send; the backend does.
- Installing as an app works with the manifest from `brand.mjs`; no service worker is needed.

### Describe the board for the checks

`my-board/tarn-board.json`:

```json
{
  "name": "Lab status",
  "pages": [{ "id": "main", "path": "/?lang=en" }, { "id": "main-de", "path": "/?lang=de", "sizes": ["phone", "desktop"], "themes": ["dark"] }],
  "kit": "tarn",
  "kitUrl": "/tarn/js/tarn.js",
  "clock": "2026-11-09T09:00:00Z",
  "snapshots": "verify/snapshots",
  "lint": { "dirs": ["."], "skip": ["tarn", "verify"], "messages": ["messages.js"] }
}
```

`kit` is where the copy lives (here `tarn`, with a backend `vendor/tarn`), `clock` the fixed time of the snapshots, `lint.messages` the catalog files that are
allowed to contain texts. Add `details` (`["jobs?open=a1"]`) to a page so that an open detail is checked as well. All fields:
[checks](checks.md#a-board-outside-the-kit).

For a verifiable board the data must not change between runs. Serve a fixture to the checks, with `generatedAt` and the other times near `clock` (the sample
board's `example/fixture.json` does this with relative times), so “updated 20 s ago” renders the same every time.

### Check it

With the board's server running:

```sh
node <kit>/tools/lint.mjs --board my-board                                              # the board's own files only: tokens, texts, icon, title
node <kit>/tools/verify.mjs --board my-board --base http://127.0.0.1:18861 --update     # once: write the snapshot baseline, then read it
node <kit>/tools/verify.mjs --board my-board --base http://127.0.0.1:18861               # before every hand-in
```

The last one prints at most ten lines and ends with `GREEN · exit 0` (or `RED` with findings and the path of `report.json`). It runs lint, `vendor --check`,
geometry on phone, tablet and desktop, the generic overlay scenarios, snapshots and the animation inventory. Exit 2 means no verdict (server not answering,
no Chrome). Commit `verify/snapshots/` with the board; review the snapshot diff whenever it changes, and rewrite it with `--update` only when the change is
intended. Hand in only with a green run, and say which command and which report path prove it.

## 3. Rules that keep boards consistent

- **Kit parts and tokens only.** No own colours, sizes, radii, shadows or fonts; no `style` with pixel or colour values; own CSS only for placement that
  `cols()`, `stack()` and `tiles()` do not cover, and then with tokens ([design language](design.md)). Lint fails on literals.
- **Every visible text through `t()`**, numbers, bytes and times through `fmt*`, with the active locale and time zone. No emoji; icons from `icon()`. Data
  such as job names is not translated.
- **Status only through status names** (`ok warn bad unknown pending info off`): `statusDot`, `badge`, `banner`, chart colour. Never colour as the only information.
- **Overview first, detail on tap**, in the view the user is in. Whole rows are buttons; no expanding lists; no `title` attributes; no own popups: menus,
  toasts, tooltips and data cards come from the kit.
- **Inputs, filters and actions through the kit:** `field()` with `textField`, `select` (up to about eight options) or `combobox`; `form()` for fields sent
  together; `filterBar()` with `matchFilters()`; `confirm()` for anything dangerous. No bare `<input>`, no `window.confirm`, `alert` or `prompt`.
- **A count on a view with tabs is split over the tabs.** When a navigation entry shows a count and the view has tabs (`segmented`), every option carries its
  share of that count: `segmented({ options: [{ value, label, count, tone }] })`, with the same tone the sidebar counter has, so a problem never hides behind a tab.
- **Phone first:** it works at 390 px without sideways scrolling; the shell and the kit parts do the rest. Never branch on the density in board code.
- **Data through `dataSource`**, with its freshness text and stale banner; the last state stays visible when a fetch fails.
- **Never edit `tarn/` (the vendor copy).** An update is a deliberate step: `vendor.mjs` again, read the `CHANGELOG.md`, run the checks, commit the copy
  together with the board changes it needs.

### What counts as a kit gap, and how to report it

A **kit gap** is something the kit should carry and does not: a fault in a kit part (a part that overflows, mistranslates, traps a swipe), a missing icon, a
missing option of an existing part, or a building block that a second board would need as well. A block that only this board needs is not a gap: build it in
the board from kit parts and tokens (`verify --board` checks it like everything else), and move it into the kit when a second board builds the same one
([what belongs in the kit](getting-started.md#what-belongs-in-the-kit)).

When you hit a gap, do not patch the copy and do not copy-and-tweak kit code. Work around it with kit parts if you can, note the workaround where you used
it, and report it: the kit version (`import { VERSION }` or the `VERSION` file in the copy), the part and the view, what you expected and what you saw, a
minimal reproduction (a few lines of `board.js`), and the finding of `verify` with the report path if there is one. Hand that to whoever maintains the kit,
or open an issue at https://github.com/R0gner/tarn. A missing icon is the one thing you can prepare yourself, in a kit checkout:
`node tools/icons.mjs add <lucide-name>`, then look at the gallery.
