// @ts-check
// dashkit · data card: one style for everything whose content is only visible on hover
// (heatmap cells, timeline bars, usage segments; line/bar charts use the same card style).
//   Mouse    immediately in the first frame, disappears on leave.
//   Touch    tap shows it, dragging across cells scrubs, tapping elsewhere or scrolling closes it.
//   Keyboard focus shows it.
//   Action   If the element has onItem, on touch only the second tap on the same element triggers it,
//            otherwise (mouse, keyboard) the click.
// Groups (heatmap row, attribute data-dk-cards): a touch anywhere in the row selects the nearest cell.
import { h } from './dom.js';
import { showOverlay, hideOverlay, placeAbove } from './overlay.js';

/** @typedef {import('./dom.js').Child} Child */
/** @typedef {() => Child} CardContent Builds the card content on every show (so it is always current). */
/** @typedef {{ onItem?: () => void }} DataCardOptions onItem: the action of the element (click; on touch the second tap). */

/** @type {WeakMap<Element, { content: CardContent, onItem?: () => void }>} */
const reg = new WeakMap();     // element → { content, onItem }
/** @type {HTMLElement | null} */ let card = null;
/** @type {Element | null} */ let current = null;
/** @type {{ id: number, el: Element, wasShown: boolean, x: number, y: number, moved: boolean } | null} */ let touch = null;
let lastTouchUp = 0, installed = false;

/**
 * Register a card on the element. content: () → Node | Node[]; opts.onItem: action (second tap / click).
 * @template {HTMLElement | SVGElement} T
 * @param {T} el
 * @param {CardContent} content
 * @param {DataCardOptions} [o]
 * @returns {T}
 */
export function dataCard(el, content, { onItem } = {}) {
  reg.set(el, { content, onItem });
  el.setAttribute('data-dk-card', '');
  install();
  el.addEventListener('pointerenter', (e) => { if (/** @type {PointerEvent} */ (e).pointerType === 'mouse') showCard(el); });
  el.addEventListener('pointerleave', (e) => { if (/** @type {PointerEvent} */ (e).pointerType === 'mouse' && current === el) hideCard(); });
  el.addEventListener('focus', () => { if (el.matches(':focus-visible')) showCard(el); });
  el.addEventListener('blur', () => { if (current === el) hideCard(); });
  if (onItem) {
    el.addEventListener('click', (ev) => {
      const e = /** @type {PointerEvent} */ (ev);
      // On touch the second tap triggers it (pointerup below); the following click does not count again.
      if (e.pointerType === 'touch' || e.pointerType === 'pen' || e.timeStamp - lastTouchUp < 700) return;
      onItem();
    });
  }
  return el;
}

// Group (heatmap row): container with attribute data-dk-cards; a touch anywhere inside selects the nearest cell.

/**
 * @param {EventTarget | null} target
 * @param {number | null} [x]
 * @returns {HTMLElement | null}
 */
function cardAt(target, x) {
  if (!(target instanceof Element)) return null;
  const el = /** @type {HTMLElement | null} */ (target.closest('[data-dk-card]'));
  if (el) return el;
  const grp = target.closest('[data-dk-cards]');
  if (!grp || x == null) return null;
  /** @type {HTMLElement | null} */
  let best = null;
  let bd = Infinity;
  for (const c of /** @type {NodeListOf<HTMLElement>} */ (grp.querySelectorAll('[data-dk-card]'))) {
    const r = c.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - x);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function ensureCard() {
  if (!card) card = h('div', { class: 'dk-datacard', role: 'tooltip', hidden: true });
  return card;
}

/**
 * @param {HTMLElement | SVGElement} el
 */
export function showCard(el) {
  const r = reg.get(el);
  if (!r) return;
  const c = ensureCard();
  c.replaceChildren(.../** @type {(Node | string)[]} */ ([r.content()].flat().filter(Boolean)));
  showOverlay(c);
  current = el;
  placeAbove(c, el.getBoundingClientRect(), 8);
}
export function hideCard() {
  current = null;
  if (card) hideOverlay(card);
}

function install() {
  if (installed) return;
  installed = true;
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    const el = cardAt(e.target, e.clientX);
    if (!el) { touch = null; hideCard(); return; }
    touch = { id: e.pointerId, el, wasShown: current === el, x: e.clientX, y: e.clientY, moved: false };
    showCard(el);
  }, { capture: true, passive: true });
  document.addEventListener('pointermove', (e) => {
    if (!touch || e.pointerId !== touch.id) return;
    if (Math.hypot(e.clientX - touch.x, e.clientY - touch.y) > 8) touch.moved = true;
    const el = cardAt(document.elementFromPoint(e.clientX, e.clientY), e.clientX);
    if (el && el !== current) showCard(el);
  }, { capture: true, passive: true });
  document.addEventListener('pointerup', (e) => {
    if (!touch || e.pointerId !== touch.id) return;
    const t = touch; touch = null;
    lastTouchUp = e.timeStamp;
    if (!t.moved && t.wasShown && current === t.el) {
      const onItem = reg.get(t.el)?.onItem;
      if (onItem) { hideCard(); onItem(); }
    }
  }, { capture: true, passive: true });
  document.addEventListener('pointercancel', () => { touch = null; hideCard(); }, { capture: true, passive: true });
  window.addEventListener('scroll', () => { if (current) hideCard(); }, { capture: true, passive: true });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && current) hideCard(); }, true);
}
