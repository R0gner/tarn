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
| `iconButton(name, { label, hint, onClick, disabled, pressed, className })` | `label` is required (aria-label and hint); `pressed` makes it a toggle button |
| `segmented({ options, value, onChange, label, small })` | 2–5 options `{ value, label?, icon?, title?, count?, tone? }`; `count` shows a counter behind the label, coloured by `tone` as in the sidebar; an icon-only option needs `title`. `el.setValue(v)` (no `onChange`), `el.value` |
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
| `section(title, { count, actions, footer, info, className }, ...kids)` | a titled group without a box, optional counter |

**`info`: an explanation behind a small “i”.** For a display that cannot be read without a key (what a colour, an edge or an axis means): a string or node
(boards pass `t()` text), a few plain sentences, at most `INFO_MAX` (280) characters. The “i” sits next to the title; a tap, Enter or Space opens the text
in a floating layer (above sheets, like a menu), Escape, a tap outside, Tab and a width change close it, the focus goes back to the “i”. Closed by default.
Never a disclaimer or a method note ([what goes on a view](dashboard-guidelines.md)). A chart gets its explanation through the card or section around it.
`infoButton(text)` is the button on its own, for a place the kit does not cover yet.

## Rows, lists and facts

| Function | Options |
|---|---|
| `statTile({ label, value, unit, sub, status, onClick })` | a key figure; `sub` may be text or a `sparkline`; with `onClick` the whole tile is the button |
| `metricRow({ title, sub, value, valueSub, status, onClick, chevron, mono, label, selected, key, wrapSub })` | one row; with `onClick` the whole row is the button with a chevron on the right; `wrapSub` lets the sub line wrap (a problem row's reason must be readable in full); `key` identifies the row for the selection in the inspector |
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
  columns: [{ key, label, get?, render?, align?: 'right', width?, mono?, wrap?, sortable?: true, mobile?: 'title' | 'value' | 'sub' | 'hide' }],
  rows, rowKey?, onRow?, status?: (row) => Status, sort?: { key, dir }, onSort?, selected?: key,
  empty?: 'text', caption?, pageSize?: 20,
})  // → element with .update({ rows, selected })
```

- Sortable, sticky header, zebra rows, tappable rows (`onRow`: the whole row is the button). `get(row)` gives the sort value and the default text,
  `render(row)` the cell content.
- Cells do not wrap except the title column and columns with `wrap: true` (schedules, long texts).
- It becomes a two-line list (`.is-list`) when the container is narrower than 600 px or the columns no longer fit. `mobile` assigns a column its place
  there; without it the first column is the title, the last right-aligned one the value, the rest the sub line (joined with “·”).
- `pageSize` rows are drawn at first (default 20, `0` = all) and a *Show more* footer adds the next ones. Drawing rows, not filtering, is what costs time.
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

`fmtNum(n, digits)`, `fmtPct(ratio, digits)`, `fmtBytes(b)` (binary), `fmtDuration(sec)`, `fmtAgo(sec)`, `fmtTime`, `fmtDate`, `fmtDay`, `fmtShort`, `fmtFull`
and `fmtWhen(t, now)` format with the active locale and time zone; they return “–” for `null`. `sortRows(rows, get, dir)`, `compareValues(a, b)`,
`matchQuery(text, query)` (all words, accent- and case-insensitive) are the matching sort and search helpers.
