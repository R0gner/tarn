# Design language and tokens

The look of the kit and the values behind it: principles, colours, status, type, spacing, density, motion, overlays, fonts. For a board author who must
stay inside the look and for a contributor who changes it. A board never writes a colour, size, radius, shadow or font of its own: it uses the tokens in
`css/tokens.css`, and lint (`tools/lint.mjs`) enforces it.

## Principles

> **Information over decoration. Dense, calm, unambiguous, instant.**
> Overview first, details on tap. Colour only when it means something. Motion short and only for orientation.

- A dense ops-console look: dark grey by default, small and dense, hairlines carry the structure, shadows only on floating layers (sheet, toast, menu,
  data card), status dots, zebra rows, 13 px body text. Light follows the system and can be switched manually (system → light → dark).
- Status only through status tokens, never colour as the only information: text or `aria-label` always goes with it.
- Every board looks the same and works the same; the kit is the shared base ([what belongs in the kit](getting-started.md#what-belongs-in-the-kit)).
- Plain ES modules and CSS custom properties; no build step, no third-party frontend libraries; CSP-friendly (`script-src 'self'; style-src 'self'`, no
  `innerHTML`, no inline styles).

## Tokens

`css/tokens.css` is the only source of values. Colours use `light-dark()`, driven by `color-scheme` (dark by default; without a manual choice the page
follows `prefers-color-scheme`; manual: `<html data-theme="light|dark">`).

| Group | Tokens |
|---|---|
| Surfaces | `--tn-bg`, `--tn-bg-sunken`, `--tn-card`, `--tn-card-2` (zebra, input fields), `--tn-popover`, `--tn-border`, `--tn-sep`, `--tn-hover`, `--tn-press`, `--tn-selected`, `--tn-indicator`, `--tn-scrim`, `--tn-skeleton`; over photos `--tn-media-veil`, `--tn-media-veil-hover`, `--tn-text-on-media` (a fixed dark veil; the image viewer itself uses its own background since 0.9.0) |
| Text | `--tn-text`, `--tn-text-2`, `--tn-text-3`, `--tn-text-3-tint` (on tinted surfaces), `--tn-placeholder`, `--tn-text-on-accent` |
| Accents (chart and tile colours) | `--tn-blue`, `--tn-purple`, `--tn-pink`, `--tn-orange`, `--tn-green`, `--tn-graphite`; `--tn-accent` (blue) |
| Status | `--tn-ok`, `--tn-warn`, `--tn-bad`, `--tn-unknown`, `--tn-pending`, `--tn-info`; as text `--tn-*-text` (darker in light for ≥ 4.5:1); as surface `--tn-*-bg` |
| Buttons, focus | `--tn-primary` (primary button background, ≥ 5:1 with white text), `--tn-focus`, `--tn-ring` |
| Type | `--tn-font` (Inter), `--tn-mono` (IBM Plex Mono), `--tn-fs-xs/section/label/body/lg/stat/input`, `--tn-lh`, `--tn-fw-label` (500), `--tn-fw-strong` (600), `--tn-ls-tight` |
| Spacing (4 px grid) | `--tn-s1` 4, `--tn-s2` 8, `--tn-s3` 12, `--tn-s4` 16, `--tn-s5` 20, `--tn-s6` 24, `--tn-s8` 32 px (there is no `--tn-s7`) |
| Fine spacing | `--tn-sp-1/2/3/5/6/9/10`: named after the value in px, for sizes between the grid steps |
| Radii | `--tn-r-1`, `-xs`, `-3`, `-sm` (4 px), `--tn-r` (6 px), `--tn-r-lg` (10 px, top of the bottom sheet) |
| Shadows | `--tn-shadow-sheet`, `-toast`, `-menu`, `-card` (floating layers only) |
| Sizes | `--tn-row-h`, `--tn-hit`, `--tn-toolbar-h`, `--tn-input-h`, `--tn-icon`, `--tn-dot`, `--tn-sidebar-w`, `--tn-inspector-w`, control heights (`--tn-btn-sm-h`, `--tn-seg-h`, `--tn-pill-h`, …); fixed component dimensions as `--tn-sz-<px>` (and `em`, `ch`, `vw` forms) |
| Motion | `--tn-t-open` 150 ms, `--tn-t-close` 120 ms, `--tn-t-lead` −16 ms, loops `--tn-t-loop-pulse`, `-indet`, `-spin` |

Chart colours are token names: `blue green orange purple pink graphite` or a status, never a colour value. Literals for colours, sizes, radii and
durations live only in `tokens.css`; a missing size is added there as a named token, not written into a component.

### Breakpoints

CSS variables do not work in `@media`, so the breakpoints are a convention: **< 700 px** phone (burger and sidebar overlay, detail as bottom sheet;
`SHEET_BREAKPOINT` in `js/sheet.js`), **700–999 px** tablet (sidebar overlay, detail as a panel from the right), **≥ 1000 px** desktop (fixed sidebar,
detail in the inspector). Below 600 px tables become lists and the toolbar shrinks to one settings entry. Details: [shell](shell.md#layout-behaviour).

## Density

Two densities, the same tokens with other values; nothing per component. **compact** (default) is the dense ops-console look. **comfortable** is for a car
touchscreen or a big finger: larger type, more space, every interactive element ≥ 48 px, stronger contrast. Switching is described in
[shell](shell.md#theme-and-density). Components never branch on the density (lint rule `density`: `data-density` appears only in `css/tokens.css`); a
control that must change gets a token.

| Token | compact | comfortable |
|---|---|---|
| `--tn-fs-xs` / `-section` / `-label` / `-body` / `-lg` / `-stat` / `-input` | 11 / 11.5 / 12 / 13 / 15 / 20 / 16 px | 13 / 14 / 15 / 17 / 20 / 28 / 18 px |
| `--tn-s1` … `--tn-s6`, `--tn-s8` (spacing) | 4 8 12 16 20 24, 32 px | 6 12 16 20 24 32, 40 px |
| `--tn-hit` (control), `--tn-input-h` | 28 px (touch 40 / 44) | 48 px, 50 px (field box; its inner element is 48) |
| `--tn-row-h`, `--tn-toolbar-h` | 32 px (touch 44), 44 px (touch 48) | 56 px |
| `--tn-btn-sm-h`, `--tn-seg-h`, `--tn-seg-sm-h`, `--tn-pill-h` | 24, 22, 22, 30 px (touch 36, 34, 34, 40) | 48 px each |
| `--tn-check`, `--tn-toggle-w` × `-h`, `--tn-badge-h` | 18 px, 28 × 16, 18 px (touch 22, 36 × 22) | 28 px, 48 × 28, 24 px |
| `--tn-icon`, `--tn-dot`, `--tn-ring`, `--tn-stroke` | 16, 7, 2, 1.5 px | 20, 10, 3, 2 px |
| `--tn-sidebar-w`, `--tn-inspector-w` | 208, 380 px | 280, 440 px |
| `--tn-text-2`, `--tn-text-3`, `--tn-border`, `--tn-sep`, `--tn-focus`, `--tn-primary`, `--tn-*-text` | see the file | stronger: secondary text, lines and focus; primary button and status texts ≥ 4.5:1 |

“Touch” means `pointer: coarse`. verify checks the core views of the gallery and the starter page in both densities; in comfortable the rule `touch48`
applies without exceptions.

## Hover, hints and overlays

- **Overlay layer** (`js/overlay.js`): menu, toast, tooltip and data card hang in the topmost open modal dialog (else `<body>`) and are lifted into the
  top layer with the Popover API (`popover="manual"`). They sit above open sheets, are not inert and refer to the viewport (a sheet has a `transform`).
  Where the browser lacks the Popover API (`showPopover()` is feature-detected) they stay ordinary positioned elements in the host, without the top layer. Esc closes the topmost. Never build your own popups.
  Every anchored overlay (tooltip, data card, menu, info popover, combobox list, board switcher) is placed by one function, `placeOverlay()`, which keeps
  it 4 px inside the laid-out page: the viewport without the scrollbar and without the reserved gutter (below).
- **Two kinds of hover, in the same card style.** The **data card** (`dataCard()`: line and area charts, bars, heat map, timeline bars, usage segments)
  shows content you only see by pointing: with a mouse instantly and gone on leave; on touch a tap shows it, a drag scrubs, a tap elsewhere or scrolling
  closes it, and if the element has an action the second tap triggers it. The **hint** (`tooltip()`, automatic for `.tn-ellipsis`) is smaller and delayed
  (mouse 350 ms, focus 150 ms, touch long press 500 ms, then it stays 1.5 s): only for icon-only buttons (`iconButton`, and a `button` without text brings it
  along) and for truncated text. Fully visible text gets no hint. Sparkline and donut have no hover.
- **No native `title` attributes** in the kit; the name of a control goes through `aria-label`.

## Motion

- Hover and press are instant (on touch `js/press.js` marks the pressed element with `.is-down`). Menu, toast, tooltip and data card show in the first
  frame (no `requestAnimationFrame`).
- Only panels, sheets and the sidebar animate, and only `transform` and `opacity`: `--tn-t-open` 150 ms, `--tn-t-close` 120 ms (JS reads the same tokens;
  with `prefers-reduced-motion` they are 0 ms), plus the endless animations `--tn-t-loop-*`. The inventory check in `verify` enforces this.
- **Lead** `--tn-t-lead` (−16 ms): panels, sheets and the sidebar start with a negative transition delay so that the first painted frame already shows
  motion; otherwise “first change” exceeds the 50 ms budget on phones.
- **Scrollbar space:** `html { scrollbar-gutter: stable }`, so that locking the background does not shift the layout by the scrollbar width and force a
  full relayout. Where scrollbars take space (Windows, Linux desktops) the gutter is reserved even while the page does not scroll, and
  `document.documentElement.clientWidth` still counts it then: overlays measure the root's box instead (`placeOverlay()`).
- Overscroll: only the one scroller of an overlay layer (sheet body, sidebar, inspector, popover) may set `overscroll-behavior`; verify rule `scroll-trap`
  fails otherwise, because a scroller inside a page or another scroller would trap the swipe.

## Fonts

Local in `fonts/` (Latin subset, woff2, 78 KB together, `font-display: swap`): Inter (variable, weights 400–600) and IBM Plex Mono (400, 500), both SIL OFL
1.1; texts and sources with sha256 in `fonts/SOURCES.md`. `css/fonts.css` includes them; preload the main font in the page head
(`<link rel="preload" href="…/inter-latin.woff2" as="font" type="font/woff2" crossorigin>`, see `example/index.html`). The system stack stays the
fallback in `css/tokens.css`.

## Licence

Tarn is released under the [MIT licence](../LICENSE), copyright (c) 2026 R0gner. The bundled Lucide icons (ISC), Inter and IBM Plex Mono (SIL Open Font
License 1.1) keep their own licences; see [NOTICE](../NOTICE) and the licence texts in `fonts/` and `icons/`.
