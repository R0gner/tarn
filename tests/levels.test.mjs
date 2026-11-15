// tarn · back by levels (js/levels.js): stack per route, Back steps, history plan.
import test from 'node:test';
import assert from 'node:assert/strict';
import { levelOf, stackFor, withLayer, withoutLayer, backStep, plan } from '../js/levels.js';

const D = 'overview';
const r = (view, params = {}) => ({ view, params });
const hashes = (st) => st.map((e) => (e.layer ? `${e.hash}+L${e.layer}` : e.hash));

test('levelOf: default view 0, another view 1, an open detail 2', () => {
  assert.equal(levelOf(r(D), D), 0);
  assert.equal(levelOf(r(D, { q: 'x' }), D), 0);
  assert.equal(levelOf(r('jobs'), D), 1);
  assert.equal(levelOf(r('jobs', { open: 'a' }), D), 2);
  assert.equal(levelOf(r(D, { open: 'a' }), D), 2);
});

test('stackFor: base, view, detail – never more', () => {
  assert.deepEqual(hashes(stackFor(r(D), D)), ['#/overview']);
  assert.deepEqual(hashes(stackFor(r('jobs'), D)), ['#/overview', '#/jobs']);
  assert.deepEqual(hashes(stackFor(r('jobs', { open: 'a' }), D)), ['#/overview', '#/jobs', '#/jobs?open=a']);
  // a detail opened on the default view sits on top of it
  assert.deepEqual(hashes(stackFor(r(D, { open: 'a' }), D)), ['#/overview', '#/overview?open=a']);
  // parameters of the view stay below its detail
  assert.deepEqual(hashes(stackFor(r('jobs', { q: 'x', open: 'a' }), D)), ['#/overview', '#/jobs?q=x', '#/jobs?q=x&open=a']);
});

test('stackFor: the base keeps the default view as the user left it (filters), never a detail or another view', () => {
  assert.deepEqual(hashes(stackFor(r('jobs'), D, { hash: '#/overview?q=x' })), ['#/overview?q=x', '#/jobs']);
  assert.deepEqual(hashes(stackFor(r('jobs'), D, { hash: '#/hosts' })), ['#/overview', '#/jobs']);
  assert.deepEqual(hashes(stackFor(r('jobs'), D, { hash: '#/overview?open=a' })), ['#/overview', '#/jobs']);
  // on the default view itself the new parameters replace the base
  assert.deepEqual(hashes(stackFor(r(D, { q: 'y' }), D, { hash: '#/overview?q=x' })), ['#/overview?q=y']);
});

test('the history never grows with use: default → A → B → C keeps two entries, back to default one', () => {
  let st = stackFor(r(D), D);
  for (const v of ['jobs', 'hosts', 'deploy']) { st = stackFor(r(v), D, st[0]); assert.equal(st.length, 2); }
  st = stackFor(r('hosts', { open: 'n' }), D, st[0]); assert.equal(st.length, 3);
  st = stackFor(r('jobs', { open: 'j' }), D, st[0]); assert.equal(st.length, 3);   // “Open in …” from a detail replaces
  st = stackFor(r(D), D, st[0]); assert.equal(st.length, 1);
});

test('layers: on top with the hash below; leaving removes only that one', () => {
  let st = stackFor(r('jobs', { open: 'a' }), D);
  st = withLayer(st, 1); st = withLayer(st, 2);
  assert.deepEqual(hashes(st), ['#/overview', '#/jobs', '#/jobs?open=a', '#/jobs?open=a+L1', '#/jobs?open=a+L2']);
  assert.deepEqual(hashes(withoutLayer(st, 1)), ['#/overview', '#/jobs', '#/jobs?open=a', '#/jobs?open=a+L2']);
});

test('backStep: closes the topmost entry only; the base stays and a further step is an exit', () => {
  const st = withLayer(stackFor(r('jobs', { open: 'a' }), D), 7);
  let s = backStep(st, 1);
  assert.deepEqual(hashes(s.stack), ['#/overview', '#/jobs', '#/jobs?open=a']);
  assert.deepEqual(s.closed.map((e) => e.layer), [7]);
  assert.equal(s.exit, false);
  s = backStep(s.stack, 1); assert.deepEqual(hashes(s.stack), ['#/overview', '#/jobs']);
  s = backStep(s.stack, 1); assert.deepEqual(hashes(s.stack), ['#/overview']); assert.equal(s.exit, false);
  s = backStep(s.stack, 1); assert.deepEqual(hashes(s.stack), ['#/overview']); assert.equal(s.exit, true);
  // two steps at once (history.go(-2)): the two topmost close, top first
  const two = backStep(withLayer(withLayer(stackFor(r(D), D), 1), 2), 2);
  assert.deepEqual(two.closed.map((e) => e.layer), [2, 1]);
});

test('plan: push the missing entries once the user touched the page, go back when the history holds more, otherwise replace', () => {
  const st3 = stackFor(r('jobs', { open: 'a' }), D);
  assert.deepEqual(plan({ phys: 1, stack: st3, canPush: true }), { push: 1, replace: false });
  assert.deepEqual(plan({ phys: 0, stack: st3, canPush: true }), { push: 2, replace: false });   // a deep link, seeded with the first touch
  assert.deepEqual(plan({ phys: 0, stack: st3, canPush: false }), { push: 0, replace: true });  // before any user activation: no entry
  assert.deepEqual(plan({ phys: 2, stack: st3 }), { push: 0, replace: true });
  assert.deepEqual(plan({ phys: 2, stack: stackFor(r(D), D) }), { go: -2, push: 0, replace: false });
  // installed app: the guard below the base
  assert.deepEqual(plan({ phys: 0, stack: stackFor(r(D), D), guard: 1, canPush: true }), { push: 1, replace: false });
  assert.deepEqual(plan({ phys: 1, stack: stackFor(r(D), D), guard: 1 }), { push: 0, replace: true });
});
