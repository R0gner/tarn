// tarn · verify screenshots on findings: the first element of a finding group, outlined in magenta, at most 4 per state and 12 per run.
import fs from 'node:fs';
import path from 'node:path';
import { evaluate } from '../lib/cdp.mjs';
import { classify, groupKey } from './rules.mjs';

/** The `shot(page, ctx, rawFindings, state)` callback of the geometry check (files numbered tmp-NNNN-… in outDir). */
export function makeShot({ outDir, rules }) {
  let seq = 0;
  return async (page, ctx, raw, st) => {
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
  };
}

/** Keep the first image per finding group in task order (at most 12), number them, delete the rest. → number of images */
export function collectShots(results, outDir) {
  const seen = new Set(); let n = 0;
  for (const r of results) for (const sh of r.shots || []) {
    if (seen.has(sh.key) || n >= 12) { fs.rmSync(sh.file, { force: true }); continue; }
    seen.add(sh.key); n++;
    fs.renameSync(sh.file, path.join(outDir, `${String(n).padStart(2, '0')}-${path.basename(sh.file).replace(/^tmp-\d+-/, '')}`));
  }
  return n;
}
