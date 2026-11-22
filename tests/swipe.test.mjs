// tarn · swipe between the parts of a segmented control (js/swipe-data.js): the axis of a touch, the rubber band, what a release does, the
// marker in between and which elements own sideways gestures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  swipeAxis, paneOffset, paneRelease, paneProgress, markerAt, scrollsSideways, AXIS_SLOP, AXIS_RATIO, PANE_SHARE, PANE_MIN, PANE_SPEED,
} from '../js/swipe-data.js';

test('swipeAxis: undecided inside the slop, sideways only when clearly flatter, vertical wins otherwise', () => {
  assert.equal(swipeAxis(0, 0), null);
  assert.equal(swipeAxis(AXIS_SLOP - 1, AXIS_SLOP - 1), null);
  assert.equal(swipeAxis(-AXIS_SLOP, 0), 'x');
  assert.equal(swipeAxis(30, 30), 'y');                       // diagonal: the page scrolls
  assert.equal(swipeAxis(30, 30 / AXIS_RATIO), 'x');          // exactly at the ratio: sideways
  assert.equal(swipeAxis(30, 30 / AXIS_RATIO + 1), 'y');
  assert.equal(swipeAxis(2, -40), 'y');
  assert.equal(swipeAxis(Number.NaN, 40), null);
  assert.equal(swipeAxis(12, 0, 20), null);                   // own slop
});

test('paneOffset: follows the finger towards a neighbour, at most one width; a rubber band at the ends', () => {
  assert.equal(paneOffset(-120, 0, 3, 390), -120);
  assert.equal(paneOffset(80, 1, 3, 390), 80);
  assert.equal(paneOffset(-500, 1, 3, 390), -390);
  assert.equal(paneOffset(0, 1, 3, 390), 0);
  const band = paneOffset(200, 0, 3, 390);                    // before the first part
  assert.ok(band > 0 && band < 40, `rubber band ${band}`);
  assert.equal(band, Math.sqrt(200) * 2);
  assert.ok(paneOffset(-200, 2, 3, 390) < 0 && paneOffset(-200, 2, 3, 390) > -40);   // after the last part
  assert.equal(paneOffset(10_000, 0, 3, 100), 25);            // the band never pulls more than a quarter
  assert.equal(paneOffset(-50, 0, 1, 390), -Math.sqrt(50) * 2);   // a single part: both sides blocked
});

test('paneRelease: far enough or fast enough switches to the neighbour, never beyond the ends', () => {
  const w = 400;
  assert.equal(paneRelease({ dx: -PANE_SHARE * w, dt: 1000, width: w, index: 0, n: 3 }), 1);
  assert.equal(paneRelease({ dx: -PANE_SHARE * w + 1, dt: 1000, width: w, index: 0, n: 3 }), 0);
  assert.equal(paneRelease({ dx: PANE_SHARE * w, dt: 1000, width: w, index: 2, n: 3 }), 1);
  assert.equal(paneRelease({ dx: -PANE_MIN, dt: PANE_MIN / PANE_SPEED, width: w, index: 1, n: 3 }), 2);   // a flick
  assert.equal(paneRelease({ dx: -(PANE_MIN - 1), dt: 1, width: w, index: 1, n: 3 }), 1);                // too short for a flick
  assert.equal(paneRelease({ dx: 300, dt: 100, width: w, index: 0, n: 3 }), 0);   // first: no wrap to the last
  assert.equal(paneRelease({ dx: -300, dt: 100, width: w, index: 2, n: 3 }), 2);  // last: no wrap to the first
  assert.equal(paneRelease({ dx: 0, dt: 0, width: 0, index: 1, n: 3 }), 1);
});

test('paneProgress and markerAt: the marker glides with the pulled-in share', () => {
  assert.equal(paneProgress(-100, 400), 0.25);
  assert.equal(paneProgress(600, 400), 1);
  assert.equal(paneProgress(10, 0), 0);
  const a = { x: 2, w: 80 }, b = { x: 86, w: 120 };
  assert.deepEqual(markerAt(a, b, 0), a);
  assert.deepEqual(markerAt(a, b, 1), b);
  assert.deepEqual(markerAt(a, b, 0.5), { x: 44, w: 100 });
  assert.deepEqual(markerAt(a, b, 2), b);
  assert.deepEqual(markerAt(a, b, Number.NaN), a);
});

test('scrollsSideways: only an element that can scroll and is wider than its box', () => {
  assert.equal(scrollsSideways({ overflowX: 'auto', scrollWidth: 800, clientWidth: 390 }), true);
  assert.equal(scrollsSideways({ overflowX: 'scroll', scrollWidth: 800, clientWidth: 390 }), true);
  assert.equal(scrollsSideways({ overflowX: 'auto', scrollWidth: 390, clientWidth: 390 }), false);   // fits: the swipe is free
  assert.equal(scrollsSideways({ overflowX: 'hidden', scrollWidth: 800, clientWidth: 390 }), false);
  assert.equal(scrollsSideways({ overflowX: 'visible', scrollWidth: 800, clientWidth: 390 }), false);
});
