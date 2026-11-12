// node --test tests/  ·  lint rules on small examples (positive control for tools/lint.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { lintCss, lintJs, lintHtml, lintLegacy, lintClassified, lintLayers, lintStarter } from '../tools/lint.mjs';

function run(fn, name, src, opts) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tn-lint-'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, src);
  const out = [];
  try { fn(file, (f) => out.push(f), opts); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  return out.map((f) => `${f.rule} ${f.text}`);
}

test('CSS: literals, transitions, keyframes', () => {
  const r = run(lintCss, 'x.css', `/* 9px in a comment */
@media (max-width: 599px) { .a { gap: var(--tn-s2); } }
.b { color: #fff; padding: 6px 0; border-radius: 3px; transition: opacity var(--tn-t), height 90ms; }
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
const ok = { label: 'x', class: 'tn-btn', value: 'a-b' };`, { i18n: true });
  assert.deepEqual(r.filter((x) => x.startsWith('i18n')).sort(), ["i18n 'aria-label': „Close panel“", 'i18n label: „Müll“', 'i18n „Done now“', 'i18n „Müll“', 'i18n „Save changes“'].sort());
});

test('legacy: old name and prefix are found outside the allowed files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tn-legacy-'));
  const old = 'dash' + 'kit', pre = 'd' + 'k-';
  try {
    fs.writeFileSync(path.join(dir, 'a.css'), `.${pre}btn { color: var(--${pre}ok); }\n.tn-fine {}\n`);
    fs.writeFileSync(path.join(dir, 'b.md'), `# ${old}\n`);
    fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), `renamed from ${old}\n`);
    fs.mkdirSync(path.join(dir, 'js'));
    fs.writeFileSync(path.join(dir, 'js', 'theme-init.js'), `localStorage.getItem('${pre}theme');\n`);
    fs.writeFileSync(path.join(dir, `${old}.js`), '');
    const out = [];
    lintLegacy((f) => out.push(`${f.file}:${f.line}`), dir);
    assert.deepEqual(out.sort(), ['a.css:1', 'b.md:1', `${old}.js:0`]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('classified: a css/js file outside the core/shell lists is found, and so is a listed file that is gone', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tn-class-'));
  try {
    fs.mkdirSync(path.join(dir, 'js'));
    fs.mkdirSync(path.join(dir, 'css'));
    fs.writeFileSync(path.join(dir, 'js', 'dom.js'), '');           // listed (core)
    fs.writeFileSync(path.join(dir, 'js', 'table.js'), '');         // listed (shell)
    fs.writeFileSync(path.join(dir, 'js', 'stray.js'), '');         // not listed
    fs.writeFileSync(path.join(dir, 'css', 'stray.css'), '');
    const out = [];
    lintClassified((f) => out.push(`${f.file}|${f.text.split(':')[0].split(' (')[0]}`), dir);
    assert.ok(out.includes('css/stray.css|not in tools/lib/kit-files.mjs'));
    assert.ok(out.includes('js/stray.js|not in tools/lib/kit-files.mjs'));
    assert.ok(!out.some((x) => x.startsWith('js/dom.js') || x.startsWith('js/table.js')));
    assert.ok(out.some((x) => x.startsWith('tools/lib/kit-files.mjs|listed but missing')));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('layers: core files must not import shell files (static, export from, dynamic); shell may import core', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tn-layers-'));
  try {
    fs.mkdirSync(path.join(dir, 'js'));
    fs.writeFileSync(path.join(dir, 'js', 'dom.js'), "import { icon } from './icons.js';\nimport { card } from './components.js';\n// import './table.js'\n");
    fs.writeFileSync(path.join(dir, 'js', 'format.js'), "export * from './widgets.js';\nexport { x } from './dom.js';\n");
    fs.writeFileSync(path.join(dir, 'js', 'primitives.js'), "const l = () => import('./shell.js');\n");
    fs.writeFileSync(path.join(dir, 'js', 'icons.js'), "import { h } from './dom.js';\n");
    fs.writeFileSync(path.join(dir, 'js', 'table.js'), "import { h } from './dom.js';\nimport { button } from './primitives.js';\n"); // shell → core: fine
    const out = [];
    lintLayers((f) => out.push(`${f.file}:${f.line} ${f.text}`), dir);
    assert.deepEqual(out.sort(), ['js/dom.js:2 core imports shell: js/components.js', 'js/format.js:1 core imports shell: js/widgets.js', 'js/primitives.js:1 core imports shell: js/shell.js']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('starter: the plain page may import and load only core files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tn-starter-'));
  try {
    fs.mkdirSync(path.join(dir, 'starter'));
    fs.writeFileSync(path.join(dir, 'starter', 'ok.js'), "import { button } from '../js/core.js';\nimport m from './messages.js';\n");
    fs.writeFileSync(path.join(dir, 'starter', 'bad.js'), "import { createApp } from '../js/tarn.js';\nimport { card } from '../js/components.js';\n");
    fs.writeFileSync(path.join(dir, 'starter', 'index.html'), '<link rel="stylesheet" href="../css/core.css"><link rel="stylesheet" href="../css/components.css">\n<!-- <link rel="stylesheet" href="../css/charts.css"> -->');
    const out = [];
    lintStarter((f) => out.push(`${f.file}:${f.line} ${f.text}`), dir);
    assert.deepEqual(out.sort(), ['starter/bad.js:1 starter page imports a non-core file: js/tarn.js', 'starter/bad.js:2 starter page imports a non-core file: js/components.js', 'starter/index.html:1 starter page loads a non-core file: css/components.css']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
