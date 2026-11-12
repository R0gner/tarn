// package.json: no dependencies, no install scripts, exports and `files` agree with the core/full lists of tools/lib/kit-files.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CORE, SHELL, ASSETS, profileFiles } from '../tools/lib/kit-files.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('package.json: private ES module package without dependencies and install scripts', () => {
  assert.equal(pkg.name, '@r0gner/tarn');
  assert.equal(pkg.private, true);
  assert.equal(pkg.type, 'module');
  for (const k of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies', 'bundledDependencies', 'scripts', 'bin', 'workspaces']) assert.ok(!(k in pkg), `unexpected ${k}`);
  assert.equal(pkg.version, read('VERSION').trim(), 'version = VERSION (node tools/package.mjs fixes it)');
});

test('package.json: `files` is exactly the full profile (the list vendor.mjs copies)', () => {
  assert.deepEqual(pkg.files, profileFiles('full', ROOT), 'run node tools/package.mjs after changing tools/lib/kit-files.mjs');
  for (const f of ['LICENSE', 'NOTICE', 'VERSION', 'js/core.js', 'js/tarn.js', 'css/core.css', 'css/tokens.css']) assert.ok(pkg.files.includes(f), f);
  for (const f of pkg.files) {
    const notRuntime = /^(tests|tools|gallery|example|starter|\.github)\//.test(f) || f.endsWith('.png') || (f.endsWith('.md') && !/SOURCES\.md$/.test(f));
    assert.ok(!notRuntime, `not a runtime file: ${f}`);
  }
});

test('package.json: exports resolve to existing files; . is the full barrel, ./core the core entry; css, fonts and icons are all reachable', () => {
  const ex = pkg.exports;
  assert.equal(ex['.'], './js/tarn.js');
  assert.equal(ex['./core'], './js/core.js');
  assert.ok(SHELL.js.includes('js/tarn.js') && CORE.js.includes('js/core.js'));
  for (const [key, target] of Object.entries(ex)) {
    if (!key.includes('*')) assert.ok(fs.existsSync(path.join(ROOT, target)), `${key} → ${target}`);
    else assert.ok(fs.readdirSync(path.join(ROOT, path.dirname(target))).length > 0, `${key} → ${target}`);
  }
  // every file below css/, fonts/ and icons/ that ships is covered by a pattern export
  for (const f of pkg.files.filter((x) => /^(css|fonts|icons)\//.test(x))) assert.ok(ex[`./${f.split('/')[0]}/*`], `no export for ${f}`);
  assert.deepEqual(ASSETS.map(([d]) => d).sort(), ['fonts', 'icons']);
});

test('package.json: the package name resolves itself (import.meta.resolve through exports)', () => {
  const at = (spec) => fileURLToPath(import.meta.resolve(spec)).slice(ROOT.length + 1);
  assert.equal(at('@r0gner/tarn'), 'js/tarn.js');
  assert.equal(at('@r0gner/tarn/core'), 'js/core.js');
  assert.equal(at('@r0gner/tarn/css/core.css'), 'css/core.css');
  assert.equal(at('@r0gner/tarn/fonts/inter-latin.woff2'), 'fonts/inter-latin.woff2');
  assert.equal(at('@r0gner/tarn/icons/check.svg'), 'icons/check.svg');
  assert.throws(() => import.meta.resolve('@r0gner/tarn/js/shell.js'), 'internals are not exported');
});

test('core list: js/core.js reaches exactly the core files, no shell file', () => {
  const seen = new Set();
  const visit = (f) => {
    if (seen.has(f)) return;
    seen.add(f);
    const code = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of code.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.[^'"]+)['"]/g)) visit(path.relative(ROOT, path.resolve(path.dirname(path.join(ROOT, f)), m[1])).split(path.sep).join('/'));
  };
  visit('js/core.js');
  for (const f of seen) assert.ok(CORE.js.includes(f), `core.js reaches ${f}, which is not in the core list`);
  // a core file that nothing in the core uses is probably in the wrong list (theme-init.js is a classic script, loaded by the page)
  for (const f of CORE.js.filter((x) => x !== 'js/theme-init.js')) assert.ok(seen.has(f), `${f} is in the core list but js/core.js does not reach it`);
});

test('npm pack --dry-run lists exactly `files` plus package.json (skipped without npm)', (t) => {
  const r = spawnSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, npm_config_cache: path.join(os.tmpdir(), 'tn-npm-cache') } });
  if (r.error || r.status !== 0) return t.skip(`npm pack not available (${r.error?.code || r.status})`);
  const out = JSON.parse(r.stdout)[0];
  const got = out.files.map((f) => f.path).sort();
  const want = [...pkg.files, 'package.json', ...got.filter((x) => /^README(\.md)?$/i.test(x))].sort();
  assert.deepEqual(got, want);
});
