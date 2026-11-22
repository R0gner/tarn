// @ts-check
// tarn · images, pure functions (no DOM): the image list, stepping through it, which neighbours to preload, what a swipe in the viewer means,
// and the zoom: double-tap steps, pan limits, zooming about a point and the hand-over to the next image at the edge.
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

// ---- zoom and pan (the viewer's current image). Coordinates are px relative to the centre of the frame the image is fitted into; the image is
// drawn with `transform: translate(tx, ty) scale(s)` around its own centre, which at rest is the frame's centre.

/** @typedef {{ s: number, tx: number, ty: number }} Zoom s: scale (1 = fitted); tx/ty: shift of the image centre from the frame centre in px. */
/** @typedef {{ x: number, y: number }} PanLimits the largest shift in each direction that keeps the image edge at or beyond the frame edge. */

/** Zoom steps a double tap walks through; after the last one it goes back to the first. */
export const ZOOM_STEPS = [1, 2, 3.5];
/** The largest scale a pinch or the wheel reaches. */
export const ZOOM_MAX = 4;
/** Below this scale the image counts as not zoomed (1×). */
export const ZOOM_EPS = 0.02;
/** Two taps count as a double tap within this time (ms) … */
export const DOUBLE_TAP_MS = 300;
/** … and this distance (px). A single tap waits DOUBLE_TAP_MS before it acts, so a double tap never closes the viewer. */
export const DOUBLE_TAP_PX = 30;

/**
 * The next double-tap step after scale `s`: the first step that is clearly larger; at or above the last step back to the first (1×).
 * A scale between steps (after a pinch) goes to the next step up.
 * @param {number} s
 * @param {number[]} [steps]
 * @returns {number}
 */
export function nextZoomStep(s, steps = ZOOM_STEPS) {
  const cur = Number.isFinite(s) ? s : 1;
  for (const z of steps) if (z > cur + ZOOM_EPS) return z;
  return steps[0];
}

/**
 * A scale inside 1 … max (1 for anything that is not a finite number).
 * @param {number} s
 * @param {number} [max]
 * @returns {number}
 */
export function clampScale(s, max = ZOOM_MAX) {
  if (!Number.isFinite(s)) return 1;
  return Math.min(max, Math.max(1, s));
}

/**
 * How far the image may be shifted at scale `s`: half of what sticks out over the frame, 0 on an axis where the scaled image still fits
 * (it stays centred there).
 * @param {{ s: number, iw: number, ih: number, w: number, h: number }} g iw/ih: the fitted image size at 1×; w/h: the frame size
 * @returns {PanLimits}
 */
export function panLimits({ s, iw, ih, w, h }) {
  return { x: Math.max(0, (s * iw - w) / 2), y: Math.max(0, (s * ih - h) / 2) };
}

/** @param {number} v @param {number} lim */
const clampAxis = (v, lim) => (Math.abs(v) <= lim ? v : Math.sign(v) * lim) || 0;

/**
 * Keep a shift inside the limits.
 * @param {Zoom} z
 * @param {PanLimits} lim
 * @returns {Zoom}
 */
export function clampPan(z, lim) {
  return { s: z.s, tx: clampAxis(z.tx, lim.x), ty: clampAxis(z.ty, lim.y) };
}

/**
 * Change the scale to `s2` so that the point (px, py) stays under the finger (pinch centre, tapped spot). Not clamped: pass the result through
 * clampPan() with the limits of the new scale. At 1× the shift is 0.
 * @param {Zoom} z the current state
 * @param {number} s2 the new scale
 * @param {number} px
 * @param {number} py
 * @returns {Zoom}
 */
export function zoomAt(z, s2, px, py) {
  if (s2 <= 1 + ZOOM_EPS) return { s: 1, tx: 0, ty: 0 };
  const k = s2 / z.s;
  return { s: s2, tx: px - (px - z.tx) * k, ty: py - (py - z.ty) * k };
}

/**
 * A drag on a zoomed image: the image moves with the finger up to its edge; what the finger travels beyond the left or right edge is handed
 * to the carousel (`over`, px, negative = towards the next image). Beyond the top or bottom edge nothing happens (a zoomed image never closes).
 * @param {{ tx: number, ty: number, dx: number, dy: number, lim: PanLimits }} g tx/ty: the shift when the drag started; dx/dy: the drag so far
 * @returns {{ tx: number, ty: number, over: number }}
 */
export function panHandoff({ tx, ty, dx, dy, lim }) {
  const wantX = tx + dx;
  const x = clampAxis(wantX, lim.x);
  return { tx: x, ty: clampAxis(ty + dy, lim.y), over: (wantX - x) || 0 };
}

/**
 * Whether a tap is the second half of a double tap.
 * @param {{ t: number, x: number, y: number } | null} prev the tap before (null: none waiting)
 * @param {{ t: number, x: number, y: number }} cur
 * @returns {boolean}
 */
export function isDoubleTap(prev, cur) {
  if (!prev) return false;
  const dt = cur.t - prev.t;
  return dt >= 0 && dt <= DOUBLE_TAP_MS && Math.hypot(cur.x - prev.x, cur.y - prev.y) <= DOUBLE_TAP_PX;
}

/**
 * The carousel offset while a drag pulls where there is no image (before the first, after the last): damped so it moves, but clearly less.
 * @param {number} dx the drag (or the part handed over by panHandoff)
 * @param {number} index
 * @param {number} n
 * @returns {number}
 */
export function trackOffset(dx, index, n) {
  const blocked = (dx < 0 && index >= n - 1) || (dx > 0 && index <= 0);
  return blocked ? Math.sign(dx) * Math.sqrt(Math.abs(dx)) * 2 : dx;
}

// ---- fling (momentum after a fast pan on a zoomed image): the speed of the last moments of the drag carries on and decays exponentially, like
// the scrollers of iOS and Android. Speeds in px/ms, times in ms.

/** @typedef {{ t: number, x: number, y: number }} PanSample a pointer position at time t (ms) */
/** @typedef {{ tx: number, ty: number, vx: number, vy: number }} Fling the shift (px) and the speed (px/ms) of a gliding image */

/** Time constant of the decay (ms): after this time the speed has dropped to 1/e, the whole glide covers speed × FLING_TAU. */
export const FLING_TAU = 325;
/** The speed at release is measured over the last FLING_WINDOW ms of the drag … */
export const FLING_WINDOW = 100;
/** … and is 0 when the finger has rested this long (ms) before it lifted (no move events while it is still). */
export const FLING_IDLE = 40;
/** A glide starts from this speed (px/ms) … */
export const FLING_MIN = 0.1;
/** … ends below this one … */
export const FLING_STOP = 0.01;
/** … and is capped at this one. */
export const FLING_MAX = 6;

/**
 * The speed of a drag at its release: the way between the first and the last sample of the last FLING_WINDOW ms, divided by their time. 0 when
 * there are not two such samples, when they are less than 8 ms apart, or when the last one is older than FLING_IDLE (the finger rested).
 * Capped at FLING_MAX (the direction stays).
 * @param {PanSample[]} samples in time order
 * @param {number} now the release time
 * @returns {{ vx: number, vy: number }}
 */
export function releaseVelocity(samples, now) {
  const recent = (samples || []).filter((p) => p.t <= now && now - p.t <= FLING_WINDOW);
  if (recent.length < 2) return { vx: 0, vy: 0 };
  const a = recent[0], b = recent[recent.length - 1];
  const dt = b.t - a.t;
  if (dt < 8 || now - b.t > FLING_IDLE) return { vx: 0, vy: 0 };
  let vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
  const v = Math.hypot(vx, vy);
  if (v > FLING_MAX) { vx *= FLING_MAX / v; vy *= FLING_MAX / v; }
  return { vx, vy };
}

/**
 * The start of a glide, or null when the speed is below FLING_MIN. On each axis the speed is lowered so that the glide (speed × tau) ends at the
 * pan limit at the latest: towards a near edge the image slows down softly and comes to rest there instead of hitting it.
 * @param {{ tx: number, ty: number }} z the shift at release
 * @param {{ vx: number, vy: number }} v the release speed
 * @param {PanLimits} lim
 * @param {number} [tau]
 * @returns {Fling | null}
 */
export function flingStart(z, v, lim, tau = FLING_TAU) {
  if (!(Math.hypot(v.vx, v.vy) >= FLING_MIN)) return null;
  /** @param {number} p @param {number} s @param {number} l */
  const room = (p, s, l) => (s === 0 ? 0 : Math.sign(s) * Math.min(Math.abs(s), Math.max(0, l - Math.sign(s) * p) / tau));
  const f = { tx: z.tx, ty: z.ty, vx: room(z.tx, v.vx, lim.x), vy: room(z.ty, v.vy, lim.y) };
  return Math.hypot(f.vx, f.vy) >= FLING_STOP ? f : null;
}

/**
 * One frame of a glide: dt ms of exponential decay (way = v · tau · (1 − e^(−dt/tau)), speed · e^(−dt/tau)), kept inside the limits (an axis
 * that reaches its limit stops). done: the speed is below FLING_STOP (or there is no time constant).
 * @param {Fling} f
 * @param {number} dt
 * @param {PanLimits} lim
 * @param {number} [tau]
 * @returns {Fling & { done: boolean }}
 */
export function flingStep(f, dt, lim, tau = FLING_TAU) {
  if (!(tau > 0)) return { ...f, vx: 0, vy: 0, done: true };
  const k = Math.exp(-Math.max(0, dt) / tau), way = tau * (1 - k);
  let tx = f.tx + f.vx * way, ty = f.ty + f.vy * way, vx = f.vx * k, vy = f.vy * k;
  if (Math.abs(tx) >= lim.x) { tx = clampAxis(tx, lim.x); vx = 0; }
  if (Math.abs(ty) >= lim.y) { ty = clampAxis(ty, lim.y); vy = 0; }
  return { tx, ty, vx, vy, done: Math.hypot(vx, vy) < FLING_STOP };
}
