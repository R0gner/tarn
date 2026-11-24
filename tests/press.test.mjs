import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// round 11: Chrome on a phone sets :active at touchstart, before it knows whether a scroll or a swipe follows; every row the thumb touched lit up.
// The pressed look comes only from .is-down (js/press.js: mouse on pointerdown, touch as a flash after a real tap).
test('the kit styles no :active (pressed is .is-down only)', () => {
  const dir = new URL('../css/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.css'))) {
    const css = readFileSync(new URL(f, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.equal(/:active\b/.test(css), false, `${f} styles :active`);
  }
});
// a hover colour on a phone sticks to the last tapped element (a row stayed lit after its detail closed by swipe or Back)
test('every :hover rule sits under @media (hover: hover)', () => {
  const dir = new URL('../css/', import.meta.url);
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.css'))) {
    const lines = readFileSync(new URL(f, dir), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n');
    const bad = lines.filter((l) => l.includes(':hover') && !l.includes('@media (hover: hover)'));
    assert.deepEqual(bad, [], `${f}: :hover outside @media (hover: hover)`);
  }
});
