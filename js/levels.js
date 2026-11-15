// @ts-check
// tarn · Back by levels, pure functions (no DOM, no history): which entries the browser history should hold for a route, what one Back does
// to them and which history operations bring the browser there. js/shell.js applies the result (createApp({ back: 'levels' }), the default).
//
// Levels: 0 = the default view; 1 = any other view; 2 = an open layer (detail via ?open=, sheet, dialog, phone drawer).
// The history never grows with use: it holds at most the base entry (default view), one entry for another view and one per open layer.
//   default → A        adds one entry          A → B             replaces it
//   A → default        back to the base entry  filter/sort/tab   replace (same view, other parameters)
//   detail from A      sits on top of A        Back              closes the topmost layer only, then goes to the default view, then leaves
// Non-URL layers (sheet, dialog, drawer) are entries with the hash of the entry below and a `layer` id.
import { parseHash, buildHash } from './router.js';

/** @typedef {{ view: string, params: Record<string, string> }} Route */
/** @typedef {{ hash: string, layer?: number }} Entry One history entry of the model; `layer` marks a sheet, dialog or drawer on top of the entry below. */
/** @typedef {{ go?: number, push: number, replace: boolean }} Plan What the shell does to the browser history: go(n) back, or replace the current entry and push `push` entries. */

/**
 * Level of a route: 0 default view, 1 another view, 2 an open detail.
 * @param {Route} route
 * @param {string} defaultView
 * @returns {0 | 1 | 2}
 */
export function levelOf(route, defaultView) {
  if (route.params.open) return 2;
  return route.view === defaultView ? 0 : 1;
}

/**
 * The entries the history should hold for a route, lowest first. `base` is the current lowest entry: when it shows the default view (possibly with
 * filter parameters) it stays, so Back from another view returns to the default view as the user left it.
 * @param {Route} route
 * @param {string} defaultView
 * @param {Entry} [base]
 * @returns {Entry[]}
 */
export function stackFor(route, defaultView, base) {
  const { open, ...rest } = route.params;
  const b = base && !base.layer ? parseHash(base.hash, defaultView) : null;
  const baseHash = b && b.view === defaultView && !b.params.open ? buildHash(b.view, b.params) : buildHash(defaultView);
  const own = { hash: buildHash(route.view, rest) };
  const under = route.view === defaultView ? [own] : [{ hash: baseHash }, own];
  return open ? [...under, { hash: buildHash(route.view, route.params) }] : under;
}

/**
 * A sheet, dialog or drawer opens on top: one more entry with the hash of the top entry.
 * @param {Entry[]} stack
 * @param {number} id
 * @returns {Entry[]}
 */
export function withLayer(stack, id) {
  return [...stack, { hash: stack[stack.length - 1].hash, layer: id }];
}

/**
 * A layer closed by itself (x, Esc, swipe, a button): its entry leaves the model, wherever it is.
 * @param {Entry[]} stack
 * @param {number} id
 * @returns {Entry[]}
 */
export function withoutLayer(stack, id) {
  return stack.filter((e) => e.layer !== id);
}

/**
 * The user went `steps` entries back: the topmost entries close, one per step, the base entry never. `exit` is true when a step found nothing
 * left to close (Back on the default view: the installed app shows the exit hint).
 * @param {Entry[]} stack
 * @param {number} steps
 * @returns {{ stack: Entry[], closed: Entry[], exit: boolean }}
 */
export function backStep(stack, steps) {
  const keep = Math.max(1, stack.length - steps);
  return { stack: stack.slice(0, keep), closed: stack.slice(keep).reverse(), exit: stack.length - steps < 1 };
}

/**
 * History operations that bring the browser from position `phys` to the model. The top of the model sits at position stack.length - 1 + guard
 * (guard: one extra entry below the base in an installed app, it catches Back for the exit hint). Too many entries: go back. Too few: push the
 * missing ones, but only once the page has had a user activation (`canPush`) – Chrome's back button skips entries a page adds before the user
 * ever touched it; until then the current entry is only replaced and the missing entries follow with the first touch.
 * @param {{ phys: number, stack: Entry[], guard?: number, canPush?: boolean }} o
 * @returns {Plan}
 */
export function plan({ phys, stack, guard = 0, canPush = false }) {
  const want = stack.length - 1 + guard;
  if (phys > want) return { go: want - phys, push: 0, replace: false };
  if (phys === want) return { push: 0, replace: true };
  return canPush ? { push: want - phys, replace: false } : { push: 0, replace: true };
}
