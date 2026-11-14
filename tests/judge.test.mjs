// node --test tests/  ·  visual judge (tools/judge.mjs): everything against a recorded answer, no network, no key, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as J from '../tools/lib/judge.mjs';
import { MUTANT_LABELS, evaluateCalibration, chooseThreshold } from '../tools/lib/judge-calibration.mjs';
import { MUTANTS } from '../tools/verify/mutants.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** A PNG header (signature + IHDR) of the given size with a seed in the tail: enough for the size check and the hash. */
function fakePng(w, h, seed = 0) {
  const b = Buffer.alloc(40);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); b.writeUInt32BE(seed, 36);
  return b;
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tarn-judge-test-'));
const RECORDED = { model: 'jev-1.14.0', answers: { overflow: { type: 'noul', noul: 0.12 }, overlap: { type: 'noul', noul: 0.93 }, clipped: { type: 'noul', noul: 0.04 }, misaligned: { type: 'noul', noul: 0.2 }, malformed: { type: 'noul', noul: 0.31 } }, usage: { input_tokens: 4200, output_tokens: 40 } };

test('request: images header, one asset used once, one noul question per fault type, no key in the body', () => {
  const { headers, body } = J.buildRequest(fakePng(700, 900), 'uuid-1');
  assert.equal(headers['TypeSafe-Danger-Zone-Images'], 'true');
  assert.deepEqual(body.state, { page: 'uuid-1' });
  assert.deepEqual(Object.keys(body.assets), ['uuid-1']);
  assert.equal(body.assets['uuid-1'].format, 'png');
  assert.deepEqual(Object.keys(body.questions), ['overflow', 'overlap', 'clipped', 'misaligned', 'malformed']);
  for (const q of Object.values(body.questions)) { assert.equal(q.type, 'noul'); assert.match(q.instructions, /`page`/); assert.ok(q.criteria.true && q.criteria.false); }
  assert.ok(!JSON.stringify({ headers, body }).includes('Bearer'));
});

test('response: scores and the reported tokens; a missing answer or missing usage is an error, not a zero', () => {
  const r = J.parseResponse(RECORDED);
  assert.equal(r.scores.overlap, 0.93); assert.equal(r.tokens, 4200); assert.equal(r.model, 'jev-1.14.0');
  assert.throws(() => J.parseResponse({ ...RECORDED, answers: { overlap: RECORDED.answers.overlap } }), /missing/);
  assert.throws(() => J.parseResponse({ ...RECORDED, usage: {} }), /usage/);
  assert.equal(J.costUsd(1_000_000), J.PRICE_PER_MTOK);
  assert.ok(Math.abs(J.costUsd(4200) - 0.0001764) < 1e-9);
});

test('size limits of the API: below 280 px and above 1568 px are refused before any call', () => {
  assert.equal(J.sizeProblem(fakePng(722, 1561)), null);
  assert.match(J.sizeProblem(fakePng(279, 900)), /below 280/);
  assert.match(J.sizeProblem(fakePng(1600, 900)), /above 1568/);
  assert.throws(() => J.pngSize(Buffer.from('not a png at all, really not')), /PNG/);
});

test('ask(): the key goes into the Authorization header only; without it nothing is sent; an error names status and type, never the key or the body', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push({ url, init }); return { ok: true, status: 200, text: async () => JSON.stringify(RECORDED) }; };
  await assert.rejects(J.ask(fakePng(700, 900), { env: {}, fetchImpl }), /not set/);
  assert.equal(seen.length, 0);
  const r = await J.ask(fakePng(700, 900), { env: { TYPESAFEAI_API_KEY: 'k-secret-123' }, fetchImpl });
  assert.equal(r.tokens, 4200);
  assert.equal(seen[0].url, J.ENDPOINT);
  assert.equal(seen[0].init.headers.Authorization, 'Bearer k-secret-123');
  assert.ok(!seen[0].init.body.includes('k-secret-123'));
  const bad = async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ detail: { error_type: 'max_tokens_exceeded', echo: 'k-secret-123' } }) });
  await assert.rejects(J.ask(fakePng(700, 900), { env: { TYPESAFEAI_API_KEY: 'k-secret-123' }, fetchImpl: bad }), (e) => /API 400 max_tokens_exceeded/.test(e.message) && !e.message.includes('k-secret-123'));
});

test('cache: the second run over unchanged pictures makes zero calls, says what it saved and books nothing; a changed picture is asked again', async () => {
  const dir = tmp(); const cacheFile = path.join(dir, 'v.json');
  let calls = 0;
  const askFn = async () => { calls++; return J.parseResponse(RECORDED); };
  const pics = [1, 2, 3].map((n) => ({ file: `p${n}.png`, label: `pic ${n}`, png: fakePng(700, 900, n) }));
  const a = await J.judgePictures(pics, { cacheFile, ask: askFn });
  assert.deepEqual([a.stats.calls, a.stats.saved, calls], [3, 0, 3]);
  assert.ok(Math.abs(a.stats.usd - 3 * J.costUsd(4200)) < 1e-12);
  const b = await J.judgePictures(pics, { cacheFile, ask: askFn });
  assert.deepEqual([b.stats.calls, b.stats.saved, calls, b.stats.usd], [0, 3, 3, 0]);
  assert.ok(b.stats.saved_usd > 0);
  assert.deepEqual(b.results.map((r) => r.source), ['cache', 'cache', 'cache']);
  const c = await J.judgePictures([...pics, { file: 'p4.png', label: 'pic 4', png: fakePng(700, 900, 4) }], { cacheFile, ask: askFn });
  assert.deepEqual([c.stats.calls, c.stats.saved, calls], [1, 3, 4]);
  // ledger: one line per paid call, the total is the sum
  const led = J.ledgerTotal(J.cachePaths(cacheFile).ledger);
  assert.equal(led.calls, 4);
  assert.ok(Math.abs(led.usd - 4 * J.costUsd(4200)) < 1e-12);
  // a new question-set version is a new key
  assert.ok(J.cacheKey(pics[0].png).startsWith(`${J.QUESTION_SET_VERSION}:`));
  fs.rmSync(dir, { recursive: true });
});

test('the same bytes twice in one run are one call; marked pictures follow the thresholds', async () => {
  const dir = tmp(); let calls = 0;
  const png = fakePng(700, 900, 7);
  const r = await J.judgePictures([{ file: 'a', label: 'a', png }, { file: 'b', label: 'b', png }], { cacheFile: path.join(dir, 'v.json'), ask: async () => { calls++; return J.parseResponse(RECORDED); } });
  assert.deepEqual([calls, r.stats.calls, r.stats.saved], [1, 1, 1]);
  assert.deepEqual(r.results[0].marked.map((m) => m.type), ['overlap']);
  assert.deepEqual(J.markedTypes(r.results[0].scores, { ...J.THRESHOLDS, overlap: 0.95 }), []);
  fs.rmSync(dir, { recursive: true });
});

test('money: a run stops before it would pass --max-usd (estimated from the tokens seen so far); the total limit of the ledger too; failed calls are booked as failed', async () => {
  const dir = tmp(); const cacheFile = path.join(dir, 'v.json');
  const pics = [1, 2, 3, 4, 5].map((n) => ({ file: `p${n}`, label: `pic ${n}`, png: fakePng(700, 900, n) }));
  const one = J.costUsd(4200);
  const a = await J.judgePictures(pics, { cacheFile, ask: async () => J.parseResponse(RECORDED), maxUsd: one * 1.5, maxTotalUsd: Infinity });
  // the first call has no figure yet and is estimated with the largest allowed picture (8000 tokens > 1.5 × 4200): nothing is asked
  assert.equal(a.stats.calls, 0); assert.equal(a.stats.skipped, 5); assert.match(a.stats.stoppedBy, /max-usd/);
  const b = await J.judgePictures(pics, { cacheFile, ask: async () => J.parseResponse(RECORDED), maxUsd: J.costUsd(8000) * 2.5 });
  assert.ok(b.stats.calls >= 1 && b.stats.calls < 5, `calls ${b.stats.calls}`);
  assert.ok(b.stats.usd <= J.costUsd(8000) * 2.5);
  const fresh = [11, 12, 13].map((n) => ({ file: `q${n}`, label: `q ${n}`, png: fakePng(700, 900, n) }));
  const c = await J.judgePictures(fresh, { cacheFile, ask: async () => J.parseResponse(RECORDED), maxUsd: 1, maxTotalUsd: J.ledgerTotal(J.cachePaths(cacheFile).ledger).usd + one * 1.5 });
  assert.equal(c.stats.calls, 1); assert.match(c.stats.stoppedBy, /total/);
  const d = await J.judgePictures([{ file: 'x', label: 'x', png: fakePng(700, 900, 99) }], { cacheFile, ask: async () => { throw Object.assign(new Error('API 429'), { status: 429 }); } });
  assert.equal(d.stats.errors, 1); assert.equal(d.stats.usd, 0);
  assert.ok(fs.readFileSync(J.cachePaths(cacheFile).ledger, 'utf8').includes('"ok":false'));
  fs.rmSync(dir, { recursive: true });
});

test('output: at most 10 lines, however many pictures are marked; a dry run asks nothing', async () => {
  const dir = tmp(); const cacheFile = path.join(dir, 'v.json');
  const pics = Array.from({ length: 30 }, (_, n) => ({ file: `p${n}`, label: `page/view ${n} phone dark`, png: fakePng(700, 900, n) }));
  const dry = await J.judgePictures(pics, { cacheFile, ask: async () => assert.fail('no call in a dry run'), noCall: true });
  assert.equal(dry.stats.calls, 0); assert.equal(dry.stats.skipped, 30);
  const r = await J.judgePictures(pics, { cacheFile, ask: async () => J.parseResponse(RECORDED), maxUsd: 1 });
  const lines = J.summaryLines(r, '/x/report.json');
  assert.ok(lines.length <= 10, `${lines.length} lines`);
  assert.match(lines[0], /30 pictures · 30 API calls · 0 saved/);
  assert.match(lines.join('\n'), /more in the report/);
  fs.rmSync(dir, { recursive: true });
});

test('calibration: faults that are not in the picture are not misses; thresholds follow the clean pictures; every label belongs to a real mutant', () => {
  const clean = (view, s) => ({ id: 'clean', page: 'gallery', view, size: 'phone', theme: 'dark', sha: `c-${view}`, scores: { overflow: s, overlap: s, clipped: s, misaligned: s, malformed: s } });
  const rows = [clean('cards', 0.1), clean('rows', 0.2),
    { id: 'tile-overlap', page: 'gallery', view: 'cards', size: 'phone', theme: 'dark', sha: 'm1', scores: { overflow: 0.1, overlap: 0.9, clipped: 0.1, misaligned: 0.1, malformed: 0.1 } },
    { id: 'row-title-no-ellipsis', page: 'gallery', view: 'rows', size: 'phone', theme: 'dark', sha: 'c-rows', scores: { overflow: 0.2, overlap: 0.2, clipped: 0.2, misaligned: 0.2, malformed: 0.2 } }];
  const ev = evaluateCalibration(rows, { overflow: 0.5, overlap: 0.5, clipped: 0.5, misaligned: 0.5, malformed: 0.5 });
  assert.deepEqual([ev.clean, ev.faults, ev.invisible], [2, 1, 1]);
  assert.deepEqual(ev.perType.overlap, { cleanMarked: 0, faults: 1, hit: 1, hitAny: 1 });
  assert.equal(ev.perMutant['row-title-no-ellipsis'].invisible, 1);
  assert.equal(chooseThreshold([0.1, 0.2, 0.55], { maxFalse: 0 }), 0.6);
  assert.equal(chooseThreshold([0.1, 0.2], { maxFalse: 0 }), 0.3);
  const ids = new Set(MUTANTS.map((m) => m.id));
  for (const [id, types] of Object.entries(MUTANT_LABELS)) { assert.ok(ids.has(id), id); assert.ok(types.every((t) => J.FAULT_TYPES.includes(t))); }
  // the two faults the owner asked about are part of the labelled set
  assert.ok(MUTANT_LABELS['toggle-thumb-leaves-track'] && MUTANT_LABELS['segmented-squeezed']);
});

test('the CLI: --help works, no key without --mock/--dry-run is a usage error (exit 2), a missing --mock file too; verify never needs the key', () => {
  const run = (args, env = {}) => spawnSync(process.execPath, [path.join(ROOT, 'tools/judge.mjs'), ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env } });
  assert.equal(run(['--help']).status, 0);
  const a = run(['--pages', 'gallery']);
  assert.equal(a.status, 2); assert.match(a.stderr, /TYPESAFEAI_API_KEY is not set/);
  assert.equal(run(['--pages', 'gallery', '--mock', '/nonexistent/x.json']).status, 2);
  assert.equal(run(['--pages', 'nope', '--dry-run']).status, 2);
  const verify = fs.readFileSync(path.join(ROOT, 'tools/verify.mjs'), 'utf8');
  assert.ok(!/judge|TYPESAFE/i.test(verify), 'verify.mjs must not know the judge');
  assert.ok(!fs.existsSync(path.join(ROOT, '.github')) || !/judge|TYPESAFE/i.test(fs.readdirSync(path.join(ROOT, '.github/workflows')).map((f) => fs.readFileSync(path.join(ROOT, '.github/workflows', f), 'utf8')).join('\n')), 'the workflow must not call the judge');
});
