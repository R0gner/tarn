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
