# Components

The building blocks a view is made of: primitives, layout, cards and rows, tables, feedback, menus, sheets, Markdown. For a board author who picks parts
from the [gallery](https://r0gner.github.io/tarn/gallery/) and needs the exact options. Charts, inputs, filters, forms and notifications have their own
pages ([charts](charts.md), [inputs and actions](inputs-and-actions.md), [notifications](notifications.md)).

All functions return DOM elements and are imported from `/tarn/js/tarn.js` (the primitives and inputs also from `/tarn/js/core.js`). Status is always one
of `'ok' | 'warn' | 'bad' | 'unknown' | 'pending' | 'info' | 'off'`; colour comes only through these names or chart colour tokens, never as a literal.
The option lists below follow the JSDoc types in `js/`, which the type check (`verify --types`) keeps true. Every block has a gallery entry with all states.

## Helpers

| Function | Does |
|---|---|
| `h(tag, attrs, ...kids)` | creates an element (`class`, `style` objects, `on…` handlers, `aria-*`); children may be nodes, strings, arrays, `null` |
| `s(tag, attrs, ...kids)` | the same for SVG elements |
| `cls(...parts)` | joins class names, dropping falsy parts |
| `mount(el, ...kids)` | replaces the children of `el` |
| `$`, `$$` | `querySelector` / `querySelectorAll` as array |
| `icon(name, { size = 16, label })` | a Lucide icon from `icons/`; with `label` it has a role and name, otherwise it is decorative. `ICON_NAMES` lists what exists, see [identity](identity.md) |
| `tokenMs(name)` | a duration token (`--tn-t-open`, …) as milliseconds |

There is no `innerHTML` anywhere; text is set as text.

## Primitives

| Function | Options |
|---|---|
| `statusDot(status, { label, title })` | traffic-light dot; with `label` the text sits next to it |
| `badge(text, { tone = 'neutral', count })` | `tone`: a status, `'neutral'` or `'accent'`; `count: true` for a counter |
| `button(label, o)` | `variant` `'default' \| 'primary' \| 'ghost' \| 'danger'`, `icon`, `iconAfter`, `onClick`, `disabled`, `type`, `title` (the name and hint of an icon-only button), `small`, `className` |
| `iconButton(name, { label, hint, onClick, disabled, pressed, className, onToggle, iconPressed })` | `label` is required (aria-label and hint); `pressed` makes it a toggle button. `onToggle(pressed, e)` makes it a toggle that flips its own `aria-pressed` on a click and shows `iconPressed` while pressed (watch: `iconButton('eye-off', { label: t('…watch'), iconPressed: 'eye', pressed, onToggle })`); the label stays the same, the state is `aria-pressed`. When saving fails, `onToggle` returns `false` or a promise that rejects (or resolves to `false`): the button goes back to its old state; while the promise runs it is `aria-busy` and ignores further clicks. On touch every icon button has a target of at least 44 px, also when it is drawn smaller (in a table row 28 px); inside a `table({ onRow })` row it does not open the row |
| `segmented({ options, value, onChange, label, small, pane?, swipe? })` | 2–5 options `{ value, label?, icon?, title?, count?, tone? }`; `count` shows a counter behind the label, coloured by `tone` as in the sidebar; an icon-only option needs `title`. `el.setValue(v)` (no `onChange`), `el.value`. With `pane: (value) => content` it returns the control with the content of the chosen option below it ([Swipe between parts](#swipe-between-parts)); `swipe: true` adds the touch gesture |
| `tabs({ tabs, value, onChange })` | `tabs: [{ id, label, count?, tone?, render? }]`; sub-areas inside a detail. `el.setValue(id)` |
| `progress({ value, tone, label, showValue })` | `value` 0–1, `null` = indeterminate |
| `tooltip(el, text)` | the small hint, see [design language](design.md#hover-hints-and-overlays); `hideTooltip()` closes it |

`STATUS_TEXT` (status names in the active language) and `STATUS_RANK` (sort order, worst first) are exported next to the formatters.

## Layout

| Function | Does |
|---|---|
| `tiles(...tiles)` | grid of `statTile`s that fits any count: rows close by themselves (a short last row stretches), two columns on a phone. `tiles({ className }, …)` |
| `cols(...kids)` | columns side by side when there is room, stacked otherwise. `cols({ min: 280 }, a, b, c)` sets the minimum column width |
| `stack(...kids)` | vertical stack with the default spacing |
| `toolbarRow(...kids)` | button group inside a card or detail |
| `card({ title, sub, actions, flush, footer, info, className }, ...kids)` | the container; `flush: true` removes the padding for lists and tables; `footer` is one quiet line under the content (“+13 frequent runs hidden”); `info` see below |
| `section(title, { count, actions, footer, info, className, fold }, ...kids)` | a titled group without a box, optional counter; `fold: 'id'` (folded) or `{ id, open: true }` makes the title row a button that folds the content, the state survives redraws by id (0.12.0) |

**`info`: an explanation behind a small “i”.** For a display that cannot be read without a key (what a colour, an edge or an axis means): a string or node
(boards pass `t()` text), a few plain sentences, at most `INFO_MAX` (280) characters. The “i” sits next to the title; a tap, Enter or Space opens the text
in a floating layer (above sheets, like a menu), Escape, a tap outside, Tab and a width change close it, the focus goes back to the “i”. Closed by default.
Never a disclaimer or a method note ([what goes on a view](dashboard-guidelines.md)). A chart gets its explanation through the card or section around it.
`infoButton(text)` is the button on its own, for a place the kit does not cover yet.

## Rows, lists and facts

| Function | Options |
|---|---|
| `statTile({ label, value, unit, sub, status, onClick })` | a key figure; `sub` may be text or a `sparkline`; with `onClick` the whole tile is the button |
| `metricRow({ title, sub, value, valueSub, status, onClick, chevron, mono, label, selected, key, wrapSub, wrapTitle })` | one row; with `onClick` the whole row is the button with a chevron on the right; `wrapSub` lets the sub line wrap (a problem row's reason must be readable in full); `wrapTitle` gives the title up to two lines before it ends in “…” (long names, e.g. listing titles on a phone); `key` identifies the row for the selection in the inspector |
| `mediaRow({ media, title, lines, onClick, key, selected, label, titleLines })` | a row with a picture (a listing, a product, a camera): the picture on the left, the title over the whole remaining width (up to `titleLines` lines, default 3, then “…” with the full text as hint), below it the lines the board gives (a value line, a line of badges and facts); with `onClick` the whole row is the button. No chevron, no status dot and no value column: on a phone those take the title’s room – put the value into a line and the state into a badge (a dot next to a verdict word says the same twice) |
| `list(items, render, { empty, zebra })` | rows from items; `empty` is the text for no items |
| `kv(pairs, { mono })` | key–value pairs `[key, value, class?]`; `null` pairs and empty values are dropped |
| `facts(title, ...kids)` | a titled group inside a detail, usually around `kv` |
| `banner(text, { tone = 'info', action })` | a notice or error line on top of a view or detail |
| `empty({ title, text, action, compact, icon })` | nothing to show |
| `error({ title, text, onRetry, compact })` | a failure with a retry button |
| `loading({ rows = 3, tiles = 0, label })` | skeleton for a view that has no data yet |

Detail layout, top to bottom: `banner()` → `facts('Status', kv(…))` → history (`heatRow`, chart) → `facts('Events', log(…))` → `facts('Technical', kv(…, { mono: true }))` →
actions (`toolbarRow`, `menu`).

## Table

```js
table({
  columns: [{ key, label, get?, render?, align?: 'right', width?, mono?, wrap?, sortable?: true,
             mobile?: 'title' | 'value' | 'sub' | 'metric' | 'action' | 'hide', short?, listLabel? }],
  rows, rowKey?, onRow?, status?: (row) => Status, sort?: { key, dir }, onSort?, selected?: key,
  empty?: 'text', caption?, pageSize?: 50,
})  // → element with .update({ rows, selected })
```

- Sortable, sticky header, zebra rows, tappable rows (`onRow`: the whole row is the button). `get(row)` gives the sort value and the default text,
  `render(row)` the cell content.
- Cells do not wrap except the title column and columns with `wrap: true` (schedules, long texts).
- It becomes a list (`.is-list`) when the container is narrower than 600 px or the columns no longer fit. `mobile` assigns a column its place
  there; without it the first column is the title, the last right-aligned one the value (unless a column is a `metric`), the rest the sub line (joined with “·”).
  The title takes up to two lines before it ends in “…”.
- **A thing with measurements** (services, containers, processes, devices: a name, a state, two to four numbers, maybe a toggle) – the one recommended row:
  `status` for the dot (its name is the state, so no “running” text beside it); the measurements `mobile: 'metric'` – in list mode they stand under
  the title over the full width as label + value pairs in a fixed column order (CPU at the same place in every row; `short` is the label there, e.g.
  `short: 'RAM'` for “Memory”; a missing value shows “–”); a state text only when it is not the normal one (a column whose `get` returns `null` for the
  normal state lands in the sub line); one control `mobile: 'action'` (e.g. the watch toggle `iconButton('eye-off', { iconPressed: 'eye', onToggle })`)
  top right beside the title. Such a list has no chevron (the row is the button; the chevron took the title's room). On a desktop it is a normal table.
- **The measurement line** (two to six metrics) is one grid with **one column template for the whole list**, so the same measurement stands at the
  same x in every row. The rule, measured once the rows are drawn (again on a width change and when more rows load): each measurement needs its
  label plus the value width that 80 % of the rows reach (`METRIC_FIT_SHARE`); as many measurements stand side by side as fit, each track as wide as
  the widest measurement in it, at most six; then the lines are balanced (five where four fit → 3 + 2). More measurements wrap to a second line
  of the same grid, aligned like the first. Spare room is shared in proportion to the needs. **A measurement is never cut** (a cut number is a
  wrong number: “1…” reads as 1): a value that does not fit beside its label in this row moves below the label, in its own cell at the same x
  (only this row gets taller, the cells of the line keep their first lines on one baseline); still too wide, it wraps at its spaces. No track is
  narrower than the longest unbreakable piece of any of its values (“1,287”), so a number is never broken; only that piece counts, not the
  outlier's full width, so one outlier does not push the whole list to one measurement per line. It never takes two cells, since that would move
  every later measurement in that row. verify rule `metric-cut` (label or value wider than its box). Pure parts: `metricNeed`, `metricLayout`,
  `metricTemplate` in `js/table-data.js`.
- `listLabel: true` puts the column label in front of a value or sub-line value in list mode where the number alone does not say what it is
  (“Size 45 GB”); default: only metrics carry their label.
- A control inside a row (a button, a link, a field) does not open the row: neither its click nor Enter/Space on it.
- **Sorting in list mode:** the header is hidden there, so a sort button above the rows shows the current order (“Sorted by CPU” with the direction
  arrow) and opens a menu of the sortable columns; choosing the current one flips the direction. It appears when at least two columns are sortable.
- `pageSize` rows are drawn at first (default 50, `0` = all); the next ones load by themselves when the footer comes near the visible area while scrolling (`IntersectionObserver`), the *Show more* button stays as the fallback. Drawing rows, not filtering, is what costs time.
- Sorting uses `sortRows()` (stable, numbers and dates numerically, text in the locale's natural order, empty values last).

## Feedback and overlays

| Function | Options |
|---|---|
| `toast(text, { tone = 'info', action, duration = 4000 })` | brief message above everything; `action: { label, onClick }`; `duration: 0` stays until closed |
| `menu(anchor, items, { align = 'end', label })` | popover menu on a button; items `{ label, hint?, icon?, onClick, danger?, disabled?, checked? }`; a text button as anchor gets the chevron if it has none (icon-only triggers stay as they are) |
| `usageBar({ used, total, label, format = fmtBytes, warnAt = 0.8, badAt = 0.9, sub, segments })` | fill level; turns warn/bad at the limits; `segments: [{ value, label, color? }]` splits it |
| `log(entries, { max = 200, wrap, newestFirst = true, empty, time })` | event list in monospace; entries `{ t (epoch ms), level?: 'info'\|'warn'\|'bad'\|'ok'\|'debug', text, src? }`; `time`: `'auto'` or `'time'` |
| `dataCard(el, () => content, { onItem })` | the hover/tap card for content you only see by pointing; `onItem` is the element's own action (on touch the second tap) |
| `confirm(…)`, `actionRun(…)` | see [inputs and actions](inputs-and-actions.md) |

### Sheets

`openSheet({ title, sub, body, footer, kind, onClose })` → `{ el, body, update(opts), close(reason) }` opens a modal dialog: a bottom sheet below 700 px (swipe down
closes), a panel from the right from 700 px (swipe right, scrim, Esc and Back close). `body` and `footer` are nodes, strings or arrays. `onClose(reason)` fires once with
`'x' | 'esc' | 'scrim' | 'swipe' | 'api'`. `update({ title, sub, body, footer, keepScroll })` changes only the keys present. `kind` goes to `data-kind`
(a styling hook). The shell uses the same sheet for details below 1000 px.

### Images

`imageStrip(images, { label, onOpen, className })` draws a row of thumbnails of the same size (4:3, cropped) that scrolls sideways with scroll snap.
`images` are URLs or `{ src, thumb?, alt? }` (`thumb`: a smaller file for the row; `alt`: what the image shows, data, not translated); entries
without `src` are dropped, and **an empty list draws nothing** (`imageStrip()` returns `null`, `h()` skips it). The row is a list named "Images"; every
thumbnail is a button "Image n of m" (with `alt`: "Front view, image n of m"), the arrow keys, Home and End move along the row. A tap opens the viewer
at that image; `onOpen(index, images)` replaces that.

`openImageViewer(images, { index, label, onChange, onClose, returnFocus, back })` → `{ el, show(i), close(reason), index() }` (or `null` for an empty
list) shows the images large above everything: a modal dialog over the whole screen, always dark, with the counter "n / m" (hidden for one image), *x*
and previous/next buttons (hidden at the ends; the list does not wrap). Counter, *x* and the buttons lie over the picture and do not zoom with it; each
wears the viewer's own background, opaque (`--tn-bg-sunken` in the dark scheme, light text): on the margin beside an image of another aspect
ratio they melt into it, over the picture they stay readable. The counter is a pill with a camera icon, *x* a round button of at least 44 px; the
paging arrows show a circle of 36 px inside a target of at least 44 px, 10 px from the screen edge plus the safe area. The head keeps clear of the
status bar and a notch (safe area).

- Paging: a carousel – every image is a slide on one track that follows the finger (touch, pen and mouse), so the previous or next image slides in
  while you drag; on release the track settles on the new image or back (short, the closing duration; instant with reduced motion). The arrow keys,
  Home/End and the buttons page with the same slide. The neighbours of the current image are loaded and decoded ahead (`img.decode()`), so a drag
  never pulls in an empty slide.
- Zoom: pinch about the fingers' centre; a double tap (double click) at a spot steps 1× → 2× → 3.5× and back to 1×; the wheel (with or without
  Ctrl, also a trackpad pinch) zooms at the pointer; `+` steps in, `-` or `0` goes back to 1×. Zoomed, a drag pans the image inside its limits (it
  never leaves an empty edge) and a drag down does not close; only a drag beyond the image's left or right edge moves on to the neighbour, which
  starts at 1×. At 1× a horizontal drag pages and a drag down closes.
- Fling: zoomed, a drag released while still moving fast glides on in that direction and slows down exponentially (time constant `FLING_TAU`,
  325 ms, like the scrollers of iOS and Android; the speed is measured over the last 100 ms of the drag, 0 when the finger rested before it lifted).
  Towards a near edge it slows down softly and comes to rest at the edge, never beyond. A new finger holds the image where it is (that press is no
  tap, so it never closes the viewer); the wheel, paging and another zoom stop it too. It never pages – only a drag beyond the edge does. No glide
  at 1× (there the carousel settles) and none with reduced motion.
- Closing: *x*, Esc, a single tap beside the image (it waits for the double-tap time first, so a double tap never closes), a swipe down at 1× and **Back**: inside a `createApp()` page the viewer takes one history entry like a sheet
  ([Back](shell.md#back)), so the Android back button of an installed app closes the viewer first, then the detail it was opened from. `back: false`
  opts out. `onClose(reason, index)` fires once with `'x' | 'esc' | 'scrim' | 'swipe' | 'api' | 'back'`.
- After closing the focus goes back to the opener; the strip moves it to the thumbnail of the image shown last (`returnFocus(index)` for your own opener).
- An image that does not load shows "The image could not be loaded"; a thumbnail that does not load stays an empty tile.
- The pure helpers (`normalizeImages`, stepping, preloading, the swipe decision, zoom steps, pan limits, zooming about a point, the hand-over at the
  edge, double taps, the fling: `releaseVelocity`, `flingStart`, `flingStep`) are in `js/images-data.js`; unit tests `tests/images.test.mjs`, overlay scenarios `image-viewer`, `image-zoom` and `back-viewer`
  ([checks](checks.md)).

Do not open images with `<a target="_blank">` in a board: in an installed app that leaves the app, and Back closes it.

## Markdown

`markdown(text, { compact, images, className })` shows agent reports: headings, paragraphs, **bold**, *italic*, ~~strikethrough~~, `code` and code blocks
(scroll sideways), quotes, nested lists, task lists, GFM tables (scroll sideways), rules, links and autolinks.

- Own parser, no library, never HTML from strings: **raw HTML in the text appears as text**. `parseMarkdown()` (returns an AST) and `renderMarkdown()`
  (builds the DOM) are in `js/markdown.js`.
- Links only `http`, `https`, `mailto` and relative (`javascript:`, `data:` and `//host` become plain text); external ones get
  `rel="noopener noreferrer"`. Images are off (alt text is shown); with `images: true` only relative paths load.
- `compact` is the dense variant for sheets and the inspector. From 20,000 characters the block sets `.is-long` (`content-visibility: auto`), so only
  the visible part is laid out; `node tools/tempo-markdown.mjs` measures a 50 KB report against a 50 ms budget at 4× CPU.

## Format and sort helpers

`fmtNum(n, digits, min?)` (at most `digits`, at least `min` decimals: `fmtNum(9.9, 2, 2)` → “9.90”), `fmtPct(ratio, digits)`, `fmtBytes(b)` (binary), `fmtDuration(sec)`, `fmtAgo(sec)`, `fmtTime`, `fmtDate`, `fmtDay`, `fmtShort`, `fmtFull`
and `fmtWhen(t, now)` format with the active locale and time zone; they return “–” for `null`. `sortRows(rows, get, dir)`, `compareValues(a, b)`,
`matchQuery(text, query)` (all words, accent- and case-insensitive) are the matching sort and search helpers.

## Swipe between parts

`segmented({ options, value, onChange, label, pane: (value) => content, swipe: true })` – the tabs of a view (e.g. Lists · Searches · Strategy)
with their content: the control on top, below it the content `pane(value)` draws (anew on every switch; `.tn-segset`, the same gap as `stack()`).
With `swipe: true`, on touch a sideways swipe on the content switches to the neighbouring option:

- The neighbour is drawn when the finger pulls it in and comes from the side of the swipe; it follows the finger and settles on release (closing
  duration); the marker of the active option glides from option to option at the same time. A slow drag switches from a quarter of the width, a
  flick from 30 px at 0.4 px/ms. `onChange(value)` fires once the new part is in (a board that keeps the tab in the URL draws the view anew then,
  as after a click).
- Vertical scrolling has priority: the gesture decides its axis after 10 px, sideways only when clearly flatter than about 34° (`|dx| ≥ 1.5 |dy|`);
  the content leaves only vertical panning and pinch zoom to the browser (`touch-action: pan-y pinch-zoom`).
- A touch that starts in something that scrolls sideways by itself (a table, an image strip, a row of chips), in a field or in an element with
  `data-tn-noswipe` belongs to it and switches nothing.
- At the first and the last part a rubber band (the content moves a little and springs back), no wrap.
- Reduced motion: nothing follows the finger, nothing slides; a swipe switches on release.
- Mouse, pen, keyboard and clicks are unchanged. When the page is scrolled past the top of the content, the new part is shown from its start.

Pure parts (axis, rubber band, release, marker, sideways scrollers) in `js/swipe-data.js`, unit tests `tests/swipe.test.mjs`; overlay scenario
`segmented-swipe` (mutants `swipe-wraps`, `swipe-no-touch-action`, `swipe-ignores-reduced-motion`).
