// @ts-check
// tarn · core controls: segmented, tabs, progress, tooltip (hint on icon-only buttons and truncated text).
import { h, cls, nextId } from './dom.js';
import { icon } from './icons.js';
import { fmtPct } from './format.js';
import { showOverlay, hideOverlay, placeAbove } from './overlay.js';

/** @typedef {import('./dom.js').Child} Child */
/** @typedef {import('./primitives.js').Status} Status */
/** @typedef {{ value: any, label?: string, icon?: string, title?: string }} SegmentedOption An option without a label is icon-only and needs a title (aria-label and hint). */
/** @typedef {{ options: SegmentedOption[], value?: any, onChange?: (value: any) => void, label?: string, small?: boolean, className?: string }} SegmentedOptions */
/** @typedef {HTMLElement & { setValue: (value: any) => void, readonly value: any }} SegmentedElement setValue() fires no onChange. */
/** @typedef {{ id: string, label: Child, count?: number | string | null, tone?: Status, render?: () => Child }} TabDef */
/** @typedef {{ tabs: TabDef[], value?: string, onChange?: (id: string) => void, className?: string }} TabsOptions */
/** @typedef {HTMLElement & { setValue: (id: string) => void }} TabsElement */
/** @typedef {{ value?: number | null, tone?: Status, label?: string, showValue?: boolean, className?: string }} ProgressOptions value 0..1, null = indeterminate. */


/**
 * Segmented switch (2–5 short options, e.g. 24 h | 7 days).
 * segmented({ options: [{ value, label, icon? }], value, onChange(value), label, small })
 * Keyboard: arrow keys switch (radio group).
 * @param {SegmentedOptions} o
 * @returns {SegmentedElement}
 */
export function segmented({ options, value, onChange, label, small, className }) {
  let cur = value ?? options[0]?.value;
  const btns = options.map((o) => {
    const b = h('button', {
      class: 'tn-seg-btn', type: 'button', role: 'radio', 'data-value': String(o.value), 'aria-label': !o.label ? (o.title || String(o.value)) : null,
      onclick: () => set(o.value, true),
    }, o.icon && icon(o.icon), o.label && h('span', null, o.label));
    return o.label ? b : tooltip(b, o.title || String(o.value)); // icon-only button: hint
  });
  const el = /** @type {SegmentedElement} */ (/** @type {HTMLElement} */ (h('div', { class: cls('tn-seg', small && 'tn-seg-sm', className), role: 'radiogroup', 'aria-label': label || null, onkeydown: key }, btns)));
  function sync() {
    btns.forEach((b, i) => { const on = options[i].value === cur; b.setAttribute('aria-checked', String(on)); b.tabIndex = on ? 0 : -1; });
  }
  /** @param {any} v @param {boolean} [fire] */
  function set(v, fire) { if (v === cur) return; cur = v; sync(); if (fire) onChange?.(v); }
  function key(e) {
    const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const i = (options.findIndex((o) => o.value === cur) + d + options.length) % options.length;
    set(options[i].value, true); btns[i].focus();
  }
  sync();
  el.setValue = (v) => set(v, false);
  Object.defineProperty(el, 'value', { get: () => cur });
  return el;
}

/**
 * Tabs with content. tabs({ tabs: [{ id, label, count?, tone?, render() → Node }], value, onChange(id) })
 * Content is re-rendered on switch (keep render cheap). Scrolls horizontally on phones.
 * @param {TabsOptions} o
 * @returns {TabsElement}
 */
export function tabs({ tabs: list, value, onChange, className }) {
  let cur = value ?? list[0]?.id;
  const id = nextId('tabs');
  const panel = h('div', { class: 'tn-tabpanel', role: 'tabpanel', id: `${id}-p`, tabindex: '-1' });
  const btns = list.map((t) => h('button', {
    class: 'tn-tab', type: 'button', role: 'tab', id: `${id}-${t.id}`, 'aria-controls': `${id}-p`,
    onclick: () => set(t.id, true),
  }, h('span', null, t.label), t.count != null && h('span', { class: cls('tn-tab-count', t.tone && `tn-t-${t.tone}`) }, t.count)));
  const bar = h('div', { class: 'tn-tabs', role: 'tablist', onkeydown: key }, btns);
  function sync() {
    list.forEach((t, i) => { const on = t.id === cur; btns[i].setAttribute('aria-selected', String(on)); btns[i].tabIndex = on ? 0 : -1; });
    const t = list.find((x) => x.id === cur);
    panel.setAttribute('aria-labelledby', `${id}-${cur}`);
    panel.replaceChildren(...[t?.render?.()].flat().filter(Boolean));
  }
  /** @param {any} v @param {boolean} [fire] */
  function set(v, fire) { if (v === cur) return; cur = v; sync(); if (fire) onChange?.(v); }
  function key(e) {
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const i = (list.findIndex((t) => t.id === cur) + d + list.length) % list.length;
    set(list[i].id, true); btns[i].focus();
  }
  sync();
  const el = /** @type {TabsElement} */ (/** @type {HTMLElement} */ (h('div', { class: cls('tn-tabset', className) }, bar, panel)));
  el.setValue = (v) => set(v, false);
  return el;
}

/**
 * Progress. progress({ value: 0..1 | null (indeterminate), tone?, label?, showValue? })
 * @param {ProgressOptions} [o]
 * @returns {HTMLElement}
 */
export function progress({ value, tone, label, showValue = false, className } = {}) {
  const ind = value == null;
  const v = ind ? 0 : Math.max(0, Math.min(1, value));
  const bar = h('div', {
    class: cls('tn-progress', ind && 'is-indeterminate', tone && `tn-tone-${tone}`, className), role: 'progressbar',
    'aria-label': label || null, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': ind ? null : String(Math.round(v * 100)),
  }, h('span', { class: 'tn-progress-fill', style: { transform: `scaleX(${ind ? 0.3 : v})` } }));
  if (!label && !showValue) return bar;
  return h('div', { class: 'tn-progress-wrap' },
    h('div', { class: 'tn-progress-head' }, label && h('span', { class: 'tn-ellipsis' }, label), showValue && !ind && h('span', { class: 'tn-num' }, fmtPct(v, 0))), bar);
}

/* ---- Hint (tooltip) ----
 * Two kinds of things appear on hover: the data card (datacard.js: content you can only see this way) and this
 * hint for text and controls: smaller, delayed, only on icon-only buttons (tooltip()) and
 * on truncated text (.tn-ellipsis with scrollWidth > clientWidth, automatic). Fully visible text
 * gets no hint. No native title attributes in the kit.
 */
const TIP_MOUSE_DELAY = 350, TIP_FOCUS_DELAY = 150, TIP_TOUCH_DELAY = 500; // delays (behavior, not animation)
const TIP_TOUCH_HOLD = 1500;     // touch: stays visible this long after release; a tap elsewhere or scrolling closes it immediately
/** @type {HTMLElement | null} */ let tipEl = null;
/** @type {HTMLElement | null} */ let tipFor = null;
/** @type {HTMLElement | null} */ let tipSuppress = null;
let tipTimer = 0, tipHold = 0;

/**
 * Small hint for mouse/keyboard (hover 350 ms, focus 150 ms) and touch (long press 500 ms, stays afterwards).
 * tooltip(element, 'text') → element. Only for icon-only buttons; aria-label stays the name.
 * @template {HTMLElement} T
 * @param {T} target
 * @param {string | null | undefined} text
 * @returns {T}
 */
export function tooltip(target, text) {
  if (!text) return target;
  target.dataset.tip = text;
  if (!target.getAttribute('aria-label') && !target.textContent.trim()) target.setAttribute('aria-label', text);
  target.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') schedule(target, TIP_MOUSE_DELAY); });
  target.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hideTooltip(); });
  target.addEventListener('focus', () => { if (target.matches(':focus-visible')) schedule(target, TIP_FOCUS_DELAY); });
  target.addEventListener('blur', hideTooltip);
  target.addEventListener('pointerdown', (e) => { hideTooltip(); if (e.pointerType !== 'mouse') schedule(target, TIP_TOUCH_DELAY); });
  target.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') touchRelease(target); });
  target.addEventListener('pointercancel', (e) => { if (e.pointerType !== 'mouse') touchRelease(target); });
  return target;
}
/** @param {HTMLElement} target @param {number} ms @param {string} [text] */
function schedule(target, ms, text) { clearTimeout(tipTimer); tipTimer = setTimeout(() => showTooltip(target, text), ms); }
/** @param {HTMLElement | null} target */
function touchRelease(target) {
  if (!target) return;
  clearTimeout(tipTimer);
  if (tipFor === target && tipEl && !tipEl.hidden) {            // long press showed the hint: leave it, do not trigger the click afterwards
    tipSuppress = target;
    clearTimeout(tipHold); tipHold = setTimeout(hideTooltip, TIP_TOUCH_HOLD);
  }
}
/** @param {HTMLElement} target @param {string} [text] */
function showTooltip(target, text) {
  if (!target.isConnected) return;
  const t = text ?? target.dataset.tip;
  if (!t) return;
  if (!tipEl) tipEl = h('div', { class: 'tn-tooltip', role: 'tooltip', hidden: true });
  tipFor = target;
  tipEl.textContent = t;
  showOverlay(tipEl);
  placeAbove(tipEl, target.getBoundingClientRect());
}
export function hideTooltip() { clearTimeout(tipTimer); clearTimeout(tipHold); if (tipEl) hideOverlay(tipEl); tipFor = null; }
window.addEventListener('scroll', () => { if (tipFor) hideTooltip(); }, { capture: true, passive: true });
document.addEventListener('pointerdown', (e) => {          // a tap elsewhere closes it
  tipSuppress = null;
  if (tipFor && !(e.target instanceof Node && tipFor.contains(e.target))) hideTooltip();
}, { capture: true, passive: true });
document.addEventListener('click', (e) => {                // do not trigger the click after a long-press hint
  if (tipSuppress && e.target instanceof Node && tipSuppress.contains(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); }
  tipSuppress = null;
}, true);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && tipFor) hideTooltip(); }, true);

/* Truncated text (.tn-ellipsis): hint with the full text, only if something is really missing. */
/** @param {HTMLElement} el */
const clipped = (el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1; // .tn-clamp: truncated across multiple lines
/** @param {EventTarget | null} t @returns {HTMLElement | null} */
const ellipsisOf = (t) => (t instanceof Element ? t.closest('.tn-ellipsis, .tn-clamp') : null);
document.addEventListener('pointerover', (e) => {
  if (e.pointerType !== 'mouse') return;
  const el = ellipsisOf(e.target);
  if (!el || el.closest('[data-tip], [data-tn-card]')) return;
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => { if (clipped(el)) showTooltip(el, el.textContent.trim()); }, TIP_MOUSE_DELAY);
});
document.addEventListener('pointerout', (e) => {
  if (e.pointerType !== 'mouse') return;
  const el = ellipsisOf(e.target);
  if (el && !(e.relatedTarget instanceof Node && el.contains(e.relatedTarget))) hideTooltip();
});
document.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') return;
  const el = ellipsisOf(e.target);
  if (!el || el.closest('[data-tip], [data-tn-card]')) return;
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => { if (clipped(el)) showTooltip(el, el.textContent.trim()); }, TIP_TOUCH_DELAY);
}, { capture: true, passive: true });
for (const type of ['pointerup', 'pointercancel']) {
  document.addEventListener(type, (e) => { if (/** @type {PointerEvent} */ (e).pointerType !== 'mouse') touchRelease(ellipsisOf(e.target)); }, { capture: true, passive: true });
}

