#!/usr/bin/env node
// tarn · verify: one command for all checks. Node ≥ 22, no npm packages.
//
//   node tools/verify.mjs [options]
//
// Output ≤ 10 lines, exit code 0 green · 1 finding · 2 measurement refused or environment broken.
// Images only on findings (as a path), full report as JSON in the output folder.
//
// Checks (--only/--skip, comma list):
//   tests     node --test tests/
//   lint      tools/lint.mjs: tokens, transitions, no innerHTML, timers, gallery coverage, emoji, visible texts via t()
//   types     TypeScript as a pure type checker over the JSDoc types of js/ (jsconfig.json, pinned version, fetched with npx;
//             skipped with a note when offline). Alias: --types = --only types
//   geometry  DOM geometry per page × size × scheme × view: overflow, truncated text, overlap, misaligned siblings, words broken
//             letter by letter, touch targets < 40 px (touch sizes), missing translations, favicon/title, console errors;
//             contrast only as a warning
//   overlay   menus, toasts, tooltips, sheets/panels are on top (elementFromPoint), not inert, focus in the menu; behaviour cases
//   snapshots text outline of the DOM per view and state against tests/snapshots/ (diff on a mismatch)
//   tempo     animation inventory (tools/tempo.mjs --inventory): only transform/opacity, durations = tokens, budgets per class.
//             The frame measurement itself is tools/tempo.mjs (needs a visible Chrome).
//
// Options:
//   --quick            fast subset: sizes phone,desktop, dark only
//   --types            only the type check (same as --only types)
//   --pages LIST       gallery,board,board-de,board-fr (default: all)
//   --views LIST       only these views (IDs, e.g. states,jobs)
//   --scenarios LIST   only these overlay scenarios (IDs, e.g. combobox,form-submit)
//   --sizes LIST       phone,desktop,phone-s,tablet-s,desktop-s or WxH[@DPR][t]
//   --themes LIST      dark,light
//   --full             the complete matrix (the default); with --selftest: everything in ONE run – the selftest reuses the findings of
//                      this run as its base (no second pass), then runs the mutants. Refuses narrowing options (--quick, --pages, …)
//   --selftest         positive control: known faults must be red, CSS/JS mutants must be detected (base pass included unless
//                      --full or --base-report)
//   --base-report FILE with --selftest: use report.json of a full run as the base; refused unless it belongs to the same commit and
//                      the same tree content and was a full run
//   --changed [REV]    dev loop: only the pages/views that the changed files (git diff against REV, default HEAD, plus untracked files)
//                      can affect; all sizes and themes. Not a replacement for the full run at the end of a stage and in CI
//   --jobs N           parallel workers (own headless Chrome, one browser context each); default min(4, cores/2). --attach is serial
//   --mutants LIST     with --selftest: only these mutants, base run skipped (development; the full selftest is the proof)
//   --update           rewrite snapshots (deliberately only, reason in the commit)
//   --out DIR          output folder (outside the repo); default: new temp folder, deleted when green
//   --base URL         check a running server instead of starting one (e.g. http://127.0.0.1:<port>)
//   --attach URL       use a running Chrome via CDP (own tab, closed afterwards)
//   --ci               for CI runners: always starts its own headless Chrome (throw-away profile, --no-sandbox), refuses --attach/--base,
//                      fails with exit 2 when no Chrome is found (CHROME=… or --chrome PATH); use --out DIR to keep images and report.json
//   Without --attach/--base the kit files reach the own headless Chrome through CDP (Fetch.fulfillRequest): no HTTP server, no network.
//   --chrome PATH      Chrome binary; --no-shots no images; -v print all finding groups
//   --list             list checks, pages and sizes
//
// Exceptions and known faults: tools/verify/exceptions.json (each with a reason).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluate } from './lib/cdp.mjs';
import { createPool } from './lib/pool.mjs';
import { treeIdentity } from './lib/tree.mjs';
import { PAGES, SIZES, DEFAULT_SIZES, QUICK_SIZES, THEMES, parseSize } from './verify/targets.mjs';
import { geometryTasks, geometryTask, runGeometry, runGeometryOn, mergeGeometry } from './verify/geometry.mjs';
import { overlayTasks, overlayTask, runOverlay, runOverlayOn, mergeOverlay, SCENARIOS } from './verify/overlay.mjs';
import { changedScope, scopeFilters, describeScope } from './verify/changed.mjs';
import { MUTANTS } from './verify/mutants.mjs';
import { snapshotTasks, snapshotTask, mergeSnapshots } from './verify/snapshots.mjs';
import { lintFindings } from './lint.mjs';
import { typesFindings, typesMutant } from './verify/types.mjs';
import { layersMutant } from './verify/layers.mjs';
import { inventoryUnits, inventoryUnit, inventorySummary } from './tempo.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CHECKS = ['tests', 'lint', 'types', 'geometry', 'overlay', 'snapshots', 'tempo'];

/* ---- Arguments ---- */
function usage() { return fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'); }
function fail(msg, code = 2) { console.log(`verify: ${msg}`); process.exit(code); }
function parseArgs(argv) {
  const o = { only: null, skip: [], quick: false, verbose: false, shots: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) fail(`${a} needs a value`); return argv[++i]; };
    const list = () => next().split(',').map((s) => s.trim()).filter(Boolean);
    if (a === '--only') o.only = list();
    else if (a === '--skip') o.skip = list();
    else if (a === '--quick') o.quick = true;
    else if (a === '--types') o.only = ['types'];
    else if (a === '--pages') o.pages = list();
    else if (a === '--views') o.views = list();
    else if (a === '--sizes') o.sizes = list();
    else if (a === '--themes') o.themes = list();
    else if (a === '--scenarios') o.scenarios = next().split(',').filter(Boolean);
    else if (a === '--mutants') o.mutants = next().split(',').filter(Boolean);
    else if (a === '--selftest') o.selftest = true;
    else if (a === '--full') o.full = true;
    else if (a === '--base-report') o.baseReport = next();
    else if (a === '--jobs') { o.jobs = Number(next()); if (!Number.isInteger(o.jobs) || o.jobs < 1 || o.jobs > 16) fail('--jobs: integer 1–16'); }
    else if (a === '--changed') o.changed = i + 1 < argv.length && !argv[i + 1].startsWith('-') ? argv[++i] : true;
    else if (a === '--update') o.update = true;
    else if (a === '--out') o.out = next();
    else if (a === '--base') o.base = next().replace(/\/+$/, '');
    else if (a === '--ci') o.ci = true;
    else if (a === '--attach') o.attach = next();
    else if (a === '--chrome') o.chrome = next();
    else if (a === '--no-shots') o.shots = false;
    else if (a === '-v' || a === '--verbose') o.verbose = true;
    else if (a === '--list') o.list = true;
    else if (a === '-h' || a === '--help') { console.log(usage()); process.exit(0); }
    else fail(`unknown option ${a} (--help)`);
  }
  if (o.ci && (o.attach || o.base)) fail('--ci starts its own Chrome and server; do not combine with --attach/--base');
  if (o.full && (o.quick || o.pages || o.views || o.sizes || o.themes || o.scenarios || o.only || o.skip.length || o.changed || o.mutants || o.update)) fail('--full is the complete matrix; do not combine with --quick/--pages/--views/--sizes/--themes/--scenarios/--only/--skip/--changed/--mutants/--update');
  if (o.baseReport && !o.selftest) fail('--base-report belongs to --selftest');
  if (o.baseReport && o.full) fail('--base-report and --full both provide the selftest base; use one');
  if (o.changed && (o.selftest || o.update)) fail('--changed is a dev loop for the checks; not with --selftest/--update');
  for (const c of [...(o.only || []), ...o.skip]) if (!CHECKS.includes(c)) fail(`unknown check ${c} (${CHECKS.join(', ')})`);
  return o;
}

/* ---- Exceptions / known faults ---- */
function loadRules() {
  const file = path.join(HERE, 'verify', 'exceptions.json');
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const compile = (e) => ({ ...e, test: (f) => Object.entries(e.match).every(([k, v]) => new RegExp(v).test(String(f[k] ?? ''))) });
  return { known: (j.known || []).map(compile), exceptions: (j.exceptions || []).map(compile) };
}
function classify(findings, rules) {
  for (const f of findings) {
    if (f.rule === 'touch48') continue;   // comfortable touch targets: no exceptions and no known faults, whatever exceptions.json says
    const ex = rules.exceptions.find((e) => e.test(f));
    if (ex) { f.excepted = ex.id; continue; }
    const kn = rules.known.find((e) => e.test(f));
    if (kn) f.known = kn.id;
  }
  return findings.filter((f) => !f.excepted);
}
const groupKey = (f) => `${f.check}|${f.rule}|${f.page}|${f.sel}`;
function groups(findings) {
  const m = new Map();
  for (const f of findings) {
    const k = groupKey(f);
    if (!m.has(k)) m.set(k, { ...f, n: 0, sizes: new Set(), views: new Set() });
    const g = m.get(k); g.n++; g.sizes.add(f.size); g.views.add(f.view);
  }
  return [...m.values()];
}

/* ---- Check: tests ---- */
function runTests() {
  // explicit file list: Node 22 treats a directory argument as a file, Node ≥ 23 expands it
  const files = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => `tests/${f}`);
  // unit tests are deterministic in one fixed zone (some cover DST in Europe/Berlin); CI runners default to UTC
  const r = spawnSync(process.execPath, ['--test', ...files], { cwd: ROOT, encoding: 'utf8', timeout: 120000, env: { ...process.env, TZ: 'Europe/Berlin' } });
  const out = `${r.stdout}\n${r.stderr}`;
  const num = (k) => Number((new RegExp(`^(?:#|ℹ) ${k} (\\d+)`, 'm').exec(out) || [])[1] || 0);
  const pass = num('pass'), failN = num('fail');
  const findings = [];
  if (r.status !== 0 || failN) {
    const names = [...out.matchAll(/^(?:not ok \d+ - |✖ )(.+?)(?: \(\d.*\))?$/gm)].map((m) => m[1]).slice(0, 5);
    findings.push({ check: 'tests', rule: 'fail', page: '-', sel: 'tests/', text: `${failN || '?'} test(s) red: ${names.join(', ') || out.trim().split('\n').slice(-3).join(' ')}` });
  }
  return { findings, summary: `tests ${failN ? `${failN} red` : 'ok'} (${pass})` };
}

/* ---- Main run ---- */
async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.list) {
    console.log(`Checks: ${CHECKS.join(', ')}\nPages: ${PAGES.map((p) => `${p.id} (${p.path})`).join(', ')}\nSizes: ${Object.entries(SIZES).map(([k, s]) => `${k} ${s.w}×${s.h}${s.mobile ? ' touch' : ''}`).join(', ')}\nMutants: ${MUTANTS.map((m) => m.id).join(', ')}`);
    return 0;
  }
  const run = (c) => (o.only ? o.only.includes(c) : true) && !o.skip.includes(c);
  const sizes = (o.sizes || (o.quick ? QUICK_SIZES : DEFAULT_SIZES)).map((s) => parseSize(s) || fail(`unknown size ${s}`));
  const themes = o.themes || (o.quick ? ['dark'] : THEMES);
  if (themes.some((t) => !THEMES.includes(t))) fail('--themes: dark and/or light');
  let pages = o.pages ? PAGES.filter((p) => o.pages.includes(p.id)) : PAGES;
  if (!pages.length) fail(`no page selected (${PAGES.map((p) => p.id).join(', ')})`);
  let viewFilter = o.views ? (pg, v) => o.views.includes(v) : null;
  let overlayOnly = o.scenarios;
  const notes = [];

  // --changed: narrow pages/views to what the changed files can affect
  let scope = null;
  if (o.changed) {
    scope = changedScope(ROOT, o.changed === true ? undefined : o.changed);
    if (scope.error) fail(`--changed: ${scope.error}`);
    const f = scopeFilters(scope, pages);
    pages = f.pages;
    const own = viewFilter;
    viewFilter = f.viewFilter && own ? (pg, v) => f.viewFilter(pg, v) && own(pg, v) : (f.viewFilter || own);
    if (!scope.all) overlayOnly = SCENARIOS.filter((sc) => pages.some((p) => p.id === sc.page) && (!viewFilter || viewFilter(sc.page, sc.hash.split('?')[0]))).map((sc) => sc.id);
    notes.push(`changed: ${describeScope(scope)}`);
  }

  // --selftest --base-report: the base comes from an earlier full run of exactly this tree
  let reportBase = null;
  if (o.baseReport) {
    let rep;
    try { rep = JSON.parse(fs.readFileSync(path.resolve(o.baseReport), 'utf8')); } catch (e) { fail(`--base-report: cannot read ${o.baseReport} (${e.message})`); }
    const id = treeIdentity(ROOT);
    if (!id.tree) fail('--base-report needs a git checkout (commit and tree hash)');
    if (rep.matrix !== 'full') fail('--base-report: the report is not from a full run (no --quick/--pages/--views/--sizes/--themes/--scenarios/--only/--skip/--changed)');
    if (rep.commit !== id.commit || rep.tree !== id.tree) fail(`--base-report refused: the report belongs to ${String(rep.commit).slice(0, 7)} / tree ${String(rep.tree).slice(0, 8)}, this tree is ${id.commit.slice(0, 7)} / ${id.tree.slice(0, 8)}`);
    reportBase = { findings: rep.findings.filter((f) => f.check === 'geometry' || f.check === 'overlay'), states: rep.stats.geometryStates, scenarios: rep.stats.overlayScenarios };
  }

  const outDir = o.out ? path.resolve(o.out) : fs.mkdtempSync(path.join(os.tmpdir(), 'tn-verify-'));
  if (outDir === ROOT || outDir.startsWith(ROOT + path.sep)) fail(`--out is inside the repo (${ROOT})`);
  fs.mkdirSync(outDir, { recursive: true });
  const rules = loadRules();
  const lines = [], summary = [];
  let findings = [], warnings = [], envError = null;
  const t0 = Date.now();
  const stats = {};
  let stateTiming = [], poolTimings = [], jobsUsed = 0, modeUsed = null;
  let baseRaw = null; // raw geometry/overlay findings of this run (the selftest base with --full)
  const selftestOnly = o.selftest && !o.full;

  if (o.update) { o.only = ['snapshots']; }
  if (run('tests') && !selftestOnly) { const r = runTests(); findings.push(...r.findings); summary.push(r.summary); }
  if (run('lint') && !selftestOnly) { const r = lintFindings(); findings.push(...r.findings); summary.push(r.summary); }
  if (run('types') && !selftestOnly) { const r = typesFindings(ROOT); findings.push(...r.findings); summary.push(r.summary); if (r.skipped) notes.push(`Type check skipped: ${r.skipped}`); }

  const tempoOn = run('tempo') && !o.views && !o.pages && !(scope && !scope.all);
  const doGeo = run('geometry') && !selftestOnly && !(scope && scope.none);
  const doOv = run('overlay') && !selftestOnly && !(scope && scope.none);
  const doSnap = run('snapshots') && !selftestOnly && !(scope && scope.none);
  const needBrowser = o.selftest || doGeo || doOv || doSnap || (tempoOn && !selftestOnly && !(scope && scope.none));
  let pool = null, selftestResult = null, shotFiles = 0, tVerifyEnd = 0;
  try {
    if (needBrowser) {
      try {
        pool = await createPool({ attach: o.attach, base: o.base, chrome: o.chrome, noSandbox: o.ci, jobs: o.jobs, root: ROOT, tmp: outDir });
      } catch (e) { throw Object.assign(e, { env: true }); }
      jobsUsed = pool.size; modeUsed = pool.mode;

      let seq = 0;
      const shot = o.shots ? async (page, ctx, raw, st) => {
        const made = [];
        for (const f of raw) {
          const ff = { check: 'geometry', ...ctx, ...f };
          const keep = classify([ff], rules).length;
          const key = groupKey(ff);
          if (!keep || st.seen.has(key) || st.n >= 4 || !f.hit) continue;
          st.seen.add(key); st.n++;
          const file = path.join(outDir, `tmp-${String(++seq).padStart(4, '0')}-${f.rule}-${ctx.page}-${ctx.view.replace(/[^a-z0-9]+/gi, '-')}-${ctx.size}-${ctx.theme}.png`);
          await evaluate(page, `(() => { const el = document.querySelector('[data-verify-hit="${f.hit}"]'); if (!el) return false; el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); el.style.outline = '2px solid magenta'; el.style.outlineOffset = '0'; return true; })()`);
          const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(file, Buffer.from(data, 'base64'));
          await evaluate(page, `(() => { const el = document.querySelector('[data-verify-hit="${f.hit}"]'); if (el) { el.style.outline = ''; el.style.outlineOffset = ''; } return true; })()`);
          made.push({ key, file });
        }
        return made;
      } : null;

      if (!selftestOnly) {
        // everything that needs a browser as one task list: the pool pulls the tasks in this order, the results are merged in task order
        const ovSizes = o.sizes || o.quick ? sizes : null;
        const tasks = [];
        const tempoUnits = tempoOn && !(scope && scope.none) ? inventoryUnits() : [];
        tasks.push(...tempoUnits.map((unit) => ({ kind: 'tempo', unit, label: unit.label })));
        if (doGeo) tasks.push(...geometryTasks({ pages, sizes, themes }));
        if (doSnap) tasks.push(...snapshotTasks({ pages }));
        if (doOv) tasks.push(...overlayTasks({ sizes: ovSizes, only: overlayOnly }));
        if (scope && !scope.all && !scope.none && !overlayOnly?.length) { /* no scenario affected */ }
        const gOpts = { viewFilter, shot }, sOpts = { viewFilter, update: o.update, outDir }, oOpts = { outDir: o.shots ? outDir : null };
        const res = await pool.run(tasks, (t, w) => {
          if (t.kind === 'geometry') return geometryTask(w, t, gOpts);
          if (t.kind === 'overlay') return overlayTask(w, t, oOpts);
          if (t.kind === 'snapshots') return snapshotTask(w, t, sOpts);
          return inventoryUnit(w.page, w.base, t.unit);
        });
        const pick = (k) => ({ tasks: tasks.filter((t) => t.kind === k), res: res.filter((_, i) => tasks[i].kind === k) });
        let g = null, ov = null;
        if (doGeo) {
          const { tasks: gt, res: gr } = pick('geometry');
          g = mergeGeometry(gt, gr);
          findings.push(...g.findings);
          warnings.push(...g.warnings);
          summary.push(`geometry ${g.states} states`);
          stats.geometryStates = g.states;
          stateTiming = g.timing;
          // screenshots: first one per finding group in task order, at most 12; files are numbered in that order
          const seen = new Set(); let n = 0;
          for (const r of gr) for (const sh of r.shots || []) {
            if (seen.has(sh.key) || n >= 12) { fs.rmSync(sh.file, { force: true }); continue; }
            seen.add(sh.key); n++;
            fs.renameSync(sh.file, path.join(outDir, `${String(n).padStart(2, '0')}-${path.basename(sh.file).replace(/^tmp-\d+-/, '')}`));
          }
          shotFiles = n;
        }
        if (doOv) {
          const { res: or } = pick('overlay');
          ov = mergeOverlay(or);
          findings.push(...ov.findings);
          summary.push(`overlay ${ov.scenarios} scenarios`);
          stats.overlayScenarios = ov.scenarios;
        }
        if (doSnap) {
          const { res: sr } = pick('snapshots');
          const sn = mergeSnapshots(sr);
          findings.push(...sn.findings);
          summary.push(o.update ? `snapshots ${sn.written} of ${sn.states} rewritten` : `snapshots ${sn.states}`);
          stats.snapshotStates = sn.states;
        }
        if (tempoUnits.length) {
          findings.push(...pick('tempo').res.flat());
          summary.push(inventorySummary(tempoUnits));
        }
        if (o.full && o.selftest && g && ov) baseRaw = { findings: [...g.findings, ...ov.findings], states: g.states, scenarios: ov.scenarios };
      }

      if (o.selftest) {
        tVerifyEnd = Date.now();
        selftestResult = await selftest(pool, { rules, sizes: sizes.length ? sizes : [parseSize('phone')], themes, pages, viewFilter, only: o.mutants, base: baseRaw || reportBase, baseSource: baseRaw ? 'this run' : reportBase ? path.basename(o.baseReport) : 'own pass' });
        const tm = o.mutants ? null : typesMutant(ROOT); // positive control of the type check (temp copy, no browser)
        const lm = o.mutants ? null : layersMutant(ROOT); // positive control of the import-direction rule (temp copy, no browser)
        const st = selftestResult;
        st.ok = st.ok && (!tm || tm.ok) && (!lm || lm.ok);
        const took = `${Math.round((Date.now() - tVerifyEnd) / 1000)} s`;
        st.lines = tm ? [...st.lines.slice(0, -1), tm.line, lm.line, st.ok ? `selftest GREEN · ${took} · exit 0` : `selftest RED · ${took} · exit 1`] : [...st.lines.slice(0, -1), st.lines.at(-1).replace(' · exit', ` · ${took} · exit`)];
        fs.writeFileSync(path.join(outDir, 'selftest.json'), JSON.stringify(st.report, null, 1));
        if (selftestOnly) {
          lines.push(...st.lines, `Report: ${path.join(outDir, 'selftest.json')}`);
          printOut(lines.slice(0, 10));
          return st.ok ? 0 : 1;
        }
      }
    }
  } catch (e) {
    envError = e;
  } finally {
    poolTimings = pool?.timings || [];
    await pool?.close().catch(() => {});
  }

  if (envError) {
    console.log(`verify: measurement aborted – ${envError.message}`);
    console.log('verify: measurement refused, no verdict on the UI · exit 2');
    if (!o.out) fs.rmSync(outDir, { recursive: true, force: true });
    return 2;
  }

  const kept = classify(findings, rules);
  const excepted = findings.length - kept.length;
  const gs = groups(kept);
  const known = gs.filter((g) => g.known), fresh = gs.filter((g) => !g.known);
  const fullMatrix = doGeo && doOv && !o.quick && !o.sizes && !o.themes && !o.pages && !o.views && !o.scenarios && !o.changed;
  const id = treeIdentity(ROOT);
  const seconds = Math.round(((tVerifyEnd || Date.now()) - t0) / 1000);
  const report = {
    at: new Date().toISOString(), seconds, summary, findings: kept, excepted, warnings,
    commit: id.commit, tree: id.tree, matrix: fullMatrix ? 'full' : 'partial', changed: o.changed ? describeScope(scope) : undefined,
    jobs: jobsUsed, mode: modeUsed, stats,
    timing: {
      tasks: poolTimings.slice().sort((a, b) => a.label.localeCompare(b.label)),
      states: stateTiming,
      stateMsTotal: stateTiming.reduce((n, x) => n + x.ms, 0), settleMsTotal: stateTiming.reduce((n, x) => n + x.settle, 0), probeMsTotal: stateTiming.reduce((n, x) => n + x.probe, 0),
    },
  };
  const reportFile = path.join(outDir, 'report.json');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 1));

  const wGroups = new Set(warnings.map((w) => `${w.rule}|${w.sel}`)).size;
  const line = (g) => {
    const where = [...g.views].slice(0, 2).join(',') + (g.views.size > 2 ? ',…' : '');
    return `${g.known ? 'KNOWN' : 'FINDING'} ${g.rule} ${g.page}/${where} [${[...g.sizes].join(',')}] ${g.sel} – ${g.text}${g.known ? ` (${g.known})` : ''}`.slice(0, 220);
  };
  // summary by known faults: id → groups, hits
  const knownIds = new Map();
  for (const g of known) { const k = knownIds.get(g.known) || { groups: 0, hits: 0, rules: new Set() }; k.groups++; k.hits += g.n; k.rules.add(g.rule); knownIds.set(g.known, k); }
  const tail = [...notes];
  if (warnings.length) tail.push(`Warnings: ${warnings.length} (${wGroups} groups, mostly contrast) – not blocking`);
  if (gs.length) tail.push(`Report: ${reportFile}${shotFiles ? ` · images: ${outDir}/*.png` : ''}`);
  tail.push(!gs.length ? `GREEN${excepted ? ` (${excepted} justified exceptions)` : ''}${o.changed ? ' – changed-only, not the full run' : ''} · exit 0`
    : `RED: ${fresh.length} new, ${known.length} known finding groups (${kept.length} hits)${excepted ? `, ${excepted} exceptions` : ''} · exit 1`);
  lines.push(`verify: ${summary.join(' · ')} · ${seconds} s${jobsUsed > 1 ? ` · ${jobsUsed} workers` : ''}`);
  if (o.verbose) lines.push(...gs.map(line));
  else {
    let budget = 10 - 1 - tail.length;
    const knownLines = [...knownIds].map(([id, k]) => `KNOWN ${id}: ${k.groups} groups, ${k.hits} hits (${[...k.rules].join(', ')})`);
    const kBudget = Math.min(knownLines.length, fresh.length ? 1 : budget);
    const fBudget = Math.max(0, budget - kBudget - (fresh.length > budget - kBudget ? 1 : 0));
    lines.push(...fresh.slice(0, fBudget).map(line));
    if (fresh.length > fBudget) lines.push(`… ${fresh.length - fBudget} more new groups (-v or the report)`);
    if (knownLines.length) {
      if (kBudget >= knownLines.length) lines.push(...knownLines);
      else lines.push(`KNOWN: ${[...knownIds].map(([id, k]) => `${id} ${k.hits}`).join(', ')}`);
    }
  }
  lines.push(...tail);
  printOut(o.verbose ? lines : lines.slice(0, 10));
  if (selftestResult) {
    lines.length = 0;
    printOut(selftestResult.lines);
    printOut([`Report: ${path.join(outDir, 'selftest.json')}`]);
  }
  const code = gs.length || (selftestResult && !selftestResult.ok) ? 1 : 0;
  if (!code && !o.out) fs.rmSync(outDir, { recursive: true, force: true });
  return code;
}

function printOut(lines) { for (const l of lines) console.log(l); }

/* ---- Selftest (positive control) ---- */
// base: { findings, states, scenarios } of a full run (this run or --base-report) or null (own pass through the pool)
async function selftest(pool, { rules, themes, pages, viewFilter, only, base, baseSource }) {
  const lines = [], report = { known: {}, mutants: {}, unexpected: [], base: baseSource, workers: pool.size };
  let ok = true;
  // 1. Base (full matrix): known faults must show up, nothing unknown otherwise. Taken over, not measured again, when a full run exists.
  let raw, states = 0, scenarios = 0;
  if (only) raw = [];
  else if (base) ({ findings: raw, states, scenarios } = base);
  else {
    const g = await runGeometry(pool, { pages, sizes: DEFAULT_SIZES.map(parseSize), themes, viewFilter });
    const ov = await runOverlay(pool, {});
    raw = [...g.findings, ...ov.findings]; states = g.states; scenarios = ov.scenarios;
  }
  const kept = classify(raw, rules);
  for (const k of rules.known) {
    // only known faults of the checks the selftest runs (geometry, overlay)
    if (k.match.check && !['geometry', 'overlay'].some((c) => new RegExp(k.match.check).test(c))) continue;
    const n = kept.filter((f) => f.known === k.id).length;
    report.known[k.id] = n;
    if (!n) ok = false;
  }
  const unexpected = groups(kept.filter((f) => !f.known));
  report.unexpected = unexpected.map((u) => ({ rule: u.rule, page: u.page, sel: u.sel, text: u.text, n: u.n, sizes: [...u.sizes], views: [...u.views] }));
  if (unexpected.length) ok = false;
  lines.push(`selftest: base ${states} states + ${scenarios} overlay scenarios (${baseSource}) · known red: ${Object.entries(report.known).map(([k, n]) => `${k} ${n ? 'yes' : 'NO'}`).join(', ')} · false alarms: ${unexpected.length}`);
  for (const u of unexpected.slice(0, 2)) lines.push(`  false alarm ${u.rule} ${u.page}/${[...u.views][0]} ${u.sel} – ${u.text}`.slice(0, 200));

  // 2. Mutants: each must produce a new finding of the expected rule. They run on the pool (one mutant per worker at a time)
  const baseKeys = new Set(kept.map((f) => `${f.rule}|${f.page}|${f.view}|${f.size}|${f.theme}|${f.sel}`));
  const mutate = async (m, w) => {
    // source mutants (m.patch: [{ file, from, to }]) are served patched by this worker; a patch that no longer applies is an error
    const rewrite = m.patch ? (p, buf) => {
      const edits = m.patch.filter((x) => p === `/${x.file}`);
      if (!edits.length) return buf;
      let text = buf.toString('utf8');
      for (const e of edits) { if (!text.includes(e.from)) throw new Error(`mutant ${m.id}: patch does not apply to ${e.file}`); text = text.replace(e.from, e.to); }
      return Buffer.from(text);
    } : null;
    return w.withRewrite(rewrite, (mbase) => (m.check === 'overlay'
      ? runOverlayOn(w, { base: mbase, sizes: m.sizes.map(parseSize), only: m.scenarios, css: m.css, js: m.js })
      : runGeometryOn(w, { base: mbase, pages: PAGES.filter((p) => p.id === m.page), sizes: m.sizes.map(parseSize), themes: ['dark'], viewFilter: (pg, v) => m.views.includes(v), css: m.css, js: m.js })));
  };
  const list = MUTANTS.filter((x) => !only || only.includes(x.id));
  const out = await pool.run(list.map((m) => ({ m, label: `mutant ${m.id}` })), async ({ m }, w) => ({ mg: await mutate(m, w), worker: w.id }));
  const res = [];
  list.forEach((m, i) => {
    const fresh = classify(out[i].mg.findings, rules).filter((f) => !baseKeys.has(`${f.rule}|${f.page}|${f.view}|${f.size}|${f.theme}|${f.sel}`) && m.expect.includes(f.rule));
    report.mutants[m.id] = { detected: fresh.length, worker: out[i].worker, sample: fresh.slice(0, 3).map((f) => `${f.rule} ${f.sel} ${f.text}`) };
    res.push(`${m.id} ${fresh.length ? 'detected' : 'MISSED'}`);
    if (!fresh.length) ok = false;
  });
  lines.push(`selftest: mutants ${res.join(', ')}`);

  // 3. Every worker must see a mutant through its own browser context and file delivery (a worker that does not would hide faults
  //    in the tasks it runs). Skipped with a single worker (the mutants above already ran there) and in the development mode.
  if (pool.size > 1 && !only) {
    const canary = MUTANTS.find((x) => x.id === 'tile-overlap');
    const seen = await pool.runAll(async (w) => {
      const mg = await mutate(canary, w);
      return classify(mg.findings, rules).some((f) => canary.expect.includes(f.rule) && !baseKeys.has(`${f.rule}|${f.page}|${f.view}|${f.size}|${f.theme}|${f.sel}`));
    });
    report.canary = seen;
    const n = seen.filter(Boolean).length;
    lines.push(`selftest: worker check (${canary.id}) seen by ${n} of ${pool.size} workers`);
    if (n !== pool.size) ok = false;
  }
  lines.push(ok ? 'selftest GREEN · exit 0' : 'selftest RED · exit 1');
  return { ok, lines, report };
}

main().then((code) => process.exit(code), (e) => { console.log(`verify: internal error – ${e.stack?.split('\n').slice(0, 2).join(' ')}`); process.exit(2); });
