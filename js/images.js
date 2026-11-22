// @ts-check
// tarn · images: imageStrip() – a row of thumbnails of the same height that scrolls sideways (scroll snap); a tap opens openImageViewer() – the
// images large above everything (a modal dialog in the top layer, like sheets). The viewer is a carousel: every image is a slide on one track that
// follows the finger, so the neighbour slides in while you drag and the track settles on release. The neighbours are loaded and decoded ahead.
// Zoom: pinch about the fingers' centre, double tap (double click) steps 1× → 2× → 3.5× → 1× at the tapped spot, the wheel zooms at the pointer;
// a zoomed image pans inside its limits and only a drag beyond the left/right edge moves on to the neighbour (which starts at 1×). Arrow keys,
// Home/End and two buttons page; x, Esc, a single tap beside the image (after the double-tap wait), a swipe down at 1× and Back close it (it takes
// one history entry inside createApp(), js/levels.js).
import './locales/shell.js';   // shell texts
import { h, tokenMs } from './dom.js';
import { t } from './i18n.js';
import { fmtNum } from './format.js';
import { iconButton } from './primitives.js';
import { backLayer, lockScroll } from './sheet.js';
import {
  normalizeImages, clampIndex, stepIndex, neighbours, swipeResult, nextZoomStep, clampScale, panLimits, clampPan, zoomAt, panHandoff, isDoubleTap,
  trackOffset, ZOOM_EPS, DOUBLE_TAP_MS,
} from './images-data.js';

/** @typedef {import('./images-data.js').ImageInput} ImageInput */
/** @typedef {import('./images-data.js').ImageItem} ImageItem */
/** @typedef {'x' | 'esc' | 'scrim' | 'swipe' | 'api' | 'back'} ViewerCloseReason */
/** @typedef {{ index?: number, label?: string, onChange?: (index: number) => void, onClose?: (reason: ViewerCloseReason, index: number) => void, returnFocus?: (index: number) => HTMLElement | null | undefined, back?: boolean }} ViewerOptions index: the image to start with; label: the dialog's name (default "Image viewer"); returnFocus: the element that gets the focus once the viewer has gone (default: the one focused before, e.g. the thumbnail that opened it); back: false = no history entry. */
/** @typedef {{ el: HTMLDialogElement, show: (index: number) => void, close: (reason?: ViewerCloseReason) => void, index: () => number }} Viewer */
/** @typedef {{ label?: string, onOpen?: (index: number, images: ImageItem[]) => void, className?: string }} ImageStripOptions label: the list's name (default "Images"); onOpen replaces the viewer (e.g. a board that opens something else). */

/** Distance in px from which a press becomes a drag (not a tap). */
const DRAG_START = 6;
/** Wheel zoom: scale factor per px of wheel delta (exp). */
const WHEEL_ZOOM = 0.002;

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
  /** the zoom of the current image @type {import('./images-data.js').Zoom} */
  let z = { s: 1, tx: 0, ty: 0 };

  // one slide per image on a track; a slide gets its file once it is the current one or a neighbour (loaded and decoded before it slides in)
  const slides = list.map((it, i) => {
    const img = h('img', { class: 'tn-viewer-img', alt: '', decoding: 'async', draggable: 'false' });
    const failed = h('p', { class: 'tn-viewer-failed', hidden: true }, t('images.failed'));
    const frame = h('div', { class: 'tn-viewer-frame' }, img, failed);
    const el = h('div', { class: 'tn-viewer-slide', 'aria-hidden': 'true' }, frame);
    el.style.setProperty('--tn-slide', String(i));
    img.addEventListener('load', () => { failed.hidden = true; img.hidden = false; });
    img.addEventListener('error', () => { failed.hidden = false; img.hidden = true; });
    return { it, el, frame, img, loaded: false };
  });
  /** @param {number} i */
  const load = (i) => {
    const sl = slides[i];
    if (!sl || sl.loaded) return;
    sl.loaded = true;
    sl.img.src = sl.it.src;
    sl.img.decode().catch(() => { /* the error event shows the message */ });
  };
  const track = h('div', { class: 'tn-viewer-track' }, slides.map((sl) => sl.el));
  const stage = h('div', { class: 'tn-viewer-stage', tabindex: '-1' }, track);
  const count = h('span', { class: 'tn-viewer-count', 'aria-live': 'polite' });
  const prev = iconButton('chevron-left', { label: t('images.prev'), onClick: () => go(-1), className: 'tn-viewer-nav tn-viewer-prev' });
  const next = iconButton('chevron-right', { label: t('images.next'), onClick: () => go(1), className: 'tn-viewer-nav tn-viewer-next' });
  const x = iconButton('x', { label: t('common.close'), onClick: () => close('x'), className: 'tn-viewer-x' });
  const d = h('dialog', { class: 'tn-viewer', 'aria-label': opts.label || t('images.viewer') },
    stage, h('header', { class: 'tn-viewer-head' }, count, x), prev, next);

  /** an element animates to its next transform with the closing duration (0 with reduced motion), then the class goes again */
  const settle = (/** @type {HTMLElement} */ el, /** @type {string} */ tr) => {
    const ms = tokenMs('--tn-t-close');
    if (ms > 0) { el.classList.add('is-settling'); setTimeout(() => el.classList.remove('is-settling'), ms + 30); }
    el.style.transform = tr;
  };
  /** the track at the current slide, shifted by dx px (while a finger drags) */
  const trackAt = (/** @type {number} */ dx, animate = false) => {
    const tr = `translate3d(calc(${-cur * 100}% + ${dx}px), 0, 0)`;
    if (animate) settle(track, tr); else { track.classList.remove('is-settling'); track.style.transform = tr; }
  };
  /** the fitted size of the current image and its frame; the centre in viewport coordinates (the track rests at the current slide) */
  const geom = () => {
    const sl = slides[cur], r = sl.frame.getBoundingClientRect();
    return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height, iw: sl.img.offsetWidth, ih: sl.img.offsetHeight };
  };
  const limits = (/** @type {number} */ s) => { const g = geom(); return panLimits({ s, iw: g.iw, ih: g.ih, w: g.w, h: g.h }); };
  /** @param {import('./images-data.js').Zoom} next @param {boolean} [animate] */
  const setZoom = (next, animate = false) => {
    z = next.s <= 1 + ZOOM_EPS ? { s: 1, tx: 0, ty: 0 } : clampPan(next, limits(next.s));
    const tr = z.s === 1 ? '' : `translate(${z.tx}px, ${z.ty}px) scale(${z.s})`;
    const img = slides[cur].img;
    if (animate) settle(img, tr); else { img.classList.remove('is-settling'); img.style.transform = tr; }
    d.classList.toggle('is-zoomed', z.s > 1);
  };
  /** zoom to scale s about a point in viewport coordinates (default: the frame centre) */
  const zoomTo = (/** @type {number} */ s, /** @type {number} */ px, /** @type {number} */ py, animate = true) => {
    const g = geom();
    setZoom(zoomAt(z, clampScale(s), px - g.cx, py - g.cy), animate);
  };

  /** @param {number} i @param {boolean} [animate] slide the track there (paging) or jump (opening, show()) */
  function show(i, animate = false) {
    const was = cur;
    cur = clampIndex(i, m);
    if (was !== cur) {
      // the image paged away keeps its zoom until it is out of sight, then rests at 1× again; the new one starts at 1×
      const old = slides[was];
      old.el.classList.remove('is-current'); old.el.setAttribute('aria-hidden', 'true');
      const reset = () => { old.img.classList.remove('is-settling'); old.img.style.transform = ''; };
      const ms = animate ? tokenMs('--tn-t-close') : 0;
      if (ms > 0) setTimeout(reset, ms + 30); else reset();
      z = { s: 1, tx: 0, ty: 0 };
      d.classList.remove('is-zoomed');
    }
    const sl = slides[cur];
    sl.el.classList.add('is-current'); sl.el.removeAttribute('aria-hidden');
    load(cur);
    for (const k of neighbours(cur, m)) load(k);
    const n = fmtNum(cur + 1, 0), total = fmtNum(m, 0);
    sl.img.alt = sl.it.alt ? t('images.itemAlt', { alt: sl.it.alt, n, m: total }) : t('images.item', { n, m: total });
    count.textContent = t('images.count', { n, m: total });
    count.hidden = m < 2;
    prev.hidden = cur === 0;
    next.hidden = cur === m - 1;
    trackAt(0, animate);
  }
  /** @param {number} dir */
  function go(dir) {
    const to = stepIndex(cur, m, dir);
    if (to === cur) { trackAt(0, true); return; }
    show(to, true);
    opts.onChange?.(cur);
  }
  /** @param {ViewerCloseReason} [reason] */
  function close(reason = 'api') {
    if (closed) return;
    closed = true;
    gesture.stop();
    removeEventListener('resize', onResize);
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
  const onResize = () => setZoom({ s: 1, tx: 0, ty: 0 });   // the fitted size changed: start again at 1×

  d.addEventListener('cancel', (e) => { e.preventDefault(); close('esc'); });
  d.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (k === 'ArrowRight' || k === 'ArrowLeft') { e.preventDefault(); go(k === 'ArrowRight' ? 1 : -1); }
    else if (k === 'Home' || k === 'End') { e.preventDefault(); const to = k === 'Home' ? 0 : m - 1; if (to !== cur) { show(to, true); opts.onChange?.(cur); } }
    else if (k === '+' || k === '=') { e.preventDefault(); const g = geom(); zoomTo(nextZoomStep(z.s), g.cx, g.cy); }
    else if (k === '-' || k === '0') { e.preventDefault(); setZoom({ s: 1, tx: 0, ty: 0 }, true); }
  });
  const gesture = initGesture(stage, {
    at: () => ({ index: cur, n: m, zoom: z }),
    limits,
    track: (dx, animate) => trackAt(dx, animate),
    drop: (dy, animate) => {
      const fr = slides[cur].frame, tr = dy ? `translate3d(0, ${dy}px, 0)` : '';
      if (animate) settle(fr, tr); else { fr.classList.remove('is-settling'); fr.style.transform = tr; }
    },
    zoom: (next, animate) => setZoom(next, animate),
    zoomTo,
    geom,
    step: (dir) => go(dir),
    close: () => close('swipe'),
    tap: (target) => { if (!(target instanceof Element && target.closest('.tn-viewer-img'))) close('scrim'); },
  });
  addEventListener('resize', onResize);

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
 * @typedef {object} GestureHooks
 * @property {() => { index: number, n: number, zoom: import('./images-data.js').Zoom }} at the current image and its zoom
 * @property {(s: number) => import('./images-data.js').PanLimits} limits pan limits at scale s
 * @property {(dx: number, animate?: boolean) => void} track shift the carousel by dx px from the current slide
 * @property {(dy: number, animate?: boolean) => void} drop move the current slide down (swipe to close)
 * @property {(z: import('./images-data.js').Zoom, animate?: boolean) => void} zoom set the zoom (clamped by the viewer)
 * @property {(s: number, px: number, py: number, animate?: boolean) => void} zoomTo zoom to s about a viewport point
 * @property {() => { cx: number, cy: number }} geom the frame centre in viewport coordinates
 * @property {(dir: number) => void} step page by one
 * @property {() => void} close swipe down closed it
 * @property {(target: EventTarget | null) => void} tap a single tap (after the double-tap wait)
 */

/**
 * Pointer gestures on the stage (touch, pen and mouse alike). One pointer at 1×: a horizontal drag moves the carousel and pages on release, a
 * drag down closes. Zoomed: a drag pans the image; beyond its left/right edge the rest moves the carousel. Two pointers: pinch zoom about their
 * centre (which may move as well). A press without movement is a tap; two taps close together are a double tap (zoom step at the spot); a single
 * tap acts only after DOUBLE_TAP_MS. The wheel zooms at the pointer. Buttons keep their own clicks.
 * @param {HTMLElement} stage
 * @param {GestureHooks} on
 * @returns {{ stop: () => void }}
 */
function initGesture(stage, on) {
  /** @type {Map<number, { x: number, y: number }>} */
  const pts = new Map();
  /** @typedef {'pending' | 'track' | 'drop' | 'pan' | 'pinch' | 'idle'} Mode */
  /** @type {{ id: number, mode: Mode, x0: number, y0: number, t0: number, dx: number, dy: number, over: number, target: EventTarget | null,
   *   z0: import('./images-data.js').Zoom, d0: number, mx0: number, my0: number } | null} */
  let g = null;
  /** @type {{ t: number, x: number, y: number } | null} */
  let lastTap = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let tapTimer = null;
  const cancelTap = () => { if (tapTimer) clearTimeout(tapTimer); tapTimer = null; lastTap = null; };
  const capture = (/** @type {number} */ id) => { try { stage.setPointerCapture(id); } catch { /* the pointer is already gone */ } };
  const pinchStart = () => {
    const [a, b] = [...pts.values()];
    const { zoom } = on.at();
    if (g && g.mode === 'track') on.track(0, true);
    if (g && g.mode === 'drop') on.drop(0, true);
    g = { id: -1, mode: 'pinch', x0: 0, y0: 0, t0: 0, dx: 0, dy: 0, over: 0, target: null, z0: zoom,
      d0: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), mx0: (a.x + b.x) / 2, my0: (a.y + b.y) / 2 };
    for (const id of pts.keys()) capture(id);
  };
  /** one pointer (again) as the start of a drag: after a pinch the remaining finger pans on from where the image is */
  const single = (/** @type {number} */ id, /** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ t0, /** @type {Mode} */ mode, /** @type {EventTarget | null} */ target) => {
    g = { id, mode, x0: x, y0: y, t0, dx: 0, dy: 0, over: 0, target, z0: on.at().zoom, d0: 0, mx0: 0, my0: 0 };
  };

  const down = (/** @type {PointerEvent} */ e) => {
    if (e.button > 0 || pts.size >= 2) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { cancelTap(); pinchStart(); return; }
    single(e.pointerId, e.clientX, e.clientY, e.timeStamp, 'pending', e.target);
  };
  const move = (/** @type {PointerEvent} */ e) => {
    const p = pts.get(e.pointerId);
    if (!p || !g) return;
    p.x = e.clientX; p.y = e.clientY;
    if (g.mode === 'pinch') {
      if (pts.size < 2) return;
      const [a, b] = [...pts.values()];
      const c = on.geom();
      const s = clampScale(g.z0.s * Math.hypot(b.x - a.x, b.y - a.y) / g.d0);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const zz = zoomAt(g.z0, s, g.mx0 - c.cx, g.my0 - c.cy);   // about where the fingers started …
      on.zoom({ s: zz.s, tx: zz.tx + mx - g.mx0, ty: zz.ty + my - g.my0 });   // … and moved with them
      return;
    }
    if (e.pointerId !== g.id || g.mode === 'idle') return;
    g.dx = e.clientX - g.x0; g.dy = e.clientY - g.y0;
    const { index, n, zoom } = on.at();
    if (g.mode === 'pending') {
      if (Math.abs(g.dx) < DRAG_START && Math.abs(g.dy) < DRAG_START) return;
      cancelTap();
      g.mode = zoom.s > 1 ? 'pan' : Math.abs(g.dx) > Math.abs(g.dy) ? 'track' : 'drop';
      capture(g.id);
    }
    if (g.mode === 'track') on.track(trackOffset(g.dx, index, n));
    else if (g.mode === 'drop') on.drop(g.dy > 0 ? g.dy : trackOffset(g.dy, 0, 1));   // upwards: damped
    else if (g.mode === 'pan') {
      const r = panHandoff({ tx: g.z0.tx, ty: g.z0.ty, dx: g.dx, dy: g.dy, lim: on.limits(zoom.s) });
      on.zoom({ s: zoom.s, tx: r.tx, ty: r.ty });
      g.over = r.over;
      on.track(trackOffset(r.over, index, n));
    }
  };
  const up = (/** @type {PointerEvent} */ e) => {
    if (!pts.delete(e.pointerId) || !g) return;
    const done = g;
    if (done.mode === 'pinch') {
      const { zoom } = on.at();
      if (zoom.s <= 1 + ZOOM_EPS * 5) on.zoom({ s: 1, tx: 0, ty: 0 }, true);   // released just above 1×: back to fitted
      const [rest] = [...pts.entries()];
      if (rest) single(rest[0], rest[1].x, rest[1].y, e.timeStamp, on.at().zoom.s > 1 ? 'pan' : 'idle', null);
      else g = null;
      return;
    }
    if (e.pointerId !== done.id) return;
    g = null;
    if (done.mode === 'idle') return;
    if (done.mode === 'pending') {
      if (e.type !== 'pointerup') return;
      const tap = { t: e.timeStamp, x: e.clientX, y: e.clientY };
      if (isDoubleTap(lastTap, tap)) {
        cancelTap();
        const { zoom } = on.at();
        on.zoomTo(nextZoomStep(zoom.s), tap.x, tap.y);
        return;
      }
      cancelTap();
      lastTap = tap;
      const target = done.target;
      tapTimer = setTimeout(() => { tapTimer = null; lastTap = null; on.tap(target); }, DOUBLE_TAP_MS);
      return;
    }
    const r = stage.getBoundingClientRect();
    const { index, n } = on.at();
    const dt = e.timeStamp - done.t0;
    const ok = e.type === 'pointerup';
    if (done.mode === 'drop') {
      if (ok && swipeResult({ dx: 0, dy: done.dy, dt, width: r.width, height: r.height, index, n }) === 'close') { on.close(); return; }
      on.drop(0, true);
      return;
    }
    const dx = done.mode === 'track' ? done.dx : done.over;
    const res = ok && dx ? swipeResult({ dx, dy: 0, dt, width: r.width, height: r.height, index, n }) : null;
    if (res === 'next' || res === 'prev') on.step(res === 'next' ? 1 : -1);
    else on.track(0, true);
  };
  const wheel = (/** @type {WheelEvent} */ e) => {
    e.preventDefault();
    const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;   // lines, pages
    const { zoom } = on.at();
    on.zoomTo(zoom.s * Math.exp(-e.deltaY * px * WHEEL_ZOOM), e.clientX, e.clientY, false);
  };
  stage.addEventListener('pointerdown', down);
  stage.addEventListener('pointermove', move);
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', wheel, { passive: false });
  return { stop: () => { cancelTap(); g = null; pts.clear(); } };
}
