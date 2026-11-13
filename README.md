# Tarn

> **Information over decoration. Dense, calm, unambiguous, instant.**
> Overview first, details on tap. Colour only when it means something. Motion short and only for orientation.
> If a building block is missing, it goes into the kit, not into the board.

Tarn is a small design system and component kit for **personal operations interfaces** – the kind of screens you let a coding
agent build for you instead of running big tools (Jenkins, Jira, Grafana) of which you use ten percent: monitoring, starting
pipelines and deployments, evaluations, logs, files, tickets. Dense, unambiguous, always the same look, and automatically
checkable (`verify`). Agents assemble a board from a few known parts; if a part is missing, it is added to the kit.

Not a goal: a general app framework, shops, logins, payments, SEO pages.

Plain ES modules and CSS custom properties – **no build step, no npm packages, no third-party frontend libraries**, CSP-friendly
(`script-src 'self'; style-src 'self'`, no `innerHTML`, no inline styles). Look: a dense ops-console style, dark grey, small, dense,
hairlines instead of shadows, status dots, zebra rows, 13 px body text. Light follows the system and can be switched manually
(system → light → dark).

For agents that build a board: **read [AGENTS.md](AGENTS.md) first.**

## The four levels

| Level | What | Examples |
|---|---|---|
| **Tokens** | colours, spacing, type, motion, icons, formatters, texts | `css/tokens.css`, Lucide icons, `fmt*()`, `t()` |
| **Primitives** | small self-contained controls | `button`, `iconButton`, `badge`, `statusDot`, `segmented`, `tabs`, `tooltip`, `progress`, **inputs** (`textField`, `numberField`, `select`, `combobox`, `checkbox`, `toggle`, `dateField`, `dateRange`, `field`) |
| **Components** | composed blocks | `card`, `section`, `statTile`, `list`, `kv`, `table`, `filterBar`, `banner`, `log`, `menu`, `toast`, sheet/panel, `markdown`, `dataCard`, `form`, `confirm`, `actionRun`, charts |
| **Shell** | the frame around a board | `createApp`, `dataSource`, board switcher, language menu, install button, notifications (browser half) |

The gallery (`gallery/`) is grouped by these levels and shows every building block in all its states, light and dark. The navigation names the part: groups `Core · Tokens`, `Core · Primitives` (incl. inputs and `form`), `Shell · Components`, `Shell · App frame`.

## Core and shell

The kit has two parts in one repository. The **core** (tokens, fonts, icons, base CSS, formatting/i18n/dom helpers, primitives, inputs and
`form`) works on any website without the shell. The **ops shell** (everything that only makes sense in boards: cards, tables,
charts, sheets, data source, router, `createApp`) builds on the core. Direction of imports: the core never imports the shell (lint rule
`layers`, see [Verification](AGENTS.md)). The classification lives in one file, `tools/lib/kit-files.mjs`; lint rule `classified` fails when a
`css/` or `js/` file is missing there.

| Part | Files | Provides |
|---|---|---|
| **core** | `css/tokens.css`, `fonts.css`, `base.css`, `core.css` | tokens, fonts, reset, focus, helper classes · button, badge, status dot, segmented, tabs, progress, tooltip, inputs, form |
| **core** | `js/core.js` (entry point), `js/version.js`, `theme-init.js`, `dom.js`, `press.js`, `overlay.js`, `density.js`, `format.js`, `i18n.js`, `locales/<lang>.js` (core texts), `icons.js`, `icons-data.js`, `favicon.js` | `h`, `icon`, `t`, `fmt*`, overlay layer, press feedback, theme/locale boot |
| **core** | `js/primitives.js` | `button`, `iconButton`, `badge`, `statusDot` |
| **core** | `js/controls.js` | `segmented`, `tabs`, `progress`, `tooltip` |
| **core** | `js/inputs.js`, `inputs-data.js`, `form.js` | `field`, `textField`, `numberField`, `select`, `combobox`, `checkbox`, `toggle`, `dateField`, `dateRange`, `form`, validation |
| **shell** | `css/components.css`, `charts.css` | app shell, cards, rows, table, sheet, confirm · log, toast, usage bar, menu, charts |
| **shell** | `js/tarn.js` | the barrel: core and shell together |
| **shell** | `js/components.js` | `card`, `section`, `statTile`, `metricRow`, `list`, `kv`, `facts`, `banner`, `empty`, `error`, `loading`, `tiles`, `toolbarRow`, `cols`, `stack` |
| **shell** | `js/widgets.js` | `log`, `toast`, `usageBar`, `menu` |
| **shell** | `js/table.js`, `filterbar.js`, `filters-data.js`, `confirm.js`, `actionrun.js`, `actions-data.js`, `sheet.js`, `datacard.js`, `markdown.js` | `table`, `filterBar`, `confirm`, `actionRun`, `openSheet`, `dataCard`, `markdown` |
| **shell** | `js/data.js`, `boards.js`, `boards-data.js`, `router.js`, `shell.js`, `charts/` | `dataSource`, board switcher, router, `createApp`, charts |

Two entry points, two stylesheet sets:

| Page type | Scripts and styles | Import |
|---|---|---|
| plain website (core only) | `theme-init.js`, `css/tokens.css`, `fonts.css`, `base.css`, `core.css` | `import { button, field, textField, form, t, icon } from '/tarn/js/core.js'` |
| board (core + shell) | the same plus `css/components.css`, `charts.css` | `import { createApp, card, table, … } from '/tarn/js/tarn.js'` (re-exports `core.js`) |

`starter/` is a complete example of a core-only page (`?lang=de` switches the language); lint rule `layers` makes sure it never loads shell files, and verify checks it like a board (geometry on all sizes, snapshots, the validation state at `#/errors`).

The kit texts of the shell (`shell.*`, `table.*`, …) sit in the same locale catalogs as the core texts; a page that uses only the core simply never asks for them.

## Quick start

Requirements: Node.js 22 or newer and Python 3 (for the local server) and a Chromium-based browser (only for `verify` and the
screenshot tool). No `npm install`; there is nothing to install.

```sh
git clone <this repository> tarn && cd tarn
python3 tools/serve.py --port 18810          # gallery: /gallery/, sample board: /example/
TZ=Europe/Berlin node --test tests/*.test.mjs                         # unit tests, no browser
node tools/verify.mjs --types                # type check, about a second
node tools/verify.mjs                        # the full check, about five minutes
```

**Start a board:** copy `example/` as the template, copy the kit into it with `node tools/vendor.mjs --to <board>/vendor/tarn`
(see “Include in a project”), and give your coding agent [AGENTS.md](AGENTS.md) together with the gallery. A board is a folder
with an `index.html`, an `app.js` that imports `/tarn/js/tarn.js`, a data source and its texts.

**Tools at a glance**

| Command | Does |
|---|---|
| `node tools/vendor.mjs --to <dir> [--check]` | copies the runtime files of this kit version into a board, or reports local changes |
| `node tools/verify.mjs [--quick] [--types] [--selftest]` | all checks in one command |
| `node tools/lint.mjs` | static kit rules (tokens, no `innerHTML`, texts via `t()`) |
| `node tools/tempo.mjs` | response times against budgets |
| `node tools/shoot.mjs` | screenshots of a page in a chosen size and colour scheme |
| `node tools/brand.mjs`, `node tools/icons.mjs` | board identity (favicon, icons, manifest) and Lucide icons |

## Folders

| Path | Contents |
|---|---|
| `css/tokens.css` | the only source of colours, status, accents, spacing (4 px grid), type, radii, motion, breakpoints |
| `css/base.css`, `fonts.css`, `core.css` (core) · `components.css`, `charts.css` (shell) | reset, focus, scrollbars · fonts · primitives and inputs · components and shell · log/toast/usage/menu and charts |
| `fonts/` | Inter and IBM Plex Mono (woff2, OFL), sources and sha256 in `fonts/SOURCES.md` |
| `icons/`, `js/icons.js`, `js/icons-data.js` | Lucide icons (fixed version, used ones only), `tools/icons.mjs` manages them |
| `js/tarn.js`, `js/core.js`, `js/version.js`, `VERSION`, `CHANGELOG.md` | **the only import for boards** (`tarn.js`, barrel with core and shell) · core entry point for plain pages (`core.js`) · version · changes per version |
| `js/theme-init.js` | classic script in `<head>`, prevents a flash of the wrong scheme |
| `js/shell.js`, `router.js` | app shell (sidebar, toolbar, inspector/panel/bottom sheet), hash router |
| `js/primitives.js`, `controls.js` (core) · `components.js`, `widgets.js`, `table.js`, `filterbar.js`, `sheet.js`, `data.js` (shell) | primitives and core controls · components, data source |
| `js/inputs.js`, `inputs-data.js`, `form.js` (core) · `filters-data.js`, `confirm.js`, `actionrun.js`, `actions-data.js` (shell) | input primitives, forms, confirm, running actions; the `*-data.js` files hold the logic without a DOM (testable in Node) |
| `js/i18n.js`, `js/locales/` | catalog layer `t()` and the kit texts in en, de, es, fr: `<lang>.js` = core texts, `<lang>-shell.js` = shell texts (merged by `locales/shell.js`, which the barrel and the shell files import; `core.js` does not) |
| `js/density.js` | `getDensity()`, `setDensity('compact' \| 'comfortable', { persist })`, `DENSITIES` |
| `js/format.js` | formatting (Intl with the active locale and time zone), sorting, search |
| `js/boards.js`, `boards-data.js` | board switcher (launcher grid as popover/sheet) and its data checks |
| `js/favicon.js` | board icon without a graphic file (SVG data URL) |
| `js/markdown.js` | Markdown parser (AST, testable in Node) and DOM renderer |
| `js/overlay.js`, `datacard.js`, `press.js` | overlay layer (popover in the topmost dialog), data card, press feedback on touch |
| `js/charts/` | `scale.js` (maths, testable), line, bar, sparkline, donut, heat row, timeline |
| `example/` | sample board with a fixture, four languages – **template for new boards** |
| `starter/` | a plain website page (header, text, form, buttons, status line; en/de) built **only from the core**: no shell, no sidebar – template for pages that are not boards; lint and verify cover it |
| `gallery/` | every building block in all states, grouped by level |
| `tools/verify.mjs`, `tools/verify/` | **all checks in one command** (tests, lint, types, DOM geometry, overlays, snapshots, animation inventory) |
| `tools/lint.mjs`, `tools/lint/` | static kit rules (tokens, transitions, no innerHTML, timers, gallery coverage, emoji, visible texts via `t()`, core/shell classification and import direction) |
| `tools/tempo.mjs`, `tools/tempo/` | response times (Event Timing, long animation frames, visibility) against budgets |
| `tools/brand.mjs`, `tools/icons.mjs` | board identity (favicon, PNG icons, manifest) · Lucide icons |
| `tools/vendor.mjs`, `tools/lib/kit-files.mjs` | copies a fixed kit version (`--profile core\|full`) into a board (`vendor/tarn/`), `--check` reports local changes, the version and the profile · the core/shell file lists |
| `tools/serve.py`, `tools/shoot.mjs`, `tools/lib/` | local server with board CSP · screenshots via CDP · shared CDP client and test server |
| `tests/` | `node --test tests/*.test.mjs`; `tests/snapshots/` holds the expected DOM outlines for verify |

## Look locally

```sh
python3 tools/serve.py --port 18810      # 127.0.0.1, no-store, strict CSP
# gallery:       http://127.0.0.1:18810/gallery/
# sample board:  http://127.0.0.1:18810/example/        (?lang=de, es, fr switches the language)
node --test tests/*.test.mjs
```

## Include in a project

Two equal ways. Both give a project one fixed version of Tarn; which one fits depends on whether the project has a package manager and a
bundler. Either way, never edit Tarn files inside the project: a missing building block goes into the kit and arrives with the next update.

| | (a) git dependency | (b) fixed copy |
|---|---|---|
| for | projects with npm (or pnpm, yarn) **and** a bundler | pages and boards without any tooling (like the sample board) |
| how | `npm i github:R0gner/tarn#v<version>` | `node tools/vendor.mjs --to <project>/vendor/tarn [--profile core]` |
| import | `import { button } from '@r0gner/tarn/core'` · `import { createApp } from '@r0gner/tarn'` | `import … from '/tarn/js/core.js'` · `'/tarn/js/tarn.js'` |
| styles | `@r0gner/tarn/css/tokens.css`, `fonts.css`, `base.css`, `core.css` (+ `components.css`, `charts.css`) | `<link href="/tarn/css/…">` |
| pin | the tag in `package.json` (`v0.4.0`), npm records the commit | `VERSION` and `SHA256SUMS` in the copy; `--check` |
| update | change the tag, `npm update @r0gner/tarn` | run `vendor.mjs` again |

### (a) git dependency

The repository root is an npm package (`package.json`: name `@r0gner/tarn`, `private`, `type: module`, no dependencies, no install scripts).
`exports` maps `.` to the full barrel (`js/tarn.js`), `./core` to `js/core.js`, and `./css/*`, `./fonts/*`, `./icons/*` to the files of
those folders; `files` limits the installed package to the runtime files plus `LICENSE`, `NOTICE` and `VERSION` (the same list
`tools/vendor.mjs` copies, kept in `tools/lib/kit-files.mjs`; a test keeps `package.json` equal to it, `node tools/package.mjs` rewrites it).

```sh
npm i github:R0gner/tarn#v0.4.0        # a tag, never a branch: the version stays fixed
```

```js
// a bundler resolves the styles too (Vite, esbuild, webpack …)
import '@r0gner/tarn/css/tokens.css';
import '@r0gner/tarn/css/fonts.css';
import '@r0gner/tarn/css/base.css';
import '@r0gner/tarn/css/core.css';
import { button, field, textField, form, t } from '@r0gner/tarn/core';
```

The classic script `@r0gner/tarn/js/theme-init.js` (no flash of the wrong colour scheme) belongs in the `<head>` as a plain `<script>` that is not bundled;
bundled into the app script it would run after the first paint. `css/fonts.css` refers to the font files relative to itself, so the bundler
must resolve those `url()`s (it does for CSS it processes).

### (b) Fixed copy with `tools/vendor.mjs`

**Every board carries a fixed copy of one kit version in `vendor/tarn/` and serves it under `/tarn/`.** No live mount: a kit
change never reaches a board unnoticed; an update is a deliberate step with a check.

```sh
# first copy and every update, run from a Tarn checkout
node tools/vendor.mjs --to <board>/vendor/tarn
# later: has anyone changed the copy? which version is it?
node tools/vendor.mjs --to <board>/vendor/tarn --check
# a plain page without the shell: core only (no createApp, router, charts, tables), the profile is recorded in SHA256SUMS
node tools/vendor.mjs --to <site>/vendor/tarn --profile core
```

`--profile core|full` (default `full`): `core` copies only the core files (see “Core and shell”) plus `VERSION`, `LICENSE`, `NOTICE`;
`full` adds the ops shell. The first line of `SHA256SUMS` is `# profile: core|full`; `--check` and later updates read it from there, so an
update keeps the profile of the copy unless you pass `--profile` (then files outside the new profile are removed).

`tools/vendor.mjs` copies only what the browser loads (`css/`, `js/`, `fonts/` with the font licences, `icons/` svg files, licence and sources
list) plus `VERSION`, `LICENSE` and `NOTICE`, and writes `SHA256SUMS` (the record of what was copied; `sha256sum -c SHA256SUMS` works
inside the folder). It never writes into the Tarn repository and leaves files it does not know alone.
Exit codes: 0 done or copy intact · 1 local changes (check) or update refused · 2 usage or environment error.

**Update:** the tool refuses to overwrite a copy whose files were changed locally (compare with `--check`; `--force` overwrites anyway,
`--dry-run` shows what would change). Then: read `CHANGELOG.md` for the versions in between, run the update, run the board's own
checks (`node <kit>/tools/verify.mjs --board <board> --base http://127.0.0.1:<port>`, see “Check a board outside the kit”), review the snapshot diff, commit the copy together with
the board changes it needs. Never edit files in `vendor/tarn/`; a missing building block goes into the kit and arrives with the next copy.
The pinned version is also available at runtime: `import { VERSION } from '/tarn/js/tarn.js'`.

The board server serves `GET /tarn/<path>` from `vendor/tarn/` (same path check as for its own static files,
`Cache-Control: no-cache`). The board then imports only:

```html
<script src="/tarn/js/theme-init.js"></script>
<link rel="stylesheet" href="/tarn/css/tokens.css">
<link rel="stylesheet" href="/tarn/css/fonts.css">
<link rel="stylesheet" href="/tarn/css/base.css">
<link rel="stylesheet" href="/tarn/css/core.css">
<link rel="stylesheet" href="/tarn/css/components.css">
<link rel="stylesheet" href="/tarn/css/charts.css">
<link rel="icon" type="image/svg+xml" href="favicon.svg">
<script type="module" src="app.js"></script>   <!-- import { … } from '/tarn/js/tarn.js' -->
```

Reason for serving it from the board itself: same origin, so a CSP with `'self'` fits without exceptions and without CORS.

## Density: compact and comfortable

Two densities, the same tokens with other values (`css/tokens.css`, nothing per component):

- **compact** (default): the dense ops-console look.
- **comfortable**: for a car touchscreen or a big finger: larger type, more space, **every interactive element ≥ 48 px**, stronger
  contrast. Switch with `<html data-density="comfortable">` (a page sets it itself, like `starter/`), `setDensity('comfortable', { persist: true })`
  (stored as `tn-density`, applied by `theme-init.js` before the first paint) or in a shell board with `createApp({ densitySwitch: true })`
  (button next to the theme switch, as in the gallery). It does not depend on the pointer: a car screen may report a fine pointer.

Components never branch on the density (lint rule `density`: `data-density` only in `css/tokens.css`); a control that must change gets a token.

| Token | compact | comfortable |
|---|---|---|
| `--tn-fs-xs` / `-section` / `-label` / `-body` / `-lg` / `-stat` / `-input` | 11 / 11.5 / 12 / 13 / 15 / 20 / 16 px | 13 / 14 / 15 / 17 / 20 / 28 / 18 px |
| `--tn-s1` … `--tn-s8` (spacing) | 4 8 12 16 20 24 32 px | 6 12 16 20 24 32 40 px |
| `--tn-hit` (control), `--tn-input-h` | 28 px (touch 40 / 44) | 48 px, 50 px (field box; its inner element is 48) |
| `--tn-row-h`, `--tn-toolbar-h` | 32 px (touch 44), 44 px (touch 48) | 56 px |
| `--tn-btn-sm-h`, `--tn-seg-h`, `--tn-seg-sm-h`, `--tn-pill-h` | 24, 22, 22, 30 px (touch 36, 34, 34, 40) | 48 px each |
| `--tn-check`, `--tn-toggle-w` × `-h`, `--tn-badge-h` | 18 px, 28 × 16, 18 px (touch 22, 36 × 22) | 28 px, 48 × 28, 24 px |
| `--tn-icon`, `--tn-dot`, `--tn-ring`, `--tn-stroke` | 16, 7, 2, 1.5 px | 20, 10, 3, 2 px |
| `--tn-sidebar-w`, `--tn-inspector-w` | 208, 380 px | 280, 440 px |
| `--tn-text-2`, `--tn-text-3`, `--tn-border`, `--tn-sep`, `--tn-focus`, `--tn-primary`, `--tn-*-text` | (see file) | stronger: secondary text, lines and focus; primary button and status texts ≥ 4.5:1 |

The values are a first set; fine-tuning comes with the first real board. verify checks the core views of the gallery and the starter page in
both densities (phone and desktop, dark and light); in comfortable the rule `touch48` applies without exceptions (own box ≥ 48 px, no hit-area
extension, disabled controls and inline links included, checkbox and toggle count as their whole row) and the selftest shrinks a target to prove it.

## Languages and time zones

The interface is multilingual; the repository is English. Kit texts ship in **en, de, es, fr** (`js/locales/`, English is the
source). Everything else goes through the same layer:

```js
createApp({
  title: () => t('board.title'),
  messages: { en: { 'board.title': 'Maintenance' }, de: { 'board.title': 'Wartung' } },   // board texts, same fallback rule
  locales: ['en', 'de'],        // languages the board offers (default: those with messages, or all kit languages)
  // locale: 'de',              // force one language (then there is no language menu)
  // timeZone: 'Europe/Berlin', // default: the browser's
});
```

- **Choice:** forced `locale` > stored menu choice > `navigator.languages` matched against the offered languages > English.
  `<html lang>` is set (it matters for hyphenation). `?lang=de` overrides for previews and tests.
- **Language menu** (toolbar, next to the theme button): only visible when more than one language is offered and no locale is forced;
  “Automatic” is the first entry; the choice is stored in `localStorage` and applied by reloading.
- **Formats:** `fmt*()`, chart axes and relative times use `Intl.NumberFormat`, `DateTimeFormat`, `RelativeTimeFormat` with the
  active locale and time zone. There is no own translation of number or date formats. Durations use unit names from the catalog.
- **Texts:** `t(key, vars)` with `{name}` placeholders and plural forms (`{ one, other }` with `vars.count`). A missing key shows
  English (and warns in the console); verify reports it. Data (job names, agent reports) is not translated.
- **Rule for boards:** never put visible text in the code; always `t()`. The lint rule `i18n` and the key-parity test
  (`tests/i18n.test.mjs`) enforce it for the kit and the sample board.

## Check: verify

```sh
node tools/verify.mjs                     # everything: tests, lint, types, geometry, overlays, snapshots, inventory (≈ 1 min with 4 workers)
node tools/verify.mjs --types             # only the type check (≈ 1 s)
node tools/verify.mjs --quick             # subset: phone + desktop, dark only
node tools/verify.mjs --only geometry --pages board --views jobs --sizes phone
node tools/verify.mjs --full --selftest   # the full run, then the positive control on its findings: known faults (if any) and all mutants (CSS/JS injection, source patches) must be red
node tools/verify.mjs --selftest --base-report <out>/report.json   # positive control on the report of a full run of exactly this tree (else refused)
node tools/verify.mjs --selftest          # positive control with a base pass of its own
node tools/verify.mjs --changed [<rev>]   # dev loop: only the pages/views that the changed files can affect (all sizes and themes); the full run stays mandatory
node tools/verify.mjs --jobs 2            # number of parallel workers (default min(4, cores/2))
node tools/verify.mjs --only overlay --scenarios combobox,form-submit   # single overlay scenarios
node tools/verify.mjs --attach http://127.0.0.1:<port>   # use a running Chrome (own tab)
node tools/verify.mjs --board <board folder> --base http://127.0.0.1:<port>   # a board outside the kit, see “Check a board outside the kit”
```

- **Density:** the pages `gallery-comfortable` (the core views), `starter-comfortable` and `starter-de-comfortable` run the same geometry and snapshot
  checks with `data-density="comfortable"` set after loading, plus the strict rule `touch48` (never covered by `exceptions.json`); the compact pages pin
  their density explicitly. `--changed` checks a page's comfortable twin with it.
- **CI:** `.github/workflows/verify.yml` runs `node tools/verify.mjs --ci` on every push and pull request (ubuntu-latest, Node 22,
  preinstalled Chrome). `--ci` always starts its own headless Chrome (`--no-sandbox`, throw-away profile) and refuses `--attach`/`--base`.
  `.github/workflows/pages.yml` (manual only) publishes the gallery, the sample board and the start page as a static site.
- Output of at most 10 lines, exit code **0 green, 1 finding, 2 measurement refused/environment broken**. The full report
  (`report.json`) and images only on findings, as paths in the output folder (`--out`, else a temp folder).
- Starts its own headless Chrome (throw-away profile, own PID) with `--jobs` pages, one browser context each, and hands it the kit
  files straight from the repo over CDP (`Fetch.fulfillRequest`, same bytes and CSP headers as `serve.py`): no HTTP server, no
  network, works in sandboxes that cannot open HTTP connections. Geometry, overlay and snapshot states are split into tasks that the
  workers pull; results are merged in task order, so findings, warnings and snapshots do not depend on `--jobs`. With `--attach`
  a running Chrome is used instead (serial; own tab via `/json/new`, only that tab is closed) – the way to go when focus, frames
  or a headed browser matter. The snapshots are taken with visible scrollbars, like in the headed browser.
- **geometry** checks per page (gallery, sample board in en, **de and fr**) × size (`phone` 390×844 touch, `desktop` 1440×900,
  plus narrow `phone-s` 340, `tablet-s` 700 touch, `desktop-s` 1000) × light/dark × view (read from the navigation) and open
  detail: child sticks out of its container, page wider than the viewport, text cut off without “…”, text boxes or flex/grid
  siblings overlap, siblings in a row misaligned, **words broken letter by letter** (`wordbreak`), timeline scrolls sideways,
  touch target < 40 px (hit area measured by `elementFromPoint`), missing translations (`i18n`), every page has
  `<link rel="icon">` and a title “View · Board” (`identity`), console errors. Contrast < 4.5 is a warning only.
- **overlay** opens menu, toast, tooltip, detail, sheet, sidebar, board switcher and install button with real input (tap, click,
  hover, long press), also from an open sheet, and checks: on top (`elementFromPoint`), not inert, focus in the menu or modal
  sheet. Plus behaviour cases: panel from the right (700–999 px) closes by swipe, Esc and Back; a menu does not close on a pure
  height change (address bar) but on a width change; Esc closes the menu inside a sheet first; a tooltip stays on touch and closes
  by tapping elsewhere; data card appears and disappears; hint only on truncated text; combobox (popover on top, keyboard, from a sheet), confirm over a
  sheet, filter sheet (focus stays after choosing), form submit (validation, sent once, running state).
- **types** (`--types`): TypeScript used as a pure type checker over the JSDoc types of `js/` (`jsconfig.json`: `checkJs`, `strict`
  except `noImplicitAny`). The version is pinned in `tools/verify/types.mjs` (`TS_VERSION`) and fetched with `npx` on demand; it is never part
  of the kit and never runs in a browser. Offline the check is skipped with a note (exit code unaffected). The public API is typed with
  `@typedef`s (option objects, return types); every file starts with `// @ts-check`. New building blocks need typed options.
  Positive control: `--selftest` plants two type errors in a temp copy and expects both to be reported.
- **lint** (`tools/lint.mjs`): colours, sizes, radii and durations only from `css/tokens.css`; transitions and animations only
  `transform`/`opacity` (`background-color` on hover); no `innerHTML`/`outerHTML`/`insertAdjacentHTML`; no native `title` tooltips;
  JS timers without number literals; every exported block has a gallery entry; no emoji; **visible texts via `t()`**; every HTML
  page has an icon and a title. Exceptions: `tools/lint/allow.json`.
- **snapshots**: per page × view (plus open details) × `phone`/`desktop` a text outline (element, role, `tn-*`/`is-*` classes,
  text, box rounded to 4 px) under `tests/snapshots/`, clock fixed to 2026-11-09 10:00. A difference is a finding with a diff
  file. `--update` rewrites (deliberately only, reason in the commit). All declared fonts are loaded before measuring, otherwise
  boxes would depend on which view was opened first.
- **tempo** (inventory): `document.getAnimations()` during every test interaction: only `transform`/`opacity`, durations =
  motion tokens, duration within the class budget; plus endless animations. Runs headless.
- Known faults and justified exceptions: `tools/verify/exceptions.json`. Mutants: `tools/verify/mutants.mjs`.

### Check a board outside the kit

A board that lives in its own repository checks itself with the tools of a kit checkout. The board describes itself in one file in its own
folder, `tarn-board.json` (all paths relative to that folder; only `name` and `pages` are required):

```json
{
  "name": "Homelab board",
  "pages": [
    { "id": "main", "path": "/?lang=en", "details": ["jobs?open=a1"] },
    { "id": "main-de", "path": "/?lang=de", "sizes": ["phone", "desktop"], "themes": ["dark"] }
  ],
  "kit": "vendor/tarn",
  "kitUrl": "/tarn/js/tarn.js",
  "clock": "2026-11-09T09:00:00Z",
  "snapshots": "verify/snapshots",
  "exceptions": "verify/exceptions.json",
  "lint": { "dirs": ["."], "skip": ["vendor", "verify"], "allow": "verify/lint-allow.json", "messages": ["messages.js"] }
}
```

Pages as in the kit's `tools/verify/targets.mjs`: `id` (used in findings and snapshot paths), `path` (URL path and query; pin the language with
`?lang=`), `details` (hashes without `#/` that are checked as extra states, e.g. an open detail), `views` (only for a page without shell
navigation, otherwise the views are read from the sidebar), `sizes` / `themes` / `density` (narrower than the default: five sizes, dark and light, compact).
`clock` is the fixed time of the snapshots; `exceptions` and `lint.allow` have the format of the kit's `tools/verify/exceptions.json` and
`tools/lint/allow.json` (each entry with a reason); missing files mean no exceptions. A mistake in the file is reported with the field name (exit 2).

Start the board's server, then, from a kit checkout (any version at or newer than the board's copy):

```sh
node <kit>/tools/verify.mjs --board <board folder> --base http://127.0.0.1:<port>          # everything below, ≤ 10 lines, exit 0 / 1 / 2
node <kit>/tools/verify.mjs --board <board folder> --base http://127.0.0.1:<port> --update  # write the snapshot baseline (deliberately only)
node <kit>/tools/lint.mjs --board <board folder> [-v] [--write-known]                       # only the lint of the board's own files
```

| Check | What a board run does |
|---|---|
| `lint` | the board's own CSS, JS and HTML: colour/size/radius/duration literals (tokens only), transitions, no `innerHTML`, no number timers, no `title` attribute, no emoji, visible texts via `t()` (the files in `lint.messages` are exempt), favicon and title on every page |
| `vendor` | `tools/vendor.mjs --check` on the board's copy (`kit`): local changes, missing or foreign files are findings; names the kit version found (and a note when the checkout is newer); the server must deliver the same `VERSION` under the kit URL |
| `geometry` | overflow, truncated text, overlap, touch targets, words broken letter by letter, missing translations, favicon/title (`identity`), console errors – for every page, size, theme, view and detail |
| `snapshots` | text outline of every view and state against `snapshots`, with the board's fixed `clock` |
| `overlay` | the scenarios that are generic for any shell board: `sidebar` (below 1000 px), `detail` (the first `details` entry with `?open=`), `menu` (opened inside a sheet), `sheet` – on top, not inert, focus, closing |
| `tempo` | animation inventory: endless animations in every view and the animations of those scenarios (only `transform`/`opacity`, durations = tokens, budget class) |

Not part of a board run: the kit's own unit tests, kit lint, types, the gallery and the mutants. Use `--only`, `--skip`, `--pages`, `--views`, `--sizes`,
`--themes`, `--scenarios`, `--quick` and `--jobs` as in the kit run. Snapshots live in the board (commit them with it); screenshots of findings, diffs
and `report.json` go to `--out` (default `<board folder>/.tarn-verify`, it carries its own `.gitignore`), never into the kit. Exit 2 (no verdict) when
the board server does not answer or Chrome cannot start. The page is fed from the board's server through Node over CDP (headers and CSP unchanged),
so the own headless Chrome needs no network of its own.

Positive control: `node tools/verify.mjs --selftest` sets up a copy of `example/` outside the repo as a foreign board (vendor copy, static server);
it must be green, and the same copy with an injected fault (colour literal, `innerHTML`, a card wider than the page, an edited vendor file) must be red.

### Tempo

```sh
node tools/tempo.mjs --attach http://127.0.0.1:<port> [--cases menu-open,sheet-auf] [--save state.json] [--compare state.json] [--table]
node tools/tempo-markdown.mjs --attach http://127.0.0.1:<port>      # 50 KB report with markdown() under 4× CPU (budget 50 ms)
```

- Cases (`tools/tempo/cases.mjs`): menu, toast, tooltip, data card, board switcher, press, segment, tab, sheet open/close, detail
  open/close, sidebar open/close (phone) and desktop. Each case `phone` (touch), `tablet-s` and `desktop` (mouse), CPU 4× and 1×,
  2 warm-up and 7 measured runs, median and max.
- Measured from the triggering event: first visible change (10 %), half, done (98 %) via a rAF sampler of the real element
  state; handler and input → next frame (Event Timing); long animation frames.
- Budgets (4× CPU): first change ≤ 50 ms; menu/tooltip/toast done ≤ 100; panel/sheet open ≤ 150, close ≤ 120 (+1 frame);
  desktop panel and press ≤ 34; handler ≤ 16; no long animation frame > 50; input → frame ≤ 100.
- Exit 0 within budget, 1 exceeded, 2 refused (tab not in front, spread of the first change > 2 frames even after a retry).
  The frame measurement needs a visible Chrome (`--attach`); `--inventory` runs headless.
- Extend: a new check as a module under `tools/verify/`, register it in `verify.mjs` (`CHECKS`); pages and sizes live in
  `tools/verify/targets.mjs`.

### Screenshots

```sh
node tools/shoot.mjs --out <folder-outside-the-repo> [--attach http://127.0.0.1:<port>] \
  "http://127.0.0.1:18810/example/?lang=en#/overview" "http://127.0.0.1:18810/example/#/jobs?open=offsite-sync"
```

Without `--attach` the own headless Chrome answers paths that start with `/` straight from the repo (no server needed):
`node tools/shoot.mjs --out <folder> --sizes phone --themes light "/starter/?lang=de"`. With `--attach` use full `http://127.0.0.1:<port>/…` URLs.

- One PNG per URL × size (`phone` 390×844 @3 touch, `desktop` 1440×900; `--sizes tablet` or `800x600@1t`) × scheme (`dark`, `light`).
  `--full` full page height, `--eval JS` e.g. a click before the capture.
- Reports console errors (including CSP violations, 404, exceptions), Chrome error pages and page overflow. Exit 1 on problems.
  `--out` is required and must be outside the repo; `--attach` as with verify.

## API in short

All functions return DOM elements; status is always `'ok' | 'warn' | 'bad' | 'unknown' | 'pending' | 'info' | 'off'`, chart
colours only as token names (`blue green orange purple pink graphite` or a status). In detail with examples: the gallery
(code under every component) and the JSDoc in the modules.

| Area | Functions |
|---|---|
| Shell | `createApp({ title, icon, boards, categories, boardId, locale, fallbackLocale, locales, messages, timeZone, views: [{ id, label, group?, icon, render(ctx), detail?(id, ctx), count?(ctx) }], source })` → `app.go(view, { open })`, `app.open(id)`, `app.closeDetail()`, `app.refresh()`, `app.setCount(view, n, tone)` |
| Data | `dataSource({ url, interval, staleAfter, parse, ageOf })` → `.start()`, `.reload()`, `.subscribe(fn)`, `.state` |
| Primitives | `h()`, `s()`, `icon()`, `statusDot()`, `badge()`, `button()`, `iconButton()`, `segmented()`, `tabs()`, `tooltip()`, `progress()`, `field()`, `textField()`, `numberField()`, `select()`, `combobox()`, `checkbox()`, `toggle()`, `dateField()`, `dateRange()` |
| Components | `card()`, `section()`, `tiles()`, `statTile()`, `cols()`, `stack()`, `toolbarRow()`, `metricRow()`, `list()`, `kv()`, `facts()`, `table()`, `filterBar()` (types options, bool, range, time) + `matchFilters()`, `form()`, `confirm()`, `actionRun()`, `matchQuery()`, `banner()`, `empty()`, `error()`, `loading()`, `toast()`, `menu()`, `usageBar()`, `log()`, `dataCard()`, `openSheet()`, `markdown()` |
| Charts | `lineChart()`, `barChart()`, `sparkline()`, `donut()`, `heatRow()`, `timeline()`, `scale.*` |
| Boards and identity | `boardSwitcher()`, `boardGrid()`, `boardIcon()`, `favicon({ icon, color })` |
| Texts and formats | `t()`, `setLocale()`, `addMessages()`, `fmtNum fmtPct fmtBytes fmtDuration fmtAgo fmtTime fmtDate fmtDay fmtShort fmtFull fmtWhen`, `sortRows`, `STATUS_TEXT`, `STATUS_RANK` |

## Layout behaviour

| Width | Sidebar | Detail (`#/view?open=id`) | Tables |
|---|---|---|---|
| ≥ 1000 px | fixed, collapsible (remembered) | inspector on the right, not modal | table |
| 700–999 px | overlay via burger | panel from the right over the list (modal, scrim; Back, Esc and swipe right close) | table, list in a narrow container |
| < 700 px | overlay via burger, swipe left closes | bottom sheet, swipe down closes, background locked | two-line list |

Back closes the detail. Tables switch to the list themselves when the container is narrower than 600 px or the columns no
longer fit (measured, no sideways scrolling). Touch targets ≥ 40 px (`pointer: coarse`), animation only `transform`/`opacity`,
`prefers-reduced-motion` switches motion off. The timeline fits the container width (no sideways scrolling); below 560 px the
name sits above the track.

## Overlays, hover and motion

- **Overlay layer** (`js/overlay.js`): menu, toast, tooltip and data card hang in the topmost open modal dialog (else `<body>`)
  and are lifted into the top layer with the Popover API (`popover="manual"`). They sit above open sheets, are not inert and
  refer to the viewport (a sheet has a `transform`). Needs at least Chrome 114, Safari 17, Firefox 125. Esc closes the topmost.
- **Hover concept**, two kinds in the same card style: the **data card** (`dataCard()`: line/area, bars, heat map, timeline bars,
  usage segments) shows content you only see by pointing – mouse instantly and gone on leave; touch: tap shows, drag scrubs, tap
  elsewhere or scrolling closes; if the element has an action, on touch the second tap triggers it. The **hint** (`tooltip()`,
  automatic for `.tn-ellipsis`) is smaller and delayed (mouse 350 ms, focus 150 ms, touch long press 500 ms, then stays 1.5 s):
  only for icon-only buttons (`iconButton`, `button` without text bring it along) and for truncated text. Fully visible text
  gets no hint. No native `title` attributes in the kit (name via `aria-label`). Sparkline and donut have no hover.
- **Lead** `--tn-t-lead` (−16 ms): panels, sheets and the sidebar start with a negative transition delay so that the first painted
  frame already shows motion (otherwise “first change” exceeds the 50 ms budget on phones).
- **Scrollbar space** (`html { scrollbar-gutter: stable }`): when the background is locked the layout would otherwise jump by the
  scrollbar width and the whole page be recomputed (panel on desktop: 104 → 56 ms to the frame).
- **Motion**: hover and press are instant (on touch `js/press.js` marks the pressed element with `.is-down`), menu, toast, tooltip
  and data card show in the first frame (no `requestAnimationFrame`). Only panels, sheets and the sidebar animate, only
  `transform`/`opacity`: `--tn-t-open` 150 ms, `--tn-t-close` 120 ms (JS reads the same tokens, `prefers-reduced-motion`: 0 ms),
  plus the endless animations `--tn-t-loop-*`.

## Fonts

Local in `fonts/` (Latin subset, woff2, 78 KB together, `font-display: swap`): Inter (variable, 400–600) and IBM Plex Mono
(400, 500), both SIL OFL 1.1 (texts and sources with sha256: `fonts/SOURCES.md`). `css/fonts.css` includes them; the main font
is preloaded with `<link rel="preload">` (see `example/index.html`). The system stack stays the fallback in `css/tokens.css`.

## Markdown (`markdown()`)

`markdown(text, { compact, images })` shows agent reports: headings, paragraphs, **bold**, *italic*, ~~strikethrough~~, `code` and
code blocks (scroll sideways), quotes, nested lists, task lists, GFM tables (scroll sideways), rule, links and autolinks. Own
parser (`parseMarkdown()` returns an AST, `renderMarkdown()` builds DOM nodes), no library, never HTML from strings: **raw HTML in
the text appears as text**. Links only `http`, `https`, `mailto` and relative (`javascript:`, `data:`, `//host` become plain
text), external ones with `rel="noopener noreferrer"`; images are off (alt text), with `images: true` only relative paths.
`compact` is the dense variant for sheets and the inspector. From 20,000 characters the block sets `.is-long`
(`content-visibility: auto`) so that only the visible part is laid out. Measurement: `node tools/tempo-markdown.mjs --attach …`
(50 KB, 4× CPU: build ≈ 28 ms, with layout ≈ 46 ms; budget 50 ms). Tests: `tests/markdown.test.mjs`.

## Inputs

All inputs share one contract (the root element is returned): `el.focusEl` (the focusable element), `el.getValue()`, `el.setValue(v)` (no
`onChange`), `el.setInvalid(bool)`, `el.setDisabled(bool)`; the bubbling `input` and `change` events fire as usual. Touch targets are
44 px on the phone (`--tn-input-h`), numbers and dates use the native `<input>` (right keyboard and picker), only the combobox has its
own popover (overlay layer, so it also works inside a sheet).

```js
import { field, textField, numberField, select, combobox, checkbox, toggle, dateField, dateRange } from '/tarn/js/tarn.js';

field({ label: t('job.name'), help: t('job.nameHelp'), required: true }, textField({ value: job.name, placeholder: 'offsite-sync' }));
field({ label: t('job.timeout') }, numberField({ value: 30, unit: 'min', min: 1, max: 120 }));        // min/max validated on change
field({ label: t('job.host') }, combobox({ options: hosts.map((x) => ({ value: x.id, label: x.name, hint: x.role })), value: 'nas-a' }));
field({ label: t('job.hosts') }, combobox({ options, multiple: true, value: [] }));                  // checkmarks, stays open
field({ label: t('job.period') }, dateRange({ from, to, onChange: ({ from, to }) => … }));            // presets today, 7 d, 30 d, month
checkbox({ label: t('job.dry'), help: t('job.dryHelp'), checked: true });   toggle({ label: t('job.enabled'), onChange: (on) => … });
```

- `field()` adds label, help and error text, `aria-describedby`, `aria-invalid` and **validation** (`rules: { required, min, max, minLength,
  maxLength, pattern, number, validate }`): it runs when a value is committed and re-runs while an error is shown. Texts come from the catalog
  (`validate.*`), a custom `validate(value)` returns its own text.
- `select()` is native and for up to about 8 options; more options → `combobox()` (search from 7 options, single or multiple choice, arrow keys,
  Enter, Esc closes the popover first, lists of more than 100 matches show the first 100). On touch devices the search field is not focused
  automatically (the keyboard would cover the list).
- Dates are calendar days (`'YYYY-MM-DD'`, no time zone); `dayStart(day, timeZone)` turns them into a point in time.
- Pure logic without DOM (`js/inputs-data.js`): `parseNumber` (decimal comma and point), `validateValue`, `filterOptions`, `rangeFromPreset`, `dayStart`.

## Filters

`filterBar({ filters })` filters by data type; the type decides the control in the filter sheet and the chip text:

| `type` | Control | State value | Chip |
|---|---|---|---|
| `options` (default) | pills, from 9 values a combobox (`pills: n` changes the threshold) | `string[]` | `Status: Error` |
| `bool` | segment *All · Yes · No* (`labels: { yes, no }`) | `true` / `false` | `Failed: Yes` |
| `range` | from/to number fields with `unit` | `{ min?, max? }` | `Duration ≥ 10 min`, `10–20 min` |
| `time` | presets (`presets: ['1h', '24h', '7d']`, also `6h`, `30d`) plus an own period | `{ preset }` or `{ from?, to? }` (days) | `Last run: last 24 hours` |

```js
const fb = filterBar({
  placeholder: t('jobs.search'), value: state, onChange: (s) => { state = s; render(); },
  filters: [
    { key: 'status', label: t('col.status'), options: STATUS_OPTIONS },
    { key: 'failing', label: t('jobs.failing'), type: 'bool' },
    { key: 'duration', label: t('col.duration'), type: 'range', unit: 'min' },
    { key: 'last', label: t('col.lastRun'), type: 'time', presets: ['1h', '24h', '7d'] },
  ],
});
rows.filter((row) => matchFilters(row, state.f, (row, key) => ({ failing: row.fails > 0, duration: row.sec / 60, last: row.lastAt })[key] ?? row[key]));
```

`matchFilters(row, f, get?, { now? })` handles every type (the type follows from the value; a row without a number or time does not match a
range or time filter); calls without a `type` keep working. The filter sheet has one calm group per filter with its own *Clear*; the controls are
created once and only synchronised afterwards, so the focus stays where the user is.

Long results: `table({ pageSize })` draws the first 20 rows (default; `0` = all) and a *Show more* footer (“20 of 339 rows”) adds the next ones – drawing
rows, not filtering, is what costs time (1,000 rows filtered and drawn: ≈ 560 ms before, ≈ 35 ms handler at 4× CPU now; tempo case `filter-apply-1000`).

## Forms and actions

```js
import { form, confirm, actionRun, openSheet, toast } from '/tarn/js/tarn.js';

const f = form({
  fields: [
    { name: 'host', type: 'combobox', label: t('dep.host'), required: true, options },
    { name: 'version', label: t('dep.version'), required: true, rules: { pattern: /^\d+\.\d+\.\d+$/ } },
    { name: 'dry', type: 'checkbox', label: t('dep.dry'), value: true },
  ],
  submitLabel: t('dep.start'),
  onSubmit: async (v) => {
    if (!(await confirm({ title: t('dep.confirm', v), danger: !v.dry, typeToConfirm: v.dry ? undefined : v.host }))) return;
    const run = await api.deploy(v);                      // { errors: { version: '…' } } or { error: '…' } reports a failure
    box.replaceChildren(actionRun({ source: `/api/runs/${run.id}`, title: …, onCancel: () => api.cancel(run.id) }));
    toast(t('dep.started'), { tone: 'ok' });
  },
});
```

- **`form()`** validates all fields first (errors on the fields, focus on the first one, “Please fix the marked fields.”), then the submit button
  shows *Running …*, the fields are locked and a second submit (click, Enter, double tap) is ignored until `onSubmit` has finished. A returned
  `{ errors, error }` or a thrown error shows up on the fields or in the form; the values stay. In a sheet pass the buttons as footer:
  `openSheet({ body: f, footer: f.buttons() })` (they are linked to the form, Enter submits).
- **`confirm({ title, text, danger?, typeToConfirm?, confirmLabel? })`** → `Promise<boolean>`: a centred modal dialog above everything, including open
  sheets. `danger` puts the focus on *Cancel*; `typeToConfirm` keeps the confirm button off until the text (e.g. the host name) is typed exactly.
- **`actionRun({ source, title, intervalMs, onCancel, onDone })`**: status badge, elapsed time, progress (a bar with a percentage if `progress` is
  known, otherwise indeterminate), live log (`log()`, sticks to the bottom unless the user scrolls up) and an optional *Cancel run* button.
  `source` is a function or a same-origin URL returning `{ status: 'pending'|'running'|'ok'|'bad'|'cancelled', startedAt?, endedAt?, progress?,
  log?: [{ t, level, text }], message? }`; it is polled every 2 s until the status is final or the element leaves the page (no WebSocket needed);
  a failing poll shows a note and retries, after 8 failures it offers *Try again*.
- Rule for boards: **every action gives feedback** (`toast` or `actionRun`), **every dangerous action asks first** (`confirm`). The sample board’s
  *Deploy* view shows the whole path with a fixture (`example/deploy-steps.json`; nothing is deployed).

## Identity, icons, installing

- **Every board has its own favicon (SVG) and a descriptive title** (`View · Board`, the shell sets it). Lint (`page`: every HTML
  page has `<link rel="icon">` and `<title>`) and verify (`identity`) check it, a self-test mutant guards the rule.
- **`node tools/brand.mjs --name "My board" --icon server --accent purple --out <folder>`** creates `favicon.svg` (rounded square
  in card grey with a hairline and a single-colour Lucide symbol in the accent colour, light/dark via `prefers-color-scheme`),
  `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (180 px) and `manifest.webmanifest`. A headless
  Chrome renders the PNGs via CDP (no image library; on hosts without their own Chrome use `--attach`). With
  `--source <svg> --bg <colour>` use an existing drawing instead of a symbol (that is how `gallery/` was made from
  `icons/logo.svg`). Without any graphic file: `favicon({ icon, color })` or `createApp({ icon: { icon, color } })`.
- **Icons**: Lucide (ISC) in a fixed version, only used symbols in `icons/`, sources and sha256 in `icons/SOURCES.md`, runtime
  file `js/icons-data.js` (generated). New symbol: `node tools/icons.mjs add <lucide-name> [--as <kit-name>]`;
  `node tools/icons.mjs check` and `tests/icons.test.mjs` verify that generated files and sources match.
- **Installing**: “Install as app” sits at the bottom of the sidebar and appears when the browser offers
  `beforeinstallprompt`, or – on iPhone, iPad and Safari on the Mac, which have no prompt – as the Add-to-Home-Screen hint (see “Notifications”); after installing (`appinstalled`) and in standalone mode (also iOS `navigator.standalone`) it is gone.
  In the board's `<head>`: `<link rel="manifest" href="manifest.webmanifest" crossorigin="use-credentials">` (the pages sit
  behind a login proxy, the manifest needs the cookies). **Chrome offers installation without a service worker**:
  `Page.getInstallabilityErrors` returns an empty list for gallery and sample board and the real `beforeinstallprompt` arrived
  without a service worker. Hence the kit has none by default (and no offline cache); the only worker it offers is `js/push-sw.js`, for notifications, and a board opts in.

## Notifications (web push, browser half)

The kit brings the browser half of notifications as an optional shell module; **sending stays with each board's backend**.

```js
createApp({ notifications: { api: '/api/push' } })        // sidebar entry "Notifications" → settings sheet
openNotifications({ api: '/api/push' })                   // the same sheet without the shell (any page)
const n = notifications({ api: '/api/push', worker: '/sw.js', scope: '/', query: { data: token } })   // controller + n.open()
```

Options: `api` (base URL of the server interface, required), `worker` (URL of the service worker file, default `sw.js` relative to the page),
`scope` (default: the folder of the worker), `query` (parameters added to every server call, e.g. a token), `env` (the browser; only for tests and
demos, see below). The sheet has one text for every state: *not supported by this browser* · *no https* · *iPhone/iPad, not installed yet* (Share →
Add to Home Screen; iOS only offers notifications to an installed app) · *server does not push* · *server not reachable* (with *Check again*) ·
*service worker did not start* · *blocked* (how to allow it again in the browser or system settings) · *off / not asked yet* (the button that asks,
**the browser prompt only ever follows a tap**) · *on* (send a test notification, turn off). All texts in en, de, es, fr.

**Server interface** (JSON, same origin, the page's cookies; `<api>` is the base URL):

| Call | Body | Answer |
|---|---|---|
| `GET <api>/key` | – | `{ "enabled": true, "publicKey": "<VAPID public key, base64url>" }`; `enabled: false` = the server does not push |
| `POST <api>/status` | `{ "endpoint": "…" }` | `{ "known": true \| false }` – does the server still know this subscription? If not, the page subscribes again quietly |
| `POST <api>/subscribe` | `{ "subscription": <PushSubscription.toJSON()>, "label": "Android, Chrome" }` | any 2xx |
| `POST <api>/unsubscribe` | `{ "endpoint": "…" }` | any 2xx (the page ignores a failure) |
| `POST <api>/test` | `{ "endpoint": "…" }` | `{ "ok": true }` or `{ "ok": false, "error": "…", "gone": true \| false }` – with any status; `gone: true` makes the page drop the subscription |

An error answer is a non-2xx status, optionally `{ "error": "text" }` (shown to the user). Deliberate difference to a "GET status": the status call is a
**POST** because the endpoint URL is a capability (anyone who has it can push to the device) and does not belong into URLs and access logs. This is exactly
what the parcel board already serves (`/api/push/key|status|subscribe|unsubscribe|test`), so it needs no server change; the same board's extra field
`events` in the key answer is ignored by the kit (per-event settings are the board's own business).

**Service worker** `js/push-sw.js` (push only: no offline cache, no `fetch` handler):
- `push` shows title, text, icon and `tag` from the message `{ "title", "body", "tag"?, "url"?, "icon"?, "renotify"?, "ts"? }` (a new message with the same `tag`
  replaces the old one and alerts again unless `renotify` is `false`; no title → the host name; relative `url`/`icon` resolve against the scope);
- `notificationclick` focuses an open window of the board and navigates it to `url`, else opens `url`.
- **The board serves this file from its own root**, not from `/tarn/`: a worker only controls the folder it is served from, and `Service-Worker-Allowed`
  is easy to forget. So: `GET /sw.js` answers with the bytes of `vendor/tarn/js/push-sw.js` (`Content-Type: text/javascript`, `Cache-Control: no-cache`); the
  scope is then `/`. A board under `/board/` serves it as `/board/sw.js` (scope `/board/`) and passes `worker: '/board/sw.js'`; a board that must
  serve it from a deeper path adds the header `Service-Worker-Allowed: /` and passes `scope`. The browser compares the file byte for byte on every
  visit, so a kit update reaches the devices by itself. The icon of a notification is `icon-192.png` next to the worker unless the message names another.

**What a board has to do**, in short: (1) implement the five calls (VAPID keys, a table of subscriptions, a sender such as `pywebpush`/`web-push`),
(2) serve `push-sw.js` from its root, (3) `createApp({ notifications: { api } })`, (4) send messages in the format above. The same applies when moving the parcel board to
Tarn: keep `api/push/*` as it is, serve `vendor/tarn/js/push-sw.js` as `/sw.js` (the board already sends `Service-Worker-Allowed: /` and the same
message format), pass its token as `query: { data }`, drop its own `meldungen.js` and sheet.

Without the shell: `openNotifications({ api })` needs only the barrel (or `notifications.js`, its data file and the core). `createNotifications({ api, env })` is the logic
without any DOM; `env` replaces every browser API (`serviceWorker`, `PushManager`, `Notification`, permission, `fetch`, user agent, standalone), which is
how the tests and the gallery run every state: `gallery/mock-push.js` is a mocked browser plus an in-memory backend.

**Install hint:** where the browser has no install prompt – iPhone and iPad (any browser), Safari on the Mac – the “Install as app” entry stays and opens a
sheet with the steps (Share → Add to Home Screen / File → Add to Dock) instead of being absent; in an installed app it is gone.

**Phone toolbar:** below 600 px the toolbar keeps only the burger, the view title, the freshness text and **one settings entry** (theme, density, language in one
sheet); the separate buttons stay on larger screens, the reload button gives way to the freshness text (itself a reload button), and the freshness text gives
way before the view title does. Verify rule `toolbar-title` (360–599 px) fails when a toolbar crowds the view title out; mutant `toolbar-crowded` plants the old layout.

Checks: the overlay scenarios `notifications` (every state through the gallery's mock, the flow tap → prompt once → on → test → off, nothing asked before the tap),
`install-hint` (iPhone user agent, no prompt) and `settings-phone`; `tests/notifications.test.mjs` (state machine, server calls, platform detection, the service worker with a
mocked scope); mutants `notifications-ask-on-open`, `install-hint-absent`, `toolbar-crowded`.

## Multiple boards (board icon and switcher)

Whoever runs several boards gives each one an icon in the sidebar header and lets the title become a switcher:

```js
createApp({
  title: 'Maintenance',
  icon: './favicon.svg',                       // URL (the file from tools/brand.mjs) or { icon: 'server', color: 'blue' }
  boardId: 'maintenance',                      // current board (accent ring, aria-current)
  boards: '/boards.json',                      // or directly [{ id, name, href, icon?, category? }, …]
  categories: [{ id: 'operations', label: 'Operations' }, { id: 'home', label: 'Home' }],   // optional, order
});
```

- **When it makes sense:** from two boards in the same host group. Without `boards` (or with a single entry) the title stays
  static, with `icon` alone only the icon precedes it. Entries may also point to pages without tarn (plain link).
- **`icon`**: a URL shows the file (the `<link rel="icon">` stays in the HTML), an object `{ icon, color }` also sets the favicon
  (`favicon()`): one way for tab and header. Boards without an icon in the list get a letter tile in a fixed colour from the name.
- **Data format:** `boards` is an array or `{ boards, categories }`. A string is a JSON file of the **same origin**, loaded on first
  open and cached; errors show a hint in the switcher instead of crashing. **One shared JSON file per host group** (every board
  includes the same URL) keeps the list in one place. Entries without `id`, `name` or `href`, with a duplicate `id` or an unsafe
  address (only http, https, relative) are dropped (hint in the console); entries with an unknown or missing category are listed
  under “Other”; without `categories` a flat grid.
- **Use:** tiles are real links (middle click and Ctrl-click open a new tab). From 700 px a popover under the title (overlay
  layer, up to 70 vh, scrolls inside), below a bottom sheet. Enter/Space opens, arrow keys and Home/End move through the grid,
  Esc closes and returns focus to the title, a click outside closes. Tile names never break letter by letter: one word gets an
  ellipsis plus hint, several words wrap at word boundaries up to two lines.
- **Checks:** `tests/boards.test.mjs` (data), overlay scenarios `board-switcher` and `detail-board-switcher`, tempo case
  `switcher-open`, mutant `switcher-without-current`.

## Licence

Tarn is released under the [MIT licence](LICENSE), copyright (c) 2026 R0gner. The bundled Lucide icons (ISC), Inter and IBM Plex
Mono (SIL Open Font License 1.1) keep their own licences; see [NOTICE](NOTICE) and the licence texts in `fonts/` and `icons/`.
