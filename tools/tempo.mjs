#!/usr/bin/env node
// tarn · tempo: response times and animation inventory via CDP. Node ≥ 22, no npm packages.
//
//   node tools/tempo.mjs --attach http://127.0.0.1:<port> [options]      frame measurement (visible Chrome)
//   node tools/tempo.mjs --inventory [--attach URL]                       animation inventory only (also headless/CI)
//
// Measurement: per case (tools/tempo/cases.mjs), size (phone = 390×844 touch, tablet-s = 700 touch, desktop = 1440×900 mouse)
// and CPU throttling (4× and 1×) 2 warm-up and 7 measured runs; median and max of
//   first visible change (10 %), half (50 %), done (98 %) – rAF sampler of the real element state
//   handler processing and input → next frame (Event Timing; a missing entry means < 16 ms)
//   long animation frames (the longest in the window)
// Inventory: document.getAnimations() during the interaction: property, duration, repetition against tokens
//   (--tn-t-open/-close/-loop-*) and budget class; plus endless animations of static views.
//
// Exit: 0 within budget · 1 budget exceeded or inventory finding · 2 measurement refused (tab not in front,
// spread of the first change > 2 frames even after a retry, environment broken).
//
// Options:
//   --cases LIST     only these cases (IDs)       --sizes phone,tablet-s,desktop      --cpu 4,1
//   --runs N         measured runs (default 7)    --warmup N (default 2)
//   --out DIR        raw data (tempo.json) and table (tempo.md); default: temp folder, the path is printed
//   --save FILE      save the result as a comparison state (outside the repo)
//   --compare FILE   compare against a saved state (Δ of the medians)
//   --base URL       use a running server         --chrome PATH    --table   print the table
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, emulate, evaluate, sleep } from './lib/cdp.mjs';
import { startServer } from './lib/static-server.mjs';
import { load, settle } from './verify/geometry.mjs';
import { PAGES, SIZES } from './verify/targets.mjs';
import { CASES, BUDGETS, GLOBAL, STATIC_VIEWS } from './tempo/cases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FRAME = 1000 / 60;
const pick = (v, size) => (v && typeof v === 'object' && !Array.isArray(v) ? v[size] : v);
const med = (a) => { const b = a.filter((x) => x != null).sort((x, y) => x - y); return b.length ? b[Math.floor((b.length - 1) / 2)] : null; };
const max = (a) => { const b = a.filter((x) => x != null); return b.length ? Math.max(...b) : null; };
const r1 = (x) => (x == null ? null : Math.round(x * 10) / 10);

/* ---- Measurement harness in the page context ---- */
export const HARNESS = `(() => {
  if (window.__tp) return true;
  const tp = window.__tp = { ev: [], loaf: [], marks: [], samples: [], anims: [], run: false };
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) tp.ev.push({ n: e.name, st: e.startTime, ps: e.processingStart, pe: e.processingEnd, d: e.duration }); }).observe({ type: 'event', buffered: false, durationThreshold: 16 }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) tp.loaf.push({ st: e.startTime, d: e.duration }); }).observe({ type: 'long-animation-frame', buffered: false }); } catch {}
  for (const t of ['pointerdown', 'pointerup', 'pointerover', 'click', 'keydown']) addEventListener(t, (e) => { if (tp.run) tp.marks.push({ t, ts: e.timeStamp }); }, true);
  const desc = (el) => !el ? '?' : el.nodeType !== 1 ? '::' : el.tagName.toLowerCase() + (el.classList.length ? '.' + [...el.classList].filter((c) => !/^is-/.test(c)).slice(0, 2).join('.') : '');
  tp.animInfo = (a) => {
    const t = a.effect?.getComputedTiming?.() || {};
    let props = [];
    if (a.transitionProperty) props = [a.transitionProperty];
    else { try { props = [...new Set(a.effect.getKeyframes().flatMap((k) => Object.keys(k).filter((x) => !['offset', 'easing', 'composite', 'computedOffset'].includes(x))))]; } catch {} }
    // Transitions: declared duration from the style (reversed, interrupted transitions run shortened)
    let duration = typeof t.duration === 'number' ? Math.round(t.duration) : null, delay = Math.round(t.delay || 0);
    if (a.transitionProperty && a.effect?.target) {
      try {
        const cs = getComputedStyle(a.effect.target, a.effect.pseudoElement || null);
        const list = cs.transitionProperty.split(',').map((x) => x.trim()), durs = cs.transitionDuration.split(',').map((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 1 : 1000));
        const dels = cs.transitionDelay.split(',').map((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 1 : 1000));
        let i = list.indexOf(a.transitionProperty); if (i < 0) i = list.indexOf('all');
        if (i >= 0) { duration = Math.round(durs[i % durs.length]); delay = Math.round(dels[i % dels.length]); }
      } catch {}
    }
    return { kind: a.constructor.name, name: a.animationName || a.transitionProperty || a.id || '', props: props.map((p) => p.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())),
      duration, delay, iterations: t.iterations === Infinity ? 'infinite' : t.iterations,
      target: desc(a.effect?.target) + (a.effect?.pseudoElement || '') };
  };
  tp.begin = (prog) => {
    tp.samples = []; tp.marks = []; tp.ev = []; tp.loaf = []; tp.anims = []; tp.run = true; tp.prog = prog;
    const seen = new Set(document.getAnimations()); // only animations that start after the input
    const tick = (now) => {
      if (!tp.run) return;
      let v; try { v = prog(); } catch { v = null; }
      tp.samples.push([now, v]);
      for (const a of document.getAnimations()) if (!seen.has(a)) { seen.add(a); tp.anims.push(tp.animInfo(a)); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return true;
  };
  tp.last = () => (tp.samples.length ? tp.samples[tp.samples.length - 1][1] : null);
  tp.end = () => { tp.run = false; return { marks: tp.marks, samples: tp.samples, ev: tp.ev, loaf: tp.loaf, anims: tp.anims }; };
  tp.fps = () => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 300) requestAnimationFrame(f); else res({ fps: n / ((performance.now() - t0) / 1000), vis: document.visibilityState }); }; requestAnimationFrame(f); });
  tp.tokens = () => { const cs = getComputedStyle(document.documentElement); const ms = (v) => { v = v.trim(); return v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000; };
    return { open: ms(cs.getPropertyValue('--tn-t-open')), close: ms(cs.getPropertyValue('--tn-t-close')), pulse: ms(cs.getPropertyValue('--tn-t-loop-pulse')), indet: ms(cs.getPropertyValue('--tn-t-loop-indet')) }; };
  return true;
})()`;

/** Evaluation of one run. */
function analyze(res, { ref, dir, delay = 0 }) {
  // Hover: the last pointerover counts (the first one comes from the approach across neighbouring elements)
  const mark = ref === 'pointerover' ? res.marks.filter((m) => m.t === ref).pop() : res.marks.find((m) => m.t === ref);
  if (!mark) return { error: `no ${ref} event` };
  const t0 = mark.ts;
  let s = res.samples;
  // Press: count only until release (feedback must appear while the finger is down)
  const up = ref === 'pointerdown' && res.marks.find((m) => m.t === 'pointerup' && m.ts >= t0);
  if (up) s = s.filter(([t]) => t < up.ts);
  // Values (not numbers): start = 0, last value in the window = 1, anything in between 0.5
  if (s.some(([, v]) => typeof v !== 'number')) {
    const first = JSON.stringify(s[0]?.[1]), last = JSON.stringify(s[s.length - 1]?.[1]);
    s = first === last ? s.map(([t]) => [t, 0]) : s.map(([t, v]) => [t, JSON.stringify(v) === first ? 0 : JSON.stringify(v) === last ? 1 : 0.5]);
  }
  const at = (pred) => { const x = s.find(([t, p]) => t >= t0 && p != null && pred(p)); return x ? x[0] - t0 : null; };
  const open = dir === 'open';
  const pre = s.filter(([t]) => t < t0).pop();
  if (pre && pre[1] != null && (open ? pre[1] > 0.5 : pre[1] < 0.5)) return { error: 'wrong initial state' };
  const first = at((p) => (open ? p >= 0.1 : p <= 0.9)), half = at((p) => (open ? p >= 0.5 : p <= 0.5)), done = at((p) => (open ? p >= 0.98 : p <= 0.02));
  const ev = res.ev.filter((e) => e.n === (ref === 'pointerover' ? 'pointerover' : ref) && e.st >= t0 - 1).sort((a, b) => a.st - b.st)[0]
    || res.ev.filter((e) => e.st >= t0 - 1 && ['click', 'pointerdown', 'pointerup', 'keydown'].includes(e.n)).sort((a, b) => b.d - a.d)[0];
  const evAll = res.ev.filter((e) => e.st >= t0 - 1);
  const loaf = res.loaf.filter((l) => l.st + l.d >= t0 - 5 && l.st <= t0 + 1000);
  const adj = (x) => (x == null ? null : Math.max(0, x - delay));
  return {
    first: r1(adj(first)), half: r1(adj(half)), done: r1(adj(done)),
    proc: ev ? r1(ev.pe - ev.ps) : null, evDur: evAll.length ? Math.max(...evAll.map((e) => e.d)) : null,
    loaf: loaf.length ? r1(Math.max(...loaf.map((l) => l.d))) : 0,
  };
}

/* ---- Input ---- */
async function center(page, targetJs) {
  return evaluate(page, `(() => { const el = (${targetJs}); if (!el) return null; el.scrollIntoView?.({ block: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
}
async function input(page, kind, p, mobile) {
  const touch = (type) => page.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: p.x, y: p.y, id: 0 }] });
  const mouse = (type, q = p) => page.send('Input.dispatchMouseEvent', { type, x: q.x, y: q.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
  if (kind === 'hint') {
    if (mobile) { await touch('touchStart'); await sleep(900); return () => touch('touchEnd'); }
    await mouse('mouseMoved', { x: p.x - 40, y: p.y - 40 }); await sleep(30); await mouse('mouseMoved'); await sleep(700);
    return () => mouse('mouseMoved', { x: 2, y: 2 });
  }
  const hold = kind === 'press' ? 250 : 40;
  if (mobile) { await touch('touchStart'); await sleep(hold); await touch('touchEnd'); }
  else { await mouse('mouseMoved'); await sleep(20); await mouse('mousePressed'); await sleep(hold); await mouse('mouseReleased'); }
  return null;
}

/* ---- one case ---- */
async function runCase(page, base, c, size, cpu, { runs, warmup, inventoryOnly }) {
  const pg = PAGES.find((p) => p.id === c.page);
  const mobile = size.mobile;
  await emulate(page, size, 'dark');
  await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await load(page, `${base}${pg.path}#/${c.hash}`, { push: () => {} });
  await settle(page);
  await evaluate(page, HARNESS);
  if (page.kind === 'attach') await page.send('Page.bringToFront');
  const fps = await evaluate(page, 'window.__tp.fps()');
  if (!inventoryOnly && (fps.vis !== 'visible' || fps.fps < 45)) return { refused: `tab not in front (${fps.vis}, ${Math.round(fps.fps)} fps)` };
  await page.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  const ref = pick(c.ref, size.name) || 'click', delay = pick(c.delay, size.name) || 0;
  const trials = [], anims = [];
  const total = inventoryOnly ? 1 : warmup + runs;
  for (let i = 0; i < total; i++) {
    if (c.pre) await evaluate(page, c.pre);
    await settle(page, { max: 1500 });
    const p = await center(page, c.target);
    if (!p) return { refused: `trigger missing (${c.id})`, env: true };
    await sleep(120);
    await evaluate(page, `window.__tp.begin(${c.prog})`);
    await sleep(80);
    const release = await input(page, pick(c.input, size.name), p, mobile);
    const goal = c.dir === 'open' ? 0.98 : 0.02;
    for (let k = 0; k < 20; k++) {
      await sleep(80);
      const v = await evaluate(page, 'window.__tp.last()');
      if (typeof v === 'number' && (c.dir === 'open' ? v >= goal : v <= goal)) break;
      if (typeof v !== 'number' && k >= 4) break;
    }
    await sleep(250);
    const res = await evaluate(page, 'window.__tp.end()');
    if (release) await release();
    anims.push(...res.anims);
    const a = analyze(res, { ref, dir: c.dir, delay });
    if (i >= (inventoryOnly ? 0 : warmup)) trials.push(a);
    if (c.reset) await evaluate(page, c.reset);
  }
  await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const ok = trials.filter((t) => !t.error);
  const sum = { n: ok.length, errors: trials.filter((t) => t.error).map((t) => t.error).slice(0, 1) };
  for (const k of ['first', 'half', 'done', 'proc', 'evDur', 'loaf']) { sum[k] = r1(med(ok.map((t) => t[k]))); sum[`${k}Max`] = r1(max(ok.map((t) => t[k]))); }
  const firsts = ok.map((t) => t.first).filter((x) => x != null);
  sum.spread = firsts.length ? r1(Math.max(...firsts) - Math.min(...firsts)) : null;
  sum.evP95 = r1(max(ok.map((t) => t.evDur))); // n = 7: p95 ≈ Max
  return { sum, anims };
}

/* ---- Inventory check ---- */
export function checkInventory(anims, c, size, tokens) {
  const out = [];
  const budgetClass = pick(c.budgetClass, size.name);
  const b = BUDGETS[budgetClass];
  const tok = new Set(Object.values(tokens).map(Math.round));
  const limit = c.dir === 'close' && b.animClose != null ? b.animClose : b.anim;
  const seen = new Set();
  for (const a of anims) {
    if (a.iterations === 'infinite') continue; // endless animations are checked by the static inventory
    if (a.props.length === 1 && a.props[0] === 'visibility') continue; // discrete, only the hide delay (like the lint exception scrim-sichtbarkeit)
    const key = `${a.target}|${a.props.join(',')}|${a.duration}`;
    if (seen.has(key)) continue; seen.add(key);
    const bad = a.props.filter((p) => !['transform', 'opacity', 'translate', 'scale', 'rotate'].includes(p) && !(p === 'background-color' && budgetClass !== 'press'));
    if (bad.length) out.push(`${a.target}: animates ${bad.join(', ')}`);
    if (a.duration != null && a.duration > 0 && !tok.has(a.duration)) out.push(`${a.target}: duration ${a.duration} ms is not a token (${[...tok].join('/')})`);
    if (a.duration != null && a.duration + a.delay > limit) out.push(`${a.target} ${a.props.join(',')}: ${a.duration + a.delay} ms > ${limit} ms (${b.note})`);
  }
  return out;
}
async function staticInventory(page, base, tokens) {
  const out = [];
  let tok = tokens ? new Set(Object.values(tokens).map(Math.round)) : null;
  for (const v of STATIC_VIEWS) {
    const pg = PAGES.find((p) => p.id === v.page);
    await emulate(page, { name: 'desktop', ...SIZES.desktop }, 'dark');
    await load(page, `${base}${pg.path}#/${v.hash}`, { push: () => {} });
    await sleep(600);
    await evaluate(page, HARNESS);
    tok ||= new Set(Object.values(await evaluate(page, 'window.__tp.tokens()')).map(Math.round));
    const list = await evaluate(page, 'document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations === Infinity).map(window.__tp.animInfo)');
    const seen = new Set();
    for (const a of list) {
      const key = `${a.name}|${a.duration}`;
      if (seen.has(key)) continue; seen.add(key);
      if (!tok.has(a.duration)) out.push({ id: `static:${v.hash}`, size: '-', text: `${a.target} @${a.name}: endless animation ${a.duration} ms is not a token` });
      const bad = a.props.filter((p) => !['transform', 'opacity'].includes(p));
      if (bad.length) out.push({ id: `static:${v.hash}`, size: '-', text: `${a.target} @${a.name}: animates ${bad.join(', ')}` });
    }
  }
  return out;
}

/* ---- Budget check ---- */
function budgetIssues(c, size, s) {
  const b = BUDGETS[pick(c.budgetClass, size.name)];
  const out = [];
  const done = c.dir === 'close' && b.doneClose != null ? b.doneClose : b.done;
  if (s.first == null) out.push(pick(c.ref, size.name) === 'pointerdown' ? 'no visible change while pressed' : 'no visible change');
  else if (s.first > b.first) out.push(`first change ${s.first} > ${b.first}`);
  if (s.done == null) { if (s.first != null) out.push('not done'); }
  else if (s.done > done) out.push(`done ${s.done} > ${Math.round(done)}`);
  if (s.proc != null && s.proc > (c.handler ?? GLOBAL.handler)) out.push(`handler ${s.proc} > ${c.handler ?? GLOBAL.handler}`);
  if (s.loafMax != null && s.loafMax > (c.loaf ?? GLOBAL.loaf)) out.push(`long animation frame ${s.loafMax} > ${c.loaf ?? GLOBAL.loaf}`);
  if (s.evP95 != null && s.evP95 > (c.inputFrame ?? GLOBAL.inputFrameP95)) out.push(`Input→frame ${s.evP95} > ${c.inputFrame ?? GLOBAL.inputFrameP95}`);
  return out;
}

/**
 * Inventory for verify (also headless), split into independent units so that verify can run them on parallel workers:
 * one unit per case × size, plus one for the endless animations of the static views. → [{ label, case?, size?, static? }]
 */
export function inventoryUnits() {
  const units = [];
  for (const c of CASES) for (const sn of c.sizes) units.push({ label: `tempo ${c.id} ${sn}`, c, sn });
  units.push({ label: 'tempo static', static: true });
  return units;
}

/** One unit on one page → findings */
export async function inventoryUnit(page, base, unit) {
  const findings = [];
  if (unit.static) {
    for (const x of await staticInventory(page, base, null)) findings.push({ check: 'tempo', rule: 'inventory', page: 'gallery', view: x.id, size: '-', theme: 'dark', sel: x.id, where: '', text: x.text });
    return findings;
  }
  const { c, sn } = unit;
  const size = { name: sn, ...SIZES[sn] };
  if (process.env.TN_DEBUG) console.error(`tempo: inventory ${c.id} ${sn}`);
  const r = await runCase(page, base, c, size, 1, { runs: 1, warmup: 0, inventoryOnly: true });
  if (r.refused) throw Object.assign(new Error(r.refused), { env: true });
  const tokens = await evaluate(page, 'window.__tp.tokens()');
  for (const t of checkInventory(r.anims, c, size, tokens)) findings.push({ check: 'tempo', rule: 'inventory', page: c.page, view: c.id, size: sn, theme: 'dark', sel: c.id, where: '', text: t });
  return findings;
}

export const inventorySummary = (units) => `tempo-inventory ${units.filter((u) => !u.static).length} cases`;

/** Serial run of all units on one page: { findings, summary } */
export async function inventoryFindings(page, base) {
  const units = inventoryUnits();
  const findings = [];
  for (const u of units) findings.push(...await inventoryUnit(page, base, u));
  return { findings, summary: inventorySummary(units) };
}

/* ---- CLI ---- */
function parseArgs(argv) {
  const o = { runs: 7, warmup: 2, cpu: [4, 1], sizes: ['phone', 'tablet-s', 'desktop'] };
  const die = (m) => { console.log(`tempo: ${m}`); process.exit(2); };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => (i + 1 < argv.length ? argv[++i] : die(`${a} needs a value`));
    if (a === '--attach') o.attach = next();
    else if (a === '--base') o.base = next().replace(/\/+$/, '');
    else if (a === '--chrome') o.chrome = next();
    else if (a === '--cases') o.cases = next().split(',');
    else if (a === '--sizes') o.sizes = next().split(',');
    else if (a === '--cpu') o.cpu = next().split(',').map(Number);
    else if (a === '--runs') o.runs = +next();
    else if (a === '--warmup') o.warmup = +next();
    else if (a === '--out') o.out = next();
    else if (a === '--save') o.save = next();
    else if (a === '--compare') o.compare = next();
    else if (a === '--inventory') o.inventory = true;
    else if (a === '--table') o.table = true;
    else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n')); process.exit(0); }
    else die(`unknown option ${a}`);
  }
  for (const f of [o.out, o.save].filter(Boolean)) { const p = path.resolve(f); if (p.startsWith(ROOT + path.sep)) die(`${f} is inside the repo`); }
  return o;
}

function table(rows, compare) {
  const cmp = new Map((compare || []).map((r) => [`${r.id}|${r.size}|${r.cpu}`, r]));
  const d = (r, k) => { const c = cmp.get(`${r.id}|${r.size}|${r.cpu}`); return c && c[k] != null && r[k] != null ? ` (${r[k] - c[k] >= 0 ? '+' : ''}${r1(r[k] - c[k])})` : ''; };
  const f = (v, m) => (v == null ? '–' : m != null && m !== v ? `${v} / ${m}` : `${v}`);
  const lines = ['| Case | Size | CPU | first change | half | done | Handler | Input→frame | LoAF | Budget |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const r of rows) {
    if (r.refused) { lines.push(`| ${r.id} | ${r.size} | ${r.cpu}× | refused: ${r.refused} | | | | | | |`); continue; }
    lines.push(`| ${r.id} | ${r.size} | ${r.cpu}× | ${f(r.first, r.firstMax)}${d(r, 'first')} | ${f(r.half)} | ${f(r.done, r.doneMax)}${d(r, 'done')} | ${r.proc == null ? '< 16' : f(r.proc, r.procMax)} | ${r.evP95 == null ? '< 16' : r.evP95} | ${r.loafMax || 0} | ${r.cpu === 4 ? (r.issues.length ? `**over:** ${r.issues.join('; ')}` : 'ok') : '(1×, comparison only)'} |`);
  }
  return lines.join('\n');
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  // output folder only for the frame measurement (the inventory writes nothing)
  const outDir = o.inventory ? null : path.resolve(o.out || fs.mkdtempSync(path.join(os.tmpdir(), 'tn-tempo-')));
  if (outDir) fs.mkdirSync(outDir, { recursive: true });
  let server, page;
  const rows = [], inv = [];
  let refused = null;
  const t0 = Date.now();
  try {
    if (!o.base) server = await startServer({ root: ROOT });
    const base = o.base || server.url;
    page = await openBrowser({ attach: o.attach, chrome: o.chrome });
    await page.send('Page.enable'); await page.send('Runtime.enable');
    await page.send('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Berlin' }).catch(() => {});
    if (o.inventory) {
      const r = await inventoryFindings(page, base);
      inv.push(...r.findings);
    } else {
      if (!o.attach) console.log('tempo: note – the frame measurement needs a visible Chrome (--attach); headless frames are not reliable');
      let tokens = null;
      const cases = CASES.filter((c) => !o.cases || o.cases.includes(c.id));
      if (!cases.length) throw Object.assign(new Error('no cases selected'), { env: true });
      for (const c of cases) for (const sn of c.sizes.filter((s) => o.sizes.includes(s))) for (const cpu of o.cpu) {
        const size = { name: sn, ...SIZES[sn] };
        let r = await runCase(page, o.base || server.url, c, size, cpu, o);
        // spread > 2 frames: repeat once, then refuse
        if (!r.refused && r.sum.spread != null && r.sum.spread > 2 * FRAME) r = await runCase(page, o.base || server.url, c, size, cpu, o);
        if (r.env) throw Object.assign(new Error(r.refused), { env: true });
        tokens ||= await evaluate(page, 'window.__tp.tokens()');
        const row = { id: c.id, size: sn, cpu };
        if (r.refused) { row.refused = r.refused; refused ||= `${c.id} ${sn} ${cpu}×: ${r.refused}`; rows.push(row); continue; }
        if (r.sum.spread != null && r.sum.spread > 2 * FRAME) { row.refused = `spread ${r.sum.spread} ms > 2 frames`; refused ||= `${c.id} ${sn} ${cpu}×: ${row.refused}`; }
        if (r.sum.errors.length && !r.sum.n) { row.refused = r.sum.errors[0]; refused ||= `${c.id} ${sn} ${cpu}×: ${row.refused}`; }
        Object.assign(row, r.sum, { issues: budgetIssues(c, size, r.sum) });
        if (cpu === o.cpu[0]) for (const t of checkInventory(r.anims, c, size, tokens)) inv.push({ view: c.id, size: sn, text: t });
        rows.push(row);
        process.stdout.write(`\rtempo: ${rows.length} measurements …`);
      }
      process.stdout.write('\r');
    }
  } catch (e) {
    await page?.close().catch(() => {}); await server?.close().catch(() => {});
    console.log(`tempo: measurement refused – ${e.message} · exit 2`);
    return 2;
  }
  await page?.close().catch(() => {}); await server?.close().catch(() => {});
  const secs = Math.round((Date.now() - t0) / 1000);
  if (o.inventory) {
    const uniq = [...new Map(inv.map((f) => [`${f.view}|${f.text}`, f])).values()];
    console.log(`tempo --inventory: ${uniq.length ? `${uniq.length} findings` : 'ok'} · ${secs} s`);
    for (const f of uniq.slice(0, 8)) console.log(`  ${f.view} [${f.size}] ${f.text}`);
    return uniq.length ? 1 : 0;
  }
  const compare = o.compare ? JSON.parse(fs.readFileSync(o.compare, 'utf8')).rows : null;
  const md = table(rows, compare);
  fs.writeFileSync(path.join(outDir, 'tempo.json'), JSON.stringify({ at: new Date().toISOString(), rows, inventory: inv }, null, 1));
  fs.writeFileSync(path.join(outDir, 'tempo.md'), `${md}\n`);
  if (o.save) fs.writeFileSync(path.resolve(o.save), JSON.stringify({ at: new Date().toISOString(), rows }, null, 1));
  const over = rows.filter((r) => r.cpu === o.cpu[0] && r.issues?.length);
  const invU = [...new Set(inv.map((f) => `${f.view}: ${f.text}`))];
  if (o.table) console.log(md);
  console.log(`tempo: ${rows.length} measurements (${o.runs} runs + ${o.warmup} warm-up) · ${secs} s`);
  for (const r of over.slice(0, 5)) console.log(`  over budget: ${r.id} ${r.size} – ${r.issues.join('; ')}`);
  if (over.length > 5) console.log(`  … ${over.length - 5} more`);
  if (invU.length) console.log(`  inventory: ${invU.length} findings (e.g. ${invU[0]})`);
  console.log(`  table: ${path.join(outDir, 'tempo.md')}`);
  if (refused) { console.log(`tempo: refused – ${refused} · exit 2`); return 2; }
  console.log(over.length || invU.length ? 'tempo: RED · exit 1' : 'tempo: within budget · exit 0');
  return over.length || invU.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((c) => process.exit(c), (e) => { console.log(`tempo: internal error – ${e.stack?.split('\n').slice(0, 2).join(' ')}`); process.exit(2); });
}
