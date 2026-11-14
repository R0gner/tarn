// tarn · mutants for verify --selftest (positive control).
// Each mutant injects a known fault (CSS or script, or a patch of a kit source file: patch: [{ file, from, to }]) and must produce a new finding of the expected rule.
// Checked only on the named views, dark.
export const MUTANTS = [
  {
    id: 'tile-overlap',
    page: 'gallery', views: ['cards'], sizes: ['phone', 'desktop'], expect: ['overlap'],
    css: '.tn-tiles > :nth-child(2) { margin-left: -60px; }',
  },
  {
    id: 'row-title-no-ellipsis',
    page: 'gallery', views: ['rows'], sizes: ['phone', 'desktop'], expect: ['clip'],
    css: '.tn-row-title { text-overflow: clip; }',
  },
  {
    id: 'button-misaligned',
    page: 'gallery', views: ['table'], sizes: ['phone', 'desktop'], expect: ['align'],
    css: '.tn-toolrow > .tn-btn:nth-child(2) { position: relative; top: 3px; }',
  },
  {
    // earlier banner fault: a long path without a break opportunity sets the minimum width, the column grows beyond the card
    id: 'banner-path-overflow',
    page: 'gallery', views: ['states'], sizes: ['phone', 'phone-s'], expect: ['overflow', 'page'],
    css: '.tn-banner-text { overflow-wrap: normal; } .g-demo, .g-stage-col { grid-template-columns: none; }',
  },
  {
    // earlier overlay fault: the menu hangs on the body instead of in the sheet and is not in the top layer → under the sheet, inert
    id: 'overlay-below-sheet',
    check: 'overlay', scenarios: ['sheet-menu'], sizes: ['phone', 'desktop'], expect: ['overlay-missing', 'overlay-top', 'overlay-inert'],
    js: `(() => { const orig = Element.prototype.append;
      Element.prototype.append = function (...a) { return orig.apply(a[0]?.classList?.contains('tn-menu') && this.matches('dialog') ? document.body : this, a); };
      HTMLElement.prototype.showPopover = function () {}; return true; })()`,
  },
  {
    // address bar fault: the menu closes on every resize, even when only the height changes
    id: 'menu-closes-on-height-change',
    check: 'overlay', scenarios: ['menu-height'], sizes: ['phone', 'desktop'], expect: ['overlay-behaviour'],
    js: `(() => { window.addEventListener('resize', () => document.querySelectorAll('.tn-menu').forEach((m) => m.remove())); return true; })()`,
  },
  {
    // tooltip fault on touch: disappears immediately on release
    id: 'tooltip-gone-on-release',
    check: 'overlay', scenarios: ['tooltip-stays'], sizes: ['phone'], expect: ['overlay-behaviour'],
    js: `(() => { document.addEventListener('pointerup', () => document.querySelectorAll('.tn-tooltip').forEach((t) => { t.hidden = true; }), true); return true; })()`,
  },
  {
    // timeline too wide for the container: scrolls sideways (opt-in scrolling accidentally active)
    id: 'timeline-scrolls-sideways',
    page: 'gallery', views: ['charts'], sizes: ['phone', 'desktop'], expect: ['scroll-x'],
    css: '.tn-tl-grid { min-width: 900px; }',
  },
  {
    // identity: board without a favicon and with a meaningless title
    id: 'board-without-favicon-and-title',
    page: 'board', views: ['overview'], sizes: ['phone'], expect: ['identity'],
    js: `(() => { document.querySelectorAll('link[rel~="icon"]').forEach((l) => l.remove()); Object.defineProperty(document, 'title', { get: () => 'Board', set() {}, configurable: true }); return true; })()`,
  },
  {
    // “Install as app” stays visible in standalone mode too
    id: 'install-button-always-visible',
    check: 'overlay', scenarios: ['install'], sizes: ['phone', 'desktop'], expect: ['overlay-behaviour'],
    js: `(() => { const fix = () => { const b = document.querySelector('.tn-install'); if (b && b.hidden) b.hidden = false; };
      new MutationObserver(fix).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] }); return true; })()`,
  },
  {
    // board switcher without a mark for the current board (aria-current is removed)
    id: 'switcher-without-current',
    check: 'overlay', scenarios: ['board-switcher'], sizes: ['phone', 'desktop'], expect: ['overlay-behaviour'],
    js: `(() => { new MutationObserver(() => document.querySelectorAll('.tn-board[aria-current]').forEach((a) => a.removeAttribute('aria-current')))
      .observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-current'] }); return true; })()`,
  },
  {
    // a word is chopped letter by letter: narrow banner with a long German compound
    id: 'word-broken-by-letter',
    page: 'gallery', views: ['rows'], sizes: ['phone', 'desktop'], expect: ['wordbreak'],
    css: '.g-narrow-s .tn-banner { width: 96px; }',
  },
  {
    // missing translation: a German key is gone from the catalog and the board asks for it (the "i18n" rule must report it)
    id: 'missing-translation',
    page: 'board-de', views: ['overview'], sizes: ['phone'], expect: ['i18n'],
    js: `(async () => { const m = await import(new URL('../js/i18n.js', location.href).href); delete m.KIT_CATALOGS.de['shell.language']; m.t('shell.language'); return true; })()`,
  },
  {
    // after choosing a pill the control is replaced (as if the sheet were re-rendered): the focus is lost, the keyboard user starts again
    id: 'focus-lost-on-choice',
    check: 'overlay', scenarios: ['filter-sheet'], sizes: ['phone', 'desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/filterbar.js', from: "onclick: () => toggle(def, o.value) },", to: "onclick: (e) => { toggle(def, o.value); const b = e.currentTarget; b.replaceWith(b.cloneNode(true)); } }," }],
  },
  {
    // comfortable density: one kind of icon button shrinks below 48 px (e.g. a local override of the size)
    id: 'comfortable-target-shrunk',
    page: 'gallery-comfortable', views: ['buttons'], sizes: ['phone', 'desktop'], expect: ['touch48'],
    css: '.tn-iconbtn { width: 40px; height: 40px; }',
  },
  {
    // comfortable density: the token itself is lowered (every control that follows --tn-hit gets small)
    id: 'comfortable-hit-token-lowered',
    page: 'gallery-comfortable', views: ['buttons', 'inputs'], sizes: ['phone', 'desktop'], expect: ['touch48'],
    css: ':root[data-density="comfortable"] { --tn-hit: 40px; --tn-input-h: 40px; --tn-btn-sm-h: 30px; }',
  },
  {
    // earlier toggle fault: the checked thumb travels a fixed 24 px and leaves its track (phone: 8 px outside, touching the label)
    id: 'toggle-thumb-leaves-track',
    page: 'gallery', views: ['inputs'], sizes: ['phone', 'desktop'], expect: ['contained'],
    css: '.tn-tick-input:checked + .tn-toggle-track > .tn-toggle-thumb { transform: translateX(24px); }',
  },
  {
    // the old overview: a problem row moves to the owning view instead of opening the detail where the user is
    id: 'row-leaves-view',
    check: 'overlay', scenarios: ['detail-in-place'], sizes: ['desktop'], expect: ['overlay-behaviour', 'overlay-missing'],
    patch: [{ file: 'example/board.js', from: "onClick: () => ctx.app.open(p.id),", to: "onClick: () => ctx.app.go(p.kind === 'job' ? 'jobs' : 'hosts', { open: p.id })," }],
  },
  {
    // the shell no longer keeps the focused field across a redraw (the old behaviour: the filter bar is rebuilt, the focus is gone)
    id: 'redraw-loses-focus',
    check: 'overlay', scenarios: ['filter-refresh'], sizes: ['desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/shell.js', from: "renderView({ keepField: true });", to: "renderView();" }],
  },
  {
    // the old tile grid: every tile one cell, so five tiles leave an empty cell in the last row
    id: 'tiles-ragged',
    page: 'gallery', views: ['cards'], sizes: ['phone', 'desktop'], expect: ['tiles-ragged'],
    css: '.tn-tiles[data-fit] > * { grid-column: span 1 !important; }',
  },
  {
    // a problem row's reason ends in "…" although the row asked to wrap it
    id: 'row-sub-wrap-ellipsis',
    page: 'gallery', views: ['rows'], sizes: ['phone-s'], expect: ['wrap-sub'],
    css: '.tn-row-sub-wrap { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
  },
  {
    // the browser prompt for the permission appears when the sheet opens, not after a tap on the button (browsers punish that, Safari refuses it)
    id: 'notifications-ask-on-open',
    check: 'overlay', scenarios: ['notifications'], sizes: ['desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/notifications-data.js', from: "if (!sub) return set({ kind: env.permission() === 'denied' ? 'blocked' : 'off', message: null });", to: "if (!sub) { env.requestPermission(); return set({ kind: env.permission() === 'denied' ? 'blocked' : 'off', message: null }); }" }],
  },
  {
    // the install entry is absent where the browser has no install prompt (iPhone, Safari): no way to find out how to install
    id: 'install-hint-absent',
    check: 'overlay', scenarios: ['install-hint'], sizes: ['phone', 'desktop'], expect: ['overlay-behaviour', 'overlay-missing'],
    patch: [{ file: 'js/shell.js', from: "installBtn.hidden = isStandalone() || (!installEvent && !manual());", to: "installBtn.hidden = isStandalone() || !installEvent;" }],
  },
  {
    // the old phone toolbar: theme, density and language as three separate buttons next to the reload button and the freshness text
    // (no single settings entry): the view title of the gallery is cut to “Foundati…” on a 390 px phone
    id: 'toolbar-crowded',
    page: 'gallery', views: ['foundations', 'themes'], sizes: ['phone'], expect: ['toolbar-title'],
    css: '.tn-hide-phone { display: inline-grid !important; } .tn-toolbar .tn-settings-btn { display: none !important; }',
  },
  {
    // earlier starter fault: the language switch shrinks in a full header row and scrolls sideways (comfortable phone: “Deutsch” cut off)
    id: 'segmented-squeezed',
    page: 'starter-comfortable', views: ['page'], sizes: ['phone-s'], expect: ['scroll-x'],
    css: '.st-header { flex-wrap: nowrap; } .st-header > .tn-seg { flex: 0 1 auto; min-width: 0; }',
  },
  {
    // a second submit while the first one runs is not ignored: the action is sent twice
    id: 'double-submit',
    check: 'overlay', scenarios: ['form-submit'], sizes: ['phone', 'desktop'], expect: ['overlay-behaviour'],
    patch: [{ file: 'js/form.js', from: "if (pending) return;", to: "" }],
  },
  {
    // earlier log fault: the log box kept the swipe to itself, so a sheet (or the page) did not scroll while the finger was on the log – also when the log had nothing to scroll
    id: 'log-traps-scroll',
    page: 'gallery', views: ['feedback'], sizes: ['phone', 'desktop'], expect: ['scroll-trap'],
    css: '.tn-log { overscroll-behavior: contain; }',
  },
];
