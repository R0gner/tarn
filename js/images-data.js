// @ts-check
// tarn · images, pure functions (no DOM): the image list, stepping through it, which neighbours to preload and what a swipe in the viewer means.
// js/images.js (imageStrip, openImageViewer) draws with them; unit tests in tests/images.test.mjs.

/** @typedef {{ src: string, thumb?: string, alt?: string }} ImageItem src: the full image; thumb: a smaller file for the strip (else src); alt: what the image shows (data, not translated). */
/** @typedef {string | ImageItem | null | undefined} ImageInput */
/** @typedef {'next' | 'prev' | 'close' | null} SwipeResult */

/**
 * Normalise an image list: strings become `{ src }`, entries without a usable `src` are dropped.
 * @param {ImageInput[] | null | undefined} list
 * @returns {ImageItem[]}
 */
export function normalizeImages(list) {
  /** @type {ImageItem[]} */
  const out = [];
  for (const x of list || []) {
    if (typeof x === 'string') { if (x.trim()) out.push({ src: x }); continue; }
    if (!x || typeof x.src !== 'string' || !x.src.trim()) continue;
    /** @type {ImageItem} */
    const it = { src: x.src };
    if (typeof x.thumb === 'string' && x.thumb.trim()) it.thumb = x.thumb;
    if (typeof x.alt === 'string' && x.alt.trim()) it.alt = x.alt.trim();
    out.push(it);
  }
  return out;
}

/**
 * An index inside 0 … n-1 (0 for an empty list or anything that is not a finite number).
 * @param {number} i
 * @param {number} n
 * @returns {number}
 */
export function clampIndex(i, n) {
  if (!(n > 0) || !Number.isFinite(i)) return 0;
  return Math.min(n - 1, Math.max(0, Math.trunc(i)));
}

/**
 * One step forward (+1) or back (-1). The list does not wrap: at the ends the index stays (the viewer hides the button there).
 * @param {number} i
 * @param {number} n
 * @param {number} dir
 * @returns {number}
 */
export function stepIndex(i, n, dir) {
  return clampIndex(i + Math.sign(dir), n);
}

/**
 * Indices to preload around `i`: the previous and the next image, nearest first, the current one never.
 * @param {number} i
 * @param {number} n
 * @returns {number[]}
 */
export function neighbours(i, n) {
  return [i + 1, i - 1].filter((k) => k >= 0 && k < n && k !== i);
}

/** Share of the stage width (or height for close) a slow swipe must travel. */
export const SWIPE_SHARE = 0.2;
/** A fast swipe counts from this distance in px … */
export const SWIPE_MIN = 24;
/** … at this speed in px/ms. */
export const SWIPE_SPEED = 0.4;

/**
 * What a finished drag in the viewer does. Horizontal: to the left = next, to the right = previous (only where there is one); downwards = close.
 * A drag counts when it travels SWIPE_SHARE of the stage, or SWIPE_MIN px at SWIPE_SPEED px/ms; the larger axis decides.
 * @param {{ dx: number, dy: number, dt: number, width: number, height: number, index: number, n: number }} g
 * @returns {SwipeResult}
 */
export function swipeResult({ dx, dy, dt, width, height, index, n }) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  const fast = (d) => d >= SWIPE_MIN && dt > 0 && d / dt >= SWIPE_SPEED;
  if (ax > ay) {
    if (!(ax >= SWIPE_SHARE * width || fast(ax))) return null;
    if (dx < 0) return index < n - 1 ? 'next' : null;
    return index > 0 ? 'prev' : null;
  }
  if (dy > 0 && (dy >= SWIPE_SHARE * height || fast(dy))) return 'close';
  return null;
}
