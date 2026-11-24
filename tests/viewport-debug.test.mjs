// tarn · viewport check: only the parameter tn-debug=viewport (query or after the hash) starts the overlay (round 11b)
import test from 'node:test';
import assert from 'node:assert/strict';
import { wantsViewportDebug } from '../js/viewport-debug.js';

test('viewport check: only with tn-debug=viewport, in the query or in the hash part', () => {
  assert.equal(wantsViewportDebug('https://b.example/'), false);
  assert.equal(wantsViewportDebug('https://b.example/#/containers?tab=host'), false);
  assert.equal(wantsViewportDebug('https://b.example/?tn-debug=viewport#/containers'), true);
  assert.equal(wantsViewportDebug('https://b.example/#/containers?tab=host&tn-debug=viewport'), true);
  assert.equal(wantsViewportDebug('https://b.example/?tn-debug=layers,viewport'), true);
  assert.equal(wantsViewportDebug('https://b.example/?tn-debug=viewports'), false);
});
