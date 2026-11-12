// tarn · verify check "geometry": DOM geometry per page × size × scheme × view, plus console errors.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emulate, evaluate, sleep } from '../lib/cdp.mjs';

const PROBE = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'probe-geometry.js'), 'utf8')
  .replace(/^\s*\/\/.*$/gm, '').trim();

/**
 * Until data is loaded and finite animations are done. Calm must hold for 4 checks in a row (≈ 130 ms),
 * because some transitions only start after two frames.
 */
export async function settle(page, { max = 3000 } = {}) {
  await evaluate(page, `new Promise((res) => {
    const t0 = performance.now();
    let calm = 0;
    // Load all declared fonts, not only the ones already used: Chrome loads a font only when an element needs it
    // (e.g. Plex Mono in the detail). document.fonts.ready waits only for loads in progress; without this, boxes depend on which
    // view was opened before (verify flake: --quick --views … produced other snapshots than the full run).
    const fontsReady = document.fonts ? Promise.all([...document.fonts].map((f) => f.load().catch(() => null))).then(() => document.fonts.ready) : Promise.resolve();
    // skeletons inside gallery demos (.g-demo) and in the gallery's example sheet are permanent examples of the loading state, not a load
    // in progress: they must not keep settle waiting until its time limit (3 s per call in every gallery view that shows one)
    const inGallery = location.pathname.includes('/gallery/');
    const busy = () => [...document.querySelectorAll('[aria-busy="true"]')].some((e) => !e.closest('.g-demo') && !(inGallery && e.closest('dialog'))) || !(document.querySelector('.tn-nav-item') || document.body.hasAttribute('data-tn-page')) ||
      document.getAnimations().some((a) => a.playState === 'running' && a.effect?.getComputedTiming().iterations !== Infinity);
    const tick = () => requestAnimationFrame(() => requestAnimationFrame(() => {
      calm = busy() ? 0 : calm + 1;
      if (calm >= 4 || performance.now() - t0 > ${max}) setTimeout(res, 30); else setTimeout(tick, 0);
    }));
    fontsReady.then(tick, tick);
  })`, { timeout: max + 5000 });
}

/** Inject CSS via an adopted stylesheet (CSP-friendly, for mutants in the self-test). */
export const injectCss = (page, css) => evaluate(page, `(() => { const s = new CSSStyleSheet(); s.replaceSync(${JSON.stringify(css)});
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, s]; return true; })()`);

export async function load(page, url, errs) {
  // without Page.enable no loadEventFired arrives (every call would wait for the timeout)
  if (!page.enabled) { await page.send('Page.enable'); await page.send('Runtime.enable'); page.enabled = true; }
  await page.send('Page.navigate', { url: 'about:blank' });
  const loaded = page.waitFor((m) => m.method === 'Page.loadEventFired', 20000);
  if (page.kind === 'attach') await page.send('Page.bringToFront');
  try { await page.send('Page.navigate', { url }, 15000); } catch (e) {
    throw Object.assign(new Error(`${url} does not load (${e.message}); ${page.kind === 'own' ? 'the own headless Chrome cannot reach the test server – use --attach with a running Chrome' : 'check server/Chrome'}`), { env: true });
  }
  await loaded.catch(() => errs.push('loading: timeout (no load event after 20 s)'));
  const docUrl = await evaluate(page, 'document.URL');
  if (/^chrome-error:/.test(docUrl)) throw Object.assign(new Error(`page not reachable: ${url}`), { env: true });
}

export function consoleCollector(page) {
  let errs = [];
  page.on((m) => {
    if (m.method === 'Runtime.exceptionThrown') errs.push(`exception: ${m.params.exceptionDetails.exception?.description?.split('\n')[0] || m.params.exceptionDetails.text}`);
    else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'assert')) errs.push(`console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 200)}`);
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errs.push(`${m.params.entry.source}: ${m.params.entry.text.slice(0, 120)}${m.params.entry.url ? ` (${m.params.entry.url.replace(/^https?:\/\/[^/]+/, '')})` : ''}`);
  });
  return { take: () => { const e = errs; errs = []; return [...new Set(e)]; }, push: (e) => errs.push(e) };
}

/** Read the navigation: view IDs from .tn-nav-item[href="#/id"]; a page without a shell navigation lists its `views` in tools/verify/targets.mjs. */
export const readViews = (page, pg) => pg?.views ? Promise.resolve([...pg.views]) : evaluate(page, `[...document.querySelectorAll('.tn-nav-item')].map((a) => (a.getAttribute('href') || '').replace(/^#\\//, '').split('?')[0]).filter(Boolean)`);

export async function goHash(page, hash) {
  await evaluate(page, `(() => { location.hash = ${JSON.stringify('#/' + hash)}; window.scrollTo(0, 0); document.querySelector('.tn-content')?.scrollTo?.(0, 0); return true; })()`);
}

/** One task per page × size × scheme (the unit that one worker runs; results are merged in this order). */
export function geometryTasks({ pages, sizes, themes }) {
  const tasks = [];
  for (const pg of pages) {
    for (const size of pg.sizes ? sizes.filter((z) => pg.sizes.includes(z.name)) : sizes) {
      for (const theme of pg.themes ? themes.filter((x) => pg.themes.includes(x)) : themes) tasks.push({ kind: 'geometry', pg, size, theme, label: `geometry ${pg.id} ${size.name} ${theme}` });
    }
  }
  return tasks;
}

/**
 * One geometry task on one worker: load the page at the size and scheme, check every view.
 * opts: { base, viewFilter, css, js, shot(page, ctx, rawFindings, state) } → { findings, warnings, states, timing }
 * timing: per state { view, ms, settle, probe } (where the time goes).
 */
export async function geometryTask(w, task, opts) {
  const { pg, size, theme } = task;
  const { viewFilter, css, js, shot } = opts;
  const base = opts.base || w.base;
  const { page, con } = w;
  const findings = [], warnings = [], timing = [], shots = [];
  let states = 0;
  const shotState = { n: 0, seen: new Set() };
  await emulate(page, size, theme);
  con.take();
  await load(page, base + pg.path, { push: con.push });
  await settle(page);
  if (css) await injectCss(page, css);
  if (js) await evaluate(page, js);
  const views = (await readViews(page, pg)).filter((v) => !viewFilter || viewFilter(pg.id, v));
  const targets = [...views, ...(pg.details || []).filter((d) => !viewFilter || viewFilter(pg.id, d.split('?')[0], d))];
  for (const view of targets) {
    const t0 = Date.now();
    await goHash(page, view);
    await settle(page);
    const t1 = Date.now();
    const res = await evaluate(page, `(${PROBE})(${JSON.stringify({ touch: size.mobile })})`, { timeout: 60000 });
    const t2 = Date.now();
    states++;
    const ctx = { page: pg.id, view, size: size.name, theme };
    // i18n: every key looked up in this view must exist in the active language
    for (const k of await evaluate(page, '[...(window.__tnMissingKeys || [])]')) findings.push({ check: 'geometry', rule: 'i18n', ...ctx, sel: k, where: '', text: `missing translation: ${k}` });
    for (const f of res.findings) findings.push({ check: 'geometry', ...ctx, ...f });
    for (const x of res.warnings) warnings.push({ check: 'geometry', ...ctx, ...x });
    for (const e of con.take()) findings.push({ check: 'geometry', rule: 'console', ...ctx, sel: 'console', where: '', text: e });
    if (shot && res.findings.length) shots.push(...await shot(page, ctx, res.findings, shotState));
    // close the detail again so that the next view starts without an open sheet
    if (view.includes('open=')) { await goHash(page, view.split('?')[0]); await settle(page); }
    timing.push({ view, ms: Date.now() - t0, settle: t1 - t0, probe: t2 - t1 });
  }
  return { findings, warnings, states, timing, shots };
}

/** All geometry tasks one after the other on one worker (mutants run inside the worker that owns them). */
export async function runGeometryOn(w, opts) {
  const out = { findings: [], warnings: [], states: 0, timing: [] };
  for (const task of geometryTasks(opts)) {
    const r = await geometryTask(w, task, opts);
    out.findings.push(...r.findings); out.warnings.push(...r.warnings); out.states += r.states; out.timing.push(...r.timing.map((x) => ({ ...x, task: task.label })));
  }
  return out;
}

/**
 * Run over all targets on all workers of the pool, merged in task order (independent of the number of workers).
 * opts: { base?, pages, sizes, themes, viewFilter, css, js, shot } → { findings, warnings, states, timing }
 */
export async function runGeometry(pool, opts) {
  const tasks = geometryTasks(opts);
  const res = await pool.run(tasks, (t, w) => geometryTask(w, t, opts));
  return mergeGeometry(tasks, res);
}

export function mergeGeometry(tasks, res) {
  const out = { findings: [], warnings: [], states: 0, timing: [] };
  res.forEach((r, i) => { out.findings.push(...r.findings); out.warnings.push(...r.warnings); out.states += r.states; out.timing.push(...r.timing.map((x) => ({ ...x, task: tasks[i].label }))); });
  return out;
}
