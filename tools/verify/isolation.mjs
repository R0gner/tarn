// tarn · positive control: no state stored by one page (theme, density, language, sidebar) reaches the next page of the same run.
// Plants stored state in every worker's origin, loads a page and expects the defaults; a load() that no longer clears the origin makes this red.
import { emulate, evaluate } from '../lib/cdp.mjs';
import { load, settle } from './geometry.mjs';

const PLANT = `(() => { localStorage.setItem('tn-density', 'comfortable'); localStorage.setItem('tn-theme', 'light'); localStorage.setItem('tn-locale', 'de'); localStorage.setItem('tn-sb', 'closed'); sessionStorage.setItem('x', '1'); return true; })()`;

/** → { ok, line } */
export async function isolationControl(pool) {
  if (pool.mode === 'attach') return { ok: true, line: 'selftest: state isolation not checked with --attach (a running browser keeps its storage)' };
  const bad = await pool.runAll(async (w) => {
    await emulate(w.page, { name: 'desktop', w: 1440, h: 900, dpr: 1, mobile: false }, 'dark');
    await load(w.page, `${w.base}/gallery/?lang=en#/foundations`, { push: () => {} });
    await evaluate(w.page, PLANT);
    await load(w.page, `${w.base}/gallery/?lang=en#/foundations`, { push: () => {} });   // the next page of the same run
    await settle(w.page);
    return evaluate(w.page, `(() => { const de = document.documentElement, left = [];
      if (de.hasAttribute('data-density')) left.push('density'); if (de.dataset.theme) left.push('theme'); if (de.lang !== 'en') left.push('language');
      if (localStorage.length || sessionStorage.length) left.push('storage'); return left; })()`);
  });
  const leaks = [...new Set(bad.flat())];
  return { ok: !leaks.length, line: `selftest: state isolation (planted theme, density, language and sidebar state does not reach the next page) ${leaks.length ? `LEAKS: ${leaks.join(', ')}` : `ok on ${pool.size} workers`}` };
}
