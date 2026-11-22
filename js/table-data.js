// @ts-check
// tarn · table: pure parts of the list mode (places of the columns, labels, sort choices). No DOM; unit tests tests/table.test.mjs.

/** @typedef {'title' | 'value' | 'sub' | 'metric' | 'action' | 'hide'} ListPlace */

/**
 * Place of every column in list mode. Explicit `mobile` wins. Without it: the first column is the title; if no column is a `metric`,
 * the last right-aligned one is the value (the two-line list of 0.10); every other column goes into the sub line.
 * @template {{ mobile?: ListPlace, align?: 'right' }} C
 * @param {C[]} cols
 * @returns {ListPlace[]}
 */
export function listPlaces(cols) {
  /** @type {(ListPlace | undefined)[]} */
  const p = cols.map((c) => c.mobile);
  if (!p.includes('title') && p.length) p[0] ??= 'title';
  if (!p.includes('value') && !p.includes('metric')) {
    for (let i = p.length - 1; i >= 0; i--) if (cols[i].align === 'right' && !p[i]) { p[i] = 'value'; break; }
  }
  return p.map((x) => x ?? 'sub');
}

/**
 * Does a cell carry its column label in list mode? `listLabel` wins; default: yes for a metric, no otherwise.
 * @param {{ listLabel?: boolean }} c
 * @param {ListPlace} place
 */
export function listLabelled(c, place) {
  return c.listLabel ?? place === 'metric';
}

/**
 * The sort choices offered in list mode (where the header is hidden): every sortable column with a label, in column order.
 * @param {{ key: string, label?: any, short?: string, sortable?: boolean }[]} cols
 * @param {{ key: string, dir: 'asc' | 'desc' } | null | undefined} sort
 * @returns {{ key: string, label: any, checked: boolean }[]}
 */
export function sortChoices(cols, sort) {
  return cols.filter((c) => c.sortable !== false && c.label != null && c.label !== '')
    .map((c) => ({ key: c.key, label: c.label, checked: sort?.key === c.key }));
}

/**
 * The next sort after choosing column `key`: the same column flips the direction, another starts descending for numbers (right-aligned), ascending otherwise.
 * @param {{ key: string, dir: 'asc' | 'desc' } | null | undefined} sort
 * @param {{ key: string, align?: 'right' }} c
 * @returns {{ key: string, dir: 'asc' | 'desc' }}
 */
export function nextSort(sort, c) {
  return sort && sort.key === c.key ? { key: c.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: c.align === 'right' ? 'desc' : 'asc' };
}

/**
 * Should a click or key on `target` inside a row open the row? Not when it lands on a control inside the row (a toggle, a link, a field).
 * @param {{ closest?: (sel: string) => any } | null} target
 * @param {any} row
 */
export function opensRow(target, row) {
  const hit = target?.closest?.('button, a[href], input, select, textarea, label, [role="button"], [role="switch"], [role="checkbox"]');
  return !hit || hit === row;
}

/** At most this many measurements stand side by side in list mode. */
export const METRIC_COLS_MAX = 6;

/**
 * Layout of the measurement grid in list mode – one template for the whole list, so the same measurement stands at the same x in every row.
 * `needs[i]` is the width measurement i needs in this list (its label + its widest value, measured). The most cells per line that fit `avail`
 * win, each track as wide as the widest measurement that lands in it; the lines are then balanced (five where four fit → 3 + 2, not 4 + 1).
 * `tracks` are the needs per track: as `fr` shares they spread spare room evenly and keep every cell at least as wide as it needs.
 * Nothing fits even one per line: one per line, the value is cut with “…”.
 * @param {number[]} needs px per measurement, in column order
 * @param {number} avail width of the measurement line (px)
 * @param {number} gap column gap (px)
 * @returns {{ cols: number, tracks: number[] }}
 */
export function metricLayout(needs, avail, gap) {
  const n = needs.length;
  /** @param {number} k */
  const tracksOf = (k) => Array.from({ length: k }, (_, j) => Math.max(1, ...needs.filter((_, i) => i % k === j)));
  /** @param {number} k */
  const fits = (k) => tracksOf(k).reduce((a, b) => a + b, 0) + (k - 1) * gap <= avail;
  let k = Math.min(n, METRIC_COLS_MAX);
  while (k > 1 && !fits(k)) k--;
  if (k > 1) {
    const even = Math.ceil(n / Math.ceil(n / k));
    if (even < k && fits(even)) k = even;
  }
  k = Math.max(1, k);
  return { cols: k, tracks: tracksOf(k) };
}

/** The CSS grid template for a layout: fr shares by need, never narrower than 0 (a long value is cut, it does not push the others). */
export function metricTemplate(tracks) {
  return tracks.map((w) => `minmax(0, ${Math.round(w)}fr)`).join(' ');
}

/** Share of the rows whose value must fit its cell uncut; the longest rest (an outlier such as “1 min 35 s” among “3 d”) is cut with “…”. */
export const METRIC_FIT_SHARE = 0.8;

/**
 * Width one measurement needs in a list: its label plus the value width that METRIC_FIT_SHARE of the rows reach (with five rows: the second widest).
 * @param {number} label px of the label (the same in every row)
 * @param {number[]} values px of the value in every drawn row
 * @param {number} inner gap between label and value (px)
 */
export function metricNeed(label, values, inner) {
  if (!values.length) return Math.ceil(label);
  const v = [...values].sort((a, b) => a - b);
  return Math.ceil(label + inner + v[Math.min(v.length - 1, Math.floor(METRIC_FIT_SHARE * (v.length - 1)))]);
}
