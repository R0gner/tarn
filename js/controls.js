// @ts-check
// dashkit · further controls: segmented, tabs, log, toast, progress, usageBar, tooltip, menu.
import { h, cls, nextId } from './dom.js';
import { icon } from './icons.js';
import { fmtBytes, fmtPct, fmtTime, fmtWhen } from './format.js';
import { overlayHost, showOverlay, hideOverlay, removeOverlay, placeAbove } from './overlay.js';
import { dataCard } from './datacard.js';
import { tipRow } from './charts/base.js';
import { t } from './i18n.js';

/** @typedef {import('./dom.js').Child} Child */
/** @typedef {import('./components.js').Status} Status */
/** @typedef {{ value: any, label?: string, icon?: string, title?: string }} SegmentedOption An option without a label is icon-only and needs a title (aria-label and hint). */
/** @typedef {{ options: SegmentedOption[], value?: any, onChange?: (value: any) => void, label?: string, small?: boolean, className?: string }} SegmentedOptions */
/** @typedef {HTMLElement & { setValue: (value: any) => void, readonly value: any }} SegmentedElement setValue() fires no onChange. */
/** @typedef {{ id: string, label: Child, count?: number | string | null, tone?: Status, render?: () => Child }} TabDef */
/** @typedef {{ tabs: TabDef[], value?: string, onChange?: (id: string) => void, className?: string }} TabsOptions */
/** @typedef {HTMLElement & { setValue: (id: string) => void }} TabsElement */
/** @typedef {{ t?: number | null, level?: 'info' | 'warn' | 'bad' | 'ok' | 'debug', text?: Child, src?: string }} LogEntry t = epoch milliseconds. */
/** @typedef {{ max?: number, wrap?: boolean, newestFirst?: boolean, empty?: string, time?: 'auto' | 'time' }} LogOptions */
/** @typedef {{ tone?: Status, action?: { label: string, onClick?: () => void }, duration?: number }} ToastOptions duration 0 = stays until closed. */
/** @typedef {{ value?: number | null, tone?: Status, label?: string, showValue?: boolean, className?: string }} ProgressOptions value 0..1, null = indeterminate. */
/** @typedef {{ value: number, label: string, color?: string }} UsageSegment */
/** @typedef {{ used: number, total: number, label?: Child, format?: (n: number) => string, warnAt?: number, badAt?: number, sub?: Child, segments?: UsageSegment[] }} UsageBarOptions */
/** @typedef {{ label: string, hint?: string, icon?: string, onClick?: () => void, danger?: boolean, disabled?: boolean, checked?: boolean }} MenuItem */
/** @typedef {{ align?: 'start' | 'end', label?: string }} MenuOptions */


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
      class: 'dk-seg-btn', type: 'button', role: 'radio', 'data-value': String(o.value), 'aria-label': !o.label ? (o.title || String(o.value)) : null,
      onclick: () => set(o.value, true),
    }, o.icon && icon(o.icon), o.label && h('span', null, o.label));
    return o.label ? b : tooltip(b, o.title || String(o.value)); // icon-only button: hint
  });
  const el = /** @type {SegmentedElement} */ (/** @type {HTMLElement} */ (h('div', { class: cls('dk-seg', small && 'dk-seg-sm', className), role: 'radiogroup', 'aria-label': label || null, onkeydown: key }, btns)));
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
  const panel = h('div', { class: 'dk-tabpanel', role: 'tabpanel', id: `${id}-p`, tabindex: '-1' });
  const btns = list.map((t) => h('button', {
    class: 'dk-tab', type: 'button', role: 'tab', id: `${id}-${t.id}`, 'aria-controls': `${id}-p`,
    onclick: () => set(t.id, true),
  }, h('span', null, t.label), t.count != null && h('span', { class: cls('dk-tab-count', t.tone && `dk-t-${t.tone}`) }, t.count)));
  const bar = h('div', { class: 'dk-tabs', role: 'tablist', onkeydown: key }, btns);
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
  const el = /** @type {TabsElement} */ (/** @type {HTMLElement} */ (h('div', { class: cls('dk-tabset', className) }, bar, panel)));
  el.setValue = (v) => set(v, false);
  return el;
}

/**
 * Event list (monospace). log(entries, { max = 200, wrap = false, newestFirst = true, empty })
 * entries: [{ t, level?: 'info'|'warn'|'bad'|'ok'|'debug', text, src? }]
 * @param {LogEntry[]} [entries]
 * @param {LogOptions} [o]
 * @returns {HTMLElement}
 */
export function log(entries = [], { max = 200, wrap = false, newestFirst = true, empty: emptyText, time = 'auto' } = {}) {
  const list = [...entries].sort((x, y) => (newestFirst ? /** @type {number} */ (y.t) - /** @type {number} */ (x.t) : /** @type {number} */ (x.t) - /** @type {number} */ (y.t))).slice(0, max);
  if (!list.length) return h('div', { class: 'dk-log dk-log-empty' }, emptyText ?? t('common.noEntries'));
  const tf = time === 'time' ? fmtTime : fmtWhen;
  return h('div', { class: cls('dk-log', wrap && 'dk-log-wrap'), role: 'log' }, list.map((e) => h('div', { class: cls('dk-log-line', e.level && `dk-log-${e.level}`) },
    h('span', { class: 'dk-log-t' }, e.t != null ? tf(e.t) : ''),
    h('span', { class: 'dk-log-lv' }, LEVEL[e.level] || ''),
    e.src && h('span', { class: 'dk-log-src' }, e.src),
    h('span', { class: 'dk-log-msg' }, e.text))));
}
const LEVEL = { bad: 'ERR', warn: 'WRN', info: 'INF', ok: 'OK', debug: 'DBG' };

/* ---- Toast ---- */
/** @type {HTMLElement | null} */
let toastRegion = null;
/**
 * Short feedback at the bottom (phone: above the safe area). toast('Saved', { tone: 'ok', action: { label, onClick }, duration = 4000 })
 * Returns a close() function. At most 3 at a time. Visible immediately, no animation; sits above open
 * sheets (overlay layer, see overlay.js).
 * @param {Child} text
 * @param {ToastOptions} [o]
 * @returns {() => void}
 */
export function toast(text, { tone = 'info', action, duration = 4000 } = {}) {
  const host = overlayHost();
  if (!toastRegion?.isConnected || toastRegion.parentNode !== host) toastRegion = h('div', { class: 'dk-toasts', role: 'status', 'aria-live': 'polite' });
  const region = /** @type {HTMLElement} */ (toastRegion);
  const ic = /** @type {Record<string, string>} */ ({ ok: 'check', bad: 'alert', warn: 'alert', info: 'info' })[tone] || 'info';
  const close = () => { clearTimeout(timer); el.remove(); };
  const el = h('div', { class: `dk-toast dk-toast-${tone}` }, h('span', { class: `dk-toast-ic dk-t-${tone}` }, icon(ic)), h('span', { class: 'dk-toast-text' }, text),
    action && h('button', { class: 'dk-toast-act', type: 'button', onclick: () => { action.onClick?.(); close(); } }, action.label),
    h('button', { class: 'dk-toast-x', type: 'button', 'aria-label': t('common.close'), onclick: close }, icon('x', { size: 14 })));
  region.append(el);
  showOverlay(region, host);
  while (region.children.length > 3) region.firstElementChild?.remove();
  let timer = duration ? setTimeout(close, duration) : 0;
  el.addEventListener('pointerenter', () => clearTimeout(timer));
  el.addEventListener('pointerleave', () => { if (duration) timer = setTimeout(close, duration / 2); });
  return close;
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
    class: cls('dk-progress', ind && 'is-indeterminate', tone && `dk-tone-${tone}`, className), role: 'progressbar',
    'aria-label': label || null, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': ind ? null : String(Math.round(v * 100)),
  }, h('span', { class: 'dk-progress-fill', style: { transform: `scaleX(${ind ? 0.3 : v})` } }));
  if (!label && !showValue) return bar;
  return h('div', { class: 'dk-progress-wrap' },
    h('div', { class: 'dk-progress-head' }, label && h('span', { class: 'dk-ellipsis' }, label), showValue && !ind && h('span', { class: 'dk-num' }, fmtPct(v, 0))), bar);
}

/**
 * Usage bar with thresholds. usageBar({ used, total, label, format = fmtBytes, warnAt = .8, badAt = .9, sub? })
 * Tone follows from the thresholds; text on the right “412 GB of 1 TB · 40 %”.
 * @param {UsageBarOptions} o
 * @returns {HTMLElement}
 */
export function usageBar({ used, total, label, format = fmtBytes, warnAt = 0.8, badAt = 0.9, sub, segments }) {
  const r = total ? used / total : 0;
  const tone = r >= badAt ? 'bad' : r >= warnAt ? 'warn' : 'ok';
  const fill = segments
    ? h('div', { class: 'dk-progress dk-usage-multi' }, segments.map((sg, i) => dataCard(
      h('span', { class: `dk-usage-seg dk-c-${sg.color || ['blue', 'purple', 'orange', 'green', 'pink'][i % 5]}`, style: { width: `${Math.max(0, (sg.value / total) * 100).toFixed(2)}%` } }),
      () => tipRow(sg.color || ['blue', 'purple', 'orange', 'green', 'pink'][i % 5], sg.label, format(sg.value), i))))
    : progress({ value: r, tone });
  return h('div', { class: 'dk-usage' },
    h('div', { class: 'dk-progress-head' },
      h('span', { class: 'dk-usage-label dk-ellipsis' }, label),
      h('span', { class: 'dk-usage-val dk-num' }, t('usage.of', { used: format(used), total: format(total) }), h('span', { class: cls('dk-usage-pct', tone !== 'ok' && `dk-t-${tone}`) }, ` · ${fmtPct(r, 0)}`))),
    fill, sub && h('div', { class: 'dk-usage-sub' }, sub));
}

/* ---- Hint (tooltip) ----
 * Two kinds of things appear on hover: the data card (datacard.js: content you can only see this way) and this
 * hint for text and controls: smaller, delayed, only on icon-only buttons (tooltip()) and
 * on truncated text (.dk-ellipsis with scrollWidth > clientWidth, automatic). Fully visible text
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
  if (!tipEl) tipEl = h('div', { class: 'dk-tooltip', role: 'tooltip', hidden: true });
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

/* Truncated text (.dk-ellipsis): hint with the full text, only if something is really missing. */
/** @param {HTMLElement} el */
const clipped = (el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1; // .dk-clamp: truncated across multiple lines
/** @param {EventTarget | null} t @returns {HTMLElement | null} */
const ellipsisOf = (t) => (t instanceof Element ? t.closest('.dk-ellipsis, .dk-clamp') : null);
document.addEventListener('pointerover', (e) => {
  if (e.pointerType !== 'mouse') return;
  const el = ellipsisOf(e.target);
  if (!el || el.closest('[data-tip], [data-dk-card]')) return;
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
  if (!el || el.closest('[data-tip], [data-dk-card]')) return;
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => { if (clipped(el)) showTooltip(el, el.textContent.trim()); }, TIP_TOUCH_DELAY);
}, { capture: true, passive: true });
for (const type of ['pointerup', 'pointercancel']) {
  document.addEventListener(type, (e) => { if (/** @type {PointerEvent} */ (e).pointerType !== 'mouse') touchRelease(ellipsisOf(e.target)); }, { capture: true, passive: true });
}

/* ---- Menu ---- */
/**
 * Dropdown menu on a button. menu(anchor, items, { align = 'end' })
 * items: [{ label, icon?, onClick, danger?, disabled?, checked? } | '-' (separator)]
 * Opens on click on anchor (visible immediately, focus in the menu); arrow keys, Esc (closes the menu first),
 * a click outside and a real width change close it – not the address bar sliding in/out (only the height changes).
 * Sits above open sheets (overlay layer). Returns anchor.
 * @template {HTMLElement} T
 * @param {T} anchor
 * @param {Array<MenuItem | '-'> | (() => Array<MenuItem | '-'>)} items
 * @param {MenuOptions} [o]
 * @returns {T}
 */
export function menu(anchor, items, { align = 'end', label } = {}) {
  const mid = nextId('menu');
  anchor.setAttribute('aria-haspopup', 'menu');
  anchor.setAttribute('aria-expanded', 'false');
  anchor.setAttribute('aria-controls', mid);
  /** @type {HTMLElement | null} */
  let el = null;
  let width0 = 0;
  /** @param {boolean} [refocus] */
  const close = (refocus) => {
    if (!el) return;
    removeOverlay(el); el = null; anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', esc, true);
    window.removeEventListener('resize', onResize);
    if (refocus && anchor.isConnected) anchor.focus();
  };
  const onResize = () => { if (Math.abs(document.documentElement.clientWidth - width0) >= 1) close(false); };
  /** @param {Event} e */
  const outside = (e) => { if (!anchor.isConnected || (el && !el.contains(/** @type {Node} */ (e.target)) && !anchor.contains(/** @type {Node} */ (e.target)))) close(false); };
  /** @param {KeyboardEvent} e */
  const esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); } };
  function open() {
    hideTooltip();
    const its = (typeof items === 'function' ? items() : items);
    const btns = [];
    el = h('div', { class: 'dk-menu', role: 'menu', id: mid, 'aria-label': label || null, onkeydown: key },
      its.map((it) => {
        if (it === '-') return h('div', { class: 'dk-menu-sep', role: 'separator' });
        const b = h('button', {
          class: cls('dk-menu-item', it.danger && 'is-danger'), type: 'button', role: it.checked != null ? 'menuitemcheckbox' : 'menuitem',
          'aria-checked': it.checked != null ? String(!!it.checked) : null, disabled: !!it.disabled,
          onclick: () => { close(true); it.onClick?.(); },
        }, h('span', { class: 'dk-menu-ic' }, it.checked ? icon('check') : it.icon ? icon(it.icon) : null), h('span', { class: 'dk-ellipsis' }, it.label), it.hint && h('span', { class: 'dk-menu-hint' }, it.hint));
        if (!it.disabled) btns.push(b);
        return b;
      }));
    showOverlay(el);
    const r = anchor.getBoundingClientRect(), vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const mw = el.offsetWidth, mh = el.offsetHeight;
    let x = align === 'end' ? r.right - mw : r.left;
    x = Math.max(4, Math.min(vw - mw - 4, x));
    let y = r.bottom + 4;
    if (y + mh > vh - 4 && r.top - mh - 4 > 4) y = r.top - mh - 4;
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    anchor.setAttribute('aria-expanded', 'true');
    width0 = vw;
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', esc, true);
    window.addEventListener('resize', onResize);
    (btns.find((b) => b.getAttribute('aria-checked') === 'true') || btns[0])?.focus({ preventScroll: true });
    function key(e) {
      if (e.key === 'Tab') { close(false); return; }
      const d = { ArrowDown: 1, ArrowUp: -1 }[e.key];
      if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); btns[e.key === 'Home' ? 0 : btns.length - 1]?.focus(); return; }
      if (!d) return;
      e.preventDefault();
      const i = btns.indexOf(document.activeElement);
      btns[(i + d + btns.length) % btns.length]?.focus();
    }
  }
  anchor.addEventListener('click', () => (el ? close(false) : open()));
  anchor.addEventListener('keydown', (e) => { if ((e.key === 'ArrowDown') && !el) { e.preventDefault(); open(); } });
  return anchor;
}
