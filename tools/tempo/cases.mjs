// dashkit · tempo cases: one representative per building block class and state (open/close).
// Fields:
//   id, budgetClass  name and budget class (see BUDGETS)
//   page, hash     page (gallery|board) and start view
//   sizes          'phone' (touch), 'tablet-s' (touch, 700 px) and/or 'desktop' (mouse)
//   dir            'open' (progress 0 → 1) or 'close' (1 → 0)
//   ref            reference event: 'click' (default), 'pointerdown' (press), 'pointerover' (hover)
//   delay          intended delay in ms (tooltip), subtracted for the budget
//   input          'tap' (tap or click), 'press' (hold), 'hint' (hover or long press)
//   pre            JS before every run (establish the initial state), may return a promise
//   target         JS expression → element that is tapped
//   prog           JS function source () → number 0..1 or a value (value: start = 0, end = 1, in between 0.5)
//   reset          JS after every run
//   handler, loaf, inputFrame   own limits in ms instead of GLOBAL (only where a budget of the brief says so; give the reason at the case)
// All JS parts run via CDP in the page context (CSP-independent), not in the kit.
const KIT = "import(new URL('../js/dashkit.js', location.href).href)";
const wait = (ms) => `new Promise((r) => setTimeout(r, ${ms}))`;
const DIALOG = `(() => { const d = document.querySelector('dialog.dk-sheet[open]'); if (!d) return 0;
  const cs = getComputedStyle(d), m = new DOMMatrix(cs.transform), hgt = d.offsetHeight || 1, wid = d.offsetWidth || 1; // bottom sheet: Y, panel from the right: X
  return Math.max(0, Math.min(1, +cs.opacity * (1 - Math.max(Math.abs(m.m42) / hgt, Math.abs(m.m41) / wid)))); })`;
const closeDialogs = `(async () => { for (const b of document.querySelectorAll('dialog.dk-sheet[open] .dk-sheet-head .dk-iconbtn')) b.click(); await ${wait(450)}; return true; })()`;

export const CASES = [
  {
    id: 'menu-open', budgetClass: 'overlay', page: 'gallery', hash: 'feedback', sizes: ['phone', 'desktop'], dir: 'open', input: 'tap',
    target: `document.querySelector('button[aria-label="Actions"]')`,
    prog: `(() => { const el = document.querySelector('.dk-menu'); return el && el.checkVisibility() ? +getComputedStyle(el).opacity : 0; })`,
    reset: `(async () => { document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.querySelectorAll('.dk-menu').forEach((m) => m.remove()); await ${wait(150)}; return true; })()`,
  },
  {
    // board switcher: popover (desktop, menu budget) or bottom sheet (phone, panel budget); on the phone open the sidebar first
    id: 'switcher-open', budgetClass: { phone: 'panel', desktop: 'overlay' }, page: 'board', hash: 'overview', sizes: ['phone', 'desktop'], dir: 'open', input: 'tap',
    pre: `(async () => { if (innerWidth < 1000 && document.querySelector('.dk-app').dataset.drawer !== 'open') { document.querySelector('.dk-sb-toggle').click(); await ${wait(400)}; } return true; })()`,
    target: `document.querySelector('.dk-brand-btn')`,
    prog: `(() => { const el = document.querySelector('.dk-boards-body'); if (!el) return 0; if (el.closest('dialog')) return ${DIALOG}(); return el.checkVisibility() ? 1 : 0; })`,
    reset: `(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); for (const b of document.querySelectorAll('dialog.dk-sheet[open] .dk-sheet-head .dk-iconbtn')) b.click(); await ${wait(450)}; return true; })()`,
  },
  {
    id: 'toast-open', budgetClass: 'overlay', page: 'gallery', hash: 'feedback', sizes: ['phone', 'desktop'], dir: 'open', input: 'tap',
    pre: `(() => { document.querySelectorAll('.dk-toast').forEach((t) => t.remove()); return true; })()`,
    target: `[...document.querySelectorAll('.g-stage .dk-btn')].find((b) => b.textContent.trim() === 'ok')`,
    prog: `(() => { const el = document.querySelector('.dk-toast:not(.is-leaving)'); return el ? +getComputedStyle(el).opacity : 0; })`,
    reset: `(() => { document.querySelectorAll('.dk-toast').forEach((t) => t.remove()); return true; })()`,
  },
  {
    id: 'tooltip-open', budgetClass: 'overlay', page: 'gallery', hash: 'controls', sizes: ['phone', 'desktop'], dir: 'open', input: 'hint',
    ref: { phone: 'pointerdown', desktop: 'pointerover' }, delay: { phone: 500, desktop: 350 },
    target: `document.querySelector('button[aria-label="Info"]')`,
    prog: `(() => { const el = document.querySelector('.dk-tooltip'); return el && !el.hidden ? +getComputedStyle(el).opacity : 0; })`,
    reset: `${KIT}.then((m) => { m.hideTooltip(); return true; })`,
  },
  {
    // data card (heat cell): mouse = hover, touch = tap; first visible change ≤ 50 ms
    id: 'datacard-open', budgetClass: 'overlay', page: 'gallery', hash: 'charts', sizes: ['phone', 'desktop'], dir: 'open', input: { phone: 'press', desktop: 'hint' },
    ref: { phone: 'pointerdown', desktop: 'pointerover' },
    target: `document.querySelector('.dk-heat-cell:not(.dk-heat-none)')`,
    prog: `(() => { const el = document.querySelector('.dk-datacard'); return el && !el.hidden ? +getComputedStyle(el).opacity : 0; })`,
    reset: `(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return true; })()`,
  },
  {
    // combobox: popover in the first frame (menu budget); closes by Esc
    id: 'combobox-open', budgetClass: 'overlay', page: 'gallery', hash: 'inputs', sizes: ['phone', 'desktop'], dir: 'open', input: 'tap',
    target: `document.querySelector('.dk-combo-btn')`,
    prog: `(() => { const el = document.querySelector('.dk-combo-pop'); return el && el.checkVisibility() ? +getComputedStyle(el).opacity : 0; })`,
    reset: `(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); document.querySelectorAll('.dk-combo-pop').forEach((m) => m.remove()); await ${wait(150)}; return true; })()`,
  },
  {
    // apply a filter to 1,000 table rows (table?rows=1000). Own limits, accepted by the maintainer (stage D review): handler 50 ms, LoAF 80 ms, input→frame 120 ms (global: 16/50/100).
    // Reason: the handler (filter, sort, draw 20 rows) takes ≈ 35–39 ms at 4× CPU (≈ 8 ms at 1×) and is the real work of this case; the same frame also restyles, lays out and paints the page
    // behind the open filter sheet, which adds ≈ 20–30 ms at 4× (LoAF 57–71 ms, input→frame 72–104 ms measured). Getting under the global limits would mean drawing fewer than 15 rows per page.
    // The table draws 20 rows and a “Show more” footer (progress = the footer text '20 of N rows'); do not loosen these limits further, and do not use them for any other case.
    id: 'filter-apply-1000', budgetClass: 'direct', handler: 50, loaf: 80, inputFrame: 120, page: 'gallery', hash: 'table?rows=1000', sizes: ['phone', 'desktop'], dir: 'open', input: 'tap',
    pre: `(async () => { [...document.querySelectorAll('.dk-filterbar .dk-btn')].find((b) => b.textContent.includes('Filter')).click(); await ${wait(450)}; return true; })()`,
    target: `[...document.querySelectorAll('dialog.dk-sheet[open] .dk-pill')].find((b) => b.textContent.includes('Backup'))`,
    prog: `(() => document.querySelector('.dk-table-more-n')?.textContent || '')`,
    reset: `(async () => { for (const c of [...document.querySelectorAll('.dk-filterbar .dk-chip:not(.dk-chip-clear)')]) c.click(); await ${wait(300)}; for (const b of document.querySelectorAll('dialog.dk-sheet[open] .dk-sheet-head .dk-iconbtn')) b.click(); await ${wait(450)}; return true; })()`,
  },
  {
    id: 'press', budgetClass: 'press', page: 'gallery', hash: 'buttons', sizes: ['phone', 'desktop'], dir: 'open', input: 'press', ref: 'pointerdown',
    target: `document.querySelector('.g-stage .dk-btn-default:not(.is-hover):not(.is-pressed)')`,
    prog: `(() => { const el = document.querySelector('.g-stage .dk-btn-default:not(.is-hover):not(.is-pressed)'); return getComputedStyle(el).backgroundColor; })`,
  },
  {
    id: 'segment', budgetClass: 'direct', page: 'gallery', hash: 'controls', sizes: ['phone', 'desktop'], dir: 'open', input: 'tap',
    pre: `(() => { window.__tpT = [...document.querySelector('.dk-seg').children].find((b) => b.getAttribute('aria-checked') !== 'true'); return true; })()`,
    target: `window.__tpT`,
    prog: `(() => (window.__tpT.getAttribute('aria-checked') === 'true' ? 1 : 0))`,
  },
  {
    id: 'tabs', budgetClass: 'direct', page: 'gallery', hash: 'controls', sizes: ['phone', 'desktop'], dir: 'open', input: 'tap',
    pre: `(() => { window.__tpT = [...document.querySelectorAll('.dk-tabs [role=tab]')].find((b) => b.getAttribute('aria-selected') !== 'true'); return true; })()`,
    target: `window.__tpT`,
    prog: `(() => (window.__tpT.getAttribute('aria-selected') === 'true' ? 1 : 0))`,
  },
  {
    id: 'sheet-open', budgetClass: 'panel', page: 'gallery', hash: 'states', sizes: ['phone', 'tablet-s', 'desktop'], dir: 'open', input: 'tap',
    target: `[...document.querySelectorAll('.dk-btn')].find((b) => b.textContent.includes('Open sheet'))`,
    prog: DIALOG, reset: closeDialogs,
  },
  {
    id: 'sheet-close', budgetClass: 'panel', page: 'gallery', hash: 'states', sizes: ['phone', 'tablet-s', 'desktop'], dir: 'close', input: 'tap',
    pre: `(async () => { [...document.querySelectorAll('.dk-btn')].find((b) => b.textContent.includes('Open sheet')).click(); await ${wait(450)}; return true; })()`,
    target: `document.querySelector('dialog.dk-sheet[open] .dk-sheet-head .dk-iconbtn')`,
    prog: DIALOG, reset: closeDialogs,
  },
  {
    id: 'detail-open', budgetClass: { phone: 'panel', 'tablet-s': 'panel', desktop: 'desk' }, page: 'board', hash: 'jobs', sizes: ['phone', 'tablet-s', 'desktop'], dir: 'open', input: 'tap',
    target: `document.querySelector('[data-key="offsite-sync"]')`,
    prog: `(() => { const i = document.querySelector('.dk-inspector'); if (i && !i.hidden && i.checkVisibility()) return 1; return ${DIALOG}(); })`,
    reset: `(async () => { location.hash = '#/jobs'; await ${wait(450)}; return true; })()`,
  },
  {
    id: 'detail-close', budgetClass: { phone: 'panel', 'tablet-s': 'panel', desktop: 'desk' }, page: 'board', hash: 'jobs', sizes: ['phone', 'tablet-s', 'desktop'], dir: 'close', input: 'tap',
    pre: `(async () => { location.hash = '#/jobs?open=offsite-sync'; await ${wait(450)}; return true; })()`,
    target: `document.querySelector('dialog.dk-sheet[open] .dk-sheet-head .dk-iconbtn') || document.querySelector('.dk-inspector [aria-label="Close details"]')`,
    prog: `(() => { const i = document.querySelector('.dk-inspector'); if (i && !i.hidden && i.checkVisibility()) return 1; return ${DIALOG}(); })`,
    reset: `(async () => { location.hash = '#/jobs'; await ${wait(450)}; return true; })()`,
  },
  {
    id: 'sidebar-open', budgetClass: 'panel', page: 'board', hash: 'overview', sizes: ['phone'], dir: 'open', input: 'tap',
    target: `document.querySelector('.dk-sb-toggle')`,
    prog: `(() => { const el = document.querySelector('.dk-sidebar'); const m = new DOMMatrix(getComputedStyle(el).transform); return Math.max(0, Math.min(1, 1 + m.m41 / (el.offsetWidth || 1))); })`,
    reset: `(async () => { document.querySelector('.dk-scrim')?.click(); await ${wait(400)}; return true; })()`,
  },
  {
    id: 'sidebar-close', budgetClass: 'panel', page: 'board', hash: 'overview', sizes: ['phone'], dir: 'close', input: 'tap',
    pre: `(async () => { document.querySelector('.dk-sb-toggle').click(); await ${wait(400)}; return true; })()`,
    target: `({ getBoundingClientRect: () => new DOMRect(innerWidth - 40, innerHeight / 2, 2, 2) })`,
    prog: `(() => { const el = document.querySelector('.dk-sidebar'); const m = new DOMMatrix(getComputedStyle(el).transform); return Math.max(0, Math.min(1, 1 + m.m41 / (el.offsetWidth || 1))); })`,
  },
  {
    id: 'sidebar-desktop', budgetClass: 'desk', page: 'board', hash: 'overview', sizes: ['desktop'], dir: 'close', input: 'tap',
    target: `document.querySelector('.dk-sb-toggle')`,
    prog: `(() => (getComputedStyle(document.querySelector('.dk-sidebar')).visibility === 'hidden' ? 0 : 1))`,
    reset: `(async () => { if (getComputedStyle(document.querySelector('.dk-sidebar')).visibility === 'hidden') document.querySelector('.dk-sb-toggle').click(); await ${wait(200)}; return true; })()`,
  },
];

/** Budgets per class (ms; median at 4× CPU). first = first visible change, done = finished (98 %). */
const FRAME = 17;
export const BUDGETS = {
  overlay: { first: 50, done: 100, anim: 100, note: 'menu/tooltip/toast' },
  panel: { first: 50, done: 150 + FRAME, doneClose: 120 + FRAME, anim: 150, animClose: 120, note: 'Panel/Sheet' },
  desk: { first: 34, done: 34, anim: 0, note: 'desktop panel without animation' },
  press: { first: 34, done: 34, anim: 0, note: 'press instantly' },
  direct: { first: 50, done: 50, anim: 0, note: 'switching without animation' },
};
export const GLOBAL = { handler: 16, loaf: 50, inputFrameP95: 100 };

/** Static inventory: endless animations in these views (loading skeleton, indeterminate progress). */
export const STATIC_VIEWS = [{ page: 'gallery', hash: 'states' }, { page: 'gallery', hash: 'controls' }];
