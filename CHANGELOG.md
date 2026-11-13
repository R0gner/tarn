# Changelog

Format after [Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).
While the major version is 0, minor versions may change the API; every change is listed here.

## 0.5.0 (unreleased)

Round 5.

### Stage V: verify for a board outside the kit
- `node <kit>/tools/verify.mjs --board <board folder | tarn-board.json> --base http://127.0.0.1:<port>` checks a running board server: its own CSS/JS
  lint, `vendor.mjs --check` on its kit copy (names the kit version found; the server must deliver the same `VERSION`), geometry (overflow,
  truncation, touch targets, i18n, identity, console), snapshots in the board's own folder with its fixed clock, the generic shell overlay
  scenarios (sidebar, detail, menu over a sheet, sheet) and the animation inventory. The kit's own tests, lint, types and mutants are not part of
  a board run; snapshots live in the board, images and `report.json` in `--out` (default `<board>/.tarn-verify`), never in the kit.
- The board describes itself in `tarn-board.json` (pages with `id`, `path`, `details`, optional `views`, `sizes`, `themes`, `density`; snapshot folder,
  exceptions file, fixed clock, kit copy, lint settings): `tools/lib/board.mjs`, README "Check: verify".
- `node tools/lint.mjs --board <…>` lints a board's own CSS, JS and HTML (tokens only, no `innerHTML`, texts via `t()`, timers, favicon/title)
  against the board's own allow file; its vendored kit copy is not linted. `--write-known` writes the board's inventory.
- The board run feeds the page from the board's server through Node (CDP `Fetch.fulfillRequest`, headers and CSP unchanged), so the own headless Chrome
  needs no network access of its own and `--jobs` works.
- Positive control in `verify --selftest`: a copy of `example/` set up outside the repo as a foreign board (vendor copy, static server) must be green,
  the same copy with injected faults (colour literal, `innerHTML`, a card wider than the page, an edited vendor file) must be red.
- Internal: exceptions, finding groups and finding screenshots moved to `tools/verify/rules.mjs` and `shots.mjs`; snapshots, overlay scenarios and the
  pool take the board's folder, pages and kit URL as options; `tests/version.test.mjs` accepts a top entry marked "(unreleased)".

### Stage N: notifications (browser half) and the phone toolbar
- `createApp({ notifications: { api } })` adds the entry "Notifications" (bell, sidebar) that opens a settings sheet; `openNotifications({ api })` is the same sheet without
  the shell, `notifications()` the controller, `createNotifications({ api, env })` the logic without a DOM (all browser APIs replaceable). States, each with its own text
  (en, de, es, fr): not supported · no https · iPhone/iPad not installed (Share → Add to Home Screen) · server does not push · server not reachable · service worker did not
  start · blocked (how to allow it again) · off (the button that asks; the browser prompt only ever after a tap) · on (test, turn off).
- Server interface, documented in the README so any backend can implement it: `GET <api>/key`, `POST <api>/status`, `/subscribe`, `/unsubscribe`, `/test`. Compatible with
  the parcel board's server as it is (status is a POST on purpose: the endpoint URL is a capability and stays out of URLs and logs; the brief's "GET status" is not used).
- New `js/push-sw.js`: a service worker for push only (`push` shows title, text, icon, `tag`; `notificationclick` focuses or opens the target); no offline cache, no fetch handler.
  The board serves it from its own root; scope and header are documented. Classified as shell, part of the vendor copy and the package.
- The install entry no longer disappears where the browser has no install prompt: on iPhone, iPad and Safari on the Mac it opens the Add-to-Home-Screen steps.
- **Phone toolbar (< 600 px):** theme, density and language move into one settings entry (sheet); the reload button gives way to the freshness text, the freshness text
  gives way before the view title (the gallery title was cut to "Foundati…" since the density button arrived). Verify rule `toolbar-title`, mutant `toolbar-crowded`.
- The sidebar foot is hidden only when all its entries are hidden (was: when any was); head, navigation and foot no longer shrink in a long sidebar, it scrolls.
- Icons `bell`, `bell-off`, `settings`, `share`, `square-plus`. Gallery: demo with every state, live sheets over mocked browser APIs and a mock backend (`gallery/mock-push.js`).
- Checks: overlay scenarios `notifications`, `install-hint`, `settings-phone`; `tests/notifications.test.mjs`; mutants `notifications-ask-on-open`, `install-hint-absent`, `toolbar-crowded`.
- Snapshots deliberately re-baselined: gallery and sample board on the phone (toolbar: settings entry instead of language/density/theme/reload), gallery on the desktop (class `tn-hide-phone`
  on the toolbar buttons), gallery `shell` (notifications demo).

### Stage G: gaps found by the first real board
- **verify (G12):** `load()` returned before the page had loaded: the load event it waited for could be the one of `about:blank`, so the page's scripts ran after the next
  step of the check (`document.readyState` was `loading` in 13 of 14 trial loads). It now returns when the requested document is complete. A snapshot of the shell's density button
  therefore depended on timing (GitHub's 2-core runner, one worker, measured "Compact"; the baseline had "Comfortable"). Every page now also starts from a clean origin (own Chrome:
  `Storage.clearDataForOrigin`), so no scenario can leak theme, density, language or sidebar state into other pages of the same run; selftest control `state isolation` plants such state and expects defaults.
- The shell names the theme and density in effect on its buttons also when something else changes them (`setDensity()` in a board, a page that sets `data-density`): observers on `<html>`, no polling (`watchDensity()` in `js/density.js`, unit test).
  No snapshot changed.
- **Texts with a formatted age (G6):** `shell.dataStale` put a full stop after `{age}` ("Stand vor 3 Std.."; English future ages end in one too); the text is now "Daten veraltet (Stand {age})." in all four languages. A test fails when any kit or sample board text has a full stop right after `{age}`.
- **`createApp({ fallbackLocale })` (G1):** the language for a browser none of whose languages is offered (default `en`); the language menu stays, a stored or forced choice and a matching browser language still win. `resolveLocale({ fallback })`.
- **`ViewDef.group` may be a function (G2),** like `label`: group headings can call `t()` after the language is set (`resolveViews()` in `js/router.js`, unit-tested; every view of every board goes through it).
- **Icons (G3):** `hard-drive`, `archive`, `database`, `calendar`, `container` (`tools/icons.mjs add`; gallery foundations shows them, snapshots re-baselined for the five extra symbols).
- **Dates (G9):** `fmtDay(t)`: a short date without time ("09.11." de, "11/09" en). `fmtWhen` in German no longer puts a comma after the full stop of the date ("07.11. 22:10", was "07.11., 22:10"); the other languages keep Intl's patterns.
  Snapshots of the German sample board pages re-baselined for it.
- **verify --ci (G11):** a failed Chrome start ("debugger on port … not reachable") is tried once more before exit 2, and the output says so (also in a board run); a missing Chrome is not retried.

### Stage Gb
- **Quiet footer line (G4):** `card({ footer })` and `section(title, { footer })` put one short muted sentence under the content ("+13 frequent runs hidden"; a link or button inside is fine), wrapping instead of truncating. Class `tn-foot`; gallery demo with four states (cards view).
- **shoot (G5):** `tools/shoot.mjs` now takes `http(s)://host:port/…` URLs of a running server without `--attach`: Node fetches the requests and fulfils them over CDP (like `verify --board`), so Chrome
  needs no network of its own; `--base URL` for paths, `--direct` for Chrome's own network. Cause of the old hang at `Page.navigate` in an agent sandbox: an inherited `DBUS_SESSION_BUS_ADDRESS` blocks
  Chrome's first D-Bus call and every HTTP navigation; the kit's own Chrome is now started without it (`chromeEnv()`), README documents what to do for `--attach`. Selftest checks the Node route; `shoot` and `load()` no longer
  leave an unhandled rejection when a navigation fails.

## 0.4.0

Round 4, stage R: renamed from dashkit.

### Changed
- The kit is now called **Tarn** (`tarn` in paths and files). Renamed from dashkit; no behaviour change.
- CSS classes and custom properties use the prefix `tn-` / `--tn-` (was `dk-` / `--dk-`), data attributes `data-tn-*`,
  test hooks `window.__tnMissingKeys` and `window.tnApp`, environment variables `TN_NO_SANDBOX`, `TN_SERVE_QUIET`, `TN_DEBUG`.
- The barrel is `js/tarn.js` (was `js/dashkit.js`); boards serve the kit under `/tarn/` and `tools/vendor.mjs` targets `vendor/tarn`.
- `js/version.js` also exports `NAME` and `PREFIX` (one place for the name and the prefix in JS).
- Text snapshots are deliberately re-baselined: only the class names changed (`dk-*` → `tn-*`), no pixel and no structure change.

### Added
- Migration: the stored settings `dk-theme`, `dk-locale` and `dk-sb` are read once by `js/theme-init.js`, copied to `tn-theme`,
  `tn-locale`, `tn-sb` and removed. Boards must include `theme-init.js` (they already do) to keep their users' choices.
- Lint rule `legacy`: the old name and prefix may appear only in the migration code and in this changelog.

### Round 4, stage K: core and shell
- The kit has two parts: **core** (tokens, fonts, icons, base CSS, formatting/i18n/dom helpers, `button`, `iconButton`, `badge`, `statusDot`,
  `segmented`, `tabs`, `progress`, `tooltip`, inputs and `form`) and the **ops shell** (everything else). Classification: `tools/lib/kit-files.mjs`,
  README "Core and shell".
- New files from splits: `js/primitives.js` (core, from `components.js`), `js/widgets.js` (shell: `log`, `toast`, `usageBar`, `menu`, from
  `controls.js`), `js/confirm.js` (shell, from `form.js`); `validateFields()` moved from `actions-data.js` to `inputs-data.js`. The public API
  and the barrel `js/tarn.js` are unchanged.
- Entry points: `js/core.js` (core only) and `css/core.css` (primitives, inputs and form styles, split out of `components.css` and
  `charts.css`; load it after `base.css`). `js/tarn.js` re-exports `core.js`; pages and boards that use the shell load `core.css` too.
- `tools/vendor.mjs --profile core|full` (default `full`); the profile is recorded as `# profile: …` in `SHA256SUMS`, `--check` and updates
  read it from there. Copies now include the `icons/*.svg` sources.
- `starter/`: a plain website page built only from the core (en/de), covered by lint and verify.
- `package.json` (`@r0gner/tarn`, private, no dependencies, no scripts): `exports` for `.`, `./core`, `./css/*`, `./fonts/*`, `./icons/*`;
  `files` equals the full vendor profile. README "Include in a project" describes the git dependency and the fixed copy as equal ways.
- Gallery: navigation groups `Core · …` and `Shell · …`; the Forms view is split into Forms (core) and Confirm and actions (shell).
  Gallery snapshots re-baselined for that (group headings, new view); all other snapshots unchanged.
- Lint: rules `classified` (every css/js file is listed once as core or shell) and `layers` (core never imports shell; the starter page
  imports and loads core files only); positive controls in the tests and in `verify --selftest`.
- Fixed: `vendor.mjs` crashed when an update removed several files of one stale folder.

### Round 4, stage T: comfortable density
- `data-density="comfortable"` on `<html>`: the same tokens with other values (type scale, spacing, 48 px targets for every interactive element,
  stronger contrast, wider sidebar). Compact stays the default and pixel-identical (every compact snapshot unchanged except the gallery toolbar,
  see below). `js/density.js` (`getDensity`, `setDensity`, `DENSITIES`, stored as `tn-density`, applied by `theme-init.js`); control
  dimensions that used to be fixed or `pointer: coarse` rules are tokens now (`--tn-min-w`, `--tn-btn-sm-h`, `--tn-seg-h`, `--tn-seg-sm-h`,
  `--tn-seg-py`, `--tn-pill-h`, `--tn-badge-h`, `--tn-check`, `--tn-toggle-*`, `--tn-fresh-*`). README "Density" lists the values.
- Fixed: `.tn-pill` (used by `dateRange`) was styled in the shell stylesheet; it moved to `css/core.css`, so a core-only page gets it.
- Lint rule `density`: `data-density` only in `css/tokens.css` (positive control in the tests).
- Gallery: density button next to the theme switch (`createApp({ densitySwitch: true })`) and a Density demo in "Light and dark"; the starter page uses
  comfortable. The gallery snapshots changed only in the toolbar (new button) and in the "Light and dark" view; board snapshots unchanged.
- verify: pages `gallery-comfortable` (core views), `starter-comfortable`, `starter-de-comfortable` (geometry, snapshots, phone + desktop, dark + light);
  strict rule `touch48` without exceptions; mutants `comfortable-target-shrunk` and `comfortable-hit-token-lowered`; `--changed` includes the twins.
- Starter page: the help icon button sits in the header (it dropped to its own line on a 444 px phone), button rows wrap evenly; starter snapshots re-baselined.
- Fixed: the toggle thumb left its track under `pointer: coarse` (checked: 8 px outside, touching the label) and sat flush at the right and bottom edge
  with a fine pointer. Inset and travel are derived with `calc()` from the track tokens (`--tn-toggle-w/-h/-thumb`; `--tn-toggle-go` is gone); the thumb
  keeps the same inset on all four sides in both states (deliberate pixel change in compact: fine thumb 12 → 10 px; one gallery phone snapshot changed).
  New verify rule `contained` (toggle thumb and determinate progress fill lie inside their track, in the state shown) and selftest mutant `toggle-thumb-leaves-track`.
- Fixed: on the starter page in comfortable density on a phone the language switch was squeezed and scrolled sideways (an option was cut off). The header
  wraps now (brand left, controls right, the switch moves to a second row). New verify finding under `scroll-x`: a segmented control must show all
  its options; selftest mutant `segmented-squeezed`.
- Locale catalogs split: `js/locales/<lang>.js` core texts (37 keys), `<lang>-shell.js` shell texts (98 keys), merged by `js/locales/shell.js`
  (`addKitMessages()`); `--profile core` and `@r0gner/tarn/core` ship only core texts. The full barrel is unchanged for boards.

## 0.3.0

First version with its own history. Round 3 "foundation", in stages:

### A – Check path
- `tools/verify.mjs`: one command for tests, lint, DOM geometry (overflow, clipped text, overlap, misaligned siblings, touch targets,
  contrast as a warning), "overlay is on top", text snapshots and the tempo inventory; exit codes 0 / 1 / 2, at most 10 lines of output.
- `--selftest`: known faults and CSS/JS mutants must be detected (positive control).
- `tools/lint.mjs` (tokens only, no `innerHTML`, transitions on `transform`/`opacity`, texts through `t()`), `tools/tempo.mjs`
  (frame budgets per building block, Event Timing, Long Animation Frames), text snapshots in `tests/snapshots/`.

### B – Behaviour
- Overlay layer: menus, toasts, tooltips and data cards open inside the topmost dialog; Esc closes the menu first.
- Long values without a break point no longer overflow (banner, key/value, table cells); touch targets of at least 40 px.
- Timing from tokens, first visible change within one frame; panels 150 ms open, 120 ms close.
- One hover concept: data card for chart elements, hint for icon buttons and clipped text; no native `title`.
- Detail in two variants: inspector next to the list (≥ 1000 px), panel from the right (700–999 px), bottom sheet below 700 px.
- Local fonts (Inter, IBM Plex Mono, OFL), `markdown()` building block, timeline fitted to the container width.
- Light mode: status text tokens, `--dk-text-3` and the primary button meet 4.5:1.

### C – Identity and i18n
- Lucide icons (ISC, pinned version) with `tools/icons.mjs`; `tools/brand.mjs` writes favicon, PNG icons and manifest.
- `favicon()`, tab title "View · Board", install button, board icon and board switcher (`createApp({ icon, boards, categories })`).
- English throughout, runtime texts through `t()` with catalogs `en`, `de`, `es`, `fr`; Intl-based formats, locale and time zone
  from the browser (overridable), language menu, plural forms.

### D – Inputs, filters, actions
- Inputs: `textField`, `numberField`, `select`, `combobox`, `checkbox`, `toggle`, `dateField`, `dateRange`, `field`.
- `filterBar` by data type (`options`, `bool`, `range`, `time`) with readable chips; `matchFilters` for all types.
- `form()` with validation and submit state, `confirm()` for dangerous actions, `actionRun()` with status, progress and live log.
- `table()` draws 20 rows and a "Show more" footer (`pageSize`).

### Delivery
- `VERSION` file and `VERSION` export from `js/dashkit.js`.
- `tools/vendor.mjs`: copies a fixed kit version into a board (`vendor/dashkit/`) with a `SHA256SUMS` record; `--check` reports local changes
  and the version; an update refuses over local changes.
- JSDoc types for the whole public API (`@typedef` option objects), `// @ts-check` in every file, `jsconfig.json`, `verify --types`
  (TypeScript as a pure type checker, pinned version, skipped offline).
- Status labels use one capital in every locale; the placeholder colour (`--dk-placeholder`) meets 4.5:1.
- `LICENSE` (MIT), `NOTICE` (Lucide, Inter, IBM Plex Mono), README for newcomers (quick start, tools, licence), `.gitignore`.
- GitHub Actions: `verify.yml` (every push and pull request, `verify --ci` with its own headless Chrome), `pages.yml` (manual only: gallery,
  sample board and start page as a static site).

### V – Faster verify
- `tools/verify.mjs` runs geometry, overlay and snapshot states on parallel workers (`--jobs N`, default min(4, cores/2)): one own headless
  Chrome, one browser context per worker, files served from the repo over CDP (`Fetch.fulfillRequest`; no HTTP server, works in sandboxes).
  Results are merged in task order, so reports do not depend on `--jobs`. `--attach` stays serial. `--ci` now runs locally too.
- `--full --selftest` is one run (the selftest takes the base findings from it); `--selftest --base-report FILE` takes them from the
  report of a full run of the same commit and tree. Selftest mutants run on the workers; every worker must see one.
- `--changed [rev]`: only the pages and views that the changed files can affect (dev loop; the full run stays mandatory).
- `report.json` carries commit, tree hash, matrix and timings (per task and per state).
- `settle` no longer waits for its 3 s limit in gallery views whose demos show a loading skeleton; the tempo inventory runs as parallel units;
  overlay scenarios wait for the condition (closing, hint, submit) instead of fixed pauses. Full run 403 s → about 1 min.
- Sample board: the schedule label “Disabled” (all four languages) follows the capitalisation of the status labels; snapshots updated (text only).
