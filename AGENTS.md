# Tarn – guide for agents that build or change a board

> You are here to change the kit or to follow its rules. **To build a new board with the kit, read [docs/building-a-board.md](docs/building-a-board.md) first.**

> **Information over decoration. Dense, calm, unambiguous, instant.**
> Overview first, details on tap. Colour only when it means something. Motion short and only for orientation.
> The kit is the shared base. What only one board needs, that board builds itself from kit parts.

Goal: every board looks the same and works the same. You build **from kit building blocks**, not your own UI. The kit has four
levels – tokens, primitives, components, shell (see docs/getting-started.md); the gallery shows them in that order. The reference for every
building block, tool and option is `docs/` (index: `docs/README.md`); this file holds the rules.

## Principles

1. **Overview first.** Start view = status tiles (`tiles(statTile…)`), below them “Problems” (everything red/yellow, worst
   first), “Up next”, “Recently failed”. Tiles with their own view jump there.
2. **Tap a row = detail – in the view you are in.** The whole row is the button (`metricRow({ onClick })`, `table({ onRow })`), a chevron on the right.
   Detail through `view.detail(id, ctx)` → `{ title, sub, body }`; the shell chooses inspector/panel/bottom sheet. From
   elsewhere: `app.go('view', { open: id })`. No expanding in lists. **A row that stands for a thing another view owns** (an overview's problem list, failed runs, a
   timeline) opens that thing's detail in place: `onClick: () => ctx.app.open(id)` and in the view `detail: (id, ctx) => ctx.app.detailOf('jobs', id, { link: true })`; the
   “Open in …” link inside the detail is the explicit way to the owning view (docs/shell.md “Detail in place”). Do not `app.go()` away from the overview on a row tap.
3. **Detail layout:** `banner()` for error/notice on top → `facts('Status', kv(…))` → history (`heatRow`, chart) →
   `facts('Events', log(…))` → `facts('Technical', kv(…, { mono: true }))` → actions (`toolbarRow`, `menu`).
4. **Status only through status tokens** (`ok warn bad unknown pending info off`): `statusDot`, `badge({ tone })`,
   `banner({ tone })`, chart colour `'bad'`. Never colour as the only information – always text/aria as well (the kit does it).
5. **No own colours, sizes, shadows, radii, fonts.** No `style` with pixel or colour values, no own CSS except pure placement that
   `cols()`/`stack()`/`tiles()` do not cover (and then only with tokens).
6. **Shared blocks live in the kit, board-specific blocks in the board.** A block only this board needs (for its own data or question) is built
   in the board's own files from kit parts and tokens; rule 5 still holds. A block a second board needs as well, or one that is plainly general,
   goes into the kit **plus** a gallery entry with all states. A fault in a kit part is fixed in the kit. No copying and tweaking of kit code
   (docs/getting-started.md “What belongs in the kit”).
7. **Texts only through `t()`.** Never put visible text into the code: board texts go into `messages` (per language, same fallback
   rule as the kit), numbers/bytes/times only through `fmt*` (Intl, active locale and time zone). No emoji, icons only from
   `icon()` (Lucide, fixed version; if one is missing: `node tools/icons.mjs add <lucide-name> [--as <name>]`, then check the
   gallery). Data (job names, agent reports) is not translated. Lint rule `i18n` and the catalog test enforce it.
8. **Data through `dataSource`**: the toolbar shows “Updated … ago” (red from `staleAfter`), a banner on error/stale data; the last
   state stays visible. Every view handles `!ctx.data` with `loading()` or `error({ onRetry })`.
9. **Mobile first**: everything must work at 390 px without sideways scrolling (also `timeline`: the axis fits the width). Density
    (`compact` default, `comfortable` for car screens: `data-density` on `<html>`, 48 px targets) is a token matter: never branch on it in a component.
10. **Hover, hints, overlays only through the kit:** content you only see by pointing (heat map, timeline bars, chart points) is a
    data card (`dataCard()`); text and icon buttons get the small hint (`iconButton`, `tooltip()`; truncated text automatically). No
    `title` attributes, no own popups: menus, toasts and tooltips automatically sit above open sheets (overlay layer, see docs/design.md).
11. **Every board has its own favicon (SVG) and a descriptive title.** Title `View · Board` (the shell sets it:
    `createApp({ title: 'My board' })`; a static `<title>` in the HTML is also “Name · Context”). Favicon: your own file via
    `<link rel="icon" type="image/svg+xml" href="icon.svg">` (template `example/favicon.svg`) or without a graphic file
    `createApp({ icon: { icon: 'server', color: 'purple' } })` / `favicon({ icon, color })`. Lint (`page`) and verify (`identity`)
    check both; never take the icon of another board or the kit logo. With several boards: the same icon in the header
    (`createApp({ icon })`) and optionally the switcher (`boards`, see docs/shell.md “Several boards”); do not build your own navigation.
12. **Language and time zone belong to the shell:** `createApp({ locale?, fallbackLocale?, locales?, messages?, timeZone? })`. Without `locale` the
    browser languages are matched against `locales`, fallback English (or `fallbackLocale`, e.g. `'de'` for a German board that still offers the language menu); `locale: 'de'` forces one language (then there is no
    language menu). Do not hard-wire a time zone or a number format anywhere.
13. **Inputs, filters and actions only through the kit.** Fields: `field({ label, help, required, rules }, textField | numberField | select | combobox |
    checkbox | toggle | dateField | dateRange)` – never a bare `<input>`; `select` up to about 8 options, above that `combobox`. Several fields that are
    sent together: `form({ fields, onSubmit })` (validation, “Running …”, no double submit). Filters by data type: `filterBar({ filters: [{ type:
    'options' | 'bool' | 'range' | 'time' }] })` + `matchFilters()`. **Every action gives feedback** (`toast` or `actionRun`), **every dangerous action
    asks first** with `confirm({ danger: true })` (`typeToConfirm` when a name or data is at stake, e.g. a host). Never `window.confirm`, `alert`
    or `prompt`.

14. **A view answers one question and needs no explanation** ([docs/dashboard-guidelines.md](docs/dashboard-guidelines.md)). What does not serve the
    question goes into a detail or is left out. Labels are short nouns, values carry their unit, a sub-line is one fact; status says what is the case.
    No always-visible explanations, disclaimers, caveats or method notes: those go into your hand-in report. A complex display may carry one optional
    `info` (`card({ info })`, `section(title, { info })`). Empty and error states: one line, one action. A number appears once per view.

## Verification

1. **Name the check before the code:** command and expected output (e.g. `node tools/verify.mjs --quick --views jobs` → “GREEN ·
   exit 0”). If there is no check for the change, build one first (new rule, new case, new mutant), then the code.
2. **Hand in only with a green verify:** `node tools/verify.mjs` (tests, lint, types, geometry in en/de/fr, overlays, snapshots,
   animation inventory) ends with exit 0, or – while known faults are open – only with the findings listed as KNOWN
   (`tools/verify/exceptions.json`, `tools/lint/allow.json`), never with new ones. When changing check tools also run
   `node tools/verify.mjs --full --selftest` (exit 0; it also proves that a foreign board copy is green and a faulty one red). While developing use `node tools/verify.mjs --changed` (only the pages/views
   the changed files can affect); the full run stays mandatory before handing in.
3. **Evidence as command plus path**, not as a claim: e.g. “`node tools/verify.mjs` → exit 0, report `<out>/report.json`”, tempo
   “`node tools/tempo.mjs --attach … --out <dir>` → `<dir>/tempo.md`”.
4. **Do not loosen or delete without an explicit assignment:** check tools (`tools/verify*`, `tools/lint*`, `tools/tempo*`),
   budgets (`tools/tempo/cases.mjs`), exceptions and inventory lists, mutants and snapshots (`tests/snapshots/`). Rewrite
   snapshots with `--update` only when the change is intended, and put the reason into the commit message. Removing a fixed known
   fault from the list is allowed and welcome.
5. What a script can check lives as a script in `tools/`, not here as a rule.

| Tool | Purpose | Duration |
|---|---|---|
| `node tools/verify.mjs [--quick]` | everything except frame measurement; ≤ 10 lines, exit 0/1/2 | ≈ 5 min (quick ≈ 1 min) |
| `node tools/verify.mjs --types` | JSDoc types of `js/` through `tsc` (pinned version via npx; skipped offline) | ≈ 1 s |
| `node tools/lint.mjs [-v]` | tokens, transitions, no innerHTML, timers, gallery coverage, emoji, texts via `t()`, core/shell classification and import direction | < 1 s |
| `node tools/tempo.mjs --attach http://127.0.0.1:<port>` | response times against budgets (visible Chrome) | ≈ 10 min |
| `node tools/tempo-markdown.mjs --attach http://127.0.0.1:<port>` | 50 KB report with `markdown()` under 4× CPU (budget 50 ms) | ≈ 20 s |
| `node tools/verify.mjs --update` | deliberately rewrite snapshots | ≈ 30 s |
| `node <kit>/tools/verify.mjs --board <board> --base http://127.0.0.1:<port>` | the same checks for a board outside the kit (its own lint, vendor copy, geometry, snapshots, overlays, inventory) | ≈ 10–60 s |
| `node <kit>/tools/lint.mjs --board <board>` | lint of the board's own CSS, JS, HTML with its allow file | < 1 s |

## Releasing

1. Set the same version in `VERSION`, `js/version.js` and `package.json`; move the changes into a `## X.Y.Z` section of `CHANGELOG.md` (the section is the text of the release).
2. `node --test` and `node tools/verify.mjs` green; `node tools/release-notes.mjs` prints the section.
3. Commit, tag `vX.Y.Z`, push the branch and the tag. `.github/workflows/release.yml` checks that the tag equals `v` + `VERSION` and creates the GitHub release by itself; do not create it by hand.

## Create a new board

1. Copy `example/` as the template (`index.html`, `board.js`, `messages.js`, `favicon.svg`, `manifest.webmanifest`, icons), switch the
   paths to `/tarn/…`; set title, favicon (`node tools/brand.mjs --name … --icon … --accent … --out …` creates favicon.svg,
   PNGs and manifest; or `favicon()`) and the board name.
2. Copy a fixed kit version into `vendor/tarn/` with `node <kit>/tools/vendor.mjs --to <board>/vendor/tarn` and serve that folder under
   `/tarn/` (see docs/getting-started.md, “Include the kit in a project”, way b). Never edit the copy; update it with the same command and run the checks afterwards.
3. `dataSource({ url: '/api/snapshot', ageOf: (d) => d.ageSec })`; prepare raw data once in `parse` (points in time, problems,
   sorting) – views do not calculate themselves.
4. Views as `views: [{ id, label, group?, icon, render(ctx), detail?(id, ctx), count?(ctx) }]`; the sidebar counter comes from
   `count(ctx)` (returns `n` or `{ n, tone }` derived from the data, never as a side effect of `render()`). `app.setCount(id, n,
   tone)` only for counters that cannot be derived from `ctx.data` (live events). `title`, `boards`, `categories` and `label`
   may be functions so that they can call `t()` after the language is set.
5. Texts: one catalog per language (`messages: { en: {…}, de: {…} }`), keys prefixed with the board name.
6. Server with a strict CSP like `tools/serve.py` (`default-src 'self'`, no inline scripts/styles).
7. Describe the board for the check tools in `tarn-board.json` in the board folder (pages with `id`, `path`, `details`, optional `views`, `sizes`,
   `themes`, `density`; `snapshots` folder, `exceptions` file, fixed `clock`; see docs/checks.md “A board outside the kit”). With the board server running:
   `node <kit>/tools/verify.mjs --board <board folder> --base http://127.0.0.1:<port> --update` once (snapshot baseline, review it), afterwards
   `node <kit>/tools/verify.mjs --board <board folder> --base http://127.0.0.1:<port>` – exit 0 before every hand-in. It runs lint of the board's own
   files, `vendor --check` on its copy, geometry, snapshots, the generic overlay scenarios and the animation inventory.

## Notifications

A board that wants notifications adds `createApp({ notifications: { api: '/api/push' } })` (sidebar entry + sheet; all states and texts are the kit's), serves
`vendor/tarn/js/push-sw.js` from its own root (e.g. `GET /sw.js`) and implements the five server calls of docs/notifications.md. No own notification UI, no
permission prompt outside the sheet (it only ever follows a tap), no service worker with an offline cache. On phones theme, density and language live in one
settings entry; do not add more toolbar buttons (verify rule `toolbar-title`).

## Choosing building blocks

| You want … | use |
|---|---|
| a key figure with a goal | `statTile({ label, value, unit, sub, status, onClick })`, trend as `sub: sparkline({ values })`; any number in a row: `tiles(a, b, c, d, e)` (rows close by themselves), `tiles({ className }, …)` |
| a list of things | `card({ flush: true }, list(items, (x) => metricRow({ … })))`; a reason that must be read in full (problem rows): `metricRow({ wrapSub: true })` |
| a quiet note under a list or card ("+13 frequent runs hidden") | `card({ flush: true, footer: t('…') }, list(…))`, under a section `section(title, { footer })` – one short sentence, never a second heading |
| many columns, sorting | `table({ columns, rows, status, onRow })` + `filterBar()`; long texts `wrap: true`, phone role `mobile` |
| facts in the detail | `facts('Title', kv([[k, v, class?], …]))` |
| a switch of 2–5 options | `segmented()`; sub-areas in the detail `tabs()` |
| secondary actions | `menu(iconButton('more', { label }), items)` |
| feedback after an action | `toast(text, { tone, action })` |
| usage, progress | `usageBar({ used, total, label })`, `progress({ value })` |
| a time series | `lineChart({ x, series })` (scrubbing built in), runs per day `barChart({ stacked: true })` |
| metrics from Prometheus/VictoriaMetrics | `promSource({ base, queries: { cpu: { expr, range: true, legend } } })` → `lineChart(ctx.data.cpu)`, `promValue(ctx.data.load)`; one view's queries as that view's `source`; with JSON `combineSources()` (docs/data.md) |
| a ranking with names | `barChart({ horizontal: true })` |
| last runs ok/fail | `heatRow({ items })` |
| a schedule, overlaps | `timeline({ rows, conflicts: 'auto' })` (heavy runs `heavy: true`) |
| a small share/fill level | `donut()` |
| a log | `log(entries)` |
| several boards, switching between them | `createApp({ icon, boards, categories, boardId })`; `boards` as an array or the URL of a shared JSON file (same origin), entries `{ id, name, href, icon?, category? }`, only invented or your own addresses |
| a field with label, help, validation | `field({ label, help, required, rules }, textField(…) \| numberField({ unit, min, max }) \| select(…) \| combobox({ options, multiple }) \| dateField(…))`; `checkbox()` / `toggle()` carry their own label |
| a form (several fields, send) | `form({ fields: [{ name, type, label, … }], onSubmit })` – in a sheet `openSheet({ body: f, footer: f.buttons() })` |
| filters by data type | `filterBar({ filters: [{ key, label, type: 'options' \| 'bool' \| 'range' \| 'time', … }] })` + `matchFilters(row, state.f, get, { now })` |
| ask before a dangerous action | `await confirm({ title, text, danger: true, typeToConfirm?: name })` |
| an action that takes time (status, progress, live log) | `actionRun({ source: fn \| url, title, onCancel, onDone })` |
| photos of a thing (a listing, a device) | `imageStrip(images)` in the detail; a tap opens `openImageViewer()` (carousel swipe, pinch and double-tap zoom with fling when panning, keys, Back closes it); never `<a target="_blank">` |
| a report, running text of an agent | `markdown(text, { compact: true })` (in the detail: `facts('Run report', markdown(…, { compact: true }))`); raw HTML becomes text, links only http(s)/mailto/relative, images off |

## Checklist before handing in

- [ ] Every view against [docs/dashboard-guidelines.md](docs/dashboard-guidelines.md): one question, no explanatory or disclaimer text on the screen, no sentences in tiles, rows, cells or titles, no number twice; your caveats and open points are in the hand-in report.
- [ ] Imports only from `/tarn/js/tarn.js`; no own CSS with colours/sizes; no new components in the board.
- [ ] No visible text in the code (only `t()` and `messages`); a catalog per offered language with the same keys.
- [ ] `node --test tests/*.test.mjs` green (for kit changes also new tests for pure functions).
- [ ] Kit code: `// @ts-check` at the top, options as `@typedef`, `node tools/verify.mjs --types` green; no `@ts-ignore`, no `any` except where a comment says why.
- [ ] For kit changes `node tools/verify.mjs` green (see “Verification”), for timing changes additionally `tools/tempo.mjs` with a
      before/after table.
- [ ] `tools/shoot.mjs --out <folder-outside-the-repo>` (a running board: pass its `http://host:port/…` URLs, Node fetches them; `--attach` only for a visible Chrome) for the overview, a list, an
      open detail (`?open=…`), in two languages – **no** console/CSP errors, **no** overflow, phone and desktop, light and dark.
      Look at a few images yourself, dark first.
- [ ] Every action gives feedback (toast or `actionRun`); every dangerous one goes through `confirm()`; forms show errors on the fields and cannot be submitted twice.
- [ ] Empty, loading and error state of every view checked (e.g. empty the fixture, wrong URL).
- [ ] Long names/paths wrap or are truncated (`…`), nothing makes the page wider; long words are never broken letter by letter.
- [ ] Back closes the detail; `#/view?open=id` opened directly shows it.
- [ ] A control that changes what a view shows (tab, switch, filter, sort) is clicked in the check and the content read afterwards, not only opened by link.
- [ ] For kit changes: gallery entry added and gallery + sample board re-checked (it affects all boards).
