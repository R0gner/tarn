// tarn · images (js/images-data.js): the image list, stepping, preloading, what a swipe in the viewer does, and the zoom (steps, pan limits,
// zooming about a point, the hand-over to the neighbour at the edge, double taps).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeImages, clampIndex, stepIndex, neighbours, swipeResult, SWIPE_MIN, nextZoomStep, clampScale, panLimits, clampPan, zoomAt, panHandoff,
  isDoubleTap, trackOffset, ZOOM_STEPS, ZOOM_MAX, DOUBLE_TAP_MS, DOUBLE_TAP_PX,
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
