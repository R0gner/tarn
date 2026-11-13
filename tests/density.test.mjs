// node --test tests/  ·  density: the stored/attribute state and the observer the shell uses to label its button (stubs for document and MutationObserver).
import { test } from 'node:test';
import assert from 'node:assert/strict';

function stubDom() {
  const attrs = new Map();
  const de = { getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null), setAttribute: (k, v) => { attrs.set(k, v); fire(); }, removeAttribute: (k) => { attrs.delete(k); fire(); } };
  const observers = [];
  const fire = () => observers.forEach((o) => o.live && o.cb([]));
  globalThis.document = { documentElement: de };
  globalThis.localStorage = { setItem() {}, removeItem() {} };
  globalThis.MutationObserver = class { constructor(cb) { this.cb = cb; this.live = false; observers.push(this); } observe(el, opts) { this.el = el; this.opts = opts; this.live = true; } disconnect() { this.live = false; } };
  return { de, observers };
}

test('watchDensity: called on every change of data-density, by whoever changes it; stops after disconnect', async () => {
  const { de, observers } = stubDom();
  const { getDensity, setDensity, watchDensity } = await import(`../js/density.js?${Math.random()}`);
  const seen = [];
  const stop = watchDensity((d) => seen.push(d));
  assert.deepEqual(observers[0].opts, { attributes: true, attributeFilter: ['data-density'] });
  assert.equal(observers[0].el, de);
  setDensity('comfortable');                       // a board
  de.removeAttribute('data-density');              // a page or the verify tools
  de.setAttribute('data-density', 'comfortable');
  assert.deepEqual(seen, ['comfortable', 'compact', 'comfortable']);
  assert.equal(getDensity(), 'comfortable');
  stop();
  setDensity('compact');
  assert.equal(seen.length, 3);
  assert.throws(() => setDensity('huge'), /unknown density/);
});

test('own headless Chrome: no D-Bus session address (an unanswered one blocks every HTTP navigation)', async () => {
  process.env.DBUS_SESSION_BUS_ADDRESS = 'unix:path=/nonexistent';
  const { chromeEnv } = await import('../tools/lib/cdp.mjs');
  const env = chromeEnv();
  assert.equal('DBUS_SESSION_BUS_ADDRESS' in env, false);
  assert.equal(env.TZ, 'Europe/Berlin');
  assert.ok(process.env.DBUS_SESSION_BUS_ADDRESS, "the caller's own environment is not changed");
});
