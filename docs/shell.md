# The shell

`createApp()` builds the frame of a board: sidebar, toolbar, views, hash routing, the detail panel, language and theme controls, the board switcher.
This page is for whoever assembles a board: the options, how views and details work, how the layout adapts, language and time zone, theme and density,
several boards. Data comes from a [`dataSource`](data.md); the blocks you put into a view are in [components](components.md).

## createApp

```js
import { createApp, dataSource } from '/tarn/js/tarn.js';

const source = dataSource({ url: '/api/snapshot', interval: 30_000, staleAfter: 120 });
const app = createApp({
  title: () => t('board.title'),
  icon: { icon: 'server', color: 'purple' },
  source,
  views: [
    { id: 'overview', label: () => t('nav.overview'), icon: 'layout-grid', render: (ctx) => viewOverview(ctx) },
    { id: 'jobs', label: () => t('nav.jobs'), icon: 'list', render: viewJobs, detail: jobDetail, count: (ctx) => ctx.data?.failing },
  ],
});
source.start();
```

| Option | Meaning |
|---|---|
| `views` | array of views (below); required. The first one is the start view |
| `defaultView` | id of the start view (default: the first) |
| `title` | string or function; becomes the page title `View · Board` |
| `source` | a [`dataSource`](data.md); the toolbar shows its freshness and reload button |
| `icon` | board icon next to the title: a URL (file from `tools/brand.mjs`) or `{ icon, color }`, which also sets the favicon |
| `favicon` | `{ icon, color }` for the page icon only |
| `boards`, `categories`, `boardId` | board switcher, see [Several boards](#several-boards) |
| `locale`, `fallbackLocale`, `locales`, `messages`, `timeZone` | language and time zone, see [Languages](#languages-and-time-zones) |
| `densitySwitch` | `true` adds a compact ↔ comfortable button next to the theme button |
| `notifications` | `{ api, … }` adds the Notifications entry to the sidebar, see [notifications](notifications.md) |
| `toolbarExtra` | one extra element in the toolbar |
| `inspector` | `false` shows details as a panel or sheet on every width instead of the inspector on wide screens |
| `root` | element the app is built into (default `document.body`) |

`title`, `boards`, `categories`, view `label` and `group` may be functions: they run after the language is set, so they can call `t()`.

### Views

```js
{ id, label, group?, icon?, hidden?, count?(ctx), render(ctx) → Node, detail?(id, ctx) → { title, sub?, body? } | null }
```

- `group` is a heading in the navigation; consecutive views with the same `group` share it. `hidden: true` keeps a view reachable (`app.go`) but out of
  the navigation.
- `count(ctx)` returns a number, `{ n, tone }` (tone is a status) or `null`; it is the counter in the sidebar and is derived from `ctx.data`, never set as
  a side effect of `render()`. `app.setCount(id, n, tone)` is only for counters that cannot be derived from data (live events).
- `ctx = { app, view, params, open, data, src }`: `data` is the parsed data of the source, `src` its full [state](data.md#state), `params` the query part of
  the hash, `open` the id of the open detail.
- Every view handles `!ctx.data`: `loading()` while there is none, `error({ onRetry })` when the load failed.
- The view is rebuilt on every new data (`app.refresh()`, every poll). The field the user is typing in keeps focus and caret, so a filter bar that is
  built again from the board's state does not interrupt typing.

### App object

| Call | Does |
|---|---|
| `app.go(view, { open?, params? })` | navigates (`#/view?open=id`) |
| `app.open(id)` | opens the detail of `id` in the current view |
| `app.closeDetail()` | closes the detail |
| `app.refresh()` | redraws the current view and detail |
| `app.setCount(view, n, tone?)` | sets a sidebar counter |
| `app.detailOf(view, id, { link? })` | what another view's `detail()` returns, see [Detail in place](#detail-in-place) |
| `app.view`, `app.openId`, `app.isDesktop`, `app.el` | current view id, open detail id, wide layout, root element |

### Routing

The state lives in the hash: `#/<view>?open=<id>&<more>`. `parseHash(hash)` and `buildHash(view, params)` are exported. Back closes a detail; a link to a
view or a detail is an ordinary URL.

## Layout behaviour

| Width | Sidebar | Detail (`#/view?open=id`) | Tables |
|---|---|---|---|
| ≥ 1000 px | fixed, collapsible (remembered in `tn-sb`) | inspector on the right, not modal | table |
| 700–999 px | overlay via burger | panel from the right over the list (modal, scrim; Back, Esc and swipe right close) | table, list in a narrow container |
| < 700 px | overlay via burger, swipe left closes | bottom sheet, swipe down closes, background locked | two-line list |

- Tables turn into the two-line list when their container is narrower than 600 px or the columns no longer fit (measured; no sideways scrolling).
- Touch targets are at least 40 px (`pointer: coarse`); `prefers-reduced-motion` switches motion off.
- Phone toolbar (< 600 px): burger, view title, freshness text and one settings entry (theme, density, language in one sheet). The freshness text gives way
  before the view title does. Do not add more toolbar buttons; verify rule `toolbar-title` fails when a toolbar crowds the title out.

## Detail in place

A row that stands for a thing **another view owns** (an overview's problem list, failed runs, a timeline in the history) opens that thing's detail in
the view the user is in. The overview stays where it is; Back and Esc close the detail and return to it. Moving to the owning view is an explicit step: a
link inside the detail. Rows of the owning view (the jobs table) open the same detail as before.

```js
views: [
  { id: 'overview', label: …, render: viewOverview,
    detail: (id, ctx) => ctx.app.detailOf('jobs', id, { link: true }) || ctx.app.detailOf('hosts', id, { link: true }) },
  { id: 'jobs', label: …, render: viewJobs, detail: jobDetail },
  { id: 'hosts', label: …, render: viewHosts, detail: hostDetail },
]
// in the overview: metricRow({ key: p.id, …, onClick: () => ctx.app.open(p.id) })      // not ctx.app.go('jobs', { open })
```

`app.detailOf(view, id, { link })` returns what that view's `detail(id, ctx)` returns (`null` when the view has no detail or does not know the id).
`link: true` adds the button “Open in <view>” (`app.go(view, { open: id })`) under the detail. `app.go(view, { open })` stays for an explicit jump (a
link, a command). The sample board's overview and history follow the pattern; overlay scenario `detail-in-place` checks it.

## Languages and time zones

The interface is multilingual; the repository is English. Kit texts ship in **en, de, es, fr** (`js/locales/`, English is the source). Board texts go
through the same layer:

```js
createApp({
  title: () => t('board.title'),
  messages: { en: { 'board.title': 'Maintenance' }, de: { 'board.title': 'Wartung' } },   // board texts, same fallback rule
  locales: ['en', 'de'],        // languages the board offers (default: those with messages, else all kit languages)
  // locale: 'de',              // force one language (then there is no language menu)
  // fallbackLocale: 'de',      // for browsers none of whose languages is offered (default 'en'); the menu stays
  // timeZone: 'Europe/Berlin', // default: the browser's
});
```

- **Choice:** forced `locale` (or `?lang=de` in the URL, for previews and tests) > the choice stored from the language menu (`tn-locale`) >
  `navigator.languages` matched against the offered languages > `fallbackLocale` > English. `<html lang>` is set.
- **Language menu** (toolbar, next to the theme button): visible only when more than one language is offered and none is forced. “Automatic” is the first
  entry; a choice is stored and applied by reloading.
- **Texts:** `t(key, vars)` with `{name}` placeholders and plural forms (`{ one, other }` with `vars.count`). A missing key shows English and warns in the
  console; verify reports it. `setLocale()`, `getLocale()`, `addMessages()`, `KIT_LOCALES`, `LOCALE_NAMES` are exported. Data (job names, agent reports) is
  not translated. Never put visible text into code: always `t()` (lint rule `i18n`, key-parity test `tests/i18n.test.mjs`).
- **Formats:** `fmt*()`, chart axes and relative times use `Intl.NumberFormat`, `DateTimeFormat` and `RelativeTimeFormat` with the active locale and time
  zone (`setTimeZone()`, `getTimeZone()`). There is no own number or date format. Durations use unit names from the catalog.

## Theme and density

- **Theme:** system, light or dark. The toolbar button cycles system → light → dark; the choice is stored as `tn-theme` and applied by
  `js/theme-init.js` before the first paint (`data-theme` on `<html>`).
- **Density:** `compact` (default) or `comfortable` (car screens, big fingers: larger type, more space, every interactive element ≥ 48 px).
  `<html data-density="comfortable">` (a plain page sets it itself, like `starter/`), `setDensity('comfortable', { persist: true })` (stored as
  `tn-density`, applied by `theme-init.js`) or `createApp({ densitySwitch: true })`. It does not depend on the pointer. Components never branch on the
  density (lint rule `density`); the values are tokens, see [design language](design.md#density).

## Several boards

Whoever runs several boards gives each an icon in the sidebar header and lets the title become a switcher:

```js
createApp({
  title: 'Maintenance',
  icon: './favicon.svg',                       // URL (the file from tools/brand.mjs) or { icon: 'server', color: 'blue' }
  boardId: 'maintenance',                      // current board (accent ring, aria-current)
  boards: '/boards.json',                      // or directly [{ id, name, href, icon?, category? }, …]
  categories: [{ id: 'operations', label: 'Operations' }, { id: 'home', label: 'Home' }],   // optional, order
});
```

- **When:** from two boards in the same host group. Without `boards` (or with a single entry) the title stays static; with `icon` alone only the icon
  precedes it. Entries may point to pages without Tarn (plain link).
- **`icon`:** a URL shows the file (the `<link rel="icon">` stays in the HTML); an object `{ icon, color }` also sets the favicon, one way for tab and
  header. Boards without an icon get a letter tile in a fixed colour from the name.
- **Data:** `boards` is an array or `{ boards, categories }`. A string is a JSON file of the **same origin**, loaded on first open and cached; a load error
  shows a hint in the switcher. One shared JSON file per host group keeps the list in one place. Entries without `id`, `name` or `href`, with a duplicate
  `id` or with an unsafe address (only http, https, relative) are dropped (console hint); an unknown or missing category lands under “Other”; without
  `categories` the grid is flat. `normalizeBoards()` is the function behind it.
- **Use:** tiles are real links (middle click and Ctrl-click open a new tab). From 700 px a popover under the title (up to 70 vh, scrolls inside), below a
  bottom sheet. Enter/Space opens, arrow keys and Home/End move through the grid, Esc closes and returns focus to the title. A one-word tile name gets an
  ellipsis plus hint, several words wrap at word boundaries up to two lines. `boardSwitcher()`, `boardGrid()` and `boardIcon()` are exported for use
  outside `createApp`.
- **Checks:** `tests/boards.test.mjs`, overlay scenarios `board-switcher` and `detail-board-switcher`, tempo case `switcher-open`, mutant
  `switcher-without-current`.
