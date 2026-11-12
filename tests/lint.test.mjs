// node --test tests/  ·  lint rules on small examples (positive control for tools/lint.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lintCss, lintJs, lintHtml } from '../tools/lint.mjs';

function run(fn, name, src, opts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dk-lint-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, src);
  const out = [];
  try { fn(file, (f) => out.push(f), opts); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  return out.map((f) => `${f.rule} ${f.text}`);
}

test('CSS: literals, transitions, keyframes', () => {
  const r = run(lintCss, 'x.css', `/* 9px in a comment */
@media (max-width: 599px) { .a { gap: var(--dk-s2); } }
.b { color: #fff; padding: 6px 0; border-radius: 3px; transition: opacity var(--dk-t), height 90ms; }
.c { animation: spin 1s infinite; } @keyframes spin { to { width: 10%; transform: none; } }`);
  assert.deepEqual(r.sort(), ['color color: #fff', 'duration transition: 90ms', 'duration animation: 1s', 'keyframes @keyframes spin: width', 'radius border-radius: 3px', 'size padding: 6px', 'transition transition: height'].sort());
});

test('JS: innerHTML, timer literals, emoji', () => {
  const r = run(lintJs, 'x.js', `// innerHTML in a comment does not count
el.innerHTML = s; setTimeout(done, 200); setTimeout(done, ms); const t = 'Fertig ✅';`);
  assert.deepEqual(r.sort(), ['emoji „✅“', 'html innerHTML', 'timer setTimeout(…, 200)'].sort());
});

test('JS: native title tooltips', () => {
  const r = run(lintJs, 'x.js', `h('button', { class: 'a', title: label }, x); el.title = 'x'; document.title = 'ok'; a.setAttribute('title', t);
s('title', null, 'Segment'); card({ title: 'Kartentitel' }); const o = { title: 'Detail' };`);
  assert.equal(r.filter((x) => x.startsWith('title')).length, 4);
});

test('HTML: favicon and title are required', () => {
  const ok = '<!doctype html><title>Board · Test</title><link rel="icon" type="image/svg+xml" href="icon.svg">';
  assert.deepEqual(run(lintHtml, 'ok.html', ok), []);
  assert.deepEqual(run(lintHtml, 'a.html', '<title>Board</title>'), ['page kein <link rel="icon">']);
  assert.deepEqual(run(lintHtml, 'b.html', '<link rel="icon" href="x.svg">'), ['page kein <title>']);
  assert.deepEqual(run(lintHtml, 'c.html', '<title> </title><link rel="icon">'), ['page kein <link rel="icon">', 'page kein <title>']);
  assert.deepEqual(run(lintHtml, 'd.html', '<!-- <link rel="icon" href="x"> --><title>T</title>'), ['page kein <link rel="icon">']);
  assert.deepEqual(run(lintHtml, 'e.html', '<title>T</title><link href="x.svg" rel="icon">'), []);
});

test('JS: visible text must come from t()', () => {
  const r = run(lintJs, 'x.js', `h('button', { 'aria-label': 'Close panel' }, 'Save changes'); const o = { label: 'Müll', title: t('x.title'), sub: \`\${a}\` }; toast('Done now');
const ok = { label: 'x', class: 'dk-btn', value: 'a-b' };`, { i18n: true });
  assert.deepEqual(r.filter((x) => x.startsWith('i18n')).sort(), ["i18n 'aria-label': „Close panel“", 'i18n label: „Müll“', 'i18n „Done now“', 'i18n „Müll“', 'i18n „Save changes“'].sort());
});
