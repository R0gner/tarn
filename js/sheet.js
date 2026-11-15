// @ts-check
// tarn · modal sheet in two variants: panel from the right (≥ 700 px, swipe right, scrim, Esc and Back
// close it) and bottom sheet (< 700 px, swipe down). There is no popup. From 1000 px the detail lives
// in the inspector instead (js/shell.js).
// Background locked (html.tn-locked), content with overscroll-behavior: contain, safe-area at the bottom.
// Proven pattern (openSheet + gestures), new look.
import './locales/shell.js';   // shell texts
import { h, mount, tokenMs } from './dom.js';
import { icon } from './icons.js';
import { t } from './i18n.js';

/** @typedef {import('./dom.js').Child} Child */
/** @typedef {{ title?: string, sub?: string, body?: Child, footer?: Child | null, kind?: string, back?: boolean, onClose?: (reason: 'x' | 'esc' | 'scrim' | 'swipe' | 'api' | 'back') => void }} SheetOptions kind goes to data-kind (styling hook). back: false = the sheet takes no history entry (the shell's detail sheet lives in the URL). */
/** @typedef {{ title?: string, sub?: string, body?: Child, footer?: Child | null, keepScroll?: boolean }} SheetUpdate Only the keys that are present change; keepScroll keeps the body scroll position when the body is replaced. */
/** @typedef {{ el: HTMLDialogElement, body: HTMLElement, update: (o?: SheetUpdate) => void, close: (reason?: string) => void }} Sheet */

/** Breakpoint panel ↔ bottom sheet in px. Must match the @media (max-width: 699px) in css/components.css. */
export const SHEET_BREAKPOINT = 700;
export const PHONE = window.matchMedia(`(max-width: ${SHEET_BREAKPOINT - 1}px)`);
let locks = 0;
/** @type {((close: () => void) => () => void) | null} */
let backHook = null;
/**
 * createApp({ back: 'levels' }) installs this: every sheet, panel and dialog takes one history entry, Back closes the topmost one (js/levels.js).
 * @param {((close: () => void) => () => void) | null} fn called with the layer's close function, returns the release that removes its entry
 */
export function setBackHook(fn) { backHook = fn; }
/**
 * A layer (sheet, dialog) opens: Back calls `close`. Returns the release for when it closes in another way. Without createApp() nothing happens.
 * @param {() => void} close
 * @returns {() => void}
 */
export function backLayer(close) { return backHook ? backHook(close) : () => {}; }
/**
 * Lock background scrolling (counted: sheet and sidebar overlay can overlap).
 * @param {boolean} on
 */
export function lockScroll(on) { lock(on); }
/**
 * @param {boolean} on
 */
function lock(on) {
  locks = Math.max(0, locks + (on ? 1 : -1));
  document.documentElement.classList.toggle('tn-locked', locks > 0);
}

/**
 * openSheet({ title, sub, body, footer, kind, onClose }) → { el, body, update(opts), close(reason) }
 * body/footer: Node, string or array. onClose(reason) fires once: 'x' | 'esc' | 'scrim' | 'swipe' | 'api' | 'back'.
 * @param {SheetOptions} [opts]
 * @returns {Sheet}
 */
export function openSheet(opts = {}) {
  const titleEl = h('h2', { class: 'tn-sheet-title tn-ellipsis' });
  const subEl = h('div', { class: 'tn-sheet-sub' });
  const bodyEl = h('div', { class: 'tn-sheet-body', tabindex: '-1' });
  const footEl = h('div', { class: 'tn-sheet-foot' });
  const closeBtn = h('button', { class: 'tn-iconbtn', type: 'button', 'aria-label': t('common.close'), onclick: () => close('x') }, icon('x'));
  const d = h('dialog', { class: 'tn-sheet', 'aria-labelledby': null },
    h('div', { class: 'tn-sheet-grip', 'aria-hidden': 'true' }),
    h('header', { class: 'tn-sheet-head' }, h('div', { class: 'tn-sheet-heading' }, titleEl, subEl), closeBtn),
    bodyEl, footEl);
  if (opts.kind) d.dataset.kind = opts.kind;

  let closed = false;
  /** @param {SheetUpdate} [o] */
  function update(o = {}) {
    if ('title' in o) titleEl.textContent = o.title || '';
    if ('sub' in o) { subEl.textContent = o.sub || ''; subEl.hidden = !o.sub; }
    if ('body' in o) { const keep = o.keepScroll ? bodyEl.scrollTop : 0; mount(bodyEl, o.body); bodyEl.scrollTop = keep; }
    if ('footer' in o) { mount(footEl, o.footer); footEl.hidden = !o.footer; }
  }
  /** @param {string} [reason] */
  function close(reason = 'api') {
    if (closed) return;
    closed = true;
    d.classList.remove('is-open');
    lock(false);
    release?.();
    const done = () => { d.close(); d.remove(); };
    const ms = tokenMs('--tn-t-close'); // duration comes from the token (reduced-motion: 0 ms → immediate)
    if (ms <= 0) done(); else setTimeout(done, ms + 30);
    opts.onClose?.(/** @type {'x' | 'esc' | 'scrim' | 'swipe' | 'api' | 'back'} */ (reason));
  }
  update({ title: opts.title, sub: opts.sub, body: opts.body, footer: opts.footer ?? null });

  d.addEventListener('cancel', (e) => { e.preventDefault(); close('esc'); });
  d.addEventListener('click', (e) => { if (e.target === d) close('scrim'); });
  initSwipe(d, bodyEl, () => close('swipe'));

  document.body.append(d);
  d.showModal();
  lock(true);
  const release = opts.back === false ? null : backLayer(() => close('back'));
  bodyEl.focus({ preventScroll: true }); // focus into the content, no ring on the close button
  void d.offsetWidth; // commit the initial state, then start in the same frame (no requestAnimationFrame)
  d.classList.add('is-open');
  return { el: d, body: bodyEl, update, close };
}

/* Swipe closes. Bottom sheet: downwards (grip/head always, content only at scrollTop 0). Panel: to the right
   (horizontal, content scrolls vertically). The sheet follows the finger, closes at 30 % of its size or on a fast
 * @param {HTMLDialogElement} d
 * @param {HTMLElement} bodyEl
 * @param {() => void} onClose
   swipe, otherwise it springs back. */
function initSwipe(d, bodyEl, onClose) {
  /** @type {{ panel: boolean, x0: number, y0: number, last: number, lastT: number, samples: { v: number, t: number }[], drag: boolean, canDrag: boolean, size?: number } | null} */
  let g = null;
  d.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { g = null; return; }
    const t = e.touches[0];
    const grip = !!/** @type {Element} */ (e.target).closest('.tn-sheet-grip, .tn-sheet-head');
    g = { panel: !PHONE.matches, x0: t.clientX, y0: t.clientY, last: 0, lastT: e.timeStamp, samples: [{ v: 0, t: e.timeStamp }], drag: false, canDrag: grip || bodyEl.scrollTop <= 0 };
  }, { passive: true });
  d.addEventListener('touchmove', (e) => {
    if (!g) return;
    const t = e.touches[0], dx = t.clientX - g.x0, dy = t.clientY - g.y0;
    const dist = g.panel ? dx : dy, cross = g.panel ? dy : dx;
    if (!g.drag) {
      if (dist > 6 && Math.abs(dist) > Math.abs(cross) && (g.panel || g.canDrag)) { g.drag = true; d.classList.add('is-dragging'); }
      else if (Math.abs(dist) > 6 || Math.abs(cross) > 6) { g = null; return; } else return;
    }
    e.preventDefault();
    g.last = dist; g.lastT = e.timeStamp;
    g.samples.push({ v: dist, t: e.timeStamp });
    if (g.samples.length > 12) g.samples.shift();
    const size = g.size || (g.size = g.panel ? d.getBoundingClientRect().width : d.getBoundingClientRect().height);
    const off = dist >= 0 ? dist : -Math.sqrt(-dist) * 2; // damped against the closing direction
    d.style.transform = g.panel ? `translateX(${off}px)` : `translateY(${off}px)`;
    d.style.setProperty('--tn-sheet-p', String(Math.max(0, 1 - Math.max(0, dist) / size)));
  }, { passive: false });
  const end = () => {
    if (!g || !g.drag) { g = null; return; }
    const dist = Math.max(0, g.last);
    const lastT = g.lastT;
    const ref = g.samples.find((p) => lastT - p.t <= 100) || g.samples[0];
    const fast = g.lastT - ref.t > 0 && (g.last - ref.v) / (g.lastT - ref.t) > 0.5;
    const size = g.size ?? 0;
    g = null;
    d.classList.remove('is-dragging');
    d.style.transform = '';
    d.style.removeProperty('--tn-sheet-p');
    if (dist > 0.3 * size || (fast && dist > 24)) onClose();
  };
  d.addEventListener('touchend', end);
  d.addEventListener('touchcancel', end);
}
