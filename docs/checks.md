# Checks

The tools that let an agent (or a person) test an interface without looking at it: `verify` (everything in one command), `lint`, `tempo`, `shoot`, and
the same checks for a board that lives outside the kit. For anyone who changes the kit or hands in a board. An optional experimental layer, the
[visual judge](visual-judge.md), is described separately; it is never part of these.

What a script can check lives as a script in `tools/`. **Name the check before the code** (command and expected output), hand in only with a green
`verify`, and give evidence as a command plus a path.

## verify

```sh
node tools/verify.mjs                     # everything: tests, lint, types, geometry, overlays, snapshots, inventory
node tools/verify.mjs --types             # only the type check (about a second)
node tools/verify.mjs --quick             # subset: phone and desktop, dark only
node tools/verify.mjs --only geometry --pages board --views jobs --sizes phone
node tools/verify.mjs --only overlay --scenarios combobox,form-submit
node tools/verify.mjs --changed [<rev>]   # dev loop: only the pages and views the changed files can affect; the full run stays mandatory
node tools/verify.mjs --full --selftest   # the full run, then the positive control: known faults and all mutants must be red
node tools/verify.mjs --selftest --base-report <out>/report.json   # positive control on the report of a full run of exactly this tree
node tools/verify.mjs --jobs 2            # parallel workers (default min(4, cores/2))
node tools/verify.mjs --attach http://127.0.0.1:<port>   # use a running Chrome (own tab, serial)
node tools/verify.mjs --board <board folder> --base http://127.0.0.1:<port>   # a board outside the kit, see below
node tools/verify.mjs --list              # checks, pages, sizes, mutants
```

Output is at most 10 lines; exit code **0 green · 1 finding · 2 measurement refused or environment broken**. The full report (`report.json`) and images are
written only on findings, as paths in the output folder (`--out`, else a temp folder that is deleted when green). `--update` rewrites the snapshots and
checks nothing else (“baseline written”, not green): deliberate only, with the reason in the commit message.

It starts its own headless Chrome (throw-away profile, own PID) and hands it the kit files straight from the repo over CDP (`Fetch.fulfillRequest`, same
bytes and CSP headers as `serve.py`): no HTTP server, no network, so it works in sandboxes that cannot open connections. Tasks are spread over `--jobs`
workers and merged in task order, so findings and snapshots do not depend on `--jobs`. With `--attach` a running Chrome is used instead: the way to go
when focus, frames or a headed browser matter.

**CI:** `.github/workflows/verify.yml` runs `node tools/verify.mjs --ci` on every push and pull request (ubuntu-latest, Node 22, the preinstalled Chrome).
`--ci` always starts its own headless Chrome (`--no-sandbox`, throw-away profile) and refuses `--attach` and `--base`. `.github/workflows/pages.yml`
(manual only) publishes the gallery, the sample board and the start page as a static site.

### The checks

| Check | What it does |
|---|---|
| `tests` | `node --test tests/*.test.mjs` |
| `lint` | `tools/lint.mjs`, below |
| `types` | TypeScript as a pure type checker over the JSDoc types of `js/` (`jsconfig.json`: `checkJs`, `strict` except `noImplicitAny`). The version is pinned in `tools/verify/types.mjs` (`TS_VERSION`) and fetched with `npx` on demand; offline the check is skipped with a note. Every file starts with `// @ts-check`; new building blocks need typed options |
| `geometry` | per page × size × theme × view (read from the navigation) and open detail: a child sticks out of its container, the page is wider than the viewport, text is cut off without “…”, text boxes or flex/grid siblings overlap, siblings in a row are misaligned, words are broken letter by letter (`wordbreak`), a chart axis label is cut at the chart edge or touches its neighbour (`axis`), a scroller traps the swipe (`scroll-trap`), a timeline scrolls sideways, a touch target is smaller than 40 px (hit area measured by `elementFromPoint`), a translation is missing (`i18n`), a page lacks `<link rel="icon">` or a title “View · Board” (`identity`), a toolbar crowds out the view title at 360–599 px (`toolbar-title`), console errors. Contrast below 4.5 is a warning only |
| `overlay` | opens menu, toast, tooltip, info explanation, detail, sheet, sidebar, board switcher and install button with real input (tap, click, hover, long press), also from an open sheet, and checks: on top (`elementFromPoint`), not inert, focus in the menu or modal sheet. Plus behaviour cases (panel from the right closes by swipe, Esc and Back; a menu does not close on a height change but on a width change; Esc closes a menu inside a sheet first; a tooltip stays on touch; combobox, confirm over a sheet, filter sheet, form submit; notifications flow; Back by levels on the real history of the test Chrome: `back-views`, `back-detail`, `back-deeplink` (these press the browser's own Back, Alt+Left, so entries Chrome's history intervention skips count as missing), `back-sheet`, `back-confirm`, `back-drawer`, `exit-hint` (installed app, emulated `display-mode`); `drawer-current`, `timeline-pan`) |
| `snapshots` | per page × view (plus open details) × `phone` and `desktop` a text outline (element, role, `tn-*` and `is-*` classes, text, box rounded to 4 px) under `tests/snapshots/`, clock fixed to 2026-11-09 10:00 (Europe/Berlin). A difference is a finding with a diff file. All declared fonts are loaded before measuring |
| `tempo` | animation inventory: `document.getAnimations()` during every test interaction. Only `transform` and `opacity`, durations equal motion tokens, duration within the class budget, plus endless animations. Runs headless |

**Pages and sizes:** the gallery, the sample board in en, de and fr, and the starter page in en and de, in the sizes `phone` 390×844 (touch), `desktop`
1440×900, `phone-s` 340×740, `tablet-s` 700×900 (touch), `desktop-s` 1000×800, each in dark and light; `--sizes` also takes `WxH[@DPR][t]`. The pages
`gallery-comfortable`, `starter-comfortable` and `starter-de-comfortable` run the same checks with `data-density="comfortable"` plus the strict rule
`touch48`: every interactive element at least 48 px, no hit-area extension, disabled controls and inline links included; checkbox and toggle count as
their whole row. `touch48` is never covered by an exception. `--changed` checks a page's comfortable twin with it.

**Exceptions and mutants:** known faults and justified exceptions are listed in `tools/verify/exceptions.json` (each with a reason), mutants in
`tools/verify/mutants.mjs`. `--selftest` plants every mutant (CSS or JS injection, source patch, two type errors in a temp copy) and expects each to be
reported; it also sets up a copy of `example/` outside the repo as a foreign board, which must be green, and the same copy with an injected fault
(colour literal, `innerHTML`, a card wider than the page, an edited vendor file), which must be red. Do not loosen or delete checks, budgets,
exceptions, mutants or snapshots without an explicit assignment; removing a fixed known fault from a list is welcome.

## lint

`node tools/lint.mjs [-v]` (under a second) checks the static kit rules: colours, sizes, radii and durations only from `css/tokens.css`; transitions and
animations only `transform` and `opacity` (`background-color` on hover); no `innerHTML`, `outerHTML` or `insertAdjacentHTML`; no native `title`
attribute; JS timers without number literals; every exported block has a gallery entry; no emoji; visible texts through `t()` (`i18n`); every HTML page has
an icon and a title (`page`); core files never import shell files (`layers`); every `css/` and `js/` file is classified in `tools/lib/kit-files.mjs`
(`classified`); `data-density` appears only in `css/tokens.css` (`density`). Exceptions: `tools/lint/allow.json`, each with a reason.

## A board outside the kit

A board that lives in its own repository checks itself with the tools of a kit checkout. The board describes itself in one file in its own folder,
`tarn-board.json` (all paths relative to that folder; only `name` and `pages` are required):

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

- **`pages`** as in the kit's `tools/verify/targets.mjs`: `id` (used in findings and snapshot paths), `path` (URL path and query; pin the language with
  `?lang=`), `details` (hashes without `#/`, checked as extra states, e.g. an open detail), `views` (only for a page without shell navigation, otherwise
  the views are read from the sidebar), `sizes`, `themes` and `density` (narrower than the default: five sizes, dark and light, compact).
- **`clock`** is the fixed time of the snapshots. `exceptions` and `lint.allow` have the format of the kit's `tools/verify/exceptions.json` and
  `tools/lint/allow.json` (each entry with a reason); a missing file means no exceptions. A mistake in the file is reported with the field name (exit 2).
- A board that uses `timeline()` with `onItem`, or `heatRow()` with clickable cells, needs the kit's two touch exceptions in its own file: copy the
  entries `timeline-bars-touch` and `heat-cells-touch` from `tools/verify/exceptions.json`.

With the board's server running, from a kit checkout (any version at or newer than the board's copy):

```sh
node <kit>/tools/verify.mjs --board <board folder> --base http://127.0.0.1:<port>            # everything below, at most 10 lines, exit 0 / 1 / 2
node <kit>/tools/verify.mjs --board <board folder> --base http://127.0.0.1:<port> --update   # write the snapshot baseline (deliberately only); checks nothing else
node <kit>/tools/lint.mjs --board <board folder> [-v] [--write-known]                         # only the lint of the board's own files
```

| Check | What a board run does |
|---|---|
| `lint` | the board's own CSS, JS and HTML: token-only literals, transitions, no `innerHTML`, no number timers, no `title` attribute, no emoji, visible texts via `t()` (the files in `lint.messages` are exempt), favicon and title on every page |
| `vendor` | `tools/vendor.mjs --check` on the board's copy (`kit`): local changes, missing or foreign files are findings; names the kit version found (and notes a newer checkout); the server must deliver the same `VERSION` under the kit URL |
| `geometry` | the geometry rules above for every page, size, theme, view and detail |
| `snapshots` | text outline of every view and state against `snapshots`, with the board's fixed `clock` |
| `overlay` | the scenarios that are generic for any shell board: `sidebar` (below 1000 px), `detail` (the first `details` entry with `?open=`), `menu` (opened inside a sheet), `sheet` |
| `tempo` | animation inventory: endless animations in every view and the animations of those scenarios |

Not part of a board run: the kit's own unit tests, kit lint, types, the gallery and the mutants. `--only`, `--skip`, `--pages`, `--views`, `--sizes`,
`--themes`, `--scenarios`, `--quick` and `--jobs` work as in the kit run. Snapshots live in the board (commit them with it); screenshots of findings,
diffs and `report.json` go to `--out` (default `<board folder>/.tarn-verify`, which carries its own `.gitignore`), never into the kit. Exit 2 (no verdict)
when the board server does not answer or Chrome cannot start. The page is fed from the board's server through Node over CDP (headers and CSP unchanged),
so the headless Chrome needs no network of its own.

## tempo

```sh
node tools/tempo.mjs --attach http://127.0.0.1:<port> [--cases menu-open,sheet-open] [--save state.json] [--compare state.json] [--table]
node tools/tempo-markdown.mjs --attach http://127.0.0.1:<port>      # a 50 KB report through markdown() under 4× CPU (budget 50 ms)
```

- **Cases** (`tools/tempo/cases.mjs`): `menu-open`, `switcher-open`, `toast-open`, `tooltip-open`, `datacard-open`, `combobox-open`, `filter-apply-1000`,
  `press`, `segment`, `tabs`, `sheet-open`, `sheet-close`, `detail-open`, `detail-close`, `sidebar-open`, `sidebar-close`, `sidebar-desktop`. Each case runs on
  `phone` (touch), `tablet-s` and `desktop` (mouse) as far as it applies (`--sizes`), with CPU 4× and 1× (`--cpu`), 2 warm-up (`--warmup`) and 7 measured
  runs (`--runs`); median and max.
- **Measured** from the triggering event: first visible change (10 %), half, done (98 %) via a rAF sampler of the real element state; handler and input
  to next frame (Event Timing); long animation frames.
- **Budgets** (4× CPU, `BUDGETS` and `GLOBAL` in `tools/tempo/cases.mjs`): first change ≤ 50 ms; menu, tooltip, toast, data card, combobox done ≤ 100;
  panel and sheet open ≤ 150, close ≤ 120 (+1 frame); segment and tab switch done ≤ 50; desktop panel and press ≤ 34; handler ≤ 16; no long animation frame
  > 50; input to frame (95th percentile) ≤ 100. The 1,000-row filter case has its own limits: handler 50, long frame 80, input to frame 120.
- Exit 0 within budget, 1 exceeded, 2 refused (tab not in front, spread of the first change over 2 frames even after a retry). The frame measurement needs
  a visible Chrome (`--attach`); `--inventory` runs headless.
- **Extend:** a new check is a module under `tools/verify/`, registered in `verify.mjs` (`CHECKS`); pages and sizes live in `tools/verify/targets.mjs`.

## shoot

Screenshots of a page in chosen sizes and colour schemes, with the same loading rules as verify:

```sh
node tools/shoot.mjs --out <folder-outside-the-repo> "http://127.0.0.1:18810/example/?lang=en#/overview" "http://127.0.0.1:18810/example/#/jobs?open=offsite-sync"
node tools/shoot.mjs --out <folder> --sizes phone --themes light "/starter/?lang=de"        # a path: answered from the repo, no server
node tools/shoot.mjs --out <folder> --base http://127.0.0.1:8795 "/#/overview"              # paths from a running server
node tools/shoot.mjs --out <folder> --attach http://127.0.0.1:<debug-port> http://…/        # a running Chrome opens the URLs
```

Three ways to get the page into the headless Chrome (without `--attach`): a **path** (`/starter/…`) is answered from the repo by CDP file delivery; the
**URL of a running server** (a board, any address) is fetched by Node and handed to Chrome over CDP, so Chrome needs no network of its own (all URLs of a
run share one origin); **`--direct`** lets Chrome open http(s) URLs with its own network stack.

- One PNG per URL × size (`phone` 390×844 @3 touch, `desktop` 1440×900; `--sizes tablet` or `800x600@1t`) × scheme (`dark`, `light`). `--full` takes the full
  page height (at most 6000 px), `--eval JS` runs a script after loading (a click, say) and waits again, `--wait MS` (default 700), `--prefix NAME`.
- It reports console errors (CSP violations, 404, exceptions), Chrome error pages and page overflow; exit 1 on problems. `--out` is required and must be
  outside the repo.
- **If `--attach` hangs at `Page.navigate`:** a sandbox that inherits the desktop session's `DBUS_SESSION_BUS_ADDRESS` can make a self-started Chrome block on
  its first D-Bus call. The kit's own Chrome is started without that variable (`chromeEnv()` in `tools/lib/cdp.mjs`). A Chrome you start yourself needs
  `env -u DBUS_SESSION_BUS_ADDRESS google-chrome --headless=new --remote-debugging-port=…`.
