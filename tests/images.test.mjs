// tarn · images (js/images-data.js): the image list, stepping, preloading, what a swipe in the viewer does, and the zoom (steps, pan limits,
// zooming about a point, the hand-over to the neighbour at the edge, double taps).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeImages, clampIndex, stepIndex, neighbours, swipeResult, SWIPE_MIN, nextZoomStep, clampScale, panLimits, clampPan, zoomAt, panHandoff,
  isDoubleTap, trackOffset, ZOOM_STEPS, ZOOM_MAX, DOUBLE_TAP_MS, DOUBLE_TAP_PX,
  releaseVelocity, flingStart, flingStep, FLING_TAU, FLING_WINDOW, FLING_IDLE, FLING_MIN, FLING_STOP, FLING_MAX,
} from '../js/images-data.js';

test('normalizeImages: strings become { src }, entries without src are dropped, thumb and alt are kept when not blank', () => {
  assert.deepEqual(normalizeImages(['a.jpg', '', '  ', null, undefined, { src: '' }, { src: 'b.jpg', thumb: 'b-s.jpg', alt: ' Front ' }, { src: 'c.jpg', thumb: ' ', alt: '' }]),
    [{ src: 'a.jpg' }, { src: 'b.jpg', thumb: 'b-s.jpg', alt: 'Front' }, { src: 'c.jpg' }]);
  assert.deepEqual(normalizeImages(null), []);
  assert.deepEqual(normalizeImages(undefined), []);
  // @ts-expect-error a wrong type in the data is dropped, not thrown
  assert.deepEqual(normalizeImages([{ src: 3 }, 7]), []);
});

test('clampIndex: inside 0 … n-1, 0 for an empty list or no number', () => {
  assert.equal(clampIndex(2, 5), 2);
  assert.equal(clampIndex(-1, 5), 0);
  assert.equal(clampIndex(9, 5), 4);
  assert.equal(clampIndex(1.7, 5), 1);
  assert.equal(clampIndex(NaN, 5), 0);
  assert.equal(clampIndex(3, 0), 0);
});

test('stepIndex: one step, no wrap at the ends', () => {
  assert.equal(stepIndex(0, 3, 1), 1);
  assert.equal(stepIndex(2, 3, 1), 2);
  assert.equal(stepIndex(0, 3, -1), 0);
  assert.equal(stepIndex(1, 3, -5), 0);
  assert.equal(stepIndex(0, 1, 1), 0);
});

test('neighbours: next and previous, nearest first, only existing ones', () => {
  assert.deepEqual(neighbours(0, 3), [1]);
  assert.deepEqual(neighbours(1, 3), [2, 0]);
  assert.deepEqual(neighbours(2, 3), [1]);
  assert.deepEqual(neighbours(0, 1), []);
});

test('swipeResult: left = next, right = previous, down = close; short or slow drags do nothing; nothing past the ends', () => {
  const g = { dt: 400, width: 400, height: 800, index: 1, n: 3 };
  assert.equal(swipeResult({ ...g, dx: -100, dy: 10 }), 'next');
  assert.equal(swipeResult({ ...g, dx: 100, dy: -10 }), 'prev');
  assert.equal(swipeResult({ ...g, dx: -40, dy: 0 }), null);                  // 10 % of the width, slow
  assert.equal(swipeResult({ ...g, dx: -40, dy: 0, dt: 60 }), 'next');         // the same distance, fast
  assert.equal(swipeResult({ ...g, dx: -(SWIPE_MIN - 1), dy: 0, dt: 10 }), null); // fast but too short
  assert.equal(swipeResult({ ...g, dx: -100, dy: 0, index: 2 }), null);        // last image: nothing to the left
  assert.equal(swipeResult({ ...g, dx: 100, dy: 0, index: 0 }), null);         // first image: nothing to the right
  assert.equal(swipeResult({ ...g, dx: 20, dy: 200 }), 'close');
  assert.equal(swipeResult({ ...g, dx: 0, dy: -300 }), null);                  // upwards does not close
  assert.equal(swipeResult({ ...g, dx: 0, dy: 60, dt: 80 }), 'close');         // a fast flick down
  assert.equal(swipeResult({ ...g, dx: -100, dy: -120 }), null);               // the larger axis decides: up
});

test('nextZoomStep: 1× → 2× → 3.5× → 1×; a pinched scale goes to the next step up', () => {
  assert.deepEqual(ZOOM_STEPS, [1, 2, 3.5]);
  assert.equal(nextZoomStep(1), 2);
  assert.equal(nextZoomStep(2), 3.5);
  assert.equal(nextZoomStep(3.5), 1);
  assert.equal(nextZoomStep(ZOOM_MAX), 1);       // pinched beyond the last step: back to 1×
  assert.equal(nextZoomStep(1.5), 2);
  assert.equal(nextZoomStep(2.6), 3.5);
  assert.equal(nextZoomStep(1.01), 2);           // within the tolerance of a step: that step counts as reached
  assert.equal(nextZoomStep(1.99), 3.5);
  assert.equal(nextZoomStep(NaN), 2);
  assert.equal(nextZoomStep(1, [1, 3]), 3);
});

test('clampScale: 1 … ZOOM_MAX, 1 for no number', () => {
  assert.equal(clampScale(0.5), 1);
  assert.equal(clampScale(2.5), 2.5);
  assert.equal(clampScale(9), ZOOM_MAX);
  assert.equal(clampScale(NaN), 1);
  assert.equal(clampScale(3, 2), 2);
});

test('panLimits: half of what sticks out over the frame, 0 where the image still fits', () => {
  // a 400×300 fitted image in a 400×700 frame (portrait phone, landscape photo)
  assert.deepEqual(panLimits({ s: 1, iw: 400, ih: 300, w: 400, h: 700 }), { x: 0, y: 0 });
  assert.deepEqual(panLimits({ s: 2, iw: 400, ih: 300, w: 400, h: 700 }), { x: 200, y: 0 });   // 600 px high: still fits, stays centred
  assert.deepEqual(panLimits({ s: 3.5, iw: 400, ih: 300, w: 400, h: 700 }), { x: 500, y: 175 });
});

test('clampPan: inside the limits, sign kept, no -0', () => {
  const lim = { x: 200, y: 0 };
  assert.deepEqual(clampPan({ s: 2, tx: 150, ty: 40 }, lim), { s: 2, tx: 150, ty: 0 });
  assert.deepEqual(clampPan({ s: 2, tx: -350, ty: -40 }, lim), { s: 2, tx: -200, ty: 0 });
  assert.ok(Object.is(clampPan({ s: 2, tx: 0, ty: -5 }, lim).ty, 0));
});

test('zoomAt: the point under the finger stays where it is; 1× always centred', () => {
  const z = zoomAt({ s: 1, tx: 0, ty: 0 }, 2, 100, -50);
  assert.deepEqual(z, { s: 2, tx: -100, ty: 50 });
  // the image point under (100, -50) before: (100 - 0) / 1 = 100; after: (100 - (-100)) / 2 = 100
  assert.equal((100 - z.tx) / z.s, 100);
  // centre stays centred
  assert.deepEqual(zoomAt({ s: 1, tx: 0, ty: 0 }, 3.5, 0, 0), { s: 3.5, tx: 0, ty: 0 });
  // from 2× to 3.5× about a point keeps it as well
  const z2 = zoomAt(z, 3.5, 40, 0);
  assert.ok(Math.abs((40 - z.tx) / z.s - (40 - z2.tx) / z2.s) < 1e-9);
  assert.deepEqual(zoomAt(z, 1, 40, 0), { s: 1, tx: 0, ty: 0 });
});

test('panHandoff: the image pans up to its edge; only what goes beyond left/right moves on to the neighbour', () => {
  const lim = { x: 200, y: 100 };
  // inside the limits: everything pans, nothing is handed over
  assert.deepEqual(panHandoff({ tx: 0, ty: 0, dx: -150, dy: 30, lim }), { tx: -150, ty: 30, over: 0 });
  // started mid-way, the edge is reached on the way: the rest goes to the carousel
  assert.deepEqual(panHandoff({ tx: -150, ty: 0, dx: -120, dy: 0, lim }), { tx: -200, ty: 0, over: -70 });
  // already at the right edge of the image (tx = -limit), dragging on to the left: all of it is handed over (next image)
  assert.deepEqual(panHandoff({ tx: -200, ty: 0, dx: -90, dy: 0, lim }), { tx: -200, ty: 0, over: -90 });
  // the other way: back into the image, nothing handed over
  assert.deepEqual(panHandoff({ tx: -200, ty: 0, dx: 90, dy: 0, lim }), { tx: -110, ty: 0, over: 0 });
  // beyond the bottom: clamped, never handed over (a zoomed image does not close)
  assert.deepEqual(panHandoff({ tx: 0, ty: 90, dx: 0, dy: 300, lim }), { tx: 0, ty: 100, over: 0 });
  // an image that fits across (limit 0): every horizontal px goes to the carousel
  assert.deepEqual(panHandoff({ tx: 0, ty: 0, dx: 50, dy: 0, lim: { x: 0, y: 100 } }), { tx: 0, ty: 0, over: 50 });
});

test('panHandoff + swipeResult: a zoomed image pages only once its edge is reached', () => {
  const lim = { x: 200, y: 0 }, g = { dy: 0, dt: 600, width: 400, height: 800, index: 1, n: 3 };
  const mid = panHandoff({ tx: 0, ty: 0, dx: -190, dy: 0, lim });
  assert.equal(swipeResult({ ...g, dx: mid.over }), null);
  const edge = panHandoff({ tx: -120, ty: 0, dx: -190, dy: 0, lim });
  assert.equal(edge.over, -110);
  assert.equal(swipeResult({ ...g, dx: edge.over }), 'next');
});

test('isDoubleTap: within DOUBLE_TAP_MS and DOUBLE_TAP_PX of the tap before', () => {
  const a = { t: 1000, x: 100, y: 100 };
  assert.equal(isDoubleTap(null, a), false);
  assert.equal(isDoubleTap(a, { t: 1000 + DOUBLE_TAP_MS, x: 110, y: 95 }), true);
  assert.equal(isDoubleTap(a, { t: 1001 + DOUBLE_TAP_MS, x: 100, y: 100 }), false);   // too late
  assert.equal(isDoubleTap(a, { t: 1100, x: 100 + DOUBLE_TAP_PX + 1, y: 100 }), false); // too far
  assert.equal(isDoubleTap(a, { t: 900, x: 100, y: 100 }), false);                      // clock went back
});

test('trackOffset: follows the drag, damped where there is no neighbour', () => {
  assert.equal(trackOffset(-100, 1, 3), -100);
  assert.equal(trackOffset(100, 1, 3), 100);
  assert.equal(trackOffset(-100, 2, 3), -20);   // last image: sqrt(100) × 2
  assert.equal(trackOffset(100, 0, 3), 20);
  assert.equal(trackOffset(0, 0, 1), 0);
});

// ---- fling

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b} (±${eps})`);
/** a glide run frame by frame (16 ms) until it is done; returns the end state and the number of frames */
const glide = (f, lim, max = 1000) => {
  let n = 0, cur = { ...f, done: false };
  while (!cur.done && n < max) { cur = flingStep(cur, 16, lim); n++; }
  return { ...cur, frames: n };
};
const WIDE = { x: 10000, y: 10000 };

test('releaseVelocity: the way over the last FLING_WINDOW ms, older samples do not count', () => {
  // slow at first (1 px/ms), then fast (3 px/ms) in the last 100 ms
  const s = [];
  for (let t = 0; t <= 200; t += 10) s.push({ t, x: t <= 100 ? t : 100 + 3 * (t - 100), y: 0 });
  const v = releaseVelocity(s, 200);
  near(v.vx, 3); near(v.vy, 0);
  const d = releaseVelocity([{ t: 0, x: 0, y: 0 }, { t: 50, x: -50, y: 25 }], 50);
  near(d.vx, -1); near(d.vy, 0.5);
  assert.equal(FLING_WINDOW, 100);
});

test('releaseVelocity: 0 when the finger rested before it lifted, for a single sample and for samples too close in time', () => {
  const s = [{ t: 0, x: 0, y: 0 }, { t: 50, x: 100, y: 0 }];
  assert.deepEqual(releaseVelocity(s, 50 + FLING_IDLE + 1), { vx: 0, vy: 0 });
  assert.ok(releaseVelocity(s, 50 + FLING_IDLE).vx > 0);
  assert.deepEqual(releaseVelocity([{ t: 0, x: 0, y: 0 }], 0), { vx: 0, vy: 0 });
  assert.deepEqual(releaseVelocity([{ t: 0, x: 0, y: 0 }, { t: 4, x: 40, y: 0 }], 4), { vx: 0, vy: 0 });
  assert.deepEqual(releaseVelocity([], 0), { vx: 0, vy: 0 });
  // @ts-expect-error no list
  assert.deepEqual(releaseVelocity(null, 0), { vx: 0, vy: 0 });
});

test('releaseVelocity: capped at FLING_MAX, the direction stays', () => {
  const v = releaseVelocity([{ t: 0, x: 0, y: 0 }, { t: 10, x: 300, y: -400 }], 10);
  near(Math.hypot(v.vx, v.vy), FLING_MAX);
  near(v.vx / v.vy, -0.75);
});

test('flingStart: no glide below FLING_MIN, a glide from it on', () => {
  assert.equal(flingStart({ tx: 0, ty: 0 }, { vx: FLING_MIN * 0.9, vy: 0 }, WIDE), null);
  assert.equal(flingStart({ tx: 0, ty: 0 }, { vx: 0, vy: 0 }, WIDE), null);
  assert.deepEqual(flingStart({ tx: 5, ty: -5 }, { vx: 1, vy: -0.5 }, WIDE), { tx: 5, ty: -5, vx: 1, vy: -0.5 });
});

test('flingStart: towards a near edge the speed is lowered so the glide ends at the limit; at the limit that axis does not glide', () => {
  const lim = { x: 200, y: 50 };
  const f = flingStart({ tx: -100, ty: 0 }, { vx: -2, vy: 0 }, lim);
  assert.ok(f);
  near(f.vx * FLING_TAU, -100);   // the whole glide covers exactly the 100 px left to the edge
  const away = flingStart({ tx: -100, ty: 0 }, { vx: 0.5, vy: 0 }, lim);   // away from the edge: 162 px of 300 room, unchanged
  assert.equal(away && away.vx, 0.5);
  const atEdge = flingStart({ tx: 200, ty: 0 }, { vx: 2, vy: 1 }, lim);   // x at its limit: only y glides (and only the 50 px it has)
  assert.ok(atEdge);
  assert.equal(atEdge.vx, 0);
  near(atEdge.vy * FLING_TAU, 50);
  assert.equal(flingStart({ tx: 200, ty: 50 }, { vx: 2, vy: 1 }, lim), null);   // in the corner: nothing left
  assert.equal(flingStart({ tx: 0, ty: 0 }, { vx: 2, vy: 1 }, { x: 0, y: 0 }), null);   // nothing to pan (not zoomed)
});

test('flingStep: exponential decay with FLING_TAU – after tau ms the speed is 1/e, the way v · tau · (1 − 1/e)', () => {
  assert.ok(FLING_TAU >= 300 && FLING_TAU <= 350);
  const s = flingStep({ tx: 0, ty: 0, vx: 2, vy: -1 }, FLING_TAU, WIDE);
  near(s.vx, 2 / Math.E); near(s.vy, -1 / Math.E);
  near(s.tx, 2 * FLING_TAU * (1 - 1 / Math.E)); near(s.ty, -FLING_TAU * (1 - 1 / Math.E));
  assert.equal(s.done, false);
  // frame size does not matter: 20 steps of 16 ms land where one step of 320 ms lands
  let a = { tx: 0, ty: 0, vx: 1.5, vy: 0 };
  for (let i = 0; i < 20; i++) a = flingStep(a, 16, WIDE);
  const b = flingStep({ tx: 0, ty: 0, vx: 1.5, vy: 0 }, 320, WIDE);
  near(a.tx, b.tx, 1e-6); near(a.vx, b.vx, 1e-9);
});

test('flingStep: the glide runs on in the release direction, slows down every frame and ends below FLING_STOP after about v · tau', () => {
  const lim = { x: 2000, y: 2000 };
  let cur = { tx: 0, ty: 0, vx: -2, vy: 0, done: false }, prevV = 2, prevX = 0;
  for (let i = 0; i < 5; i++) {
    cur = flingStep(cur, 16, lim);
    assert.ok(cur.tx < prevX, 'moves on to the left');
    assert.ok(Math.abs(cur.vx) < prevV, 'slows down');
    prevV = Math.abs(cur.vx); prevX = cur.tx;
  }
  const end = glide({ tx: 0, ty: 0, vx: -2, vy: 0 }, lim);
  assert.ok(end.done);
  assert.ok(Math.abs(end.vx) < FLING_STOP);
  near(end.tx, -2 * FLING_TAU, FLING_STOP * FLING_TAU + 1);   // short of v · tau only by the rest below FLING_STOP
  assert.ok(end.frames * 16 > 1000 && end.frames * 16 < 3000, `glides ${end.frames * 16} ms`);
});

test('flingStep: never beyond the limits – an axis that reaches its limit stops there, the other one glides on', () => {
  const lim = { x: 100, y: 1000 };
  const s = flingStep({ tx: 90, ty: 0, vx: 3, vy: 1 }, 64, lim);
  assert.equal(s.tx, 100); assert.equal(s.vx, 0);
  assert.ok(s.ty > 0 && s.vy > 0);
  const end = glide({ tx: 90, ty: 0, vx: 3, vy: 1 }, lim);
  assert.equal(end.tx, 100);
  assert.ok(Math.abs(end.ty) <= 1000);
  const neg = flingStep({ tx: -95, ty: 0, vx: -3, vy: 0 }, 16, lim);
  assert.equal(neg.tx, -100); assert.ok(neg.done);
});

test('flingStart + flingStep: a fast fling towards a near edge comes to rest at it, softly (slowing down on every frame, no jump to the edge)', () => {
  const lim = { x: 300, y: 0 };
  const f = flingStart({ tx: 200, ty: 0 }, { vx: 4, vy: 0 }, lim);
  assert.ok(f);
  let cur = { ...f, done: false }, step = Infinity, n = 0;
  while (!cur.done && n < 1000) {
    const nx = flingStep(cur, 16, lim);
    const d = nx.tx - cur.tx;
    assert.ok(d >= 0 && d <= step + 1e-9, 'every frame moves less than the one before');
    step = d; cur = nx; n++;
  }
  assert.ok(cur.tx <= 300 && cur.tx > 300 - FLING_STOP * FLING_TAU - 1, `rests at ${cur.tx}`);
  assert.ok(step < 0.5, 'the last frame barely moves');
});

test('flingStep: no time constant means no glide', () => {
  assert.equal(flingStep({ tx: 1, ty: 2, vx: 3, vy: 4 }, 16, WIDE, 0).done, true);
});
