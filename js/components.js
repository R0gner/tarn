// @ts-check
// tarn · core components. Every function returns a DOM element. Status only via
// 'ok' | 'warn' | 'bad' | 'unknown' | 'pending' | 'info' | 'off'.
import { h, cls } from './dom.js';
import { icon } from './icons.js';
import { tooltip } from './controls.js';
import { t } from './i18n.js';

/** @typedef {import('./dom.js').Child} Child */
/** @typedef {'ok' | 'warn' | 'bad' | 'unknown' | 'pending' | 'info' | 'off'} Status The only status names. */
/** @typedef {Status | 'neutral' | 'accent'} Tone Colour meaning of a badge. */
/** @typedef {{ label?: string, title?: string }} StatusDotOptions */
/** @typedef {{ tone?: Tone, count?: boolean }} BadgeOptions */
/** @typedef {{ variant?: 'default' | 'primary' | 'ghost' | 'danger', icon?: string, iconAfter?: string, onClick?: (e: MouseEvent) => void, disabled?: boolean, type?: 'button' | 'submit' | 'reset', title?: string, small?: boolean, className?: string }} ButtonOptions */
/** @typedef {{ label: string, hint?: string, onClick?: (e: MouseEvent) => void, disabled?: boolean, pressed?: boolean | null, className?: string }} IconButtonOptions */
/** @typedef {{ title?: Child, sub?: Child, actions?: Child, flush?: boolean, className?: string }} CardOptions */
/** @typedef {{ count?: number | string | null, actions?: Child, className?: string }} SectionOptions */
/** @typedef {{ label?: Child, value?: Child, unit?: Child, sub?: Child, status?: Status, onClick?: (e: MouseEvent) => void, className?: string }} StatTileOptions */
/** @typedef {{ title?: Child, sub?: Child, value?: Child, valueSub?: Child, status?: Status, onClick?: (e: MouseEvent) => void, chevron?: boolean, mono?: boolean, label?: string, selected?: boolean, key?: string | number, className?: string }} MetricRowOptions */
/** @typedef {{ empty?: string, zebra?: boolean }} ListOptions */
/** @typedef {{ mono?: boolean }} KvOptions */
/** @typedef {[Child, Child, string?]} KvPair [key, value, optional class for the value] */
/** @typedef {{ tone?: Status, action?: Child }} BannerOptions */
/** @typedef {{ title?: Child, text?: Child, action?: Child, compact?: boolean, icon?: string }} EmptyOptions */
/** @typedef {{ title?: Child, text?: Child, onRetry?: (e: MouseEvent) => void, compact?: boolean }} ErrorStateOptions */
/** @typedef {{ rows?: number, tiles?: number, label?: string }} LoadingOptions */


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
export function iconButton(name, { label, hint, onClick, disabled, pressed, className }) {
  return tooltip(h('button', {
    class: cls('tn-iconbtn', className), type: 'button', 'aria-label': label, disabled: !!disabled,
    'aria-pressed': pressed == null ? null : String(!!pressed), onclick: onClick || null,
  }, icon(name)), hint || label);
}

/**
 * Card – the only container with a hairline border. card({ title, sub, actions, flush }, ...content)
 * @param {CardOptions | undefined} o
 * @param {...Child} kids
 * @returns {HTMLElement}
 */
export function card({ title, sub, actions, flush, className } = {}, ...kids) {
  const head = title || actions ? h('header', { class: 'tn-card-head' },
    h('div', { class: 'tn-card-heading' }, title && h('h3', { class: 'tn-card-title' }, title), sub && h('div', { class: 'tn-card-sub' }, sub)),
    actions && h('div', { class: 'tn-card-actions' }, actions)) : null;
  return h('section', { class: cls('tn-card', flush && 'tn-card-flush', className) }, head, h('div', { class: 'tn-card-body' }, kids));
}

/**
 * Section with a small heading (11.5/600), optional counter and actions.
 * @param {Child} title
 * @param {SectionOptions | undefined} o
 * @param {...Child} kids
 * @returns {HTMLElement}
 */
export function section(title, { count, actions, className } = {}, ...kids) {
  return h('section', { class: cls('tn-section', className) },
    h('header', { class: 'tn-section-head' },
      h('h2', { class: 'tn-section-title' }, title, count != null && h('span', { class: 'tn-section-count' }, count)),
      actions && h('div', { class: 'tn-section-actions' }, actions)),
    kids);
}

/**
 * Metric tile. With onClick it is a button (whole surface).
 * @param {StatTileOptions} [o]
 * @returns {HTMLElement}
 */
export function statTile({ label, value, unit, sub, status, onClick, className } = {}) {
  const inner = [
    h('div', { class: 'tn-stat-label' }, status && statusDot(status), h('span', { class: 'tn-ellipsis' }, label)),
    h('div', { class: 'tn-stat-value tn-num' }, value ?? '–', unit && h('span', { class: 'tn-stat-unit' }, unit)),
    sub && h('div', { class: cls('tn-stat-sub', status && status !== 'ok' && `tn-t-${status}`) }, sub),
  ];
  return onClick
    ? h('button', { class: cls('tn-stat tn-stat-btn', className), type: 'button', onclick: onClick }, inner, h('span', { class: 'tn-go', 'aria-hidden': 'true' }, icon('chevron-right')))
    : h('div', { class: cls('tn-stat', className) }, inner);
}

/**
 * Row – whole surface tappable (button), title/subtitle left, value right, status dot, chevron.
 * metricRow({ title, sub, value, valueSub, status, onClick, chevron = !!onClick, mono })
 * @param {MetricRowOptions} [o]
 * @returns {HTMLElement}
 */
export function metricRow({ title, sub, value, valueSub, status, onClick, chevron, mono, label, selected, key, className } = {}) {
  const tag = onClick ? 'button' : 'div';
  return h(tag, {
    class: cls('tn-row', onClick && 'tn-row-btn', selected && 'is-selected', className), type: onClick ? 'button' : null, 'data-key': key ?? null,
    onclick: onClick || null, 'aria-label': label || null, 'aria-current': selected ? 'true' : null,
  },
  status && h('span', { class: 'tn-row-status' }, statusDot(status)),
  h('span', { class: 'tn-row-main' },
    h('span', { class: cls('tn-row-title tn-ellipsis', mono && 'tn-mono') }, title),
    sub && h('span', { class: 'tn-row-sub tn-ellipsis' }, sub)),
  value != null && h('span', { class: 'tn-row-value' },
    h('span', { class: 'tn-num' }, value), valueSub && h('span', { class: 'tn-row-sub' }, valueSub)),
  (chevron ?? !!onClick) && h('span', { class: 'tn-go', 'aria-hidden': 'true' }, icon('chevron-right')));
}

/**
 * List of rows in a card without padding. items → render(item) (usually metricRow).
 * @template T
 * @param {T[] | null | undefined} items
 * @param {(item: T, index: number) => HTMLElement} render
 * @param {ListOptions} [o]
 * @returns {HTMLElement}
 */
export function list(items, render, { empty: emptyText, zebra = false } = {}) {
  if (!items?.length) return empty({ title: emptyText ?? t('common.noEntries'), compact: true });
  return h('div', { class: cls('tn-list', zebra && 'tn-zebra'), role: 'list' }, items.map((it, i) => {
    const el = render(it, i);
    el.setAttribute('role', el.tagName === 'BUTTON' ? 'button' : 'listitem');
    return el;
  }));
}

/**
 * Facts: kv([['Host', 'nas'], ['Uptime', '3 d', 'tn-t-warn'], null]) – empty values are dropped.
 * @param {Array<KvPair | null | undefined | false>} pairs
 * @param {KvOptions} [o]
 * @returns {HTMLElement | null}
 */
export function kv(pairs, { mono = false } = {}) {
  const dl = h('dl', { class: cls('tn-kv', mono && 'tn-kv-mono') });
  for (const p of pairs || []) {
    if (!p) continue;
    const [k, v, ddCls] = p;
    if (v == null || v === '' || v === false) continue;
    dl.append(h('dt', null, k), h('dd', { class: ddCls || null }, v));
  }
  return dl.childNodes.length ? dl : null;
}

/**
 * Facts block with a small heading (for details). Empty blocks → null.
 * @param {Child} title
 * @param {...Child} kids
 * @returns {HTMLElement | null}
 */
export function facts(title, ...kids) {
  const body = kids.flat().filter(Boolean);
  return body.length ? h('section', { class: 'tn-facts' }, title && h('h3', { class: 'tn-facts-title' }, title), body) : null;
}

/**
 * Notice bar. tone: status.
 * @param {Child} text
 * @param {BannerOptions} [o]
 * @returns {HTMLElement}
 */
export function banner(text, { tone = 'info', action } = {}) {
  const ic = tone === 'bad' || tone === 'warn' ? 'alert' : 'info';
  return h('div', { class: `tn-banner tn-banner-${tone}`, role: tone === 'bad' ? 'alert' : 'status' },
    icon(ic), h('div', { class: 'tn-banner-text' }, text), action);
}

/**
 * Empty state.
 * @param {EmptyOptions} [o]
 * @returns {HTMLElement}
 */
export function empty({ title = t('common.noEntries'), text, action, compact, icon: ic } = {}) {
  return h('div', { class: cls('tn-empty', compact && 'tn-empty-compact') },
    ic && h('span', { class: 'tn-empty-icon' }, icon(ic)),
    h('div', { class: 'tn-empty-title' }, title), text && h('div', { class: 'tn-empty-text' }, text), action);
}

/**
 * Error state with optional "Retry".
 * @param {ErrorStateOptions} [o]
 * @returns {HTMLElement}
 */
export function errorState({ title = t('common.loadFailed'), text, onRetry, compact } = {}) {
  return h('div', { class: cls('tn-empty tn-error', compact && 'tn-empty-compact'), role: 'alert' },
    h('span', { class: 'tn-empty-icon' }, icon('alert')),
    h('div', { class: 'tn-empty-title' }, title), text && h('div', { class: 'tn-empty-text tn-mono' }, text),
    onRetry && button(t('common.retry'), { icon: 'refresh', onClick: onRetry, small: true }));
}
export { errorState as error };

/**
 * Skeleton: loading({ rows: 4 }) rows, loading({ tiles: 4 }) tiles.
 * @param {LoadingOptions} [o]
 * @returns {HTMLElement}
 */
export function loading({ rows = 3, tiles = 0, label = t('common.loading') } = {}) {
  if (tiles) return h('div', { class: 'tn-tiles', 'aria-busy': 'true', 'aria-label': label },
    Array.from({ length: tiles }, () => h('div', { class: 'tn-stat tn-skel-tile' }, h('span', { class: 'tn-skel tn-skel-s' }), h('span', { class: 'tn-skel tn-skel-l' }))));
  return h('div', { class: 'tn-skel-rows', 'aria-busy': 'true', 'aria-label': label },
    Array.from({ length: rows }, (_, i) => h('div', { class: 'tn-skel-row' },
      h('span', { class: 'tn-skel tn-skel-dot' }), h('span', { class: 'tn-skel', style: { width: `${[62, 48, 70, 55, 40][i % 5]}%` } }), h('span', { class: 'tn-skel tn-skel-v' }))));
}

/**
 * Tile grid (auto-fill, min. 150 px).
 * @param {...Child} kids
 * @returns {HTMLElement}
 */
export function tiles(...kids) { return h('div', { class: 'tn-tiles' }, kids); }

/**
 * Button group/toolbar inside cards.
 * @param {...Child} kids
 * @returns {HTMLElement}
 */
export function toolbarRow(...kids) { return h('div', { class: 'tn-toolrow' }, kids); }

/**
 * Layout: columns (side by side from 1000 px content width, stacked otherwise). cols(a, b) · cols({ min: 280 }, a, b, c)
 * @param {...(Child | { min?: number })} kids
 * @returns {HTMLElement}
 */
export function cols(...kids) {
  const opt = /** @type {{ min?: number }} */ (kids[0] && !(kids[0] instanceof Node) && !Array.isArray(kids[0]) && typeof kids[0] === 'object' ? kids.shift() : {});
  return h('div', { class: 'tn-cols', style: opt.min ? { '--tn-col-min': `${opt.min}px` } : null }, kids);
}
/**
 * Layout: vertical stack with default spacing.
 * @param {...Child} kids
 * @returns {HTMLElement}
 */
export function stack(...kids) { return h('div', { class: 'tn-stack' }, kids); }
