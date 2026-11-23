// @ts-check
// tarn · growList bookkeeping without the DOM (js/components.js growList): how many rows are drawn after a step, what the end of the list
// does next and which loaded rows are new. A list is never cut: it draws everything it knows step by step while the reader scrolls and
// asks the board for the rest by itself – there is no "Show more" button and never a "26 more" line that cannot be tapped.

/** Rows drawn at first and per step (drawing rows is what costs time, not knowing them). */
export const GROW_STEP = 50;
/** The next step starts when the end of the list comes within this many pixels of the visible area (same as table()). */
export const GROW_AHEAD = 600;

/**
 * Rows drawn after one more step: `shown + step`, at most all known rows; a rest smaller than a fifth of a step is drawn at once.
 * `step <= 0` draws everything.
 * @param {number} shown rows drawn so far
 * @param {number} known rows the list knows
 * @param {number} [step]
 * @returns {number}
 */
export function nextShown(shown, known, step = GROW_STEP) {
  const all = Math.max(0, known | 0);
  if (!(step > 0)) return all;
  const n = Math.min(all, Math.max(0, shown | 0) + step);
  return all - n < step / 5 ? all : n;
}

/**
 * What the end of the list does when it comes into view: `draw` (known rows are left), `load` (the board has more and can load them),
 * `wait` (a load is running), `failed` (the last load failed: an error with "Try again"), `done` (the list is complete).
 * @param {{ shown: number, known: number, more?: boolean, loading?: boolean, failed?: boolean }} s
 * @returns {'draw' | 'load' | 'wait' | 'failed' | 'done'}
 */
export function growAction({ shown, known, more = false, loading = false, failed = false }) {
  if (shown < known) return 'draw';
  if (loading) return 'wait';
  if (failed) return 'failed';
  return more ? 'load' : 'done';
}

/**
 * Normalises a load answer: an array (then the board has nothing more) or `{ items, more }`.
 * @param {any} res
 * @returns {{ items: any[], more: boolean }}
 */
export function loadResult(res) {
  if (Array.isArray(res)) return { items: res, more: false };
  const items = Array.isArray(res?.items) ? res.items : [];
  return { items, more: !!res?.more && items.length > 0 };
}

/**
 * The rows of `add` that `known` does not hold yet (by `key`, without a key all of them), in the order of `add`.
 * @template T
 * @param {T[]} known
 * @param {T[]} add
 * @param {((item: T) => unknown) | undefined} key
 * @returns {T[]}
 */
export function newRows(known, add, key) {
  if (!key) return add.slice();
  const seen = new Set(known.map(key));
  const out = [];
  for (const x of add) {
    const k = key(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}
