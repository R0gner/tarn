// @ts-check
// tarn · growList: a list that is never cut. It draws every row it knows step by step while the reader scrolls (IntersectionObserver on the
// end of the list) and, when the board can deliver more (`load`), asks for the next rows by itself. There is no "Show more" button and never a
// "26 more" line that cannot be tapped. The bookkeeping lives in growlist-data.js (tested without the DOM).
import './locales/shell.js';   // shell texts
import { h, cls } from './dom.js';
import { t } from './i18n.js';
import { empty, errorState, loading } from './components.js';
import { GROW_AHEAD, GROW_STEP, growAction, loadResult, newRows, nextShown } from './growlist-data.js';

export { GROW_STEP, GROW_AHEAD };

/** @typedef {import('./dom.js').Child} Child */
/**
 * @template T
 * @typedef {{ load?: (offset: number) => Promise<T[] | { items: T[], more?: boolean }>, more?: boolean, key?: (item: T) => unknown,
 *   step?: number, id?: string, empty?: string, zebra?: boolean, className?: string }} GrowListOptions
 * load: asks the board for the rows after `offset` (the number of rows the list knows); answer an array (then nothing more follows) or
 * `{ items, more }`. more: the board has more than `items` right now (without it `load` is not called before the first answer). key: drops rows
 * that arrive twice. step: rows drawn at first and per step (0 = all at once). id: keeps the drawn and loaded rows while the page lives, so a
 * redraw of the view (fresh data) does not throw the reader back to the first rows.
 */

/** @type {Map<string, { shown: number, loaded: any[], more: boolean, base: number }>} */
const KEPT = new Map();

/**
 * List that grows while scrolling – use it for every list that can be longer than a screen: watchlists, search hits, logs, journals.
 * growList(items, render, { load, more, key, step, id, empty, zebra }) → element
 * Rows are the elements `render` returns (metricRow, mediaRow …), like list(). Without IntersectionObserver every known row is drawn at once.
 * @template T
 * @param {T[]} items rows known now (all of them, or the first page when `load` delivers the rest)
 * @param {(item: T, index: number) => HTMLElement} render
 * @param {GrowListOptions<T>} [o]
 * @returns {HTMLElement}
 */
export function growList(items, render, o = {}) {
  const { load, key, step = GROW_STEP, id, empty: emptyText, zebra = false, className } = o;
  const base = items || [];
  const kept = id ? KEPT.get(id) : undefined;
  // kept rows belong to this list only while its first page is the same length (a new filter or fresh data with other rows starts anew)
  const keep = kept && kept.base === base.length ? kept : undefined;
  /** @type {T[]} */ let known = base.concat(newRows(base, keep?.loaded || [], key));
  let more = keep ? keep.more : !!(o.more && load);
  let shown = 0, busy = false, failed = false;
  if (!known.length && !more) return empty({ title: emptyText ?? t('common.noEntries'), compact: true });

  const rows = h('div', { class: cls('tn-list', zebra && 'tn-zebra', className), role: 'list' });
  const tail = h('div', { class: 'tn-grow-end' });
  const wrap = h('div', { class: 'tn-grow' }, rows, tail);
  /** @type {IntersectionObserver | null} */ let io = null;

  function save() {
    if (id) KEPT.set(id, { shown, loaded: known.slice(base.length), more, base: base.length });
  }
  /** @param {number} upto */
  function drawTo(upto) {
    const add = known.slice(shown, upto).map((it, i) => {
      const el = render(it, shown + i);
      el.setAttribute('role', el.tagName === 'BUTTON' ? 'button' : 'listitem');
      return el;
    });
    rows.append(...add);
    shown = Math.max(shown, Math.min(upto, known.length));
  }
  function fetchMore() {
    if (!load) return;
    busy = true; failed = false;
    tail.replaceChildren(loading({ rows: 1 }));
    Promise.resolve().then(() => load(known.length)).then((res) => {
      const r = loadResult(res);
      known = known.concat(newRows(known, r.items, key));
      more = r.more;
      busy = false;
      advance();
    }, () => {
      busy = false; failed = true;
      tail.replaceChildren(errorState({ compact: true, onRetry: () => fetchMore() }));
      save();
    });
  }
  /** One step at the end of the list: draw known rows, load, or stop. */
  function advance() {
    const act = growAction({ shown, known: known.length, more, loading: busy, failed });
    if (act === 'draw') drawTo(nextShown(shown, known.length, step));
    else if (act === 'load') { fetchMore(); return; }
    if (act === 'draw' || act === 'done') tail.replaceChildren();
    if (!more && shown >= known.length) { io?.disconnect(); io = null; }
    else if (io) { io.unobserve(tail); io.observe(tail); }   // still near the visible area after these rows: the observer reports again at once
    if (!known.length && !more) wrap.replaceChildren(empty({ title: emptyText ?? t('common.noEntries'), compact: true }));
    save();
  }

  const first = keep ? Math.max(keep.shown, 0) : 0;
  if (typeof IntersectionObserver !== 'function') {
    drawTo(known.length);
    if (more) fetchMore();
    return wrap;
  }
  drawTo(first || nextShown(0, known.length, step));
  io = new IntersectionObserver((entries) => {
    if (!wrap.isConnected) return;     // built before it is attached, or left behind by a redraw: nothing to draw into
    if (entries.some((e) => e.isIntersecting) && !busy) advance();
  }, { rootMargin: `0px 0px ${GROW_AHEAD}px 0px` });
  if (more || shown < known.length) io.observe(tail);
  else io = null;
  save();
  return wrap;
}
