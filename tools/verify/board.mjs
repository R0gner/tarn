// tarn · verify for a board outside the kit: `node <kit>/tools/verify.mjs --board <board folder | tarn-board.json> --base http://127.0.0.1:<port>`.
//
// The board describes itself in tarn-board.json (tools/lib/board.mjs): pages, snapshot folder, its own exceptions file, the fixed clock.
// The board's server is already running at --base; the kit checkout only brings the measuring tools. Checks of a board run:
//   lint       the board's own css/js/html (tokens only, no innerHTML, texts via t(), timers) against its own allow file
//   vendor     tools/vendor.mjs --check on the board's copy of the kit; names the version found; the server must deliver the same VERSION
//   geometry   overflow, truncation, overlap, touch targets, missing translations (i18n), favicon/title (identity), console errors
//   snapshots  text outline of every view and state against the board's own snapshot folder, with its fixed clock (--update rewrites)
//   overlay    the generic shell scenarios: sidebar, detail, menu over a sheet, sheet (on top, not inert, focus, behaviour)
//   tempo      animation inventory: endless animations of every view and the animations of those overlay scenarios (properties, token durations)
// Not part of a board run: the kit's own unit tests, kit lint, types, the gallery and the kit's mutants.
// Snapshots live in the board folder; images, diffs and report.json land in --out (default <board folder>/.tarn-verify), never in the kit.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emulate, evaluate, sleep } from '../lib/cdp.mjs';
import { createPool } from '../lib/pool.mjs';
import { loadBoard } from '../lib/board.mjs';
import { treeIdentity } from '../lib/tree.mjs';
import { DEFAULT_SIZES, QUICK_SIZES, THEMES, parseSize } from './targets.mjs';
import { geometryTask, geometryTasks, mergeGeometry, load, settle, goHash, readViews } from './geometry.mjs';
import { snapshotTask, mergeSnapshots, SNAP_SIZES } from './snapshots.mjs';
import { overlayTask, mergeOverlay, makeIO, kitModule, OVERLAY_SIZES } from './overlay.mjs';
import { loadRules, classify, groups, groupLine } from './rules.mjs';
import { makeShot, collectShots } from './shots.mjs';
import { runBoardLint, lintFindings } from '../lint.mjs';
import { HARNESS, checkInventory } from '../tempo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BOARD_CHECKS = ['lint', 'vendor', 'geometry', 'overlay', 'snapshots', 'tempo'];

/**
 * The overlay scenarios that are generic for any shell board: they use only kit parts and the board's own pages/details.
 * → { scenarios, notes }   (a board without a shell page or without a detail gets fewer scenarios, with a note)
 */
export function boardScenarios(board, pages = board.pages) {
  const MOD = kitModule(board.kitUrl);
  const notes = [];
  const shell = pages.find((p) => !p.views);
  if (!shell) return { scenarios: [], notes: ['overlay: no page with a shell navigation, no scenarios'] };
  const scenarios = [];
  scenarios.push({ id: 'sidebar', page: shell.id, pg: shell, hash: '', overlay: '.tn-sidebar', when: (sz) => sz.w < 1000, budget: 'panel',
    open: (io) => io.press('.tn-sb-toggle') });
  const detail = shell.details?.find((d) => d.includes('open='));
  if (detail) {
    // opened the way a tap does it: the router gets the hash with ?open=…, the shell chooses inspector or sheet
    scenarios.push({ id: 'detail', page: shell.id, pg: shell, hash: detail.split('?')[0], overlay: 'dialog.tn-sheet[open], .tn-inspector:not([hidden])', focus: 'modal',
      budget: { phone: 'panel', 'tablet-s': 'panel', desktop: 'desk' },
      open: async (io) => { await io.eval(`(() => { location.hash = ${JSON.stringify('#/' + detail)}; return true; })()`); await io.settle(); } });
  } else notes.push(`overlay: page ${shell.id} has no detail with ?open=…, scenario detail skipped`);
  scenarios.push({ id: 'sheet', page: shell.id, pg: shell, hash: '', overlay: 'dialog.tn-sheet[open]', focus: true, budget: 'panel',
    open: async (io) => {
      await io.eval(`${MOD}.then((m) => { m.openSheet({ title: 'Check', body: [m.button('Action')] }); return true; })`);
      await io.settle();
    } });
  scenarios.push({ id: 'menu', page: shell.id, pg: shell, hash: '', overlay: '.tn-menu', focus: true, budget: 'overlay',
    // a menu opened from inside a sheet must sit above it (overlay layer), take the focus and be reachable
    setup: async (io) => {
      await io.eval(`${MOD}.then((m) => { m.openSheet({ title: 'Check', body: [m.menu(m.iconButton('more', { label: 'Actions' }), [{ label: 'First', onClick() {} }, { label: 'Second', onClick() {} }])] }); return true; })`);
      await io.settle();
    },
    open: (io) => io.press('dialog.tn-sheet[open] [aria-label="Actions"]') });
  return { scenarios, notes };
}

/** vendor.mjs --check on the board's copy, plus: the server delivers the same VERSION. → { findings, summary, version, notes } */
export async function vendorCheck(board, base) {
  const findings = [], notes = [];
  const add = (text, sel = path.relative(board.dir, board.kit) || '.') => findings.push({ check: 'vendor', rule: 'vendor', page: '-', view: '-', size: '-', theme: '-', sel, where: '', text });
  const version = (() => { try { return fs.readFileSync(path.join(board.kit, 'VERSION'), 'utf8').trim(); } catch { return null; } })();
  const r = spawnSync(process.execPath, [path.join(ROOT, 'tools', 'vendor.mjs'), '--to', board.kit, '--check'], { encoding: 'utf8', timeout: 60000 });
  const lines = `${r.stdout}\n${r.stderr}`.split('\n').map((l) => l.trim()).filter(Boolean);
  if (r.status === 1) {
    for (const l of lines.filter((x) => /^(CHANGED|MISSING|FOREIGN|PROFILE)/.test(x))) add(l.slice(0, 200));
    if (!findings.length) add(lines.slice(0, 2).join(' ').slice(0, 200));
  } else if (r.status !== 0) add((lines[0] || 'vendor --check failed').replace(/^vendor: /, '').slice(0, 200));
  const upd = lines.find((l) => /^update available/.test(l));
  if (upd) notes.push(`kit copy ${version || '?'}, this checkout ${fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim()}: update available (vendor.mjs --to …)`);
  // the server must deliver the copy that was checked
  if (version) {
    try {
      const res = await fetch(new URL('../VERSION', base + board.kitUrl), { signal: AbortSignal.timeout(8000) });
      if (res.status === 200) { const served = (await res.text()).trim(); if (served !== version) add(`the server delivers kit ${served}, the copy in ${path.relative(board.dir, board.kit)} is ${version}`, 'server'); }
      else notes.push(`vendor: the server does not deliver ${new URL('../VERSION', base + board.kitUrl).pathname} (${res.status}); served version not compared`);
    } catch (e) { notes.push(`vendor: served version not compared (${e.message})`); }
  }
  return { findings, version, notes, summary: `kit ${version ? `tarn ${version}` : 'unknown'} · vendor ${findings.length ? 'RED' : 'ok'}` };
}

/** Endless animations of every view (desktop, dark): only transform/opacity, durations are tokens. */
async function staticInventory(w, pg, base) {
  const out = [];
  const { page } = w;
  const size = { name: 'desktop', w: 1440, h: 900, dpr: 1, mobile: false };
  await emulate(page, size, 'dark');
  await load(page, base + pg.path, { push: () => {} });
  await settle(page);
  await evaluate(page, HARNESS);
  const tok = new Set(Object.values(await evaluate(page, 'window.__tp.tokens()')).map(Math.round));
  const views = await readViews(page, pg);
  for (const view of [...views, ...(pg.details || [])]) {
    await goHash(page, view);
    await settle(page);
    const list = await evaluate(page, 'document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations === Infinity).map(window.__tp.animInfo)');
    const seen = new Set();
    for (const a of list) {
      const key = `${a.name}|${a.duration}`;
      if (seen.has(key)) continue; seen.add(key);
      const text = [!tok.has(a.duration) ? `${a.target} @${a.name}: endless animation ${a.duration} ms is not a token` : null,
        a.props.some((p) => !['transform', 'opacity'].includes(p)) ? `${a.target} @${a.name}: animates ${a.props.filter((p) => !['transform', 'opacity'].includes(p)).join(', ')}` : null].filter(Boolean);
      for (const t of text) out.push({ check: 'tempo', rule: 'inventory', page: pg.id, view, size: '-', theme: 'dark', sel: `static:${view}`, where: '', text: t });
    }
  }
  return out;
}

/** Animations that start while a generic scenario opens its overlay: properties, token durations, budget class of the scenario. */
async function scenarioInventory(w, task, base) {
  const { sc, size } = task;
  const { page } = w;
  await emulate(page, size, 'dark');
  await load(page, `${base}${sc.pg.path}#/${sc.hash}`, { push: () => {} });
  await settle(page);
  await evaluate(page, HARNESS);
  const tokens = await evaluate(page, 'window.__tp.tokens()');
  const io = makeIO(page, size);
  if (sc.setup) await sc.setup(io);
  await evaluate(page, 'window.__tp.begin(() => 0)');
  try { await sc.open(io); } catch (e) { if (!e.missing) throw e; await evaluate(page, 'window.__tp.end()'); return []; }   // a missing trigger is reported by the overlay check
  await sleep(450);
  const res = await evaluate(page, 'window.__tp.end()');
  return checkInventory(res.anims, { budgetClass: sc.budget, dir: 'open' }, size, tokens)
    .map((text) => ({ check: 'tempo', rule: 'inventory', page: sc.page, view: sc.id, size: size.name, theme: 'dark', sel: sc.id, where: '', text }));
}

const names = (list) => list.map((s) => s.name);

/**
 * The board run. o: { board, base, out?, only?, skip?, quick?, sizes?, themes?, pages?, views?, scenarios?, update?, attach?, chrome?, ci?, shots?, verbose? }
 * → { code, lines, report, outDir } (code 0 green · 1 findings · 2 measurement refused or environment broken); prints nothing.
 */
export async function runBoard(o) {
  const refuse = (msg) => ({ code: 2, lines: [`verify: ${msg}`, 'verify: measurement refused, no verdict on the UI · exit 2'], report: null, outDir: null });
  let board;
  try { board = loadBoard(o.board); } catch (e) { return { code: 2, lines: [`verify: ${e.message}`], report: null, outDir: null }; }
  if (!o.base) return refuse('--board needs --base http://127.0.0.1:<port> (the running server of the board)');
  const base = o.base.replace(/\/+$/, '');
  const only = o.update ? ['snapshots'] : o.only;
  for (const c of [...(only || []), ...(o.skip || [])]) if (!BOARD_CHECKS.includes(c)) return refuse(`unknown check ${c} for a board (${BOARD_CHECKS.join(', ')}); the kit's own tests and types are not part of a board run`);
  const run = (c) => (only ? only.includes(c) : true) && !(o.skip || []).includes(c);

  const outDir = o.out ? path.resolve(o.out) : path.join(board.dir, '.tarn-verify');
  if (outDir === ROOT || outDir.startsWith(ROOT + path.sep)) return refuse(`--out is inside the kit (${ROOT}); snapshots and reports belong to the board`);
  fs.mkdirSync(outDir, { recursive: true });
  if (!o.out && !fs.existsSync(path.join(outDir, '.gitignore'))) fs.writeFileSync(path.join(outDir, '.gitignore'), '*\n');
  for (const f of fs.readdirSync(outDir)) if (/\.(png|diff)$/.test(f) || f === 'report.json') fs.rmSync(path.join(outDir, f), { force: true });

  let rules;
  try { rules = loadRules(board.exceptions, { optional: !board.exceptionsGiven }); } catch (e) { return refuse(`exceptions file ${board.exceptions}: ${e.message}`); }

  // pages × sizes × themes: the board file narrows the defaults, the command line narrows again
  const globalSizes = o.sizes || (o.quick ? QUICK_SIZES : DEFAULT_SIZES);
  const globalThemes = o.themes || (o.quick ? ['dark'] : THEMES);
  if (o.sizes) for (const s of o.sizes) if (!parseSize(s)) return refuse(`unknown size ${s}`);
  if (globalThemes.some((t) => !THEMES.includes(t))) return refuse('--themes: dark and/or light');
  let pages = board.pages.map((p) => ({ ...p, sizes: p.sizes ? p.sizes.filter((s) => !o.sizes || o.sizes.includes(s)) : globalSizes, themes: p.themes ? p.themes.filter((t) => globalThemes.includes(t)) : globalThemes }));
  if (o.pages) pages = pages.filter((p) => o.pages.includes(p.id));
  pages = pages.filter((p) => p.sizes.length && p.themes.length);
  if (!pages.length) return refuse(`no page selected (${board.pages.map((p) => p.id).join(', ')})`);
  const sizeObjs = [...new Set(pages.flatMap((p) => p.sizes))].map((s) => parseSize(s));
  const viewFilter = o.views ? (pg, v) => o.views.includes(v) : null;

  const t0 = Date.now();
  const findings = [], warnings = [], summary = [], notes = [];
  const stats = {};
  let kitVersion = null;

  if (run('lint')) {
    const r = lintFindings(runBoardLint(board));
    findings.push(...r.findings); summary.push(r.summary);
  }
  if (run('vendor')) {
    const r = await vendorCheck(board, base);
    findings.push(...r.findings); notes.push(...r.notes); kitVersion = r.version;
    summary.unshift(r.summary);
  }
  kitVersion ||= (() => { try { return fs.readFileSync(path.join(board.kit, 'VERSION'), 'utf8').trim(); } catch { return null; } })();

  const doGeo = run('geometry'), doSnap = run('snapshots'), doOv = run('overlay'), doInv = run('tempo') && !o.views;
  let pool = null, shotFiles = 0;
  try {
    if (doGeo || doSnap || doOv || doInv) {
      try { await fetch(base + pages[0].path, { signal: AbortSignal.timeout(8000) }); } catch (e) { throw Object.assign(new Error(`the board server at ${base} does not answer (${e.message}); start it first`), { env: true }); }
      try { pool = await createPool({ attach: o.attach, base, proxy: true, chrome: o.chrome, noSandbox: o.ci, jobs: o.jobs, root: ROOT, tmp: outDir }); } catch (e) { throw Object.assign(e, { env: true }); }
      const shot = o.shots === false ? null : makeShot({ outDir, rules });
      const { scenarios, notes: scNotes } = doOv || doInv ? boardScenarios(board, pages) : { scenarios: [], notes: [] };
      const picked = scenarios.filter((sc) => !o.scenarios || o.scenarios.includes(sc.id));
      const ovSizes = (o.sizes || o.quick ? sizeObjs : OVERLAY_SIZES.map(parseSize));
      const tasks = [];
      if (doGeo) tasks.push(...geometryTasks({ pages, sizes: sizeObjs, themes: THEMES }));
      if (doSnap) for (const pg of pages) {
        const snapSizes = pg.sizes.filter((s) => SNAP_SIZES.includes(s));
        for (const sn of snapSizes.length ? snapSizes : pg.sizes.slice(0, 1)) tasks.push({ kind: 'snapshots', pg, sn, label: `snapshots ${pg.id} ${sn}` });
      }
      if (doOv) for (const size of ovSizes) for (const sc of picked) if (!sc.when || sc.when(size)) tasks.push({ kind: 'overlay', size, sc, label: `overlay ${sc.id} ${size.name}` });
      if (doInv) {
        for (const pg of pages) tasks.push({ kind: 'inv-static', pg, label: `inventory static ${pg.id}` });
        for (const size of ovSizes) for (const sc of picked) if (!sc.when || sc.when(size)) tasks.push({ kind: 'inv-scenario', size, sc, label: `inventory ${sc.id} ${size.name}` });
      }
      if (doOv || doInv) notes.push(...scNotes);
      const gOpts = { viewFilter, shot }, sOpts = { viewFilter, update: o.update, outDir, snapDir: board.snapshots, relTo: board.dir, fixedTime: board.clockMs }, oOpts = { outDir: o.shots === false ? null : outDir };
      const res = await pool.run(tasks, (t, w) => {
        if (t.kind === 'geometry') return geometryTask(w, t, gOpts);
        if (t.kind === 'overlay') return overlayTask(w, t, oOpts);
        if (t.kind === 'snapshots') return snapshotTask(w, t, sOpts);
        if (t.kind === 'inv-static') return staticInventory(w, t.pg, base);
        return scenarioInventory(w, t, base);
      });
      const pick = (k) => ({ tasks: tasks.filter((t) => t.kind === k), res: res.filter((_, i) => tasks[i].kind === k) });
      if (doGeo) {
        const { tasks: gt, res: gr } = pick('geometry');
        const g = mergeGeometry(gt, gr);
        findings.push(...g.findings); warnings.push(...g.warnings);
        summary.push(`geometry ${g.states} states`); stats.geometryStates = g.states;
        shotFiles = collectShots(gr, outDir);
      }
      if (doOv) {
        const ov = mergeOverlay(pick('overlay').res);
        findings.push(...ov.findings);
        summary.push(`overlay ${ov.scenarios} scenarios`); stats.overlayScenarios = ov.scenarios;
      }
      if (doSnap) {
        const sn = mergeSnapshots(pick('snapshots').res);
        findings.push(...sn.findings);
        summary.push(o.update ? `snapshots ${sn.written} of ${sn.states} rewritten` : `snapshots ${sn.states}`); stats.snapshotStates = sn.states;
      }
      if (doInv) {
        const inv = [...pick('inv-static').res, ...pick('inv-scenario').res];
        findings.push(...inv.flat());
        summary.push(`inventory ${inv.length} units`); stats.inventoryUnits = inv.length;
      }
    }
  } catch (e) {
    await pool?.close().catch(() => {});
    return { code: 2, lines: [`verify: measurement aborted – ${e.message}`, 'verify: measurement refused, no verdict on the UI · exit 2'], report: null, outDir };
  }
  await pool?.close().catch(() => {});

  const kept = classify(findings, rules);
  const excepted = findings.length - kept.length;
  const gs = groups(kept);
  const known = gs.filter((g) => g.known), fresh = gs.filter((g) => !g.known);
  const seconds = Math.round((Date.now() - t0) / 1000);
  const id = treeIdentity(ROOT);
  const report = { at: new Date().toISOString(), board: board.name, boardFile: board.file, base, kit: kitVersion, kitCheckout: { commit: id.commit, tree: id.tree }, seconds, summary, findings: kept, excepted, warnings, stats };
  const reportFile = path.join(outDir, 'report.json');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 1));

  const tail = notes.slice(0, 2);
  if (notes.length > 2) tail.push(`… ${notes.length - 2} more notes (report.json)`);
  if (warnings.length) tail.push(`Warnings: ${warnings.length} (${new Set(warnings.map((w) => `${w.rule}|${w.sel}`)).size} groups, mostly contrast) – not blocking`);
  if (gs.length) tail.push(`Report: ${reportFile}${shotFiles ? ` · images: ${outDir}/*.png` : ''}`);
  tail.push(!gs.length ? `GREEN${excepted ? ` (${excepted} justified exceptions)` : ''} · exit 0` : `RED: ${fresh.length} new, ${known.length} known finding groups (${kept.length} hits)${excepted ? `, ${excepted} exceptions` : ''} · exit 1`);
  report.notes = notes;
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 1));
  const lines = [`verify (board ${board.name}): ${summary.join(' · ')} · ${seconds} s`];
  if (o.verbose) lines.push(...gs.map(groupLine));
  else {
    const budget = 10 - 1 - tail.length - (known.length ? 1 : 0);
    const room = fresh.length > budget ? Math.max(0, budget - 1) : budget;
    lines.push(...fresh.slice(0, room).map(groupLine));
    if (fresh.length > room) lines.push(`… ${fresh.length - room} more new groups (-v or the report)`);
    if (known.length) lines.push(`KNOWN: ${known.length} groups (${[...new Set(known.map((g) => g.known))].join(', ')})`);
  }
  lines.push(...tail);
  return { code: gs.length ? 1 : 0, lines, report, outDir };
}
