// @ts-check
// tarn · Press feedback immediately, on touch too.
// Chrome only sets :active on touch with a delay (or on release). This file marks the pressed
// control with .is-down on pointerdown; the CSS treats :active and .is-down the same.
const PRESSABLE = '.tn-btn, .tn-iconbtn, .tn-row-btn, .tn-stat-btn, .tn-seg-btn, .tn-tab, .tn-pill, .tn-chip, .tn-nav-item, .tn-th-btn, .tn-fresh, .tn-menu-item, .tn-toast-act, .tn-toast-x, .tn-tl-name, tr[tabindex]';
/** @type {Element | null} */
let down = null;

function release() {
  if (down) { down.classList.remove('is-down'); down = null; }
}
document.addEventListener('pointerdown', (e) => {
  release();
  const el = e.target instanceof Element ? /** @type {HTMLElement | null} */ (e.target.closest(PRESSABLE)) : null;
  if (!el || /** @type {HTMLButtonElement} */ (el).disabled) return;
  down = el;
  el.classList.add('is-down');
}, { capture: true, passive: true });
for (const type of ['pointerup', 'pointercancel', 'dragstart', 'blur']) {
  (type === 'blur' ? window : document).addEventListener(type, release, { capture: true, passive: true });
}
