// @ts-check
// tarn · Board switcher: launcher grid for switching between boards (see boards-data.js for the data format).
//   boardGrid(data, { current })        the grid (tiles as real <a href>, small headings with categories)
//   boardSwitcher(anchor, opts)         turns a button into the switcher: ≥ 700 px popover below the anchor (overlay layer),
//                                       below that a bottom sheet. opts: { boards | URL, categories?, boardId? }
//   boardIcon(spec, name, size)         icon of a board (file URL or { icon, color }); without an icon a letter tile
// Controls: Enter/Space opens, arrow keys in the grid (Home/End), Esc closes and returns focus, a click outside
// closes. Middle click/Ctrl-click on a tile opens the board in a new tab.
import './locales/shell.js';   // shell texts
import { h, tokenMs } from './dom.js';
import { icon } from './icons.js';
import { empty, loading } from './components.js';
import { openSheet, PHONE } from './sheet.js';
import { showOverlay, removeOverlay } from './overlay.js';
import { faviconHref } from './favicon.js';
import { normalizeBoards, normalizeIcon, letterOf, colorOf } from './boards-data.js';
import { t } from './i18n.js';

/** @typedef {import('./boards-data.js').BoardList} BoardList */
/** @typedef {import('./boards-data.js').BoardCategory} BoardCategory */
/** @typedef {import('./boards-data.js').NormalizedBoards} NormalizedBoards */
/** @typedef {import('./boards-data.js').IconSpec} IconSpec */
/** @typedef {import('./sheet.js').Sheet} Sheet */
/** @typedef {{ boards: BoardList | string, categories?: BoardCategory[], boardId?: string }} BoardSwitcherOptions boards as a string is the URL of a same-origin JSON file (loaded on first open and cached). */
/** @typedef {{ open: (byKeyboard?: boolean) => void, close: (refocus?: boolean) => void, isOpen: () => boolean, readonly data: NormalizedBoards | null }} BoardSwitcher */

/**
 * Icon of a board. spec: URL | { icon, color } | null; without spec a letter tile (letter = false: nothing). Fixed size, no layout shift.
 * @param {IconSpec} spec
 * @param {string} name
 * @param {number} [size]
 * @param {{ letter?: boolean }} [o]
 * @returns {HTMLElement | null}
 */
export function boardIcon(spec, name, size = 44, { letter = true } = {}) {
  const ic = normalizeIcon(spec);
  const box = h('span', { class: 'tn-bicon', style: { '--tn-bicon': `${size}px` }, 'aria-hidden': 'true' });
  const tile = () => {
    box.classList.add('is-letter', `tn-c-${colorOf(name)}`);
    box.replaceChildren(h('span', { class: 'tn-bicon-letter' }, letterOf(name)));
  };
  if (!ic) { if (!letter) return null; tile(); return box; }
  const img = h('img', { class: 'tn-bicon-img', src: 'url' in ic ? ic.url : faviconHref(ic), width: size, height: size, alt: '', decoding: 'async' });
  img.addEventListener('error', () => { if (letter) tile(); else img.remove(); }, { once: true });
  box.append(img);
  return box;
}

/**
 * Grid from groups { label, boards } (from normalizeBoards). opts: { current: id, onNavigate }.
 * @param {NormalizedBoards} data
 * @param {{ current?: string }} [o]
 * @returns {HTMLElement}
 */
export function boardGrid(data, { current } = {}) {
  const grid = h('div', { class: 'tn-boards-body' });
  for (const g of data.groups) {
    if (g.label) grid.append(h('h3', { class: 'tn-boards-cat' }, g.label));
    grid.append(h('div', { class: 'tn-boards-grid' }, g.boards.map((b) => h('a', {
      class: 'tn-board', href: b.href, 'data-id': b.id, 'aria-current': b.id === current ? 'true' : null,
    }, boardIcon(b.icon, b.name), // names wrap only at word boundaries: a single word gets an ellipsis + hint, multiple words at most 2 lines
      h('span', { class: /\s/.test(b.name) ? 'tn-board-name tn-clamp' : 'tn-board-name tn-ellipsis' }, b.name)))));
  }
  grid.addEventListener('keydown', (e) => navigate(grid, e));
  return grid;
}

/**
 * Arrow keys in the grid: geometrically to the next tile in that direction (rows and columns across categories).
 * @param {HTMLElement} root
 * @param {KeyboardEvent} e
 */
function navigate(root, e) {
  const keys = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const tiles = /** @type {HTMLElement[]} */ ([...root.querySelectorAll('a.tn-board')]);
  const i = tiles.indexOf(/** @type {HTMLElement} */ (document.activeElement));
  if (i < 0 || (!keys[e.key] && e.key !== 'Home' && e.key !== 'End')) return;
  e.preventDefault();
  if (e.key === 'Home') return tiles[0].focus();
  if (e.key === 'End') return tiles[tiles.length - 1].focus();
  const [dx, dy] = keys[e.key];
  const r = tiles[i].getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  /** @type {HTMLElement | null} */
  let best = null;
  let bd = Infinity;
  tiles.forEach((t, k) => {
    if (k === i) return;
    const q = t.getBoundingClientRect(), tx = q.left + q.width / 2 - cx, ty = q.top + q.height / 2 - cy;
    const along = dx ? tx * dx : ty * dy, across = dx ? Math.abs(ty) : Math.abs(tx);
    if (along <= 1 || (dx && across > r.height * 0.6) || (dy && across > r.width * 3)) return;
    const d = along + across * 2;
    if (d < bd) { bd = d; best = t; }
  });
  const target = /** @type {HTMLElement | null} */ (best); // assigned in the forEach callback; TypeScript does not see that
  if (target) target.focus();
  else if (dx) { const k = i + dx; if (tiles[k]) tiles[k].focus(); } // line wrap: next/previous tile
}

/**
 * Turns anchor (button) into the board switcher. opts: { boards: Array | { boards, categories } | URL (same-origin JSON, loaded
 * on first open and cached), categories?, boardId? (current board) }. Returns { open, close, isOpen }.
 * @param {HTMLElement} anchor
 * @param {BoardSwitcherOptions} opts
 * @returns {BoardSwitcher}
 */
export function boardSwitcher(anchor, opts) {
  let data = typeof opts.boards === 'string' ? null : normalizeBoards(opts.boards, opts.categories);
  /** @type {NormalizedBoards | null} */
  /** @type {string | null} */ let loadError = null;
  /** @type {Promise<void> | null} */ let loading_ = null;
  /** @type {HTMLElement | null} */ let el = null;
  /** @type {Sheet | null} */ let sheet = null;
  /** @type {HTMLElement | null} */ let body = null;
  let width0 = 0;
  anchor.setAttribute('aria-haspopup', 'dialog');
  anchor.setAttribute('aria-expanded', 'false');

  async function load() {
    if (data || loading_) return loading_;
    loading_ = (async () => {
      try {
        const url = new URL(/** @type {string} */ (opts.boards), location.href);
        if (url.origin !== location.origin) throw new Error('same-origin board lists only');
        const r = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        data = normalizeBoards(await r.json(), opts.categories);
        loadError = null;
      } catch (e) { loadError = /** @type {Error} */ (e).message || t('common.unknownError'); data = null; }
      loading_ = null;
    })();
    return loading_;
  }
  function content() {
    if (data?.boards.length) return boardGrid(data, { current: opts.boardId });
    if (!data && !loadError) return loading({ rows: 2, label: t('boards.loading') });
    return empty({ compact: true, icon: 'alert', title: t('boards.none'), text: loadError ? t('boards.loadFailed', { error: loadError }) : t('boards.empty') });
  }
  /** @param {boolean} [focus] */
  function fill(focus) {
    if (!body) return;
    body.replaceChildren(content());
    if (el) place();
    if (focus) focusFirst();
  }
  function focusFirst() {
    if (!body) return;
    const t = /** @type {HTMLElement | null} */ (body.querySelector('a[aria-current="true"]') || body.querySelector('a.tn-board'));
    if (t) t.focus({ preventScroll: true });
  }
  function place() {
    const r = anchor.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight;
    if (!el) return;
    const w = el.offsetWidth, hgt = el.offsetHeight;
    const x = Math.max(4, Math.min(vw - w - 4, r.left));
    let y = r.bottom + 4;
    if (y + hgt > vh - 4) y = Math.max(4, vh - 4 - hgt);
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  /** @param {Event} e */
  const outside = (e) => { if (el && !el.contains(/** @type {Node} */ (e.target)) && !anchor.contains(/** @type {Node} */ (e.target))) close(false); };
  /** @param {KeyboardEvent} e */
  const esc = (e) => { if (e.key === 'Escape' && el) { e.preventDefault(); e.stopPropagation(); close(true); } };
  const resized = () => { if (el && Math.abs(document.documentElement.clientWidth - width0) >= 1) close(false); };
  /** @param {boolean} [byKeyboard] */
  function open(byKeyboard = true) {
    if (el || sheet) return;
    anchor.setAttribute('aria-expanded', 'true');
    body = h('div', { class: 'tn-boards-content' });
    body.append(content());
    if (PHONE.matches) {
      sheet = openSheet({ title: t('boards.title'), body, onClose: (reason) => { sheet = null; anchor.setAttribute('aria-expanded', 'false'); if (reason !== 'api') setTimeout(() => anchor.focus({ preventScroll: true }), tokenMs('--tn-t-close') + 60); } }); // only once the sheet is closed (before that the title is inert)
      if (byKeyboard) focusFirst();
    } else {
      el = h('div', { class: 'tn-boards', role: 'dialog', 'aria-label': t('boards.title') }, body);
      showOverlay(el);
      place();
      width0 = document.documentElement.clientWidth;
      document.addEventListener('pointerdown', outside, true);
      document.addEventListener('keydown', esc, true);
      window.addEventListener('resize', resized);
      if (byKeyboard) focusFirst();
    }
    if (!data) load().then(() => { if (el || sheet) fill(byKeyboard); });
  }
  /** @param {boolean} [refocus] */
  function close(refocus) {
    if (sheet) { const s = sheet; sheet = null; s.close('api'); anchor.setAttribute('aria-expanded', 'false'); if (refocus) setTimeout(() => anchor.focus({ preventScroll: true }), tokenMs('--tn-t-close') + 60); return; }
    if (!el) return;
    removeOverlay(el); el = null; anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', esc, true);
    window.removeEventListener('resize', resized);
    if (refocus && anchor.isConnected) anchor.focus({ preventScroll: true });
  }
  anchor.addEventListener('click', (e) => (el || sheet ? close(false) : open(e.detail === 0))); // detail 0: keyboard (Enter/Space) → focus into the grid
  return { open, close, isOpen: () => !!(el || sheet), get data() { return data; } };
}
