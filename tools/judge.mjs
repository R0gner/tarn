#!/usr/bin/env node
// tarn · visual judge: an optional second layer. NOT part of verify, --ci or the workflow; never a gate; needs the API key TYPESAFEAI_API_KEY.
//
//   node tools/judge.mjs [options]
//
// Takes a picture of every page × view × size × theme (the capture of verify), asks a decision model (TypeSafe Jev) one question per fault type
// (overflow, overlap, clipped, misaligned, malformed) and prints at most 10 lines: the pictures marked for a look, what the run cost, what the cache saved.
// Only pages with invented data (gallery, sample board, starter) can be chosen; no other URL is ever sent anywhere.
//
// Options:
//   --pages LIST     page ids of tools/verify/targets.mjs (default: gallery,board,starter)
//   --views LIST     only these views (default: all views of each page)
//   --sizes LIST     default: phone,desktop (names of tools/verify/targets.mjs; with --calibrate the mutants run at their own sizes unless given)
//   --themes LIST    default: dark
//   --out DIR        pictures and report.json go here (default: <cache dir>/judge-shots); must be outside the repo
//   --cache FILE     verdict file (default: $XDG_CACHE_HOME/tarn/judge-verdicts.json); the spend ledger lies next to it
//   --max-usd N      stop before this run would cost more than N dollars (default 0.10)
//   --max-total-usd N  the same for everything ever booked in the ledger
//   --dry-run        capture and look up the cache, ask nothing; says how many calls a real run would make
//   --mock FILE      answer from a recorded JSON ({ "scores": { "overlap": 0.9 }, "tokens": 1200 }) instead of the API (no key, no network)
//   --calibrate      judge the known faults of verify --selftest and the same states unmutated; prints the table per fault type
//   --mutants LIST   with --calibrate: only these mutants
//   --with-clean     with --calibrate: also photograph the unmutated pages of --pages/--sizes/--themes as clean pictures (a larger clean set)
//   --jobs N         parallel pages of the own Chrome (default 2)
//   --chrome PATH
// Exit code: 0 (also with marked pictures), 2 on usage errors, 3 when the capture or the API fails.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPool } from './lib/pool.mjs';
import { PAGES, SIZES, parseSize } from './verify/targets.mjs';
import { MUTANTS } from './verify/mutants.mjs';
import { capture } from './lib/judge-capture.mjs';
import { ask, mockAsk, judgePictures, summaryLines, defaultCacheDir, QUESTION_SET_VERSION, THRESHOLDS, FAULT_TYPES } from './lib/judge.mjs';
import { MUTANT_LABELS, MUTANT_SCROLL, evaluateCalibration, chooseThreshold } from './lib/judge-calibration.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const usage = () => fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n');
function fail(msg) { console.error(`judge: ${msg}`); process.exit(2); }

function parseArgs(argv) {
  const o = { pages: ['gallery', 'board', 'starter'], sizes: ['phone', 'desktop'], themes: ['dark'], maxUsd: 0.10, maxTotalUsd: Infinity, jobs: 2 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) fail(`${a} needs a value`); return argv[++i]; };
    const list = () => next().split(',').filter(Boolean);
    const num = () => { const n = Number(next()); if (!(n >= 0)) fail(`${a}: a number ≥ 0`); return n; };
    if (a === '--pages') o.pages = list();
    else if (a === '--views') o.views = list();
    else if (a === '--sizes') { o.sizes = list(); o.sizesGiven = true; }
    else if (a === '--themes') o.themes = list();
    else if (a === '--out') o.out = next();
    else if (a === '--cache') o.cache = next();
    else if (a === '--max-usd') o.maxUsd = num();
    else if (a === '--max-total-usd') o.maxTotalUsd = num();
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--mock') o.mock = next();
    else if (a === '--calibrate') o.calibrate = true;
    else if (a === '--mutants') o.mutants = list();
    else if (a === '--with-clean') o.withClean = true;
    else if (a === '--jobs') o.jobs = Math.max(1, num());
    else if (a === '--chrome') o.chrome = next();
    else if (a === '-h' || a === '--help') { console.log(usage()); process.exit(0); }
    else fail(`unknown option ${a} (--help)`);
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const cacheFile = path.resolve(o.cache || path.join(defaultCacheDir(), 'judge-verdicts.json'));
  const out = path.resolve(o.out || path.join(path.dirname(cacheFile), 'judge-shots'));
  if (out === ROOT || out.startsWith(ROOT + path.sep)) fail(`--out is inside the repo (${ROOT}); use a folder outside`);
  const themes = o.themes.filter((t) => t === 'dark' || t === 'light');
  if (!themes.length) fail('--themes: dark and/or light');
  const sizes = o.sizes.map((s) => parseSize(s) || fail(`unknown size ${s} (${Object.keys(SIZES).join(', ')})`));
  const pages = o.pages.map((id) => PAGES.find((p) => p.id === id) || fail(`unknown page ${id} (${PAGES.map((p) => p.id).join(', ')})`));
  if (!o.mock && !o.dryRun && !process.env.TYPESAFEAI_API_KEY) fail('TYPESAFEAI_API_KEY is not set (use --dry-run, or --mock FILE to work without the API)');

  let askFn = ask;
  if (o.mock) { try { askFn = mockAsk(JSON.parse(fs.readFileSync(o.mock, 'utf8'))); } catch (e) { fail(`--mock: ${e.message}`); } }

  // Tasks: what to photograph.
  const tasks = [];
  if (o.calibrate) {
    const muts = MUTANTS.filter((m) => m.check !== 'overlay' && MUTANT_LABELS[m.id] && (!o.mutants || o.mutants.includes(m.id)));
    if (!muts.length) fail('--calibrate: no such mutant');
    const cleanKey = new Map();
    for (const m of muts) {
      const pg = PAGES.find((p) => p.id === m.page);
      for (const sz of m.sizes) {
        if (o.sizesGiven && !o.sizes.includes(sz)) continue;   // without --sizes every mutant runs at its own sizes
        const size = parseSize(sz);
        tasks.push({ pg, size, theme: 'dark', views: m.views, css: m.css, js: m.js, patch: m.patch, id: m.id, scroll: MUTANT_SCROLL[m.id] });
        const k = `${pg.id}|${sz}`;
        const c = cleanKey.get(k) || { pg, size, theme: 'dark', views: [], id: 'clean', scroll: {} };
        for (const v of m.views) if (!c.views.includes(v)) c.views.push(v);
        Object.assign(c.scroll, MUTANT_SCROLL[m.id] || {});
        cleanKey.set(k, c);
      }
    }
    tasks.unshift(...cleanKey.values());
  }
  if (!o.calibrate || o.withClean) {
    for (const pg of pages) for (const size of (pg.sizes ? sizes.filter((z) => pg.sizes.includes(z.name)) : sizes)) for (const theme of (pg.themes ? themes.filter((x) => pg.themes.includes(x)) : themes)) {
      tasks.push({ pg, size, theme, only: o.views, id: 'clean' });
    }
  }
  if (!tasks.length) fail('nothing to photograph');

  let pool;
  try { pool = await createPool({ root: ROOT, jobs: o.jobs, chrome: o.chrome, tmp: undefined }); } catch (e) { console.error(`judge: Chrome did not start (${String(e.message).slice(0, 160)})`); process.exit(3); }
  let pics;
  try {
    // --views filters the views of each page; a page without any of them gives no picture
    pics = await capture(pool, tasks, out);
  } catch (e) { console.error(`judge: capture failed – ${String(e.message).slice(0, 200)}`); await pool.close().catch(() => {}); process.exit(3); }
  await pool.close().catch(() => {});

  const { results, stats } = await judgePictures(pics.map((p) => ({ file: p.file, png: p.png, label: p.label })), { cacheFile, ask: askFn, maxUsd: o.maxUsd, maxTotalUsd: o.maxTotalUsd, noCall: o.dryRun });
  const reportFile = path.join(out, o.calibrate ? 'judge-calibration.json' : 'judge-report.json');

  if (o.calibrate) {
    const rows = results.map((r, i) => ({ ...pics[i].meta, sha: r.sha, scores: r.scores }));
    const cleanScores = (t) => rows.filter((r) => r.id === 'clean' && r.scores).map((r) => r.scores[t]);
    const n = cleanScores(FAULT_TYPES[0]).length;
    const thresholds = Object.fromEntries(FAULT_TYPES.map((t) => [t, chooseThreshold(cleanScores(t), { maxFalse: Math.floor(0.05 * n) })]));
    const ev = evaluateCalibration(rows, thresholds);
    fs.writeFileSync(reportFile, JSON.stringify({ qs: QUESTION_SET_VERSION, thresholds, evaluation: ev, stats, rows }, null, 1));
    const lines = [`judge calibrate ${QUESTION_SET_VERSION}: ${ev.clean} clean + ${ev.faults} faulty pictures (+${ev.invisible} faults not in the picture) · ${stats.calls} calls · $${stats.usd.toFixed(5)} (ledger $${stats.total_usd.toFixed(5)})`];
    for (const t of FAULT_TYPES) { const p = ev.perType[t]; lines.push(`  ${t.padEnd(10)} threshold ${thresholds[t].toFixed(2)} · clean marked ${p.cleanMarked}/${ev.clean} · faults of this type ${p.hit}/${p.faults} marked by its own question, ${p.hitAny}/${p.faults} by any`); }
    const pm = (id) => { const m = ev.perMutant[id]; return m ? `${m.hitAny}/${m.pictures}` : 'not run'; };
    lines.push(`  clean pictures marked by any question: ${ev.cleanMarkedAny}/${ev.clean} · toggle-thumb-leaves-track ${pm('toggle-thumb-leaves-track')} · segmented-squeezed ${pm('segmented-squeezed')} (pictures marked / pictures with the fault visible)`);
    lines.push(`judge: report ${reportFile}`);
    console.log(lines.join('\n'));
    return 0;
  }
  fs.writeFileSync(reportFile, JSON.stringify({ qs: QUESTION_SET_VERSION, thresholds: THRESHOLDS, stats, marked: results.filter((r) => r.marked.length).map((r) => ({ label: r.label, file: r.file, marked: r.marked })), results: results.map((r) => ({ label: r.label, file: r.file, source: r.source, scores: r.scores, note: r.note })) }, null, 1));
  console.log(summaryLines({ results, stats }, reportFile).join('\n'));
  return stats.errors && !stats.calls && !stats.saved ? 3 : 0;
}

main().then((c) => process.exit(c), (e) => { console.error(`judge: ${String(e.stack || e).split('\n').slice(0, 2).join(' ')}`); process.exit(3); });
