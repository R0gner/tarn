// @ts-check
// tarn · images: imageStrip() – a row of thumbnails of the same height that scrolls sideways (scroll snap); a tap opens openImageViewer() – the
// image large above everything (a modal dialog in the top layer, like sheets). The viewer pages with a swipe left/right (touch, pen, mouse), the arrow
// keys and two buttons; it closes with x, Esc, a tap beside the image, a swipe down and Back (it takes one history entry inside createApp(),
// js/levels.js). It preloads the neighbours. No zoom: a pinch would fight the swipe; a board that needs zoom links the file.
import './locales/shell.js';   // shell texts
import { h, tokenMs } from './dom.js';
import { t } from './i18n.js';
import { fmtNum } from './format.js';
import { iconButton } from './primitives.js';
import { backLayer, lockScroll } from './sheet.js';
import { normalizeImages, clampIndex, stepIndex, neighbours, swipeResult } from './images-data.js';

/** @typedef {import('./images-data.js').ImageInput} ImageInput */
/** @typedef {import('./images-data.js').ImageItem} ImageItem */
/** @typedef {'x' | 'esc' | 'scrim' | 'swipe' | 'api' | 'back'} ViewerCloseReason */
/** @typedef {{ index?: number, label?: string, onChange?: (index: number) => void, onClose?: (reason: ViewerCloseReason, index: number) => void, returnFocus?: (index: number) => HTMLElement | null | undefined, back?: boolean }} ViewerOptions index: the image to start with; label: the dialog's name (default "Image viewer"); returnFocus: the element that gets the focus once the viewer has gone (default: the one focused before, e.g. the thumbnail that opened it); back: false = no history entry. */
/** @typedef {{ el: HTMLDialogElement, show: (index: number) => void, close: (reason?: ViewerCloseReason) => void, index: () => number }} Viewer */
/** @typedef {{ label?: string, onOpen?: (index: number, images: ImageItem[]) => void, className?: string }} ImageStripOptions label: the list's name (default "Images"); onOpen replaces the viewer (e.g. a board that opens something else). */

/** Distance in px from which a press becomes a drag (not a tap). */
const DRAG_START = 6;

/**
 * A row of thumbnails that scrolls sideways. Every thumbnail is a button "Image n of m" that opens the viewer at that image; arrow keys move the
 * focus along the row. An empty list draws nothing (returns null).
 * @param {ImageInput[] | null | undefined} images strings (URLs) or `{ src, thumb?, alt? }`
 * @param {ImageStripOptions} [opts]
 * @returns {HTMLElement | null}
 */
export function imageStrip(images, opts = {}) {
  const list = normalizeImages(images);
  if (!list.length) return null;
  const m = list.length;
  /** @type {HTMLButtonElement[]} */
  const btns = [];
  const focusAt = (/** @type {number} */ i) => {
    const b = btns[clampIndex(i, m)];
    b.focus({ preventScroll: true });
    b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const open = (/** @type {number} */ i) => {
    if (opts.onOpen) { opts.onOpen(i, list); return; }
    openImageViewer(list, { index: i, returnFocus: (last) => (ul.isConnected ? btns[clampIndex(last, m)] : null) });
  };
  const ul = h('ul', { class: ['tn-imgstrip', opts.className], role: 'list', 'aria-label': opts.label || t('images.strip') },
    list.map((img, i) => {
      const n = i + 1;
      const name = img.alt ? t('images.itemAlt', { alt: img.alt, n: fmtNum(n, 0), m: fmtNum(m, 0) }) : t('images.item', { n: fmtNum(n, 0), m: fmtNum(m, 0) });
      const pic = h('img', { class: 'tn-imgstrip-img', src: img.thumb || img.src, alt: '', loading: 'lazy', decoding: 'async', draggable: 'false' });
      pic.addEventListener('error', () => pic.classList.add('is-broken'), { once: true });
      const b = h('button', { class: 'tn-imgstrip-btn', type: 'button', 'aria-label': name, onclick: () => open(i) }, pic);
      btns.push(b);
      return h('li', { class: 'tn-imgstrip-item' }, b);
    }));
  ul.addEventListener('keydown', (e) => {
    const i = btns.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
    if (i < 0) return;
    const to = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : e.key === 'Home' ? 0 : e.key === 'End' ? m - 1 : null;
    if (to == null) return;
    e.preventDefault();
    focusAt(to);
  });
  return ul;
}

/**
 * Open images large above everything. Returns { el, show(i), close(reason), index() }; onClose(reason, index) fires once.
 * @param {ImageInput[] | null | undefined} images
 * @param {ViewerOptions} [opts]
 * @returns {Viewer | null} null for an empty list
 */
export function openImageViewer(images, opts = {}) {
  const list = normalizeImages(images);
  if (!list.length) return null;
  const m = list.length;
  let cur = clampIndex(opts.index ?? 0, m);
  let closed = false;
  /** @type {Map<string, HTMLImageElement>} */
  const preloaded = new Map();

  const img = h('img', { class: 'tn-viewer-img', alt: '', decoding: 'async', draggable: 'false' });
  const failed = h('p', { class: 'tn-viewer-failed', hidden: true }, t('images.failed'));
  const frame = h('div', { class: 'tn-viewer-frame' }, img, failed);
  const stage = h('div', { class: 'tn-viewer-stage', tabindex: '-1' }, frame);
  const count = h('span', { class: 'tn-viewer-count', 'aria-live': 'polite' });
  const prev = iconButton('chevron-left', { label: t('images.prev'), onClick: () => go(-1), className: 'tn-viewer-nav tn-viewer-prev' });
  const next = iconButton('chevron-right', { label: t('images.next'), onClick: () => go(1), className: 'tn-viewer-nav tn-viewer-next' });
  const x = iconButton('x', { label: t('common.close'), onClick: () => close('x'), className: 'tn-viewer-x' });
  const d = h('dialog', { class: 'tn-viewer', 'aria-label': opts.label || t('images.viewer') },
    stage, h('header', { class: 'tn-viewer-head' }, count, x), prev, next);

  img.addEventListener('load', () => { failed.hidden = true; img.hidden = false; });
  img.addEventListener('error', () => { failed.hidden = false; img.hidden = true; });

  /** @param {number} i */
  function show(i) {
    cur = clampIndex(i, m);
    const it = list[cur];
    const n = fmtNum(cur + 1, 0), total = fmtNum(m, 0);
    failed.hidden = true; img.hidden = false;
    if (img.getAttribute('src') !== it.src) img.src = it.src;
    img.alt = it.alt ? t('images.itemAlt', { alt: it.alt, n, m: total }) : t('images.item', { n, m: total });
    count.textContent = t('images.count', { n, m: total });
    count.hidden = m < 2;
    prev.hidden = cur === 0;
    next.hidden = cur === m - 1;
    for (const k of neighbours(cur, m)) {
      const src = list[k].src;
      if (preloaded.has(src)) continue;
      const pre = new Image();
      pre.decoding = 'async';
      pre.src = src;
      preloaded.set(src, pre);
    }
  }
  /** @param {number} dir */
  function go(dir) {
    const to = stepIndex(cur, m, dir);
    if (to === cur) return;
    show(to);
    opts.onChange?.(cur);
  }
  /** @param {ViewerCloseReason} [reason] */
  function close(reason = 'api') {
    if (closed) return;
    closed = true;
    d.classList.remove('is-open');
    lockScroll(false);
    release?.();
    const done = () => {
      d.close(); d.remove();
      const to = opts.returnFocus?.(cur);   // after close(): the dialog gives the focus back to the opener first
      if (to) { to.focus({ preventScroll: true }); to.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
    };
    const ms = tokenMs('--tn-t-close');
    if (ms <= 0) done(); else setTimeout(done, ms + 30);
    opts.onClose?.(reason, cur);
  }

  d.addEventListener('cancel', (e) => { e.preventDefault(); close('esc'); });
  d.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowLeft') { e.preventDefault(); go(k === 'ArrowRight' ? 1 : -1); }
    else if (k === 'Home' || k === 'End') { e.preventDefault(); const to = k === 'Home' ? 0 : m - 1; if (to !== cur) { show(to); opts.onChange?.(cur); } }
  });
  initGesture(stage, img, {
    step: (dir) => go(dir),
    close: () => close('swipe'),
    tap: (target) => { if (target !== img) close('scrim'); },
    at: () => ({ index: cur, n: m }),
  });

  show(cur);
  document.body.append(d);
  d.showModal();
  lockScroll(true);
  const release = opts.back === false ? null : backLayer(() => close('back'));
  stage.focus({ preventScroll: true });   // focus into the viewer, no ring on the close button
  void d.offsetWidth;   // commit the initial state, then start in the same frame
  d.classList.add('is-open');
  return { el: d, show: (i) => { show(i); }, close, index: () => cur };
}

/**
 * Pointer gestures on the stage (touch, pen and mouse alike): the image follows a horizontal drag and pages on release, a drag down closes,
 * a press without movement is a tap (beside the image: close). Buttons keep their own clicks.
 * @param {HTMLElement} stage
 * @param {HTMLImageElement} img
 * @param {{ step: (dir: number) => void, close: () => void, tap: (target: EventTarget | null) => void, at: () => { index: number, n: number } }} on
 */
function initGesture(stage, img, on) {
  /** @type {{ id: number, x0: number, y0: number, t0: number, dx: number, dy: number, drag: boolean, target: EventTarget | null } | null} */
  let g = null;
  const reset = () => {
    img.classList.add('is-settling');
    img.style.transform = '';
    const ms = tokenMs('--tn-t-close');
    if (ms <= 0) img.classList.remove('is-settling'); else setTimeout(() => img.classList.remove('is-settling'), ms + 30);
  };
  stage.addEventListener('pointerdown', (e) => {
    if (!e.isPrimary || e.button > 0) return;
    g = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, dx: 0, dy: 0, drag: false, target: e.target };
  });
  stage.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    g.dx = e.clientX - g.x0; g.dy = e.clientY - g.y0;
    if (!g.drag) {
      if (Math.abs(g.dx) < DRAG_START && Math.abs(g.dy) < DRAG_START) return;
      g.drag = true;
      img.classList.remove('is-settling');
      try { stage.setPointerCapture(g.id); } catch { /* the pointer is already gone */ }
    }
    const { index, n } = on.at();
    const horiz = Math.abs(g.dx) > Math.abs(g.dy);
    // damped where there is nothing to page to, and upwards
    const damp = (/** @type {number} */ v) => (v >= 0 ? 1 : -1) * Math.sqrt(Math.abs(v)) * 2;
    const dx = horiz ? ((g.dx < 0 && index >= n - 1) || (g.dx > 0 && index <= 0) ? damp(g.dx) : g.dx) : 0;
    const dy = horiz ? 0 : (g.dy > 0 ? g.dy : damp(g.dy));
    img.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  const end = (/** @type {PointerEvent} */ e) => {
    if (!g || e.pointerId !== g.id) return;
    const done = g;
    g = null;
    if (!done.drag) { if (e.type === 'pointerup') on.tap(done.target); return; }
    const r = stage.getBoundingClientRect();
    const { index, n } = on.at();
    const res = e.type === 'pointerup' ? swipeResult({ dx: done.dx, dy: done.dy, dt: e.timeStamp - done.t0, width: r.width, height: r.height, index, n }) : null;
    if (res === 'close') { on.close(); return; }
    if (res) on.step(res === 'next' ? 1 : -1);
    reset();
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
}
