#!/usr/bin/env node
// tarn · tempo-markdown: render time of a 50 KB report with markdown(), 4× CPU throttled. Node ≥ 22, no npm packages.
//
//   node tools/tempo-markdown.mjs --attach http://127.0.0.1:<port> [--kb 50] [--runs 7] [--cpu 4] [--budget 50] [--base URL]
//
// Measured (median / max over --runs runs after 2 warm-up runs): "build" = parser + DOM nodes, "with layout" = additionally
// attached to the document with layout forced (offsetHeight). Budget (brief B3): ≤ 50 ms under 4× CPU, measured as
// "with layout". Exit 0 within budget · 1 over · 2 measurement refused (tab not in front) or environment broken.
import { openBrowser, evaluate, sleep } from './lib/cdp.mjs';
import { startServer } from './lib/static-server.mjs';
import { load, settle } from './verify/geometry.mjs';
import { emulate } from './lib/cdp.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const o = { kb: 50, runs: 7, cpu: 4, budget: 50 };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i], v = () => process.argv[++i];
  if (a === '--attach') o.attach = v(); else if (a === '--kb') o.kb = +v(); else if (a === '--runs') o.runs = +v();
  else if (a === '--cpu') o.cpu = +v(); else if (a === '--budget') o.budget = +v(); else if (a === '--base') o.base = v().replace(/\/+$/, '');
  else if (a === '--chrome') o.chrome = v();
  else { console.log(`tempo-markdown: unknown option ${a}`); process.exit(2); }
}
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const r1 = (x) => Math.round(x * 10) / 10;

const server = o.base ? null : await startServer({ root: ROOT });
const base = o.base || server.url;
let page;
try {
  page = await openBrowser({ attach: o.attach, chrome: o.chrome });
  await emulate(page, { name: 'phone', w: 390, h: 844, dpr: 3, mobile: true }, 'dark');
  await load(page, `${base}/gallery/#/markdown`, { push: () => {} });
  await settle(page);
  if (page.kind === 'attach') await page.send('Page.bringToFront');
  const vis = await evaluate(page, 'document.visibilityState');
  if (vis !== 'visible') { console.log(`tempo-markdown: tab not in front (${vis}) – measurement refused`); process.exitCode = 2; throw new Error('refused'); }
  const SAMPLE = `const m = await import(new URL('../js/tarn.js', location.href).href); const s = await import(new URL('../gallery/markdown-sample.js', location.href).href);
    let text = ''; let n = 0; while (text.length < ${o.kb * 1024}) text += s.REPORT.replace('Lauf 412', 'Lauf ' + (400 + n++)) + '\\n\\n';
    window.__md = { m, text, run() { const host = document.createElement('div'); document.body.append(host);
      const t0 = performance.now(); const el = m.markdown(text, { compact: true }); const t1 = performance.now();
      host.append(el); const h = host.offsetHeight; const t2 = performance.now(); host.remove();
      return { build: t1 - t0, total: t2 - t0, nodes: el.querySelectorAll('*').length, h }; } }; return text.length`;
  const size = await evaluate(page, `(async () => { ${SAMPLE} })()`, { timeout: 30000 });
  await page.send('Emulation.setCPUThrottlingRate', { rate: o.cpu });
  const build = [], total = [];
  let nodes = 0;
  for (let i = 0; i < 2 + o.runs; i++) {
    const r = await evaluate(page, 'window.__md.run()');
    nodes = r.nodes;
    if (i >= 2) { build.push(r.build); total.push(r.total); }
    await sleep(60);
  }
  await page.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const ok = med(total) <= o.budget;
  console.log(`tempo-markdown: ${r1(size / 1024)} KB report, ${nodes} nodes, ${o.cpu}× CPU, n = ${o.runs}`);
  console.log(`  build        median ${r1(med(build))} ms · max ${r1(Math.max(...build))} ms`);
  console.log(`  with layout  median ${r1(med(total))} ms · max ${r1(Math.max(...total))} ms (budget ${o.budget} ms)`);
  console.log(ok ? 'tempo-markdown: within budget · exit 0' : 'tempo-markdown: OVER budget · exit 1');
  process.exitCode = ok ? 0 : 1;
} catch (e) {
  if (e.message !== 'refused') { console.log(`tempo-markdown: ${e.message}`); process.exitCode = 2; }
} finally {
  try { await page?.send?.('Emulation.setCPUThrottlingRate', { rate: 1 }); } catch {}
  try { await page?.close?.(); } catch {}
  await server?.close();
  process.exit(process.exitCode ?? 0);
}
