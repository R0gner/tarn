// @ts-check
// tarn · core primitives: statusDot, badge, button, iconButton. Status only via
// 'ok' | 'warn' | 'bad' | 'unknown' | 'pending' | 'info' | 'off'.
import { h, cls } from './dom.js';
import { icon } from './icons.js';
import { tooltip } from './controls.js';
import { t } from './i18n.js';
import { toggleKept } from './inputs-data.js';

/** @import { Child } from './dom.js' */
/** @typedef {'ok' | 'warn' | 'bad' | 'unknown' | 'pending' | 'info' | 'off'} Status The only status names. */
/** @typedef {Status | 'neutral' | 'accent'} Tone Colour meaning of a badge. */
/** @typedef {{ label?: string, title?: string }} StatusDotOptions */
/** @typedef {{ tone?: Tone, count?: boolean }} BadgeOptions */
/** @typedef {{ variant?: 'default' | 'primary' | 'ghost' | 'danger', icon?: string, iconAfter?: string, onClick?: (e: MouseEvent) => void, disabled?: boolean, type?: 'button' | 'submit' | 'reset', title?: string, small?: boolean, className?: string }} ButtonOptions */
/** @typedef {{ label: string, hint?: string, onClick?: (e: MouseEvent) => void, disabled?: boolean, pressed?: boolean | null, className?: string, onToggle?: (pressed: boolean, e: MouseEvent) => (void | boolean | Promise<unknown>), iconPressed?: string }} IconButtonOptions onToggle makes it a toggle that flips its own state (aria-pressed) and icon (iconPressed while pressed) on a click; returning false or a promise that rejects (or resolves to false) puts it back; inside a table row it does not open the row. */


/** Status names in the active language (getters: always current, also after a language switch). */
export const STATUS_TEXT = /** @type {Record<Status, string>} */ (Object.defineProperties({}, Object.fromEntries(['ok', 'warn', 'bad', 'unknown', 'pending', 'info', 'off'].map((k) => [k, { enumerable: true, get: () => t(`status.${k}`) }]))));

/**
 * Traffic-light dot. statusDot('bad') · statusDot('ok', { label: 'running' }) shows text next to it.
 * @param {Status | string} [status]
 * @param {StatusDotOptions} [o]
 * @returns {HTMLElement}
 */
export function statusDot(status = 'unknown', { label, title } = {}) {
  const dot = h('span', { class: `tn-dot tn-s-${status}`, role: label ? null : 'img', 'aria-label': label ? null : (title || STATUS_TEXT[status] || status) });
  return label ? h('span', { class: 'tn-dotlabel' }, dot, h('span', null, label)) : dot;
}

/**
 * Small label. tone: 'neutral' | status | 'accent'; count: true for counters (sidebar).
 * @param {Child} text
 * @param {BadgeOptions} [o]
 * @returns {HTMLElement}
 */
export function badge(text, { tone = 'neutral', count = false } = {}) {
  return h('span', { class: cls('tn-badge', `tn-badge-${tone}`, count && 'tn-badge-count') }, text);
}

/**
 * Button. variant: 'default' | 'primary' | 'ghost' | 'danger'.
 * @param {Child} label
 * @param {ButtonOptions} [o]
 * @returns {HTMLButtonElement}
 */
export function button(label, { variant = 'default', icon: ic, iconAfter, onClick, disabled, type = 'button', title, small, className } = {}) {
  const b = h('button', {
    class: cls('tn-btn', `tn-btn-${variant}`, small && 'tn-btn-sm', !label && 'tn-btn-icononly', className),
    type, disabled: !!disabled, 'aria-label': !label ? (title || null) : null, onclick: onClick || null,
  }, ic && icon(ic), label && h('span', null, label), iconAfter && icon(iconAfter));
  return label ? b : tooltip(b, title); // icon-only button: tooltip (title = name)
}

/**
 * Icon only, square. label is required (aria-label and tooltip; hint = longer tooltip text). pressed: toggle state.
 * @param {string} name
 * @param {IconButtonOptions} o
 * @returns {HTMLButtonElement}
 */
export function iconButton(name, { label, hint, onClick, disabled, pressed, className, onToggle, iconPressed }) {
  /** @param {boolean} on */
  const show = (on) => {
    b.setAttribute('aria-pressed', String(on));
    if (iconPressed) b.replaceChildren(icon(on ? iconPressed : name));
  };
  const toggle = onToggle ? (/** @type {MouseEvent} */ e) => {
    if (b.getAttribute('aria-busy') === 'true') return;   // the last change is still being saved
    const on = b.getAttribute('aria-pressed') !== 'true';
    show(on);
    const kept = toggleKept(onToggle(on, e));
    if (kept === false) { show(!on); return; }
    if (kept !== true) {
      b.setAttribute('aria-busy', 'true');
      kept.then((ok) => { b.removeAttribute('aria-busy'); if (!ok) show(!on); });
    }
  } : null;
  const b = /** @type {HTMLButtonElement} */ (h('button', {
    class: cls('tn-iconbtn', className), type: 'button', 'aria-label': label, disabled: !!disabled,
    'aria-pressed': pressed == null && !onToggle ? null : String(!!pressed), onclick: toggle || onClick || null,
  }, icon(pressed && iconPressed ? iconPressed : name)));
  return tooltip(b, hint || label);
}
