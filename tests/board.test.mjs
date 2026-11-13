// node --test tests/  ·  a board outside the kit: board file, board lint, vendor check, generic overlay scenarios, command line refusals.
// The browser half (green copy, red copy) is the positive control of `verify --selftest` (tools/verify/board-control.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBoard, BOARD_FILE } from '../tools/lib/board.mjs';
import { runBoardLint } from '../tools/lint.mjs';
import { boardScenarios, vendorCheck } from '../tools/verify/board.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tn-board-'));
const put = (dir, rel, text) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); return f; };
const board = (dir, extra = {}) => put(dir, BOARD_FILE, JSON.stringify({ name: 'T', pages: [{ id: 'main', path: '/', details: ['jobs?open=a'] }], ...extra }));
const rm = (dir) => fs.rmSync(dir, { recursive: true, force: true });

test('board file: defaults, folder or file as argument', () => {
  const dir = tmp();
  try {
    const f = board(dir);
    const b = loadBoard(dir);
    assert.equal(b.file, f);
    assert.equal(b.name, 'T');
    assert.equal(b.kit, path.join(dir, 'vendor', 'tarn'));
    assert.equal(b.snapshots, path.join(dir, 'verify', 'snapshots'));
    assert.equal(b.kitUrl, '/tarn/js/tarn.js');
    assert.equal(b.clockMs, Date.UTC(2026, 10, 9, 9, 0, 0));
    assert.deepEqual(b.pages[0].details, ['jobs?open=a']);
    assert.equal(loadBoard(f).dir, dir);
    assert.equal(b.exceptionsGiven, false);
  } finally { rm(dir); }
});

test('board file: every mistake names the field', () => {
  const dir = tmp();
  try {
    const bad = (j, re) => { put(dir, BOARD_FILE, JSON.stringify(j)); assert.throws(() => loadBoard(dir), re); };
    const ok = { name: 'T', pages: [{ id: 'main', path: '/' }] };
    bad({ pages: ok.pages }, /name is required/);
    bad({ name: 'T' }, /pages is required/);
    bad({ ...ok, colour: 1 }, /unknown field “colour”/);
    bad({ name: 'T', pages: [{ id: 'a b', path: '/' }] }, /pages\[0\]\.id/);
    bad({ name: 'T', pages: [{ id: 'a', path: 'x' }] }, /pages\[0\]\.path/);
    bad({ name: 'T', pages: [{ id: 'a', path: '/' }, { id: 'a', path: '/' }] }, /used twice/);
    bad({ name: 'T', pages: [{ id: 'a', path: '/', sizes: ['huge'] }] }, /unknown size “huge”/);
    bad({ name: 'T', pages: [{ id: 'a', path: '/', themes: ['sepia'] }] }, /not dark or light/);
    bad({ name: 'T', pages: [{ id: 'a', path: '/', density: 'tight' }] }, /density/);
    bad({ ...ok, clock: 'yesterday' }, /clock/);
    bad({ ...ok, kitUrl: 'tarn/js/tarn.js' }, /kitUrl starts with/);
    bad({ ...ok, kit: '../outside' }, /kit must stay inside/);
    bad({ ...ok, lint: { dirs: 'x' } }, /lint\.dirs/);
    fs.writeFileSync(path.join(dir, BOARD_FILE), '{ nope');
    assert.throws(() => loadBoard(dir), /not valid JSON/);
    assert.throws(() => loadBoard(path.join(dir, 'missing')), /board file not found/);
  } finally { rm(dir); }
});

test('board lint: own files, the vendored kit copy is not linted, own allow file', () => {
  const dir = tmp();
  try {
    board(dir);
    put(dir, 'index.html', '<!doctype html><title>View · Board</title><link rel="icon" href="icon.svg">');
    put(dir, 'app.css', '.a { padding: var(--tn-s2); color: var(--tn-text); }\n');
    put(dir, 'app.js', "import { t } from '/tarn/js/tarn.js';\nexport const x = () => t('app.title');\n");
    put(dir, 'messages.js', "export default { en: { 'app.title': 'Overview of the day' } };\n");
    put(dir, 'vendor/tarn/css/tokens.css', '.k { color: #fff; margin: 3px; }\n');
    const clean = runBoardLint(loadBoard(dir));
    assert.deepEqual(clean.findings, []);
    assert.equal(clean.files, 4);   // index.html, app.css, app.js, messages.js: not vendor/, not the json

    put(dir, 'bad.css', '.b { color: #ff00ff; margin: 3px; transition: height 90ms; }\n');
    put(dir, 'bad.js', "export const f = (el) => { el.innerHTML = 'x'; setTimeout(f, 500); return button('Save changes'); };\n");
    put(dir, 'nofav.html', '<!doctype html><title>x</title>');
    const bad = runBoardLint(loadBoard(dir)).findings.map((f) => `${f.rule} ${f.file}`).sort();
    assert.deepEqual(bad, ['color bad.css', 'duration bad.css', 'html bad.js', 'i18n bad.js', 'page nofav.html', 'size bad.css', 'timer bad.js', 'transition bad.css']);

    // its own allow file: an exception with a reason removes a finding, `known` marks the inventory
    put(dir, 'verify/lint-allow.json', JSON.stringify({ exceptions: [{ id: 'bad-css', match: { rule: '^(color|size|duration|transition)$', file: '^bad\\.css$' }, reason: 'test' }], known: [{ rule: 'html', file: 'bad.js', text: 'innerHTML' }] }));
    const after = runBoardLint(loadBoard(dir));
    assert.equal(after.excepted, 4);
    assert.deepEqual(after.findings.filter((f) => f.known).map((f) => f.rule), ['html']);
    assert.ok(after.findings.some((f) => f.rule === 'timer' && !f.known));
  } finally { rm(dir); }
});

test('lint --board on the command line: exit codes and --write-known into the board', () => {
  const dir = tmp();
  try {
    board(dir);
    put(dir, 'app.js', 'export const x = (el) => { el.innerHTML = 1; };\n');
    const lint = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'tools', 'lint.mjs'), '--board', dir, ...a], { encoding: 'utf8' });
    const red = lint();
    assert.equal(red.status, 1);
    assert.match(red.stdout, /NEW {3}html app\.js:1/);
    assert.equal(lint('--write-known').status, 0);
    assert.ok(fs.existsSync(path.join(dir, 'verify', 'lint-allow.json')));
    const green = lint();
    assert.equal(green.status, 0);
    assert.match(green.stdout, /GREEN \(inventory 1\)/);
    assert.equal(spawnSync(process.execPath, [path.join(ROOT, 'tools', 'lint.mjs'), '--board', path.join(dir, 'nowhere')], { encoding: 'utf8' }).status, 2);
  } finally { rm(dir); }
});

test('vendor check of a board: the copy, local changes, the version found', async () => {
  const dir = tmp();
  try {
    board(dir);
    const v = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'vendor.mjs'), '--to', path.join(dir, 'vendor', 'tarn')], { encoding: 'utf8' });
    assert.equal(v.status, 0);
    const b = loadBoard(dir);
    const version = fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim();
    const ok = await vendorCheck(b, 'http://127.0.0.1:9');   // nothing listens there: the served version is not compared, a note says so
    assert.deepEqual(ok.findings, []);
    assert.equal(ok.version, version);
    assert.match(ok.summary, new RegExp(`tarn ${version.replace(/\./g, '\\.')} · vendor ok`));
    assert.ok(ok.notes.some((n) => /not compared/.test(n)));
    fs.appendFileSync(path.join(dir, 'vendor', 'tarn', 'css', 'core.css'), '/* edited */\n');
    const red = await vendorCheck(b, 'http://127.0.0.1:9');
    assert.equal(red.findings.length, 1);
    assert.match(red.findings[0].text, /^CHANGED locally \(1\): css\/core\.css/);
    rm(path.join(dir, 'vendor'));
    const none = await vendorCheck(b, 'http://127.0.0.1:9');
    assert.equal(none.findings.length, 1);
    assert.match(none.summary, /vendor RED/);
  } finally { rm(dir); }
});

test('generic overlay scenarios: sidebar, detail, sheet, menu on a shell page; none without a shell', () => {
  const dir = tmp();
  try {
    board(dir);
    const b = loadBoard(dir);
    const { scenarios, notes } = boardScenarios(b);
    assert.deepEqual(scenarios.map((s) => s.id), ['sidebar', 'detail', 'sheet', 'menu']);
    assert.deepEqual(notes, []);
    assert.equal(scenarios.find((s) => s.id === 'detail').hash, 'jobs');
    assert.equal(scenarios[0].pg.id, 'main');
    assert.ok(scenarios.find((s) => s.id === 'menu').setup, 'the menu scenario opens its sheet in setup, so the inventory records only the menu');
    // no detail with ?open= → no detail scenario, with a note
    put(dir, BOARD_FILE, JSON.stringify({ name: 'T', pages: [{ id: 'main', path: '/' }] }));
    const r = boardScenarios(loadBoard(dir));
    assert.deepEqual(r.scenarios.map((s) => s.id), ['sidebar', 'sheet', 'menu']);
    assert.match(r.notes[0], /no detail with \?open=/);
    // a page without shell navigation (views given): nothing generic to check
    put(dir, BOARD_FILE, JSON.stringify({ name: 'T', pages: [{ id: 'site', path: '/', views: ['page'] }] }));
    const none = boardScenarios(loadBoard(dir));
    assert.deepEqual(none.scenarios, []);
    assert.match(none.notes[0], /no page with a shell navigation/);
  } finally { rm(dir); }
});

test('verify --board: refusals before any browser starts', () => {
  const dir = tmp();
  try {
    board(dir);
    const v = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'tools', 'verify.mjs'), ...a], { encoding: 'utf8' });
    const noBase = v('--board', dir);
    assert.equal(noBase.status, 2);
    assert.match(noBase.stdout, /--board needs --base/);
    assert.equal(v('--board', dir, '--base', 'http://127.0.0.1:9', '--selftest').status, 2);
    assert.match(v('--board', dir, '--base', 'http://127.0.0.1:9', '--only', 'types').stdout, /not part of a board run/);
    assert.match(v('--board', dir, '--base', 'http://127.0.0.1:9', '--only', 'gallery').stdout, /unknown check gallery for a board/);
    assert.match(v('--board', path.join(dir, 'x'), '--base', 'http://127.0.0.1:9').stdout, /board file not found/);
    // snapshots and reports never land in the kit
    assert.match(v('--board', dir, '--base', 'http://127.0.0.1:9', '--out', path.join(ROOT, 'out')).stdout, /--out is inside the kit/);
    // the server must answer: no verdict (exit 2) instead of a green run over nothing
    const down = v('--board', dir, '--base', 'http://127.0.0.1:9', '--only', 'geometry');
    assert.equal(down.status, 2);
    assert.match(down.stdout, /does not answer/);
  } finally { rm(dir); }
});
