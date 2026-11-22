// @ts-check
// tarn · swipe between the parts of a segmented control, pure functions (no DOM): which axis a touch takes, how far the panes follow the finger
// (rubber band at the first and the last part), what a release does and where the marker of the active option sits in between.
// js/swipe.js draws with them; unit tests in tests/swipe.test.mjs.

/** Distance in px a finger travels before the gesture decides its axis. */
export const AXIS_SLOP = 10;
/** Sideways wins only when |dx| ≥ AXIS_RATIO × |dy| (flatter than about 34°); everything steeper is the page's vertical scroll. */
export const AXIS_RATIO = 1.5;
/** Share of the pane width a slow swipe must travel to switch. */
export const PANE_SHARE = 0.25;
/** A fast swipe switches from this distance in px … */
export const PANE_MIN = 30;
/** … at this speed in px/ms. */
export const PANE_SPEED = 0.4;

/**
 * The axis of a touch after it moved (dx, dy) from where it started: null while it is still inside AXIS_SLOP, 'x' for a sideways swipe,
 * 'y' for everything else (vertical scrolling has priority: a diagonal touch is a scroll).
 * @param {number} dx
 * @param {number} dy
 * @param {number} [slop]
 * @returns {'x' | 'y' | null}
 */
export function swipeAxis(dx, dy, slop = AXIS_SLOP) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (!Number.isFinite(ax) || !Number.isFinite(ay) || Math.max(ax, ay) < slop) return null;
  return ax >= AXIS_RATIO * ay ? 'x' : 'y';
}

/**
 * How far the panes move for a drag of dx px from part `index` of `n`: with the finger where a neighbour exists (at most one pane width), damped
 * (rubber band) where there is none – before the first and after the last part.
 * @param {number} dx
 * @param {number} index
 * @param {number} n
 * @param {number} width the pane width
 * @returns {number}
 */
export function paneOffset(dx, index, n, width) {
  if (!Number.isFinite(dx) || !dx) return 0;
  const blocked = (dx < 0 && index >= n - 1) || (dx > 0 && index <= 0);
  if (blocked) return Math.sign(dx) * Math.min(Math.sqrt(Math.abs(dx)) * 2, Math.max(0, width) / 4);
  return Math.sign(dx) * Math.min(Math.abs(dx), Math.max(0, width));
}

/**
 * The part shown after a sideways drag ends: the neighbour in the drag's direction (to the left = next) when the drag travelled PANE_SHARE of
 * the width or PANE_MIN px at PANE_SPEED px/ms, otherwise the same part. Never beyond the first or the last part (no wrap).
 * @param {{ dx: number, dt: number, width: number, index: number, n: number }} g
 * @returns {number}
 */
export function paneRelease({ dx, dt, width, index, n }) {
  const ax = Math.abs(dx);
  const far = width > 0 && ax >= PANE_SHARE * width;
  const fast = ax >= PANE_MIN && dt > 0 && ax / dt >= PANE_SPEED;
  if (!(far || fast)) return index;
  const to = index + (dx < 0 ? 1 : -1);
  return to < 0 || to >= n ? index : to;
}

/**
 * The share (0 … 1) of the way from the current part to the neighbour the finger has pulled in: |offset| / width, 0 when nothing is there.
 * @param {number} offset the pane offset (paneOffset)
 * @param {number} width
 * @returns {number}
 */
export function paneProgress(offset, width) {
  if (!(width > 0) || !Number.isFinite(offset)) return 0;
  return Math.min(1, Math.abs(offset) / width);
}

/** @typedef {{ x: number, w: number }} Span a horizontal span (left edge and width, px) */

/**
 * The marker of the active option on its way from option a to option b: position and width interpolated by progress p (0 = a, 1 = b).
 * @param {Span} a
 * @param {Span} b
 * @param {number} p
 * @returns {Span}
 */
export function markerAt(a, b, p) {
  const q = Math.min(1, Math.max(0, Number.isFinite(p) ? p : 0));
  return { x: a.x + (b.x - a.x) * q, w: a.w + (b.w - a.w) * q };
}

/**
 * Whether an element scrolls sideways by itself (a table, an image strip, a row of chips): a gesture that starts inside it belongs to it.
 * @param {{ overflowX: string, scrollWidth: number, clientWidth: number }} el the computed overflow-x and the sizes
 * @returns {boolean}
 */
export function scrollsSideways({ overflowX, scrollWidth, clientWidth }) {
  return (overflowX === 'auto' || overflowX === 'scroll') && scrollWidth > clientWidth + 1;
}
