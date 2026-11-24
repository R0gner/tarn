// @ts-check
// tarn · Press feedback: immediate under a mouse, a short flash after a real tap on touch.
// The CSS styles only .is-down (never :active): Chrome on a phone sets :active on touchstart, so every row the thumb touched to
// start a scroll or a swipe lit up (round 11). Mouse and pen: .is-down from pointerdown to release, as before. Touch and keyboard:
// .is-down only for --tn-t-tap after the click of a real tap (finger down and up within a few px, no pointercancel, no scroll).
import { tokenMs } from './dom.js';

const PRESSABLE = 'button, a[href], [role="button"], [role="tab"], [role="option"], [role="menuitem"], tr[tabindex], .tn-combo-opt';
const SLOP = 8;   // px a finger may move and still tap
/** @type {Element | null} */
let down = null;
/** @type {{ el: Element, x: number, y: number, id: number } | null} */
let touch = null;
/** @type {Element | null} */
let tapped = null;
let flashTimer = 0;

/** @param {EventTarget | null} t */
function pressable(t) {
  const el = t instanceof Element ? t.closest(PRESSABLE) : null;
  return el && !(/** @type {HTMLButtonElement} */ (el).disabled) && el.getAttribute('aria-disabled') !== 'true' ? el : null;
}
function release() {
  if (down) { down.classList.remove('is-down'); down = null; }
}
/** @param {Element} el */
function flash(el) {
  clearTimeout(flashTimer);
  release();
  down = el;
  el.classList.add('is-down');
  const ms = tokenMs('--tn-t-tap');
  flashTimer = window.setTimeout(() => { flashTimer = 0; if (down === el) release(); }, ms);
}

document.addEventListener('pointerdown', (e) => {
  clearTimeout(flashTimer);
  flashTimer = 0;
  release();
  touch = null;
  tapped = null;
  const el = pressable(e.target);
  if (!el) return;
  if (e.pointerType === 'touch') { touch = { el, x: e.clientX, y: e.clientY, id: e.pointerId }; return; }
  down = el;
  el.classList.add('is-down');
}, { capture: true, passive: true });
document.addEventListener('pointermove', (e) => {
  if (touch && e.pointerId === touch.id && Math.hypot(e.clientX - touch.x, e.clientY - touch.y) > SLOP) touch = null;
}, { capture: true, passive: true });
document.addEventListener('pointerup', (e) => {
  if (touch && e.pointerId === touch.id && Math.hypot(e.clientX - touch.x, e.clientY - touch.y) <= SLOP) tapped = touch.el;
  touch = null;
}, { capture: true, passive: true });
// a scroll or swipe that started on the control: the browser takes the pointer over (pointercancel) or the page scrolls
for (const type of ['pointercancel', 'scroll']) document.addEventListener(type, () => { touch = null; tapped = null; }, { capture: true, passive: true });
document.addEventListener('click', (e) => {
  const el = pressable(e.target);
  // a real tap (its pointerup stayed within SLOP) or a keyboard click (detail 0): a short flash; a mouse click was already shown on pointerdown
  if (el && (el === tapped || (e.detail === 0 && !down))) flash(el);
  tapped = null;
}, { capture: true, passive: true });
// mouse and pen: the pressed state ends with the release; a running flash ends by its timer
for (const type of ['pointerup', 'pointercancel', 'dragstart']) {
  document.addEventListener(type, (e) => { if (/** @type {PointerEvent} */ (e).pointerType !== 'touch' && !flashTimer) release(); }, { capture: true, passive: true });
}
window.addEventListener('blur', () => { clearTimeout(flashTimer); flashTimer = 0; release(); touch = null; tapped = null; }, { capture: true, passive: true });
