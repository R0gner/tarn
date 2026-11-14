# Getting started

How to run the kit locally, how a board gets a fixed copy of it, what is in the repository and what belongs into the kit. For anyone who
starts a board or a plain page; the other pages of the [index](README.md) assume you know this one.

## Run it locally

Requirements: Node.js 22 or newer, Python 3 (the local server) and a Chromium-based browser (only for `verify`, `shoot` and `tempo`). There is no
`npm install`; nothing is installed.

```sh
git clone https://github.com/R0gner/tarn tarn && cd tarn
python3 tools/serve.py --port 18810      # 127.0.0.1, no-store, strict CSP; --bind and --root exist too
# gallery:       http://127.0.0.1:18810/gallery/
# sample board:  http://127.0.0.1:18810/example/     (?lang=de, es, fr switches the language)
TZ=Europe/Berlin node --test tests/*.test.mjs      # unit tests, no browser
node tools/verify.mjs --types                      # type check, about a second
node tools/verify.mjs                              # the full check, see checks.md
```

The gallery shows every building block in all its states, light and dark, grouped by level. The sample board (`example/`) is a complete board with
fixture data in four languages and the template for new ones.

## Tools at a glance

| Command | Does |
|---|---|
| `node tools/vendor.mjs --to <dir> [--check]` | copies the runtime files of this kit version into a board, or reports local changes |
| `node tools/verify.mjs [--quick] [--types] [--selftest]` | all checks in one command ([checks](checks.md)) |
| `node tools/lint.mjs` | static kit rules (tokens, no `innerHTML`, texts via `t()`) |
| `node tools/tempo.mjs` | response times against budgets |
| `node tools/shoot.mjs` | screenshots of a page in a chosen size and colour scheme |
| `node tools/judge.mjs` | optional: a decision model marks screenshots that look broken ([visual judge](visual-judge.md)) |
| `node tools/brand.mjs`, `node tools/icons.mjs` | board identity (favicon, icons, manifest) and Lucide icons ([identity](identity.md)) |
| `node tools/package.mjs [--check]` | keeps `package.json` `files` equal to the kit file lists |

## Start a board

Copy `example/` as the template, put a fixed copy of the kit into it (below) and give your coding agent [AGENTS.md](../AGENTS.md) together with the
gallery. A board is a folder with an `index.html`, a module script that imports `/tarn/js/tarn.js` (`board.js` in the sample board), a data source and its texts.

## The four levels

| Level | What | Examples |
|---|---|---|
| **Tokens** | colours, spacing, type, motion, icons, formatters, texts | `css/tokens.css`, Lucide icons, `fmt*()`, `t()` |
| **Primitives** | small self-contained controls | `button`, `iconButton`, `badge`, `statusDot`, `segmented`, `tabs`, `tooltip`, `progress`, inputs (`textField`, `numberField`, `select`, `combobox`, `checkbox`, `toggle`, `dateField`, `dateRange`, `field`) |
| **Components** | composed blocks | `card`, `section`, `statTile`, `list`, `kv`, `table`, `filterBar`, `banner`, `log`, `menu`, `toast`, `openSheet`, `markdown`, `dataCard`, `form`, `confirm`, `actionRun`, charts |
| **Shell** | the frame around a board | `createApp`, `dataSource`, board switcher, language menu, install button, notifications (browser half) |

## Core and shell

One repository, two parts. The **core** (tokens, fonts, icons, base CSS, formatting/i18n/dom helpers, primitives, inputs and `form`) works on any
website without the shell. The **ops shell** (cards, tables, charts, sheets, data source, router, `createApp`) builds on the core. The core never
imports the shell (lint rule `layers`). The classification lives in one file, `tools/lib/kit-files.mjs`; lint rule `classified` fails when a `css/` or
`js/` file is missing there.

| Page type | Scripts and styles | Import |
|---|---|---|
| plain website (core only) | `js/theme-init.js`, `css/tokens.css`, `fonts.css`, `base.css`, `core.css` | `import { button, field, textField, form, t, icon } from '/tarn/js/core.js'` |
| board (core + shell) | the same plus `css/components.css`, `charts.css` | `import { createApp, card, table, … } from '/tarn/js/tarn.js'` (re-exports `core.js`) |

`starter/` is a complete core-only page (`?lang=de` switches the language). Lint rule `layers` makes sure it never loads shell files; verify checks it like a
board. Kit texts of the shell (`shell.*`, `table.*`, …) sit in the same locale catalogs as the core texts; a core-only page never asks for them.

| Part | Files |
|---|---|
| core CSS | `css/tokens.css`, `fonts.css`, `base.css`, `core.css` (reset, focus, helper classes, primitives, inputs, form) |
| core JS | `js/core.js` (entry point), `version.js`, `theme-init.js`, `dom.js`, `press.js`, `overlay.js`, `density.js`, `format.js`, `i18n.js`, `locales/<lang>.js`, `icons.js`, `icons-data.js`, `favicon.js`, `primitives.js`, `controls.js`, `inputs.js`, `inputs-data.js`, `form.js` |
| shell CSS | `css/components.css` (app shell, cards, rows, table, sheet, confirm, log, toast, usage bar, menu), `css/charts.css` |
| shell JS | `js/tarn.js` (the barrel: core and shell), `components.js`, `widgets.js`, `table.js`, `filterbar.js`, `filters-data.js`, `confirm.js`, `actionrun.js`, `actions-data.js`, `sheet.js`, `datacard.js`, `markdown.js`, `data.js`, `boards.js`, `boards-data.js`, `router.js`, `shell.js`, `notifications.js`, `notifications-data.js`, `push-sw.js`, `tiles-data.js`, `locales/*-shell.js`, `charts/` |

## What is in the repository

| Path | Contents |
|---|---|
| `css/`, `js/`, `fonts/`, `icons/` | the runtime: what a board loads |
| `js/tarn.js`, `js/core.js` | **the only imports for boards** (barrel with core and shell · core entry point for plain pages) |
| `VERSION`, `js/version.js`, `CHANGELOG.md` | the version (`import { VERSION }`) and the changes per version |
| `js/locales/` | kit texts in en, de, es, fr: `<lang>.js` core, `<lang>-shell.js` shell (merged by `locales/shell.js`) |
| `example/` | sample board with a fixture, four languages – **template for new boards** |
| `starter/` | a plain website page built only from the core – template for pages that are not boards |
| `gallery/` | every building block in all states |
| `tools/` | `verify.mjs` + `verify/`, `lint.mjs` + `lint/`, `tempo.mjs` + `tempo/`, `vendor.mjs`, `package.mjs`, `shoot.mjs`, `brand.mjs`, `icons.mjs`, `judge.mjs`, `serve.py`, `lib/` (shared code, `kit-files.mjs`) |
| `tests/` | `node --test tests/*.test.mjs`; `tests/snapshots/` holds the expected DOM outlines for verify |
| `docs/` | this reference; not part of the runtime copy |
| `AGENTS.md` | rules for agents that build or change a board |

## What belongs in the kit

The kit is the base every board shares: tokens, primitives, components and the shell that more than one board uses. It is not the place for every
chart or panel one board happens to want; a kit that takes them all grows without end.

- **Into the kit:** a building block a second board needs as well, or one that is plainly general (an input, a chart type, a shell behaviour), and
  every fix to a kit part. It comes with a gallery entry in all states and its checks.
- **Into the board:** a block for this board's own data or question. Build it in the board's own files from kit parts (`barChart`, `lineChart`,
  `segmented`, `facts`, …) and kit tokens; `verify --board` lints and measures it like everything else.
- **Moving up later:** when a second board builds the same block, move it into the kit then.

Either way the look stays the kit's: no own colours, sizes, radii or fonts, and never a changed copy of a kit file.

## Include the kit in a project

Two ways; both give a project one fixed version. Never edit Tarn files inside the project: a fix goes into the kit and arrives with the next update.

| | (a) git dependency | (b) fixed copy |
|---|---|---|
| for | projects with npm (or pnpm, yarn) **and** a bundler | pages and boards without tooling (like the sample board) |
| how | `npm i github:R0gner/tarn#v<version>` | `node tools/vendor.mjs --to <project>/vendor/tarn [--profile core]` |
| import | `import { button } from '@r0gner/tarn/core'` · `import { createApp } from '@r0gner/tarn'` | `import … from '/tarn/js/core.js'` · `'/tarn/js/tarn.js'` |
| styles | `@r0gner/tarn/css/tokens.css`, `fonts.css`, `base.css`, `core.css` (+ `components.css`, `charts.css`) | `<link href="/tarn/css/…">` |
| pin | the tag in `package.json`, npm records the commit | `VERSION` and `SHA256SUMS` in the copy; `--check` |
| update | change the tag, `npm update @r0gner/tarn` | run `vendor.mjs` again |

### (a) git dependency

The repository root is an npm package (`@r0gner/tarn`, `private`, `type: module`, no dependencies, no install scripts). `exports` maps `.` to the
barrel (`js/tarn.js`), `./core` to `js/core.js`, `./css/*`, `./fonts/*`, `./icons/*` to those folders and `./js/theme-init.js` to the boot script.
`files` limits the installed package to the runtime files (the list `tools/vendor.mjs` copies; a test keeps both equal, `node tools/package.mjs`
rewrites it).

```sh
npm i github:R0gner/tarn#v0.5.3        # a tag, never a branch
```

```js
import '@r0gner/tarn/css/tokens.css';   // a bundler resolves the styles too (Vite, esbuild, webpack …)
import '@r0gner/tarn/css/fonts.css';
import '@r0gner/tarn/css/base.css';
import '@r0gner/tarn/css/core.css';
import { button, field, textField, form, t } from '@r0gner/tarn/core';
```

`@r0gner/tarn/js/theme-init.js` (no flash of the wrong colour scheme) belongs in the `<head>` as a plain, not bundled `<script>`; bundled into the app
script it would run after the first paint. `css/fonts.css` refers to the font files relative to itself, so the bundler must resolve those `url()`s.

### (b) Fixed copy with `tools/vendor.mjs`

Every board carries a fixed copy of one kit version in `vendor/tarn/` and serves it under `/tarn/`. No live mount: a kit change never reaches a board
unnoticed; an update is a deliberate step with a check.

```sh
node tools/vendor.mjs --to <board>/vendor/tarn                    # first copy and every update, run from a Tarn checkout
node tools/vendor.mjs --to <board>/vendor/tarn --check            # has anyone changed the copy? which version and profile is it?
node tools/vendor.mjs --to <site>/vendor/tarn --profile core      # a plain page without the shell
```

- `--profile core|full` (default `full`): `core` copies only the core files plus `VERSION`, `LICENSE`, `NOTICE`; `full` adds the shell. The first line of
  `SHA256SUMS` is `# profile: core|full`; later updates and `--check` read it, so an update keeps the profile unless you pass `--profile` (then files
  outside the new profile are removed).
- It copies only what the browser loads (`css/`, `js/`, `fonts/` with the font licences, `icons/` svg files with licence and sources list) and writes
  `SHA256SUMS` (`sha256sum -c SHA256SUMS` works inside the folder). `docs/`, `tools/`, tests, gallery and example are not copied. It never writes into
  the Tarn repository and leaves files it does not know alone.
- Exit codes: 0 done or copy intact · 1 local changes (check) or update refused · 2 usage or environment error.

**Update:** the tool refuses to overwrite a copy whose files were changed locally (`--force` overwrites anyway, `--dry-run` shows what would change).
Then: read `CHANGELOG.md` for the versions in between, run the update, run the board's checks
(`node <kit>/tools/verify.mjs --board <board> --base http://127.0.0.1:<port>`, see [checks](checks.md)), review the snapshot diff, commit the copy together
with the board changes it needs. The pinned version is available at runtime: `import { VERSION } from '/tarn/js/tarn.js'`.

The board's server serves `GET /tarn/<path>` from `vendor/tarn/` (same path check as for its own static files, `Cache-Control: no-cache`); same origin, so
a CSP with `'self'` fits without exceptions and without CORS. The page then loads:

```html
<script src="/tarn/js/theme-init.js"></script>
<link rel="stylesheet" href="/tarn/css/tokens.css">
<link rel="stylesheet" href="/tarn/css/fonts.css">
<link rel="stylesheet" href="/tarn/css/base.css">
<link rel="stylesheet" href="/tarn/css/core.css">
<link rel="stylesheet" href="/tarn/css/components.css">
<link rel="stylesheet" href="/tarn/css/charts.css">
<link rel="icon" type="image/svg+xml" href="favicon.svg">
<script type="module" src="board.js"></script>   <!-- import { … } from '/tarn/js/tarn.js' -->
```
