// @ts-check
// tarn · shell widgets: log, toast, usageBar, menu (overlay-based or data-driven parts that boards use; the core controls are in controls.js).
import './locales/shell.js';   // shell texts
import { h, cls, nextId } from './dom.js';
import { icon } from './icons.js';
import { fmtBytes, fmtPct, fmtTime, fmtWhen } from './format.js';
import { overlayHost, showOverlay, removeOverlay, placeOverlay } from './overlay.js';
import { dataCard } from './datacard.js';
import { tipRow } from './charts/base.js';
import { progress, hideTooltip } from './controls.js';
import { t } from './i18n.js';

/** @typedef {import('./dom.js').Child} Child */
/** @typedef {import('./primitives.js').Status} Status */
/** @typedef {{ t?: number | null, level?: 'info' | 'warn' | 'bad' | 'ok' | 'debug', text?: Child, src?: string }} LogEntry t = epoch milliseconds. */
/** @typedef {{ max?: number, wrap?: boolean, newestFirst?: boolean, empty?: string, time?: 'auto' | 'time' }} LogOptions */
/** @typedef {{ tone?: Status, action?: { label: string, onClick?: () => void }, duration?: number }} ToastOptions duration 0 = stays until closed. */
/** @typedef {{ value: number, label: string, color?: string }} UsageSegment */
/** @typedef {{ used: number, total: number, label?: Child, format?: (n: number) => string, warnAt?: number, badAt?: number, sub?: Child, segments?: UsageSegment[] }} UsageBarOptions */
/** @typedef {{ label: string, hint?: string, icon?: string, onClick?: () => void, danger?: boolean, disabled?: boolean, checked?: boolean }} MenuItem */
/** @typedef {{ align?: 'start' | 'end', label?: string }} MenuOptions */

/**
 * Event list (monospace). log(entries, { max = 200, wrap = false, newestFirst = true, empty })
 * entries: [{ t, level?: 'info'|'warn'|'bad'|'ok'|'debug', text, src? }]
 * @param {LogEntry[]} [entries]
 * @param {LogOptions} [o]
 * @returns {HTMLElement}
 */
export function log(entries = [], { max = 200, wrap = false, newestFirst = true, empty: emptyText, time = 'auto' } = {}) {
  const list = [...entries].sort((x, y) => (newestFirst ? /** @type {number} */ (y.t) - /** @type {number} */ (x.t) : /** @type {number} */ (x.t) - /** @type {number} */ (y.t))).slice(0, max);
  if (!list.length) return h('div', { class: 'tn-log tn-log-empty' }, emptyText ?? t('common.noEntries'));
  const tf = time === 'time' ? fmtTime : fmtWhen;
  return h('div', { class: cls('tn-log', wrap && 'tn-log-wrap'), role: 'log' }, list.map((e) => h('div', { class: cls('tn-log-line', e.level && `tn-log-${e.level}`) },
    h('span', { class: 'tn-log-t' }, e.t != null ? tf(e.t) : ''),
    h('span', { class: 'tn-log-lv' }, LEVEL[e.level] || ''),
    e.src && h('span', { class: 'tn-log-src' }, e.src),
    h('span', { class: 'tn-log-msg' }, e.text))));
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
  if (!toastRegion?.isConnected || toastRegion.parentNode !== host) toastRegion = h('div', { class: 'tn-toasts', role: 'status', 'aria-live': 'polite' });
  const region = /** @type {HTMLElement} */ (toastRegion);
  const ic = /** @type {Record<string, string>} */ ({ ok: 'check', bad: 'alert', warn: 'alert', info: 'info' })[tone] || 'info';
  const close = () => { clearTimeout(timer); el.remove(); };
  const el = h('div', { class: `tn-toast tn-toast-${tone}` }, h('span', { class: `tn-toast-ic tn-t-${tone}` }, icon(ic)), h('span', { class: 'tn-toast-text' }, text),
    action && h('button', { class: 'tn-toast-act', type: 'button', onclick: () => { action.onClick?.(); close(); } }, action.label),
    h('button', { class: 'tn-toast-x', type: 'button', 'aria-label': t('common.close'), onclick: close }, icon('x', { size: 14 })));
  region.append(el);
  showOverlay(region, host);
  while (region.children.length > 3) region.firstElementChild?.remove();
  let timer = duration ? setTimeout(close, duration) : 0;
  el.addEventListener('pointerenter', () => clearTimeout(timer));
  el.addEventListener('pointerleave', () => { if (duration) timer = setTimeout(close, duration / 2); });
  return close;
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
    ? h('div', { class: 'tn-progress tn-usage-multi' }, segments.map((sg, i) => dataCard(
      h('span', { class: `tn-usage-seg tn-c-${sg.color || ['blue', 'purple', 'orange', 'green', 'pink'][i % 5]}`, style: { width: `${Math.max(0, (sg.value / total) * 100).toFixed(2)}%` } }),
      () => tipRow(sg.color || ['blue', 'purple', 'orange', 'green', 'pink'][i % 5], sg.label, format(sg.value), i))))
    : progress({ value: r, tone });
  return h('div', { class: 'tn-usage' },
    h('div', { class: 'tn-progress-head' },
      h('span', { class: 'tn-usage-label tn-ellipsis' }, label),
      h('span', { class: 'tn-usage-val tn-num' }, t('usage.of', { used: format(used), total: format(total) }), h('span', { class: cls('tn-usage-pct', tone !== 'ok' && `tn-t-${tone}`) }, ` · ${fmtPct(r, 0)}`))),
    fill, sub && h('div', { class: 'tn-usage-sub' }, sub));
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
    el = h('div', { class: 'tn-menu', role: 'menu', id: mid, 'aria-label': label || null, onkeydown: key },
      its.map((it) => {
        if (it === '-') return h('div', { class: 'tn-menu-sep', role: 'separator' });
        const b = h('button', {
          class: cls('tn-menu-item', it.danger && 'is-danger'), type: 'button', role: it.checked != null ? 'menuitemcheckbox' : 'menuitem',
          'aria-checked': it.checked != null ? String(!!it.checked) : null, disabled: !!it.disabled,
          onclick: () => { close(true); it.onClick?.(); },
        }, h('span', { class: 'tn-menu-ic' }, it.checked ? icon('check') : it.icon ? icon(it.icon) : null), h('span', { class: 'tn-ellipsis' }, it.label), it.hint && h('span', { class: 'tn-menu-hint' }, it.hint));
        if (!it.disabled) btns.push(b);
        return b;
      }));
    showOverlay(el);
    placeOverlay(el, anchor.getBoundingClientRect(), { align });
    anchor.setAttribute('aria-expanded', 'true');
    width0 = document.documentElement.clientWidth;
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
