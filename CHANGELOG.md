# Changelog

Format after [Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).
While the major version is 0, minor versions may change the API; every change is listed here.

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
