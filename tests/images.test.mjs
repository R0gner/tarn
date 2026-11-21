// tarn · images (js/images-data.js): the image list, stepping, preloading and what a swipe in the viewer does.
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeImages, clampIndex, stepIndex, neighbours, swipeResult, SWIPE_MIN } from '../js/images-data.js';

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
