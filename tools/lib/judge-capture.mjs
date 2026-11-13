// tarn · pictures for the visual judge: the capture path of verify (pool, load, settle, view by hash), one PNG per page × view × size × theme.
import fs from 'node:fs';
import path from 'node:path';
import { emulate, evaluate, sleep } from './cdp.mjs';
import { dateShim, FIXED_TIME } from '../verify/snapshots.mjs';
import { load, settle, goHash, readViews, applyDensity, injectCss } from '../verify/geometry.mjs';
import { IMAGE_LIMITS } from './judge.mjs';

/**
 * A picture must be the same bytes when nothing changed (the cache key is the hash of the PNG): the clock is the fixed clock of the snapshots, and animations,
 * transitions and the caret are off. Without this about a third of the pictures (relative times, spinners, skeletons) differed from run to run.
 */
const STILL_CSS = '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; scroll-behavior: auto !important; }';

/**
 * Device pixel ratio for a size: the largest whole number (at most 2) that keeps the longer side of the PNG within the API's limit. A fractional ratio
 * (1.85 on a phone) gave pictures that differed from run to run in a few pixels; whole ratios are stable.
 */
export const judgeDpr = (size) => Math.max(1, Math.min(2, Math.floor(IMAGE_LIMITS.max / Math.max(size.w, size.h))));

const slug = (s) => String(s).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');

/** Screenshot until two in a row are the same bytes (a late repaint, a chart still settling): at most 6 tries, then the last one. */
async function stableShot(page) {
  let prev = null;
  for (let i = 0; i < 6; i++) {
    await sleep(i ? 150 : 120);
    const png = Buffer.from((await page.send('Page.captureScreenshot', { format: 'png' })).data, 'base64');
    if (prev && prev.equals(png)) return png;
    prev = png;
  }
  return prev;
}

/** A served-file rewrite for a source mutant ({ file, from, to }[]); a patch that no longer applies is an error. */
export const patchRewrite = (id, patch) => (p, buf) => {
  const edits = patch.filter((x) => p === `/${x.file}`);
  if (!edits.length) return buf;
  let text = buf.toString('utf8');
  for (const e of edits) { if (!text.includes(e.from)) throw new Error(`mutant ${id}: patch does not apply to ${e.file}`); text = text.replace(e.from, e.to); }
  return Buffer.from(text);
};

/**
 * Tasks: [{ pg, size, theme, views?: string[] (exact; an unknown one is an error), only?: string[] (filter of the page's views), css?, js?, patch?, id?: 'clean' | mutant id, scroll?: { [view]: selector } }]
 * → [{ file, label, png, meta }] in task order (one PNG per view). A view that does not exist in the page is an error.
 */
export async function capture(pool, tasks, outDir, { log = () => {} } = {}) {
  fs.mkdirSync(outDir, { recursive: true });
  const per = await pool.run(tasks.map((t) => ({ ...t, label: `judge ${t.pg.id} ${t.size.name} ${t.theme}` })), async (t, w) => {
    const { pg, size, theme } = t;
    const { page, con } = w;
    const out = [];
    await emulate(page, { ...size, dpr: judgeDpr(size) }, theme);
    con.take();
    if (!page.judgeClock) { await page.send('Page.addScriptToEvaluateOnNewDocument', { source: dateShim(FIXED_TIME) }); page.judgeClock = true; }
    await w.withRewrite(t.patch ? patchRewrite(t.id, t.patch) : null, async (base) => {
      await load(page, base + pg.path, { push: con.push });
      if (pg.density) await applyDensity(page, pg.density);
      await settle(page);
      await injectCss(page, STILL_CSS);
      if (t.css) await injectCss(page, t.css);
      if (t.js) await evaluate(page, t.js);
      const have = await readViews(page, pg);
      for (const view of t.views || have.filter((v) => !t.only || t.only.includes(v))) {
        if (!have.includes(view)) throw new Error(`page ${pg.id} has no view "${view}" (${have.join(', ')})`);
        await goHash(page, view);
        await settle(page);
        const sel = t.scroll?.[view] || t.scroll?.['*'];
        if (sel) await evaluate(page, `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (el) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }); return !!el; })()`);
        const png = await stableShot(page);
        const name = `${slug(pg.id)}-${slug(view)}-${size.name}-${theme}${t.id && t.id !== 'clean' ? `-${slug(t.id)}` : ''}.png`;
        const file = path.join(outDir, name);
        fs.writeFileSync(file, png);
        out.push({ file, label: `${pg.id}/${view} ${size.name} ${theme}${t.id && t.id !== 'clean' ? ` [${t.id}]` : ''}`, png, meta: { page: pg.id, view, size: size.name, theme, id: t.id || 'clean', scrolled: !!sel } });
      }
    });
    return out;
  });
  log(`captured ${per.flat().length} pictures`);
  return per.flat();
}
