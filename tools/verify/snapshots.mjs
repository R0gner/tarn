// tarn · verify check "snapshots": text outline of the DOM per page × view × size (dark) against
// tests/snapshots/. Per line: element with role, important classes (tn-*, is-*), text or name and the box rounded to 4 px.
// The clock is fixed (2026-11-09 10:00 Europe/Berlin) so that relative times stay stable.
// Excluded: .tn-sidebar-foot (install button; appears only when the browser fires beforeinstallprompt – depends on
// Chrome, not on the kit; the behaviour is checked by the overlay scenario "install").
// --update rewrites the files (deliberately only, reason in the commit).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { emulate, evaluate } from '../lib/cdp.mjs';
import { load, settle, goHash, readViews, applyDensity } from './geometry.mjs';
import { parseSize } from './targets.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SNAP_DIR = path.join(ROOT, 'tests', 'snapshots');
export const SNAP_SIZES = ['phone', 'desktop'];
export const FIXED_TIME = Date.UTC(2026, 10, 9, 9, 0, 0);

const DATE_SHIM = `(() => { const T = ${FIXED_TIME}, D = Date;
  class FixedDate extends D { constructor(...a) { if (a.length) super(...a); else super(T); } static now() { return T; } }
  globalThis.Date = FixedDate; })();`;

const OUTLINE = `(() => {
  const IMPLICIT = { BUTTON: 'button', A: 'link', INPUT: 'textbox', SELECT: 'combobox', TEXTAREA: 'textbox', H1: 'heading', H2: 'heading', H3: 'heading', H4: 'heading',
    NAV: 'navigation', MAIN: 'main', ASIDE: 'complementary', HEADER: 'banner', DIALOG: 'dialog', TABLE: 'table', TH: 'columnheader', DT: 'term', DD: 'definition' };
  const r4 = (v) => Math.round(v / 4) * 4;
  const lines = [];
  const own = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join(' ').replace(/\\s+/g, ' ').trim();
  const walk = (el, depth) => {
    if (el.nodeType !== 1 || el.matches('script, style, template, [data-verify-ignore], .tn-sidebar-foot')) return;
    if (el.checkVisibility && !el.checkVisibility()) return;
    const svg = el.tagName.toLowerCase() === 'svg';
    const role = el.getAttribute('role') || IMPLICIT[el.tagName] || (svg && el.getAttribute('aria-label') ? 'img' : '');
    const classes = [...el.classList].filter((c) => /^tn-/.test(c) || /^is-/.test(c));
    const text = own(el);
    const keep = role || (classes.length && (text || /^tn-/.test(classes[0])));
    let d = depth;
    if (keep) {
      const b = el.getBoundingClientRect();
      const name = text || el.getAttribute('aria-label') || '';
      const extra = ['aria-selected', 'aria-checked', 'aria-expanded', 'aria-current', 'aria-sort'].map((a) => el.hasAttribute(a) ? a.slice(5) + '=' + el.getAttribute(a) : '').filter(Boolean).join(' ');
      lines.push('  '.repeat(depth) + el.tagName.toLowerCase() + (classes.length ? '.' + classes.slice(0, 3).join('.') : '') + (role && role !== IMPLICIT[el.tagName] ? ' [' + role + ']' : '') +
        (extra ? ' {' + extra + '}' : '') + (name ? ' "' + name.slice(0, 60) + '"' : '') + ' @' + r4(b.left + scrollX) + ',' + r4(b.top + scrollY) + ' ' + r4(b.width) + 'x' + r4(b.height));
      d = depth + 1;
    }
    if (svg) return;
    for (const k of el.children) walk(k, d);
    if (el.shadowRoot) for (const k of el.shadowRoot.children) walk(k, d);
  };
  for (const k of document.body.children) walk(k, 0);
  return lines.join('\\n');
})()`;

/** Line diff (LCS), output in unified style with little context. */
export function lineDiff(a, b, ctx = 1) {
  const A = a.split('\n'), B = b.split('\n');
  const n = A.length, m = B.length;
  if (n * m > 25e6) return { text: `(too large for the line diff: ${n} against ${m} lines)`, changed: Math.abs(n - m) || 1 };
  const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) { ops.push([' ', A[i]]); i++; j++; }
    else if (j < m && (i >= n || L[i][j + 1] >= L[i + 1][j])) { ops.push(['+', B[j]]); j++; }
    else { ops.push(['-', A[i]]); i++; }
  }
  const keep = ops.map((o, k) => o[0] !== ' ' || ops.slice(Math.max(0, k - ctx), k + ctx + 1).some((x) => x[0] !== ' '));
  const out = [];
  let gap = false;
  ops.forEach((o, k) => { if (keep[k]) { out.push(o[0] + o[1]); gap = false; } else if (!gap) { out.push('…'); gap = true; } });
  return { text: out.join('\n'), changed: ops.filter((o) => o[0] !== ' ').length };
}

const fileFor = (page, view, size) => path.join(SNAP_DIR, page, `${view.replace(/\?/g, '~').replace(/[^\w~=-]+/g, '-')}__${size}.txt`);

/** One task per page × size (dark). */
export function snapshotTasks({ pages, sizes }) {
  const tasks = [];
  for (const pg of pages) for (const sn of sizes || SNAP_SIZES) tasks.push({ kind: 'snapshots', pg, sn, label: `snapshots ${pg.id} ${sn}` });
  return tasks;
}

/** One snapshot task on one worker → { findings, states, written } */
export async function snapshotTask(w, task, { base, viewFilter, update, outDir }) {
  const { pg, sn } = task;
  const b = base || w.base;
  const { page } = w;
  const findings = [];
  let states = 0, written = 0;
  const { identifier } = await page.send('Page.addScriptToEvaluateOnNewDocument', { source: DATE_SHIM });
  try {
    const size = parseSize(sn);
    await emulate(page, size, 'dark');
    await load(page, b + pg.path, { push: () => {} });
    if (pg.density) await applyDensity(page, pg.density);
    await settle(page);
    const views = (await readViews(page, pg)).filter((v) => !viewFilter || viewFilter(pg.id, v));
    const targets = [...views, ...(pg.details || []).filter((d) => !viewFilter || viewFilter(pg.id, d.split('?')[0], d))];
    for (const view of targets) {
      await goHash(page, view);
      await settle(page);
      // pause endless animations (indeterminate progress, skeleton) at their start: boxes must not depend on the phase
      await evaluate(page, `document.getAnimations().forEach((a) => { if (a.effect?.getComputedTiming().iterations === Infinity) { a.pause(); a.currentTime = 0; } })`);
      const text = `# ${pg.id} #/${view} · ${size.name} ${size.w}×${size.h} · dunkel\n${await evaluate(page, OUTLINE)}\n`;
      states++;
      const file = fileFor(pg.id, view, size.name);
      const rel = path.relative(ROOT, file);
      if (update) {
        if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); written++; }
      } else if (!fs.existsSync(file)) {
        findings.push({ check: 'snapshots', rule: 'snapshot', page: pg.id, view, size: size.name, theme: 'dark', sel: rel, where: '', text: 'no snapshot present (--update)' });
      } else {
        const old = fs.readFileSync(file, 'utf8');
        if (old !== text) {
          const d = lineDiff(old, text);
          let at = '';
          if (outDir) { at = path.join(outDir, `${path.basename(file, '.txt')}-${pg.id}.diff`); fs.writeFileSync(at, `--- ${rel}\n+++ current\n${d.text}\n`); }
          const firstChange = d.text.split('\n').find((l) => /^[-+]/.test(l)) || '';
          findings.push({ check: 'snapshots', rule: 'snapshot', page: pg.id, view, size: size.name, theme: 'dark', sel: rel, where: '', text: `${d.changed} lines changed, e.g. ${firstChange.trim().slice(0, 80)}${at ? ` · Diff: ${at}` : ''}` });
        }
      }
      if (view.includes('open=')) { await goHash(page, view.split('?')[0]); await settle(page); }
    }
  } finally {
    await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier }).catch(() => {});
  }
  return { findings, states, written };
}

/** All snapshot tasks on all workers, merged in task order. opts: { base?, pages, viewFilter, update, outDir, sizes } */
export async function runSnapshots(pool, opts) {
  const res = await pool.run(snapshotTasks(opts), (t, w) => snapshotTask(w, t, opts));
  return mergeSnapshots(res);
}
export const mergeSnapshots = (res) => ({ findings: res.flatMap((r) => r.findings), states: res.reduce((n, r) => n + r.states, 0), written: res.reduce((n, r) => n + r.written, 0) });
