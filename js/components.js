// @ts-check
// tarn · shell components: card, section, statTile, metricRow, list, kv, facts, banner, empty/error/loading and the layout helpers.
// The primitives (statusDot, badge, button, iconButton) live in primitives.js and are re-exported by the barrel.
import './locales/shell.js';   // shell texts
import { h, cls, nextId } from './dom.js';
import { icon } from './icons.js';
import { statusDot, button } from './primitives.js';
import { t } from './i18n.js';
import { showOverlay, removeOverlay, placeOverlay } from './overlay.js';
import { hideTooltip } from './controls.js';
import { fitTiles } from './tiles-data.js';

/** @import { Status } from './primitives.js' */
/** @typedef {{ title?: Child, sub?: Child, actions?: Child, flush?: boolean, footer?: Child, info?: Child, className?: string }} CardOptions footer: a quiet line under the content ("+13 frequent runs hidden"); info: an optional explanation behind a small "i" next to the title (closed by default, at most INFO_MAX characters). */
/** @typedef {{ count?: number | string | null, actions?: Child, footer?: Child, info?: Child, className?: string, fold?: string | { id: string, open?: boolean } }} SectionOptions footer: a quiet line under the content; info: an optional explanation behind a small "i" next to the title; fold: the title becomes a button that folds the content (id: stable name, the state survives redraws while the page lives; open: start open, default folded). */
/** @typedef {{ label?: Child, value?: Child, unit?: Child, sub?: Child, status?: Status, onClick?: (e: MouseEvent) => void, className?: string }} StatTileOptions */
/** @typedef {{ title?: Child, sub?: Child, value?: Child, valueSub?: Child, status?: Status, onClick?: (e: MouseEvent) => void, chevron?: boolean, mono?: boolean, label?: string, selected?: boolean, key?: string | number, wrapSub?: boolean, wrapTitle?: boolean, className?: string }} MetricRowOptions wrapSub: the sub line wraps instead of ending in "…" (a problem row's reason must be readable in full); wrapTitle: the title takes up to two lines. */
/** @typedef {{ media?: Child, title?: Child, lines?: Array<Child | null | undefined | false>, onClick?: (e: MouseEvent) => void, label?: string, selected?: boolean, key?: string | number, titleLines?: 2 | 3 | 4, className?: string }} MediaRowOptions media: the picture (an <img> or a placeholder), titleLines: lines the title may take before "…" (default 3), lines: the rows below the title (a value line, a line of badges). */
/** @typedef {{ empty?: string, zebra?: boolean }} ListOptions */
/** @typedef {{ mono?: boolean }} KvOptions */
/** @typedef {[Child, Child, string?]} KvPair [key, value, optional class for the value] */
/** @typedef {{ tone?: Status, action?: Child }} BannerOptions */
/** @typedef {{ title?: Child, text?: Child, action?: Child, compact?: boolean, icon?: string }} EmptyOptions */
/** @typedef {{ title?: Child, text?: Child, onRetry?: (e: MouseEvent) => void, compact?: boolean }} ErrorStateOptions */
/** @typedef {{ rows?: number, tiles?: number, label?: string }} LoadingOptions */
/** @typedef {import('./dom.js').Child} Child */


/** Longest allowed `info` text in characters: a few plain sentences. verify (rule `info-length`) fails above it. */
export const INFO_MAX = 280;

/**
 * The small "i" next to a card or section title: a button that opens `text` in a kit overlay (above sheets), closed by default.
 * Tap or Enter/Space opens and closes it; Escape, a tap outside, Tab and a width change close it. Use it through `card({ info })` or
 * `section(title, { info })`; a chart gets its explanation through the card or section around it.
 * @param {Child} text a string or node (boards pass t() text): a few plain sentences, only what is needed to read the display
 * @returns {HTMLButtonElement}
 */
export function infoButton(text) {
  const pid = nextId('info');
  const btn = /** @type {HTMLButtonElement} */ (h('button', {
    class: 'tn-iconbtn tn-info-btn', type: 'button', 'aria-label': t('common.info'), 'aria-expanded': 'false', 'aria-controls': pid,
  }, icon('info')));
  /** @type {any} */ (btn).tnInfo = text;   // read by verify (rule info-length) without opening it
  /** @type {HTMLElement | null} */
  let el = null;
  let width0 = 0;
  /** @param {boolean} [refocus] */
  const close = (refocus) => {
    if (!el) return;
    removeOverlay(el); el = null; btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', key, true);
    window.removeEventListener('resize', onResize);
    if (refocus && btn.isConnected) btn.focus();
  };
  const onResize = () => { if (Math.abs(document.documentElement.clientWidth - width0) >= 1) close(false); };
  /** @param {Event} e */
  const outside = (e) => { if (!btn.isConnected || (el && !el.contains(/** @type {Node} */ (e.target)) && !btn.contains(/** @type {Node} */ (e.target)))) close(false); };
  /** @param {KeyboardEvent} e */
  const key = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); }
    else if (e.key === 'Tab' && el && el.contains(document.activeElement)) close(true);   // focus back on the "i", Tab moves on from there
  };
  const open = () => {
    hideTooltip();
    el = h('div', { class: 'tn-info', role: 'dialog', id: pid, 'aria-label': t('common.info'), tabindex: '-1' },
      typeof text === 'string' ? h('p', { class: 'tn-info-text' }, text) : text);
    showOverlay(el);
    placeOverlay(el, btn.getBoundingClientRect());
    btn.setAttribute('aria-expanded', 'true');
    width0 = document.documentElement.clientWidth;
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('resize', onResize);
    el.focus({ preventScroll: true });
  };
  btn.addEventListener('click', () => (el ? close(false) : open()));
  return btn;
}

/**
 * Card – the only container with a hairline border. card({ title, sub, actions, flush, footer, info }, ...content)
 * footer: a quiet footer line (one short sentence, e.g. "+13 frequent runs hidden"; a link or button inside is fine) under the content, inside the card.
 * info: an optional explanation behind a small "i" next to the title (infoButton()).
 * @param {CardOptions | undefined} o
 * @param {...Child} kids
 * @returns {HTMLElement}
 */
export function card({ title, sub, actions, flush, footer, info, className } = {}, ...kids) {
  const head = title || actions || info ? h('header', { class: 'tn-card-head' },
    h('div', { class: 'tn-card-heading' },
      info ? h('div', { class: 'tn-card-titlerow' }, title && h('h3', { class: 'tn-card-title' }, title), infoButton(info)) : title && h('h3', { class: 'tn-card-title' }, title),
      sub && h('div', { class: 'tn-card-sub' }, sub)),
    actions && h('div', { class: 'tn-card-actions' }, actions)) : null;
  return h('section', { class: cls('tn-card', flush && 'tn-card-flush', className) }, head, h('div', { class: 'tn-card-body' }, kids), footer ? h('footer', { class: 'tn-foot' }, footer) : null);
}

/**
 * Section with a small heading (11.5/600), optional counter and actions; `footer`: a quiet line under the content; `info`: an explanation behind a small "i".
 * @param {Child} title
 * @param {SectionOptions | undefined} o
 * @param {...Child} kids
 * @returns {HTMLElement}
 */
export function section(title, { count, actions, footer, info, className, fold } = {}, ...kids) {
  if (fold) return foldSection(title, { count, actions, footer, info, className, fold }, kids);
  return h('section', { class: cls('tn-section', className) },
    h('header', { class: 'tn-section-head' },
      h('h2', { class: 'tn-section-title' }, title, count != null && h('span', { class: 'tn-section-count' }, count)),
      info ? infoButton(info) : null,
      actions && h('div', { class: 'tn-section-actions' }, actions)),
    kids, footer ? h('div', { class: 'tn-foot tn-foot-plain' }, footer) : null);
}

/* Folded sections (0.12.0): the open state by fold id, kept while the page lives – a view is drawn again on every poll. */
/** @type {Map<string, boolean>} */
const folds = new Map();
/**
 * A section whose content folds away (a quiet group such as "More candidates", "Routine"): the title row is the button.
 * @param {Child} title @param {SectionOptions} o @param {Child[]} kids
 */
function foldSection(title, { count, actions, footer, info, className, fold }, kids) {
  const id = typeof fold === 'string' ? fold : /** @type {{ id: string, open?: boolean }} */ (fold).id;
  const open = folds.has(id) ? !!folds.get(id) : typeof fold === 'object' && !!fold.open;
  const bodyId = nextId('tn-fold');
  const body = h('div', { class: 'tn-section-fold', id: bodyId, hidden: !open }, kids, footer ? h('div', { class: 'tn-foot tn-foot-plain' }, footer) : null);
  const btn = h('button', { class: 'tn-section-toggle', type: 'button', 'aria-expanded': String(open), 'aria-controls': bodyId,
    onclick: () => { const o = btn.getAttribute('aria-expanded') !== 'true'; folds.set(id, o); btn.setAttribute('aria-expanded', String(o)); body.hidden = !o; } },
  icon('chevron-down', { size: 14 }), h('span', { class: 'tn-ellipsis' }, title), count != null && h('span', { class: 'tn-section-count' }, count));
  return h('section', { class: cls('tn-section', 'tn-section-folding', className) },
    h('header', { class: 'tn-section-head' }, h('h2', { class: 'tn-section-title' }, btn), info ? infoButton(info) : null,
      actions && h('div', { class: 'tn-section-actions' }, actions)),
    body);
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
 * metricRow({ title, sub, value, valueSub, status, onClick, chevron = !!onClick, mono, wrapSub })
 * wrapSub: the sub line wraps over as many lines as it needs (default: one line, "…" at the end, full text as hint).
 * wrapTitle: the title takes up to two lines before it ends in "…" (long names such as listing titles; full text as hint).
 * @param {MetricRowOptions} [o]
 * @returns {HTMLElement}
 */
export function metricRow({ title, sub, value, valueSub, status, onClick, chevron, mono, label, selected, key, wrapSub, wrapTitle, className } = {}) {
  const tag = onClick ? 'button' : 'div';
  return h(tag, {
    class: cls('tn-row', onClick && 'tn-row-btn', selected && 'is-selected', className), type: onClick ? 'button' : null, 'data-key': key ?? null,
    onclick: onClick || null, 'aria-label': label || null, 'aria-current': selected ? 'true' : null,
  },
  status && h('span', { class: 'tn-row-status' }, statusDot(status)),
  h('span', { class: 'tn-row-main' },
    h('span', { class: cls('tn-row-title', wrapTitle ? 'tn-clamp' : 'tn-ellipsis', mono && 'tn-mono') }, title),
    sub && h('span', { class: cls('tn-row-sub', wrapSub ? 'tn-row-sub-wrap' : 'tn-ellipsis') }, sub)),
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
 * Row with a picture – a listing, a product, a camera: the picture on the left, the title over the whole remaining width (up to `titleLines`
 * lines, default 3, then "…" with the full text as hint), below it the lines the board gives (a value line, a line of badges). The whole row is
 * the button; there is no chevron and no status dot – say the state with a badge in a line (the dot and a verdict word side by side say the
 * same twice). A value does not sit in its own column beside the title, it goes into a line: on a phone a right column takes the title's room.
 * Rows without a picture: metricRow().
 * mediaRow({ media, title, lines: [valueLine, badges], onClick, key, selected, label, titleLines })
 * @param {MediaRowOptions} [o]
 * @returns {HTMLElement}
 */
export function mediaRow({ media, title, lines = [], onClick, label, selected, key, titleLines = 3, className } = {}) {
  const tag = onClick ? 'button' : 'div';
  return h(tag, {
    class: cls('tn-row', 'tn-mrow', onClick && 'tn-row-btn', selected && 'is-selected', className), type: onClick ? 'button' : null, 'data-key': key ?? null,
    onclick: onClick || null, 'aria-label': label || null, 'aria-current': selected ? 'true' : null,
  },
  h('span', { class: 'tn-mrow-media', 'aria-hidden': 'true' }, media),
  h('span', { class: 'tn-mrow-main' },
    h('span', { class: cls('tn-mrow-title', 'tn-clamp', titleLines !== 2 && `tn-clamp-${titleLines}`) }, title),
    lines.filter((l) => l != null && l !== false && l !== '').map((l) => h('span', { class: 'tn-mrow-line' }, l))));
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
  if (tiles) {
    const grid = tileGrid(Array.from({ length: tiles }, () => h('div', { class: 'tn-stat tn-skel-tile' }, h('span', { class: 'tn-skel tn-skel-s' }), h('span', { class: 'tn-skel tn-skel-l' }))));
    grid.setAttribute('aria-busy', 'true'); grid.setAttribute('aria-label', label);
    return grid;
  }
  return h('div', { class: 'tn-skel-rows', 'aria-busy': 'true', 'aria-label': label },
    Array.from({ length: rows }, (_, i) => h('div', { class: 'tn-skel-row' },
      h('span', { class: 'tn-skel tn-skel-dot' }), h('span', { class: 'tn-skel', style: { width: `${[62, 48, 70, 55, 40][i % 5]}%` } }), h('span', { class: 'tn-skel tn-skel-v' }))));
}

/**
 * Tile grid for any number of tiles: columns of at least 150 px (two on a phone), the rows are balanced (5 tiles: wide 5, medium 3 + 2, phone 2 + 2 + 1) and the tiles of
 * an incomplete row are wider, so every row ends at the same edge (fitTiles() in js/tiles-data.js). tiles(a, b, …) · tiles({ className }, a, b, …)
 * @param {...(Child | { className?: string })} kids
 * @returns {HTMLElement}
 */
export function tiles(...kids) {
  const first = kids[0];
  const o = first && typeof first === 'object' && !Array.isArray(first) && !(first instanceof Node) ? /** @type {{ className?: string }} */ (kids.shift()) : {};
  return tileGrid(/** @type {Child[]} */ (kids), o.className);
}

/** The tile grid itself (also used by loading({ tiles })). @param {Child[]} kids @param {string} [className] */
function tileGrid(kids, className) {
  const el = h('div', { class: cls('tn-tiles', className) }, kids);
  if (typeof ResizeObserver === 'undefined') return el;
  let last = '';
  const fit = () => {
    const cs = getComputedStyle(el), items = /** @type {HTMLElement[]} */ ([...el.children].filter((c) => c instanceof HTMLElement));
    const gap = parseFloat(cs.columnGap) || 8, min = parseFloat(cs.getPropertyValue('--tn-sz-150')) || 150;
    const r = fitTiles(items.length, el.clientWidth, { min, gap });
    const key = `${items.length}/${r.grid}/${r.spans.join('')}`;
    if (key === last) return;
    last = key;
    el.style.setProperty('--tn-tiles-cols', String(r.grid));
    items.forEach((c, i) => c.style.setProperty('--tn-tile-span', String(r.spans[i])));
    el.dataset.fit = String(r.cols);
  };
  new ResizeObserver(fit).observe(el);
  return el;
}

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
