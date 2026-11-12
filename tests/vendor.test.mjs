import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collectSource, checkDir } from '../tools/vendor.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOL = path.join(ROOT, 'tools', 'vendor.mjs');
const run = (...args) => { const r = spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8' }); return { code: r.status, out: r.stdout + r.stderr }; };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tn-vendor-test-'));
const withTmp = (fn) => { const d = tmp(); try { return fn(d); } finally { fs.rmSync(d, { recursive: true, force: true }); } };
const walk = (base, d = base, o = []) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walk(base, p, o) : o.push(path.relative(base, p).split(path.sep).join('/')); } return o; };

test('vendor: copies only runtime files, writes SHA256SUMS in sha256sum format', () => withTmp((d) => {
  const to = path.join(d, 'board', 'vendor', 'tarn');
  const r = run('--to', to);
  assert.equal(r.code, 0, r.out);
  const files = walk(to);
  assert.ok(files.includes('js/tarn.js') && files.includes('css/tokens.css') && files.includes('VERSION') && files.includes('SHA256SUMS'));
  assert.ok(files.some((f) => f.startsWith('fonts/') && f.endsWith('.woff2')));
  for (const f of files) assert.ok(!/^(tests|tools|gallery|example|\.git)\//.test(f) && !f.endsWith('.svg') && !f.endsWith('.png'), `unexpected file ${f}`);
  const lines = fs.readFileSync(path.join(to, 'SHA256SUMS'), 'utf8').trim().split('\n');
  assert.equal(lines.length, files.length - 1);
  for (const l of lines) {
    const [, h, p] = /^([0-9a-f]{64})  (.+)$/.exec(l);
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(to, p))).digest('hex'), h, p);
  }
  assert.equal(fs.readFileSync(path.join(to, 'VERSION'), 'utf8'), fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8'));
  // the copy is byte-identical to the source files it was made from
  for (const [p, buf] of collectSource().files) assert.ok(fs.readFileSync(path.join(to, p)).equals(buf), p);
}));

test('vendor --check: intact copy → 0; changed, missing and foreign files → 1 and named', () => withTmp((d) => {
  const to = path.join(d, 'v');
  assert.equal(run('--to', to).code, 0);
  let r = run('--to', to, '--check');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /tarn \d+\.\d+\.\d+ in /);
  assert.match(r.out, /up to date/);
  fs.appendFileSync(path.join(to, 'css', 'base.css'), '\n/* local tweak */\n');
  fs.rmSync(path.join(to, 'js', 'dom.js'));
  fs.writeFileSync(path.join(to, 'js', 'mine.js'), '// not part of the kit\n');
  r = run('--to', to, '--check');
  assert.equal(r.code, 1);
  assert.match(r.out, /CHANGED locally \(1\): css\/base\.css/);
  assert.match(r.out, /MISSING \(1\): js\/dom\.js/);
  assert.match(r.out, /FOREIGN files \(1\): js\/mine\.js/);
  assert.deepEqual(checkDir(to).modified, ['css/base.css']);
}));

test('vendor update: refuses over local changes, --force overwrites, stale files are removed, foreign files stay', () => withTmp((d) => {
  const to = path.join(d, 'v');
  assert.equal(run('--to', to).code, 0);
  // pretend the previous copy came from an older kit: one file that no longer exists in the kit, listed in the manifest
  fs.mkdirSync(path.join(to, 'js', 'gone'), { recursive: true });
  fs.writeFileSync(path.join(to, 'js', 'gone', 'old.js'), 'export {};\n');
  const man = path.join(to, 'SHA256SUMS');
  fs.appendFileSync(man, `${crypto.createHash('sha256').update('export {};\n').digest('hex')}  js/gone/old.js\n`);
  fs.writeFileSync(path.join(to, 'README.local'), 'board notes\n');
  fs.writeFileSync(path.join(to, 'VERSION'), '0.0.1\n');
  let r = run('--to', to);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /update refused/);
  assert.match(r.out, /VERSION/);
  assert.equal(fs.readFileSync(path.join(to, 'VERSION'), 'utf8'), '0.0.1\n', 'a refused update changes nothing');
  r = run('--to', to, '--dry-run', '--force');
  assert.equal(r.code, 0);
  assert.match(r.out, /dry run/);
  assert.equal(fs.readFileSync(path.join(to, 'VERSION'), 'utf8'), '0.0.1\n');
  r = run('--to', to, '--force');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /0\.0\.1 → /);
  assert.ok(!fs.existsSync(path.join(to, 'js', 'gone')), 'stale file and its empty folder are removed');
  assert.ok(fs.existsSync(path.join(to, 'README.local')), 'foreign file stays');
  assert.match(r.out, /1 foreign files left alone/);
  assert.equal(run('--to', to, '--check').code, 1, 'the foreign file is still reported');
  fs.rmSync(path.join(to, 'README.local'));
  assert.equal(run('--to', to, '--check').code, 0);
  assert.equal(run('--to', to).code, 0, 'repeating an update on an intact copy is fine');
}));

test('vendor: refuses non-empty foreign folders, the repository itself and bad usage (exit 2)', () => withTmp((d) => {
  const foreign = path.join(d, 'x'); fs.mkdirSync(foreign); fs.writeFileSync(path.join(foreign, 'a.txt'), 'a');
  let r = run('--to', foreign);
  assert.equal(r.code, 2); assert.match(r.out, /not a vendored tarn copy/);
  assert.ok(!fs.existsSync(path.join(foreign, 'js')));
  r = run('--to', path.join(ROOT, 'vendor-test'));
  assert.equal(r.code, 2); assert.match(r.out, /inside the Tarn repository/);
  assert.ok(!fs.existsSync(path.join(ROOT, 'vendor-test')));
  const link = path.join(d, 'link'); fs.symlinkSync(ROOT, link);
  r = run('--to', path.join(link, 'sub'));
  assert.equal(r.code, 2, 'a symlink into the repository does not help');
  assert.equal(run('--check', '--to', path.join(d, 'nope')).code, 2);
  assert.equal(run('--check', '--to', foreign).code, 2);
  assert.equal(run().code, 2);
  assert.equal(run('--bogus').code, 2);
}));
