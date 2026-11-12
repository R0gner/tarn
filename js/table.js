// @ts-check
// tarn · table: sortable, sticky header, zebra, tappable rows.
// Automatically a two-line list (class .is-list) when the container is narrower than 600 px or the columns
// no longer fit (measured, without horizontal scrolling and without widening the page):
//   Dot   | Title            Value | ›
//         | Subtitle (sub columns joined with ·)
import './locales/shell.js';   // shell texts
import { h, cls } from './dom.js';
import { icon } from './icons.js';
import { statusDot, button } from './primitives.js';
import { empty } from './components.js';
import { sortRows } from './format.js';
import { t } from './i18n.js';

/** @typedef {import('./dom.js').Child} Child */
/** @typedef {import('./primitives.js').Status} Status */
/** @typedef {{ key: string, dir: 'asc' | 'desc' }} SortState */
/** @typedef {{ key: string, label?: Child, get?: (row: any) => any, render?: (row: any) => Child, align?: 'right', width?: number | string, mono?: boolean, wrap?: boolean, sortable?: boolean, mobile?: 'title' | 'value' | 'sub' | 'hide' }} TableColumn get gives the value for sorting (and the default text); render the cell content. */
/** @typedef {{ columns: TableColumn[], rows?: any[], rowKey?: (row: any) => string | number | null | undefined, onRow?: (row: any) => void, onSort?: (sort: SortState) => void, status?: (row: any) => Status | undefined, sort?: SortState | null, selected?: string | number | null, empty?: string, caption?: string, pageSize?: number }} TableOptions */
/** @typedef {HTMLElement & { update: (o?: { rows?: any[], selected?: string | number | null }) => void }} TableElement */

/**
 * table({
 *   columns: [{ key, label, get?(row), render?(row), align?: 'right', width?, mono?, wrap?, sortable?: true,
 *               mobile?: 'title' | 'value' | 'sub' | 'hide' }],
 *   rows, rowKey?(row), onRow?(row), status?(row) → Status, sort?: { key, dir }, selected?: key,
 *   empty?: 'text', caption?, pageSize?: 20 (rows drawn at first; “Show more” adds the next ones; 0 = all)
 * }) → element with .update({ rows, selected })
 * Cells do not wrap (except the title column and wrap: true for longer texts such as schedules).
 * Without mobile: first column = title, last right-aligned = value, rest = sub.
 * @param {TableOptions} opts
 * @returns {TableElement}
 */
export function table(opts) {
  const cols = opts.columns.map((c, i) => ({ sortable: true, ...c, idx: i }));
  if (!cols.some((c) => c.mobile === 'title')) cols[0].mobile ??= 'title';
  if (!cols.some((c) => c.mobile === 'value')) {
    const v = [...cols].reverse().find((c) => c.align === 'right' && !c.mobile);
    if (v) v.mobile = 'value';
  }
  for (const c of cols) c.mobile ??= 'sub';
  /** @param {TableColumn} c @param {any} r */
  const val = (c, r) => (c.get ? c.get(r) : r[c.key]);
  /** @param {TableColumn} c @param {any} r */
  const cell = (c, r) => (c.render ? c.render(r) : val(c, r));

  let rows = opts.rows || [];
  /** @type {SortState | null} */
  let sort = opts.sort || null;
  /** @type {string | number | null} */
  let selected = opts.selected ?? null;
  const key = opts.rowKey || ((r) => r.id);
  const pageSize = opts.pageSize ?? 20;   // drawing many rows is the expensive part (layout), not filtering: stay within the “direct” budget
  /** @type {any[]} */ let shown = [];
  /** @type {HTMLElement | null} */ let tbody = null;
  /** @type {HTMLElement | null} */ let more = null;
  let drawn = 0;

  const wrap = h('div', { class: cls('tn-table-wrap', opts.onRow && 'tn-table-click') });
  const LIST_BELOW = 600; // container width (px) below which the list always appears
  let list = false, natural = 0;
  /** @param {boolean} on */
  function setList(on) { list = on; wrap.classList.toggle('is-list', on); }
  /** Table or list depending on width. Measure before painting (ResizeObserver runs before paint). */
  function fit() {
    const w = wrap.clientWidth;
    const t = wrap.firstElementChild?.tagName === 'TABLE' ? /** @type {HTMLElement} */ (wrap.firstElementChild) : null;
    if (!w || !t) return;
    if (list) {
      if (w < LIST_BELOW || w < natural) return;
      setList(false);
    }
    if (w < LIST_BELOW || t.offsetWidth > w + 0.5) { natural = t.offsetWidth; setList(true); }
  }
  new ResizeObserver(fit).observe(wrap);

  /** @param {TableColumn} c */
  function headCell(c) {
    const active = sort?.key === c.key;
    const label = c.sortable
      ? h('button', { class: 'tn-th-btn', type: 'button', onclick: () => toggleSort(c) },
        h('span', null, c.label), h('span', { class: 'tn-sort', 'aria-hidden': 'true' }, active && sort ? icon(sort.dir === 'desc' ? 'arrow-down' : 'arrow-up', { size: 12 }) : null))
      : c.label;
    return h('th', {
      scope: 'col', class: cls(c.align === 'right' && 'tn-right', active && 'is-sorted'),
      'aria-sort': active && sort ? (sort.dir === 'desc' ? 'descending' : 'ascending') : null,
      style: c.width ? { width: typeof c.width === 'number' ? `${c.width}px` : c.width } : null,
    }, label);
  }
  /** @param {TableColumn} c */
  function toggleSort(c) {
    sort = sort && sort.key === c.key ? { key: c.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: c.align === 'right' ? 'desc' : 'asc' };
    opts.onSort?.(sort);
    render();
  }
  /** @param {any} r */
  function bodyRow(r) {
    const k = key(r);
    const st = opts.status?.(r);
    const subs = cols.filter((c) => c.mobile === 'sub').map((c) => cell(c, r)).filter((x) => x != null && x !== '');
    const onRow = opts.onRow;
    const tr = h('tr', {
      class: cls(k != null && k === selected && 'is-selected'),
      tabindex: opts.onRow ? '0' : null, 'data-key': k ?? null,
      onclick: onRow ? () => onRow(r) : null,
      onkeydown: onRow ? (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRow(r); } } : null,
    },
    opts.status && h('td', { class: 'tn-td-status', 'data-m': 'status' }, statusDot(st || 'unknown')),
    cols.map((c) => h('td', {
      class: cls(c.align === 'right' && 'tn-right', c.mono && 'tn-mono', c.wrap && 'tn-wrap', c.mobile === 'title' && 'tn-td-title'), 'data-m': c.mobile,
    }, cell(c, r))),
    h('td', { class: 'tn-td-m', 'data-m': 'subline', 'aria-hidden': 'true' }, subs.flatMap((x, i) => (i ? [h('span', { class: 'tn-sep-dot' }, ' · '), x] : [x]))),
    opts.onRow && h('td', { class: 'tn-td-go', 'aria-hidden': 'true' }, icon('chevron-right')));
    return tr;
  }
  function drawMore() {
    if (!tbody || !more) return;
    const next = shown.slice(drawn, pageSize > 0 ? drawn + pageSize : undefined);
    tbody.append(...next.map(bodyRow));
    drawn += next.length;
    const left = shown.length - drawn;
    more.hidden = left <= 0;
    /** @type {HTMLElement} */ (more.querySelector('.tn-table-more-n')).textContent = t('table.shown', { shown: drawn, total: shown.length });
  }
  function render() {
    shown = rows;
    if (sort) { const sk = sort; const c = cols.find((x) => x.key === sk.key); if (c) shown = sortRows(rows, (/** @type {any} */ r) => val(c, r), sk.dir); }
    drawn = 0;
    if (!shown.length) { wrap.replaceChildren(empty({ title: opts.empty || t('common.noEntries'), compact: true })); return; }
    tbody = h('tbody');
    more = h('div', { class: 'tn-table-more', hidden: true },
      h('span', { class: 'tn-table-more-n' }),
      button(t('table.more'), { variant: 'ghost', small: true, onClick: () => drawMore() }));
    wrap.replaceChildren(h('table', { class: 'tn-table' },
      opts.caption && h('caption', { class: 'tn-sr' }, opts.caption),
      h('thead', null, h('tr', null, opts.status && h('th', { class: 'tn-td-status', 'aria-label': 'Status' }), cols.map(headCell), h('th', { class: 'tn-td-m' }), opts.onRow && h('th', { class: 'tn-td-go' }))),
      tbody), more);
    drawMore();
    natural = 0; setList(false); fit();
  }
  const tableEl = Object.assign(wrap, {
    /** @param {{ rows?: any[], selected?: string | number | null }} [o] */
    update(o = {}) {
      if ('rows' in o) rows = o.rows || [];
      if ('selected' in o) selected = o.selected ?? null;
      render();
    },
  });
  render();
  return tableEl;
}
