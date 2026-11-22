# Changelog

Format after [Keep a Changelog](https://keepachangelog.com/); versions follow [SemVer](https://semver.org/).
While the major version is 0, minor versions may change the API; every change is listed here.

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
- **Pattern "detail in place" (item 13):** a row that stands for a thing another view owns opens that thing's detail in the current view; moving to the owner is a link inside the detail. `app.detailOf(view, id, { link })`
  reuses another view's `detail` (and adds "Open in <view>", text in en, de, es, fr). The sample board's overview (problems, up next, recently failed) and history (timeline) follow it; new board states `overview?open=…`,
  overlay scenario `detail-in-place`, mutant `row-leaves-view`. README "Pattern: detail in place", AGENTS principle 2.
- **A redraw keeps the field you are typing in (G10):** `app.refresh()` (new data) rebuilds the view, and with it the filter bar; the shell now gives focus and caret back to the same field (matched by position, tag, type and label). The text stays the
  board's state (`filterBar({ value })`, as in the sample board). Overlay scenario `filter-refresh` (real typing, a redraw, typing goes on), mutant `redraw-loses-focus`.
- **`tiles()` closes its rows for any number of tiles (G8):** 5 tiles are wide 5 in a row, medium 3 + 2, phone 2 + 2 + 1 with a wide last tile (`fitTiles()` in `js/tiles-data.js`: balanced rows, the tiles of an incomplete row
  take whole parts of a common grid); `tiles({ className }, …)`; `loading({ tiles })` uses the same grid. Verify rule `tiles-ragged`, mutant `tiles-ragged`, `tests/tiles.test.mjs`, gallery demo with 3, 5 and 7 tiles.
- **`metricRow({ wrapSub })` (G7):** the sub line wraps over as many lines as it needs instead of ending in "…" (a problem row's reason is readable in full at 340 px); the sample board's problem list uses it. Verify rule `wrap-sub`, mutant `row-sub-wrap-ellipsis`, gallery demo.
- **Quiet footer line (G4):** `card({ footer })` and `section(title, { footer })` put one short muted sentence under the content ("+13 frequent runs hidden"; a link or button inside is fine), wrapping instead of truncating. Class `tn-foot`; gallery demo with four states (cards view).
- **shoot (G5):** `tools/shoot.mjs` now takes `http(s)://host:port/…` URLs of a running server without `--attach`: Node fetches the requests and fulfils them over CDP (like `verify --board`), so Chrome
  needs no network of its own; `--base URL` for paths, `--direct` for Chrome's own network. Cause of the old hang at `Page.navigate` in an agent sandbox: an inherited `DBUS_SESSION_BUS_ADDRESS` blocks
  Chrome's first D-Bus call and every HTTP navigation; the kit's own Chrome is now started without it (`chromeEnv()`), README documents what to do for `--attach`. Selftest checks the Node route; `shoot` and `load()` no longer
  leave an unhandled rejection when a navigation fails.

### Stage J: visual judge (optional second layer)
- `node tools/judge.mjs`: photographs page × view × size × theme with the capture path of verify (fixed clock, animations off, screenshot repeated until it is stable) and asks
  a decision model (TypeSafe Jev) one yes/no question per fault type (overflow, overlap, clipped, misaligned, malformed). Prints at most 10 lines (pictures marked, API calls,
  calls saved, cost) and writes `judge-report.json`. Not part of `verify`, `--ci` or the workflow; never a gate (exit 0 with marked pictures); only pages with invented data can be chosen.
- Never pays twice: verdicts cached by sha256 of the PNG + question-set version (`--cache`, default `$XDG_CACHE_HOME/tarn/`), spend ledger next to it, cost from the reported tokens
  at the list price, `--max-usd` (default 0.10) and `--max-total-usd` stop before a run would pass the limit; `--dry-run`, `--mock FILE`.
- `--calibrate`: the known faults of `verify --selftest` against the same states unmutated; thresholds per fault type and the table are in README "Visual judge".
- `tests/judge.test.mjs` (request, cost, cache, ledger, budget stop, calibration, CLI) against a recorded answer; no network, no key. `snapshots.mjs` exports `dateShim`.

### Board check: small things found by the first real board
- `verify --board`: an exceptions file that is named in `tarn-board.json` but missing no longer stops the run with ENOENT; it means no exceptions (as the README
  said, and as `lint.allow` already behaved) and is noted in the output.
- `--update` (kit and board) ends with "baseline written, nothing else checked" instead of GREEN: it rewrites the snapshots and is no verdict. The selftest checks this.
- README: which two touch exceptions a board with `timeline()` or `heatRow()` copies into its own file.

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
