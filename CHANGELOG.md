# Changelog

Format after [Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).
While the major version is 0, minor versions may change the API; every change is listed here.

## 0.18.0

### Changed
- **Controls for the content stay fixed, the content scrolls** (round 11b, Max): the view's tab bar (`segmented({ pane })`, `tabs()` placed directly
  in the view) and its main filter bar stick under the toolbar; they span the content's width with the page background, rows scroll behind them, the
  table head sits below them (`--tn-stick`, stacked by the shell). `segmented({ pane })` puts its control into a full-width `.tn-segbar`.
- **Search as an icon in the toolbar on the phone** (round 11b, Max): the main filter bar (the first `filterBar()` of a view, not in a card, not
  `inline: true`) loses its search row on a phone; a search icon in the toolbar (dot for a query, badge with the number of active filters) turns the
  title into a search field with the filter icon and ✕ beside it (✕/Escape clear and close, empty closes). Two fixed rows instead of three. Variants
  tried at 360 × 780: search and filter as two toolbar icons (title cut to “S…”, settings pushed out of the toolbar), tabs inside the toolbar row (three
  tabs with counts need ~300 px, no room for the title), one compact row with tabs and icons (German tab labels overflow at 360 px). From 600 px the
  search field stays visible in the content (there is room) and sticks under the toolbar. New option `filterBar({ inline })`. Texts
  `filter.closeSearch`, `filter.searchFor`, `filter.titleN` (en, de, fr, es).
- **Phone toolbar: the freshness text shows the age alone** (“2 min ago”), so the title and the search icon fit at 360 px; stale data stays red
  and has its banner, the label and the source list keep the full text. (First draft kept “Stale · …” on the phone: “Update-Manager” was cut in
  the board's stale fixture. found by: verify toolbar-title/board updatemanager (stale)/–)

- **Viewport check `?tn-debug=viewport`** (round 11b, HL board as an installed PWA on a Samsung S23 scrolled by about a toolbar height although the
  content fit): a small closable overlay (`js/viewport-debug.js`, started by `createApp` only with the parameter) shows live innerHeight,
  visualViewport height/offset, html client/scroll height, body and `.tn-app` heights, the measured 100vh/dvh/svh/lvh, the display mode, the
  safe-area insets, the scroll position, the three elements that reach furthest below the viewport and every scroll container that scrolls.
- **`.tn-app` fills the small viewport (`min-height: 100svh`), `body` has no min-height any more** (was `100dvh` on both). Suspected cause of the
  phantom scroll: in standalone mode Chrome on Android can resolve `100dvh` larger than the visible area (system bars, `viewport-fit=cover`); `svh` is
  never larger than what is visible. Not reproducible headless; the overlay above shows on the phone whether `dvh` > innerHeight.

### Fixed
- The fixed bars first reached sideways to the content's edge (negative margins); nested in a tab pane they stuck out of it. found by: verify
  overflow/board updatemanager, hostjobs/– (Homelab Board; the kit's pages have no tab pane directly in a view)
- A static main filter bar (phone) painted over the fixed tab bar: `z-index` applies to a grid item even without `position`. found by: review
- The empty toolbar search field closed on the tap on the filter icon beside it (blur before the click), so the filter sheet never opened; the field
  now stays open while the focus goes to its own row or into a sheet. found by: verify overlay-missing/filter-sheet/–

### Tooling
- verify overlay scenario **`toolbar-search`** (board `jobs`): phone – no search row in the content, the icon opens a focused field, typing filters,
  a redraw keeps field and text, the filter icon opens the sheet, Escape clears and closes, the title comes back; wider – no icon, the filter bar
  stays under the toolbar after scrolling. `filter-sheet` opens the sheet through the toolbar on a phone, `filter-refresh` runs from 600 px (the phone
  part is in `toolbar-search`). Mutants `toolbar-search-deaf`, `filterbar-scrolls-away`, `toolbar-search-blur-closes`.
- Mutant `toolbar-crowded` gives the freshness text the width of the old “Updated now” back (with the short phone text the title was no longer
  crowded out and the mutant went undetected). found by: selftest toolbar-crowded

## 0.17.1

### Tooling
- **The checks wait for events, not for time** (stage 2 of the check-time plan, `docs/ci-speed.md`): the image viewer scenario `image-zoom` waits for the
  image to come to rest (no running animation, same position on three polls) instead of fixed pauses: phone 13.0 → 9.3 s, tablet-s 13.2 → 11.0 s, its
  7 mutants 26.6 → 16.7 s wall; the real animation times (zoom, glide) and the negative windows stay. `settle` in the geometry check needs 3 calm
  checks (counted in frames) instead of 4, and closing a detail no longer settles on its own: geometry 29.7 → 22.4 s wall, same findings. Not done: the
  other 130 fixed `sleep()` calls of `overlay.mjs` (one scenario per step, later).
- **`verify --selftest --changed [REV]`**: only the mutants the change can affect (a changed patched file always selects its mutant; otherwise the page and
  views of the mutant or of its scenario); all mutants, the base pass and the controls when `tools/` or anything shared changes. A change in
  `gallery-inputs.js` runs 3 of 82 mutants in 3 s, in `js/table.js` 42 in 31 s. A dev loop; the release still needs the full selftest (stamp).
  `tests/verify-changed.test.mjs` proves that every patched file selects its mutant and that a map that hides a change on purpose is reported.
- **Worker seconds per phase** at the end of every verify run (and `timing.phaseSeconds` in `report.json`); a full selftest above 240 s with 4 or more
  workers is flagged (`BUDGET:` line, `budget` in `report.json`; never a failure).
- **Which check found which bug**: CHANGELOG convention `found by: verify <rule>/<scenario or view>/<mutant or –>` (`AGENTS.md`, `docs/checks.md`).
- **CI**: no verify run on tag pushes (the tag is the tree main just verified); on a push to main a second job runs `--full --selftest --jobs 4`.
- **`.githooks/pre-push`** (tests, lint, types, about 3 s): `git config core.hooksPath .githooks` per clone, see `docs/releasing.md`.

## 0.17.0

### Changed
- **Press feedback on touch only after a real tap** (round 11, HL board on a phone): a row the thumb touched to start a scroll or a swipe lit up.
  Root cause: `js/press.js` set `.is-down` on every `pointerdown`, and the CSS also styled `:active`, which Chrome on Android sets at touchstart.
  Now the CSS styles only `.is-down`; under a mouse or pen it is set on `pointerdown` as before, on touch it is a short flash (`--tn-t-tap`,
  140 ms, new token) after the click of a tap whose finger moved at most 8 px (no `pointercancel`, no scroll); a keyboard click flashes too.
  Applies to every tappable element (buttons, rows, table rows, tiles, tabs, menu items). Scenario `touch-press`, mutant `press-on-touchdown`;
  `tests/press.test.mjs` keeps `:active` out of the kit's CSS (headless Chrome does not set it for a synthetic touch, so no mutant can show it).
- **Hover only for a pointer that hovers** (round 11): every `:hover` rule sits under `@media (hover: hover)`. Chrome on Android keeps `:hover`
  on the last tapped element; a row whose detail was closed by a swipe or by Back (no further tap) stayed lit with `--tn-hover` and looked
  still selected. The kit's own mark (`aria-current`, `is-selected` beside the inspector) was already cleared on every close path. The forced
  gallery states `.is-hover` stay unconditional. Clickable table rows get `touch-action: manipulation` like the other tappable rows.
  Scenario `detail-mark-cleared` (close button and Back, desktop also Escape), mutants `row-hover-touch`, `mark-kept-on-close`.
- **Sort direction on a phone** (round 11): in list mode the sort bar holds the column menu (“Sorted by CPU”, the menu only picks a column; the
  current one keeps its direction) and beside it an arrow button that shows the direction (aria-label “Ascending”/“Descending”) and flips it with
  one tap. Desktop header sorting unchanged. `pickSort()`/`flipSort()` in `table-data.js`; locale keys `table.asc`/`table.desc` replace
  `table.sortedAsc`/`table.sortedDesc`. Scenario `table-sort-dir`, mutant `sort-dir-dead`.

### Tooling
- **Release in one command** (TN-29): `tools/release.mjs` (dry run by default, `--yes` releases): preflight (clean tree, release branch,
  fetch, origin/main ancestor, the four versions agree and are newer than the newest tag, release notes build), then a green verify stamp for
  exactly this tree or the full selftest, ff main, annotated tag, atomic push. `docs/releasing.md` also lists the consumer (board) steps.
- **Verify stamp**: a green `verify --full --selftest` writes `<git common dir>/tarn-verify/stamps/<tree>.json` keyed on the content hash of
  all files (shared by all worktrees), so a release does not rerun a selftest that already ran green on the identical tree.
- `docs/ci-speed.md`: baseline of the check time (`--full --selftest` 349 s at `--jobs 2`, 190 s at 4, 143 s at 6) and the plan for stage 2.

## 0.16.0

### Added
- **Where a tap leads** (TN-22, owner's rule HL-72): `go: 'detail' | 'view'` on `metricRow`, `statTile`, `mediaRow`, `table` and `go: 'view'` on
  `button`. `'detail'` (the default with `onClick`) keeps the chevron: the detail opens in the view you are in. `'view'` shows the link symbol
  `arrow-up-right` instead: the tap leads into another view (an overview tile, a row that opens the thing where it lives, “Open in …”). Never
  guessed from `onClick`. `arrow-up-right`, not `external`: that one reads as “another website”. The element carries `data-go`.
  `GO_ICONS` and `goMark(go)` for rows of your own; a later third value (subpage) gets its own symbol. In a phone list with measurements
  (`table`, `mobile: 'metric'`) the link symbol stays visible (the chevron is hidden there). docs/components.md “Where a tap leads”,
  docs/dashboard-guidelines.md rule 15, gallery “Rows and facts”.
- verify rule `go-symbol` (content probe): a `go: 'view'` element without the visible link symbol or with the chevron, a `detail` one with the link
  symbol; found by the icon's path. Mutant `go-view-chevron`. Whether a handler stays in the view is not visible without running it: a board checks
  that in its own test.
- Icon `arrow-up-right` (Lucide).

### Changed
- The shell's “Open in …” button of `detailOf(…, { link: true })` shows the link symbol instead of the chevron.
- Sample board: the overview tiles and the job rows in a host detail are `go: 'view'`.

## 0.15.0

### Added
- **A thing with measurements in list mode** (`table()`): a column with `mobile: 'metric'` is a labelled measurement in the row's measurement
  line under the title, in a fixed column order (CPU at the same place in every row); `short` is its label there (default `label`), e.g.
  `{ key: 'mem', label: 'Memory', short: 'RAM', mobile: 'metric' }`. The line holds two to six measurements on one column template for the
  whole list: as many side by side as fit, balanced lines (five where four fit → 3 + 2), the second line aligned like the first.
  **A measurement is never cut**: a value that does not fit beside its label moves below it in its own cell (same x), still too wide it wraps
  at its spaces; a number is never broken. docs/components.md “The measurement line”.
- `mobile: 'action'`: one control top right of the row (e.g. a watch toggle); it does not open the row, neither by click nor by Enter.
  Generally, a button inside a row no longer opens the row.
- `listLabel` per column: show the column label in front of a value or sub value in list mode (“Size 45 GB”); default: only for metrics.
- **Sorting in list mode**: above a list with at least two sortable columns a sort button shows the current order (“Sorted by CPU” with the
  direction arrow) and opens a menu of the sortable columns; choosing the current one flips the direction. The default order is the table's `sort`.
- `iconButton({ onToggle, iconPressed })`: a toggle that flips its own `aria-pressed` and icon. `onToggle` returning `false` or a promise that
  rejects (or resolves to `false`) puts it back to its old state; while the promise runs it is `aria-busy` and ignores further clicks.
- Icons `eye` and `eye-off` (watch / not watched).
- verify: geometry rule `metric-cut` (a measurement label or value wider than its box), mutants `metric-value-ellipsis` and `metrics-one-line`;
  verify target `gallery-de` (the gallery's table view in German on the phone sizes).

### Fixed
- Swipe between parts (`segmented({ pane, swipe: true })`) works wherever it starts below the control, also in the empty room of the view down
  to the lower edge of the screen: the shell's `.tn-main` takes those touches for the one swipe area of the view (and has touch-action
  pan-y while it holds one); before, only the content itself took it (a short part ended halfway down the screen), and in the empty room the
  browser could take the sideways swipe as its own back gesture. Boards get it without a change.
- The neighbour being pulled in no longer makes the page taller: it is cut at the lower edge of what is visible (before, pulling a long part in
  from a short one grew the page, e.g. 780 → 1651 px, while the finger held it). The moves of a swipe are followed on the window, and a gesture
  whose view was drawn anew meanwhile leaves nothing behind.
- The empty room is found when a touch starts (one listener on the document, the view's one swipe area under `.tn-main`): an area mounted
  late (a part built after loading, a view put back from a cache) takes it too; nothing to register or clean up.
- verify scenario `segmented-swipe-empty-room` (the swipe demo alone, short part, a long neighbour): a swipe in the empty room near the lower
  edge switches, and the page does not grow while the neighbour is held; mutants `swipe-ignores-empty-room`, `swipe-neighbour-grows-page`.
- `aria-current` marks the row whose detail is open, and no other, also when opening or switching the detail draws nothing anew (the shell keeps
  it, in the inspector and on the phone alike; the highlight stays inspector only). Before, only drawing set it: it depended on data arriving
  afterwards and stayed on the row of the detail opened before. verify scenario `detail-current-row`, mutant `current-row-only-drawn`.

### Changed (for existing boards)
- In list mode the title of a row takes up to two lines before it ends in “…” (was one).
- In list mode a table with at least two sortable columns gets the sort button above its rows (44 px of height; desktop tables keep their header). Opt out by marking columns `sortable: false`.
- On touch every icon button has a hit area of at least 44 px (drawn size unchanged; in a table row the control is drawn at 28 px).
- Without the new options nothing else changes: a table without `mobile: 'metric'` keeps its list rows (title, sub, value, chevron).

## 0.14.0

### Added
- `views[].infoIcon`: the icon of the button next to the toolbar title when it opens the thing's details rather than an explanation (e.g.
  `'file-text'` for an order's text, terms and budgets); default `'info'`, which stays for explanations. Gallery "Entries per thing". docs/shell.md

## 0.13.0

### Added
- `growList(items, render, { load, more, key, step, id, empty, zebra })`: a list that is never cut. It draws 50 rows at first and the next ones
  while the reader scrolls (IntersectionObserver on the end of the list); with `load(offset)` and `more` it asks the board for the rest by itself
  (loading row, compact error with "Try again"). `key` drops rows that arrive twice, `id` keeps drawn and loaded rows across redraws of the view.
  Bookkeeping without the DOM in `js/growlist-data.js` (tests/growlist.test.mjs). Gallery "Cards and tiles". docs/components.md
- Icons `file-text` (a document: details of a thing, next to the ⓘ that stays for explanations) and `pin` (pinned rows).

### Changed
- New content rule 14 "A list is never cut" (docs/dashboard-guidelines.md) and principle 15 in AGENTS.md: every list shows all rows or grows by
  itself while scrolling; no "Show more" button, never a "26 more" line that cannot be tapped; a folded section holds the whole list. Found on the
  Markt-Scout ("26 more candidates" under 40 rows).

## 0.12.1

### Changed
- A toolbar title from the data (`views[].title(ctx)`, e.g. an order's long name) may end in … on the phone; the ⓘ next to it shows the details.
  verify's `toolbar-title` rule keeps holding the board's own view labels to the full width (the shell marks a data title with `data-title-data`).
  Found by the Markt-Scout with a real order name.

## 0.12.0

### Added
- `section(title, { fold })`: the title row becomes a button that folds the section's content (chevron, `aria-expanded`). `fold: 'id'` starts folded,
  `fold: { id, open: true }` open; the state is kept by id while the page lives, so a view drawn again on every poll keeps it. For quiet groups such as
  "More candidates", "Unseen" or "Routine" (Markt-Scout). Gallery "Cards and tiles". docs/components.md

## 0.11.0

### Added
- Navigation groups that fold: `createApp({ navGroups: { id: { label, collapsible, collapsed } } })`, views refer to a group by `group: id`. The heading
  of a collapsible group is a button with a chevron; the choice is kept per browser. Groups without an entry stay plain headings. docs/shell.md "Views"
- `views[].entries(ctx)`: a view appears in the navigation as one entry per thing it shows (e.g. per order), each linking to the view with its
  `params`, active while those params are shown (or `active: true`), with its own icon and counter. Built for the Markt-Scout (one entry per order).
- `views[].title(ctx)` (toolbar and page title from the data) and `views[].info(ctx)` (an ⓘ next to the title that opens, for example, a sheet with
  the details of what the view shows). New texts `shell.viewInfo`, `shell.viewInfoAbout` in all four languages.
- Gallery: the group "Shell · App frame" folds, and the view "Entries per thing" shows `entries`, `title` and `info`.

## 0.10.1

### Fixed
- A view opened again while its own source still fails showed its loading state until the next fetch of the app source (up to its
  interval): the second failure brought the same error, so nothing changed and the view was not drawn again. The shell now redraws the view
  when a load ends in an error, also an unchanged one (found by the Homelab Board's check with failing metrics, which opens that view twice).

## 0.10.0

### Changed
- The time range control reads as a selector: clock, range and chevron, the long form of the menu items (“Last 24 hours”) from 600 px, the short
  one (“1 d”) on the phone.
- The freshness text shows the age of the source the view mainly shows (its own source, else the app's; `views[].freshness: 'app'` overrides),
  not the oldest of both. Reload turns its icon while it runs (at least about 0.5 s, reduced motion respected), the text shows the new age at
  once, and a reload that brought nothing newer says so (toast; the source list names the source and shows its note).
- A range change keeps the old range's values until the new ones arrive (`state.refreshing`); the shell marks the content `aria-busy` and dims
  the charts. Before, `promSource.setRange()` dropped the data, the view drew its loading state for a moment and the blocks jumped. docs/data.md
  "Time range"

### Fixed
- A view whose own source fails completely after a view change shows its error with “retry” at once; before, the shell only redrew on new data, so
  the view kept its loading state until the app's next fetch (up to 60 s).
- Equal errors of a `promSource`'s queries are merged into one line with a count (`19 queries: HTTP 502`) instead of one line per query.

### Added
- `menu()` gives a text button as anchor the chevron (`chevron-down`) when it has none; verify rule `trigger-chevron` (geometry) finds a dropdown
  trigger with text and no chevron, mutant `menu-no-chevron`.
- The freshness text opens a source list: every source of the current view with name, age, refresh interval and note, stale ones marked, and a
  reload button (on the phone the only way to reload; the text is no reload button any more). `label`/`note` on `dataSource` and `promSource`,
  `parts` on `combineSources`, `interval` on every source. verify scenario `fresh-sources`, mutant `reload-invisible`. docs/shell.md
- verify `overlay-shift`: overlay scenarios marked `steady` record the boxes of the view's blocks before, during and after the interaction; a
  block that moves, resizes, appears or disappears is a finding (`range-menu`, `range-change`). New mutant `range-drops-data` (the old behaviour);
  `range-keeps-old-data` now drops only the refreshing mark.
## 0.9.3

### Added
- `mediaRow({ media, title, lines, onClick, key, selected, label, titleLines })`: a row with a picture – the picture on the left (a square,
  `--tn-mrow-media`, 72 px), the title over the whole remaining width (up to three lines, then "…" with the full text as hint), the board's
  lines below (a value line, a line of badges). The whole row is the button; no chevron, no status dot, no value column – on a phone those
  took the title's room (Markt-Scout listing rows: titles cut after a few words, a dot and a verdict word saying the same thing twice).
  Gallery Rows "mediaRow()", docs/components.md; overlay scenario `media-row`, mutant `media-row-two-lines`. `.tn-clamp-3`/`.tn-clamp-4`.

## 0.9.2

### Changed
- The title of a detail (inspector, panel, bottom sheet) and of `openSheet()` is always whole: it wraps over as many lines as it needs instead
  of ending in "…" (Markt-Scout: long listing titles were cut). The inspector head grows with it. Overlay scenario `detail-long-title`, mutant
  `detail-title-ellipsis`.
- `table()`: 50 rows at first instead of 20 (`PAGE_SIZE`), and the next ones load by themselves while scrolling – an `IntersectionObserver`
  draws the next step when the footer comes within 600 px (`MORE_AHEAD`) of the visible area; the *Show more* button stays as the fallback
  (no observer, or the user prefers to tap). `pageSize` keeps working (`0` = all). Overlay scenario `table-load-more`, mutant
  `table-no-auto-more`.

## 0.9.1

### Fixed
- Shell: `ctx.params` no longer holds `open` (the detail stays `ctx.open`), and `app.go(view, { params })` drops an `open` inside `params` – only
  the `open` option opens a detail. A view drawn while a detail was open (new data, `refresh()`) kept `open` in `ctx.params`; a switch built
  from it (`go(view, { params: { ...ctx.params, tab } })`) reopened the detail after it had been closed (Markt-Scout: close a listing with a
  swipe down, swipe to the next tab, the listing came back). Pure part `viewParams()` in `js/router.js` (unit test); overlay scenario
  `param-stale-open` with the mutants `stale-open-in-params` (the 0.9.0 state) and `go-open-from-params`. The sample board's history switch
  now keeps the other parameters (`{ ...ctx.params, cpu }`), as docs/shell.md recommends.

## 0.9.0

### Added
- Swipe between parts: `segmented({ pane, swipe })`. `pane: (value) => content` returns the control with the content of the chosen option below
  it (`.tn-segset`); `swipe: true` adds a touch gesture on that content: the neighbouring part comes in from the side of the swipe, follows the
  finger and settles on release, the marker of the active option glides along. Vertical scrolling has priority (axis after 10 px, sideways only
  when `|dx| ≥ 1.5 |dy|`; the content leaves pan-y and pinch zoom to the browser); a touch that starts in a sideways scroller (table, image strip,
  chips), a field or `[data-tn-noswipe]` switches nothing; a rubber band at the first and the last part, no wrap; with reduced motion nothing
  moves and the swipe switches on release. Clicks, keys and `onChange` are unchanged (it fires once the part is in). Pure parts in
  `js/swipe-data.js` (core), unit tests `tests/swipe.test.mjs`; gallery Controls "segmented() with panes and swipe"; overlay scenario
  `segmented-swipe` with the mutants `swipe-wraps`, `swipe-no-touch-action`, `swipe-ignores-reduced-motion`. Docs: docs/components.md
  "Swipe between parts".
- `metricRow({ wrapTitle: true })`: the title takes up to two lines before it ends in "…" (long listing titles on a phone; full text as hint).
  Gallery Rows "metricRow({ wrapTitle })".
- `fmtNum(n, digits, min)`: at least `min` decimals (amounts: `fmtNum(9.9, 2, 2)` → "9,90" instead of "9,9").

### Changed
- Image viewer: counter, *x* and the paging arrows wear the viewer's own background, opaque (`--tn-bg-sunken` in the dark scheme, light text)
  instead of the half-transparent black veil of 0.8.3 – on the grey margin beside an image of another aspect ratio the veil was a slightly
  different black that looked odd (Markt-Scout on Android); now they melt into the margin and stay readable over the picture. The paging
  arrows are smaller: a visible circle of 36 px inside a target of at least 44 px, 10 px from the screen edge plus the safe area (they sat at
  the edge and covered too much of the picture). The tokens `--tn-media-veil*` stay for boards.
- verify `image-viewer`: counter, *x* and next button must wear the viewer background (opaque, same colour), contrast ≥ 4.5 on it, buttons ≥ 44 px;
  the paging circle about 36 px and 8–14 px from the edge. Mutants `viewer-controls-no-veil` (adapted), `viewer-controls-dark-veil` (the 0.8.3
  veil), `viewer-nav-at-edge` (the 0.8.4 arrows).

## 0.8.4

### Added
- `dataSource({ revalidate, refreshOnShow })` for live backends (Markt-Scout: the dashboard reads straight from its database instead of a
  snapshot file). `revalidate: true` sends the ETag of the data held as `If-None-Match`; a `304` keeps the data – the same object, `parse` does
  not run – and confirms it as current (`fetchedAt` now, age 0), a `200` replaces it and remembers the new ETag. `refreshOnShow: true` fetches at
  once when the tab becomes visible again instead of only when the interval has passed; hidden tabs still never poll. Both default to `false`,
  so existing boards behave as before. Docs: docs/data.md "JSON: dataSource"; tests `tests/datasource.test.mjs`.

## 0.8.3

### Fixed
- Image viewer: the counter "1 / 2" and the *x* stood straight on the picture, thin and light grey – on a light photo, and on a zoomed one that
  reaches under the head, they were hard to see (Markt-Scout on Android). Now the counter is a dark pill with a camera icon, *x* and the paging
  arrows are dark round buttons; all three have a fixed veil `rgb(0 0 0 / .6)` behind white text and icons with thicker strokes, independent of
  the picture and its zoom (they lie above the stage and do not zoom). White on the veil over a white image is 5.7:1. The buttons are at least
  44 px (48 with the comfortable density) with every pointer; the head is the toolbar height plus a margin and keeps clear of the status bar and
  a notch (`env(safe-area-inset-*)`); the image frame starts below it as before.

### Added
- Tokens `--tn-media-veil`, `--tn-media-veil-hover`, `--tn-text-on-media` (controls over photos; same value in both themes). Icon `camera`
  (Lucide).
- verify: the `image-viewer` scenario checks counter, *x* and the next button – each has its own veil (alpha ≥ .5), contrast ≥ 4.5 over a white
  and over a black picture, buttons ≥ 44 px, none inside the zooming stage; mutant `viewer-controls-no-veil` (the 0.8.2 head).

## 0.8.2

### Added
- Image viewer fling: zoomed, a pan released while the finger still moves fast glides on in that direction and slows down exponentially (time
  constant 325 ms, `FLING_TAU`, like the iOS and Android scrollers), driven by `requestAnimationFrame`. In 0.8.1 the image stopped dead where the
  finger lifted. The speed is measured over the last 100 ms of the drag (0 when the finger rested 40 ms before it lifted, capped at 6 px/ms);
  towards a near edge the start speed is lowered so the glide comes to rest at the edge instead of hitting it. A new finger holds the image where
  it is (that press is no tap and never closes the viewer); the wheel, paging, another zoom and a resize stop it. It never pages (only a drag
  beyond the edge does), there is none at 1× (the carousel settles there) and none with reduced motion. Pure helpers in `js/images-data.js`:
  `releaseVelocity`, `flingStart`, `flingStep` (unit tests: speed window, rest, cap, decay, frame-size independence, limits, soft stop).
- verify: the `image-zoom` scenario checks the glide on touch (goes on after release, no paging, inside the limits), the hold by a new finger
  and no glide with reduced motion (emulated); mutants `viewer-no-fling` (the 0.8.1 behaviour), `viewer-fling-ignores-reduced-motion`,
  `viewer-fling-not-held`.

## 0.8.1

### Fixed
- Image viewer: paging by swipe showed black instead of the neighbour, then swapped the picture at once. The 0.8.0 viewer had a single `<img>`:
  a drag moved only that element over the dark dialog, so the side it uncovered was empty (nothing was there to slide in); on release the same
  element was sent back to the middle while its `src` was swapped, and the neighbour, preloaded only as a detached `new Image()` with
  `decoding: async`, was decoded when it was set, so the old image slid back and was replaced by a different one. Now the viewer is a carousel:
  every image is a slide on one track (slide i at i × 100 %), the track follows the finger so the previous or next image slides in while you
  drag, and on release it settles on the new image or back (closing duration, instant with reduced motion); keys and buttons page with the same
  slide. The current image and its neighbours get their file at once and are decoded ahead with `img.decode()`.

### Added
- Image viewer zoom: pinch about the fingers' centre; a double tap (double click) at a spot steps 1× → 2× → 3.5× → 1×; the wheel (also Ctrl+wheel,
  a trackpad pinch) zooms at the pointer; `+` steps in, `-`/`0` back to 1×. Zoomed, a drag pans inside the image's limits (no empty edge), a drag
  down does not close, and only a drag beyond the left or right edge hands the rest to the carousel and pages; the new image starts at 1×. At 1×
  a horizontal drag pages and a drag down closes as before. A single tap beside the image still closes, but only after the double-tap time
  (`DOUBLE_TAP_MS`, 300 ms), so a double tap never closes. Back (one history entry) is unchanged. Pure helpers in `js/images-data.js`:
  `nextZoomStep`, `clampScale`, `panLimits`, `clampPan`, `zoomAt`, `panHandoff`, `isDoubleTap`, `trackOffset` (unit tests in
  `tests/images.test.mjs`). The API of `imageStrip()`/`openImageViewer()` is unchanged.
- verify: overlay scenario `image-zoom` (double-tap steps, never closing on a double tap, the next image loaded and in view during a drag, pan
  limits, no close when zoomed, paging only beyond the edge with the new image at 1×, pinch, single tap closes after the wait); mutants
  `viewer-pages-before-edge`, `viewer-no-neighbours` (the 0.8.0 fault), `viewer-doubletap-closes`, `viewer-zoom-no-reset`. The `image-viewer`
  scenario reads the current slide.
- Icon `bookmark` (Lucide), for "keep/save for later" actions (Markt-Scout's *Save* button).

## 0.8.0

### Added
- Images: `imageStrip(images, { label, onOpen })` – a row of thumbnails of the same size that scrolls sideways (scroll snap), a list "Images" with
  buttons "Image n of m", arrow keys, Home and End along the row; an empty list draws nothing. A tap opens `openImageViewer(images, { index, onChange,
  onClose, returnFocus, back })` – the image large above everything (a modal dialog, always dark), counter "n / m", paging by swipe (touch, pen,
  mouse), arrow keys, Home/End and two buttons (no wrap), preloading of the neighbours; *x*, Esc, a tap beside the image, a swipe down and Back close
  it. The viewer takes one history entry like a sheet, so the Android back button of an installed app closes the viewer, then the detail, then the
  view – a board that opened photos with `<a target="_blank">` left the app instead, and Back closed it. After closing, the focus is on the thumbnail
  of the image shown last. No zoom (a pinch would fight the swipe). Pure helpers in `js/images-data.js` (`normalizeImages` is exported), unit tests
  `tests/images.test.mjs`; texts `images.*` in en/de/es/fr. Gallery: "States and sheets" shows several images, one, a thumbnail that does not load,
  the empty list and the viewer opened directly (sample images `gallery/img/`). Docs: docs/components.md "Images", docs/shell.md "Back" (level 2),
  AGENTS.md "Choosing building blocks".
- verify: overlay scenarios `image-viewer` (paging by keys and swipe without wrapping, the whole image fits below the head, Esc and a tap beside
  close, the focus comes back to the thumbnail) and `back-viewer` (a viewer over a detail: Back closes the viewer, then the detail, then the view);
  mutants `viewer-ignores-back` and `viewer-wraps`.

## 0.7.1

### Fixed
- A view parameter changed on the same view redraws the view at once (`app.go(view, { params })`, e.g. a `segmented()` that keeps its tab in
  the URL): before, the hash changed and the content stayed until the next data fetch. The redraw is the one of `app.refresh()` (focus and caret
  of the field being typed in, scroll position and an open detail stay); the same parameters again, opening or closing a detail draw nothing, a
  range change draws once. With `back: 'history'` the same call now replaces the entry as documented (it did nothing). docs/shell.md "Routing"
  says what a parameter change does. Overlay scenario `param-redraw` (clicks the sample board's CPU switch and reads the chart), mutants
  `param-no-redraw` and `param-redraw-always`; the mutant `redraw-loses-focus` now names the `refresh()` line it patches.
- Sample board: the history view's 24 h / 48 h switch is a view parameter (`#/history?cpu=48h`); the overview tile "Runs (7 days)" opened an
  unknown view (and landed on the overview) instead of History.
- AGENTS.md checklist: a control that changes what a view shows is clicked in the check, not only opened by link.
- Overlays at the right edge were cut by the scrollbar gutter on desktops with scrollbars that take space (Windows, Linux): while the page does not
  scroll, `html { scrollbar-gutter: stable }` reserves the gutter but `documentElement.clientWidth` still counts it, so a hint under the theme
  button reached 11 px into it (measured at 1440 px: page 1425 px, hint to 1436 px). All anchored overlays (tooltip, data card, menu, info popover,
  combobox list, board switcher) are now placed by one function in `js/overlay.js` (`placeOverlay()`, `viewWidth()`) against the root's laid-out
  box. Toasts were not affected (CSS-positioned). Overlay scenario `edge-scrollbar` (hint and menu at the right edge, page not scrolling and
  scrolling, with the test Chrome's space-taking scrollbars), mutant `overlay-gutter`.
- Enter in the `confirm({ typeToConfirm })` field and in the combobox search does nothing while an input method composes a character
  (`isComposing`, keyCode 229; `imeComposing()` in js/inputs-data.js, unit-tested). Overlay scenarios `confirm-typed` and `combobox-ime`, mutant
  `ime-enter`.
- `confirm({ typeToConfirm })`: a tap beside the dialog no longer cancels it (a half-typed name was lost); Esc, Back and *Cancel* still do. Dialogs
  without the field are unchanged. Mutant `confirm-typed-outside`.
- `menu()`: a disabled item is `aria-disabled` instead of `disabled`: it stays reachable with the arrow keys and is read by assistive tech, choosing
  it does nothing, its `hint` (the reason) keeps full contrast. The sample board's "Pause" on a job that is off says "Already off" (and gives
  feedback when it is available); the gallery menu shows the same case; dashboard-guidelines rule 11 points to it. Overlay scenario
  `menu-disabled`, mutant `menu-disabled-hidden`.
- A focused row (`metricRow`, table row) keeps the focus when the view is redrawn (`app.refresh()` after new data, a parameter change); before,
  the focus fell back to the page. Overlay scenario `row-refresh`, mutant `redraw-loses-row`.

## 0.7.0

### Added
- `promSource({ base, queries, interval?, staleAfter?, minStep?, maxPoints? })`: named PromQL queries against the Prometheus HTTP API
  (`GET {base}/api/v1/query` and `/api/v1/query_range`, same origin; VictoriaMetrics answers it as well). A range query (`range: true`) gives
  `{ x, series: [{ label, labels, values }] }` on one time grid with `null` in gaps, what `lineChart`/`barChart` take; an instant query gives rows
  `[{ label, labels, value }]`, `promValue(rows, match?)` picks the one number. `legend` is a template (`'{{instance}}'`) or a function of the
  labels; `expr` a string or a function of the current range. The step keeps a series at most about 300 points long (`minStep` as lower bound);
  without `interval` the refresh follows the range. Errors per query (HTTP, `status: "error"` with its text, not JSON, timeout): the other queries
  still update, the failing one keeps its last good data and the message names it; age is that of the oldest query.
- `promEscape(value, { regex? })` escapes label values for a PromQL string; `RANGE_PRESETS` (1 h, 6 h, 24 h, 7 d, 30 d).
- `combineSources({ a, b })`: one source with `data = { a, b }`; in error or stale when a part is (the message and `staleParts` name it, the stale
  banner says which part), age of the oldest part, every part keeps its last good data.
- Time range: one per app, a kit menu in the toolbar while the shown view's source follows the range (`createApp({ ranges?, range? })`,
  `app.range`, `app.setRange(id)`). Kept as the view parameter `range`; a choice replaces the history entry. Changing it aborts requests in flight
  and drops the old range's data before the view renders. Texts en/de/es/fr.
- Sources of one view: `views[].source` starts when the view is shown, stops when it is left, and is merged with the app's source for `ctx.data`,
  the freshness text and the banners. Queries of one view do not run while another view is shown.
- `dataSource({ timeout })` (default 30 s); `stop()` aborts a request in flight. All sources share one polling engine.
- Gallery view “Data sources” on a simulated Prometheus (`gallery/prom-sim.js`, a `fetch` replacement computed from the time asked for; also used by
  the unit tests, no request reaches a real metrics server).
- verify: overlay scenarios `range-menu` and `range-change` (the range choice replaces the history entry and the chart never shows the old
  range's data under the new label), mutant `range-keeps-old-data`.
- `card({ info })`, `section(title, { info })` and `infoButton(text)`: an optional explanation behind a small “i” next to the title, closed by
  default, opened in a kit overlay above sheets (tap and keyboard; Escape, a tap outside, Tab and a width change close it, the focus goes back to the
  “i”). `INFO_MAX` (280 characters). Kit text `common.info` in en/de/es/fr. Gallery entry in “Cards and tiles”.
- verify content rules in the geometry check (kit and `--board`), from docs/dashboard-guidelines.md: `prose` (always-visible running text from five
  words on beyond card 100, section 60, tile 40, row 120 characters; values, table cells, logs, code, Markdown and facts do not count), `banner-info`
  (an info or neutral banner on a view), `info-length` (an `info` text over `INFO_MAX`). Limits measured on the gallery and the sample board; the
  gallery views that demonstrate long texts and every banner tone are excepted (`gallery-demo-text`). Overlay scenarios `info` and `sheet-info`,
  mutants `info-below-sheet`, `prose-on-view`, `disclaimer-banner`, `info-too-long`.

### Changed
- Sample board: the deploy empty state is one line, the storage tile's sub line is “name · percent” instead of a sentence, the schedule explains its
  colours behind an “i”. Starter: the sent status no longer carries a demo note.

### Fixed
- `lineChart` time axis: the tick step follows the width and the labels (no label leaves the chart or touches its neighbour; a 7 d range on a
  phone showed one tick), labels through Intl (day and month for day steps and at local midnight, time of day otherwise) instead of a cut date
  (“11/12/”). New verify rule `axis` with mutant `axis-labels-crowd`.
- Source error texts of the kit (timeout, not JSON, unexpected response) go through the catalog (en/de/es/fr); `HTTP <status>` and a server's
  own `error` text stay as they are.

### Docs
- docs/data.md rewritten around the source kinds (JSON, PromQL, combined, view sources; stream planned), the two server options for the Prometheus
  API (reverse-proxy route with a sample, or a board backend with its own expressions) and a walk-through from a Grafana panel to a Tarn view;
  pointers in docs/charts.md, docs/building-a-board.md and the AGENTS.md building-block table. docs/shell.md: the time range (options `ranges`,
  `range`, `app.range`, `app.setRange`, the `range` parameter and its history rule) and `views[].source`.
- docs/dashboard-guidelines.md: what goes on a view – one question per view, no explanations, disclaimers or method notes on the screen (they go
  into the hand-in report), short labels with units, status as state, one-line empty states, a number once, overview first, a unique name for every
  control, unavailable actions shown with their reason, nothing opens unasked, no silent loss of input in a sheet; each rule with a do and a don't.
  Linked from the README, the docs index, AGENTS.md (principle 14, checklist) and docs/building-a-board.md; docs/checks.md “Content”.

## 0.6.1

### Fixed
- verify rule `scroll-y` no longer reports the scroller of an overlay layer (sheet body, inspector body, sidebar: the boxes that set
  `overscroll-behavior`). A detail whose content is a few px taller than the sheet scrolls by that much on purpose; the rule is meant for boxes
  inside the page (timeline, tabs, segmented). Found on the first board checked with 0.6.0: three detail panes were reported, none was a fault.
  The kit's own pages did not have a detail of that height, so the selftest did not see it.

## 0.6.0

### Added
- Back goes by levels, not through the history (`createApp({ back: 'levels' | 'history' })`, default `'levels'`). Levels: 0 = the default view,
  1 = any other view, 2 = an open layer (detail via `?open=`, sheet, panel, `confirm()` dialog, phone/tablet drawer). Back with an open layer
  closes the topmost layer only; Back on another view goes to the default view; Back on the default view leaves the page. The history never
  grows with use: default → A adds one entry, A → B replaces it, A → default returns to the base entry, a detail opened in A sits on top of A,
  “Open in …” from a detail replaces, same view with other parameters (`app.go(view, { params })`, filter, sort, tab) replaces. The base entry
  keeps the default view's parameters. Typed URLs, `location.hash = …`, in-content links to `#/view` (caught on click) and `ctx.app.go/open`
  are folded into the model. An entry the browser added itself (typed URL, `location.hash`) is folded without a traversal; entries below it that
  the model does not need stay, and a Back that reaches one of them on the default view leaves the page on its own. Forward is folded like a
  typed URL; nothing more is promised for it. `'history'` keeps the behaviour before 0.6.0 (every view change is an entry).
- Installed app (display-mode `standalone`, `minimal-ui` or `fullscreen`): Back on the default view first shows the toast “Press back again to
  close” (en/de/es/fr) and leaves on a second Back within 2.5 s; after 2.5 s the catching entry is set again. No dialog: a page cannot close an
  installed app reliably, a second Back can. On by default, off with `createApp({ exitHint: false })`.
- Deep links at level 1 or 2 (also from a notification) get the missing lower entries, so Back walks down the levels. Chrome's history
  manipulation intervention skips entries a page adds before the user ever activated it, so the shell adds them with the first touch or key
  (`navigator.userActivation.hasBeenActive`; all missing entries at once). **Back before the first touch** leaves the page directly: in a browser
  tab to the previous page, in an installed app it closes the app, without the exit hint. Measured in Chrome 157 with the browser's own Back
  (Alt+Left, which honours the intervention like the Android back button): deep link `#/jobs?open=…`, Back untouched → previous page; one tap,
  then Back → `#/jobs` → `#/overview` → previous page; an entry pushed by a script without activation is skipped by Back. A reload restores the stack from `history.state`
  (open sheets and dialogs are not restored).
- `openSheet({ back: false })`: a sheet without a history entry (the shell's own detail sheet lives in the URL). `onClose` reason `'back'`.
  Without `createApp()` (starter pages) sheets and dialogs take no entry, as before. Chrome on Android closes an open modal dialog on Back by
  itself (close request); the shell then removes its entry, the result is the same.
- Pure module `js/levels.js` (shell profile: `levelOf`, `stackFor`, `withLayer`, `withoutLayer`, `backStep`, `plan`) with `tests/levels.test.mjs`.
- verify overlay scenarios on the real history of the test Chrome: `back-views` (three view changes, one Back = default view, history grew by
  at most one entry), `back-detail` (detail, Back = same view without detail, Back = default view), `back-sheet`, `back-confirm`, `back-drawer`
  (each closes on Back, nothing else changes), `back-deeplink` (deep link, touch, Back, Back), `exit-hint` (installed app). Chrome 157 ignores
  the CDP emulated media feature `display-mode`; the scenario tries it and otherwise answers `matchMedia` for display-mode by a script added
  before the page loads. `back-views`, `back-detail` and `back-deeplink` press the browser's Back (Alt+Left through CDP), not `history.back()`,
  so entries the intervention skips count as missing. Mutants `view-change-pushes` (the growing history), `sheet-ignores-back` and
  `deeplink-seeds-untouched` (lower entries added at load, before any activation).

### Fixed
- Shell, phone and tablet drawer: a tap on any navigation entry closes the drawer, also on the entry of the view already shown (before, the hash
  did not change and the drawer stayed open). The desktop sidebar is unchanged. verify overlay scenario `drawer-current`, mutant
  `drawer-stays-on-current`.
- Shell chrome is no longer selectable: a long press or a stray tap on the board title (sidebar head), the view title or the freshness text
  in the toolbar, a navigation entry or group heading, a tab or segment label or a badge inside a control selects nothing and shows no touch
  callout (`user-select: none`, `-webkit-touch-callout: none` on sidebar head, navigation, sidebar foot, toolbar, tabs, segmented, buttons).
  Fields a board puts into the toolbar stay editable. Content (table cells, values, detail text, logs, Markdown, code) stays selectable.
  verify geometry rule `select-chrome` checks both sides; mutants `title-selectable` and `cells-unselectable`.
- `timeline()`: a vertical swipe that starts on a timeline scrolls the page. Before, the box scrolled itself by a few px (phone 390 px: 5 px
  compact, 10 px comfortable; measured scrollHeight 411/416 against clientHeight 406) and the page did not move: `overflow-x: auto` made
  `overflow-y` compute to `auto`, and in the narrow layout the enlarged hit area of the bars in the last row sticks out below the grid.
  `.tn-tl-scroll` now has `overflow-y: hidden` and `.tn-tl-grid` clips in both directions (`overflow: clip`), so the content fits the box
  exactly: measured at 390 px in compact and comfortable, the example board's timeline (history view) 499/499, the gallery timeline 406/406
  and a one-row timeline 67/67 (scrollHeight/clientHeight); a vertical touch drag on each scrolls the page by about 186 px and leaves the
  timeline at scrollTop 0. The horizontal pan of a wide timeline keeps working. The same fault was in `tabs()` (the tab strip was 1 px taller
  inside through the tab's -1 px margin over the border): the separator is now an inset shadow and the margin is gone (same height);
  `.tn-tabs` and `.tn-seg` get `overflow-y: hidden` as well.
- verify, geometry rule `scroll-y` (all pages and views): a scroller (`overflow-y` auto or scroll, also the one `overflow-x: auto` creates) must
  not be vertically scrollable by 1–24 px; a horizontal scroller with `overflow-y: hidden` must not hide 1–24 px either (focus or
  `scrollIntoView` would still move it). Mutant `timeline-hidden-overflow` (the scroller hidden, the grid not clipped) is detected. Not checked: the page itself and boxes that cap their own height with `max-height` (log, menus, list
  popups), where the amount depends on the data. Mutant `timeline-scrolls-vertically` restores the old timeline and is detected; overlay scenario
  `timeline-pan` (touch sizes) drives a real vertical and horizontal swipe, mutant `timeline-catches-pan`.

### Docs
- `docs/shell.md`: section "Back" (levels, history rules, exit hint, deep links and the measured behaviour of Chrome's history intervention),
  options `back` and `exitHint` in the `createApp` table, drawer, chrome selection and scroller behaviour under "Layout behaviour";
  `docs/checks.md` names the Back scenarios. README: one feature bullet for Back by levels. The comments in `gallery/gallery.js`,
  `example/index.html` and `starter/index.html` point to `docs/getting-started.md` instead of the README.

## 0.5.3

### Added
- The visual judge is back as an optional, experimental tool (`tools/judge.mjs`, `tools/lib/judge*.mjs`, `tests/judge.test.mjs`, README section
  "Visual judge"), restored unchanged from 0.5.1. It is never run by `verify`, `lint` or CI, needs its own API key from the environment
  (`TYPESAFEAI_API_KEY`, one provider so far: TypeSafe Jev) and is never a gate. Last calibration: 12 of 25 visible faults and 23 of 167 clean
  pictures marked. Further decision models may be added later.

## 0.5.2

### Added
- `segmented()`: an option takes `count` and `tone` and shows the counter behind its label, in the same form as the sidebar counter (a red 2 in
  the sidebar is a red 2 on the part that holds the two problems).
- `timeline()`: `conflictTone: 'warn'` paints conflicting rows and bars in the warning colour, for boards where an overlap is a risk and not a
  failure. The default stays red.

### Fixed
- README: the sections Inputs, Filters, Forms and actions, Identity, Notifications, Multiple boards and Licence are back. They were cut off by
  accident in 0.5.0 (the file ended in the middle of the Markdown section) while the code and AGENTS.md still pointed to them.

### Removed
- The visual judge (`tools/judge.mjs`, `tools/lib/judge*.mjs`, its tests and its README section) left the kit. On the calibration set it marked
  12 of 25 visible faults and 23 of 167 clean pictures, and it is tied to one provider. It stays on the branch `visual-judge` until a comparison
  of decision models gives a better result. `verify` never used it.

## 0.5.1

### Fixed
- `log()`: the box no longer keeps a swipe to itself (`overscroll-behavior: contain` removed). In a bottom sheet a finger on the log now scrolls the
  sheet; before, nothing moved, also when the log had nothing to scroll. Found on the first real board.

### Added
- verify, geometry rule `scroll-trap`: a scroller in the page content or inside another scroller must not set `overscroll-behavior`; only the one
  scroller of an overlay layer (sheet body, sidebar, inspector, popover) may. Mutant `log-traps-scroll` brings the old log back and is detected.

### Changed
- README “What belongs in the kit” and AGENTS rule 6: the kit is the shared base. A block only one board needs is built in that board from kit parts
  and tokens; it moves into the kit when a second board needs it. (Before: every missing block went into the kit first.)

## 0.5.0

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