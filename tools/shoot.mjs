#!/usr/bin/env node
// dashkit · screenshots and self-check via headless Chrome (CDP), Node ≥ 22, no npm packages.
//
//   node tools/shoot.mjs --out /path/outside/the/repo [options] URL [URL …]
//
// One PNG per URL × size × theme. Reports console errors (including CSP, 404, exceptions) and horizontal
// overflow. Exit code 1 on errors/overflow, 2 on usage errors.
//
// Options:
//   --out DIR        required. Must be outside the repo (is created).
//   --sizes LIST     phone,desktop (default) · additionally: tablet · or WxH[@DPR][t] e.g. 800x600@1t
//   --themes LIST    dark,light (default)
//   --wait MS        wait after loading (default 700)
//   --full           whole page height instead of the viewport only (max. 6000 px)
//   --port N         debug port (default: chosen freely); --chrome PATH; --tmp DIR (base for the throw-away profile)
//   --prefix NAME    file name prefix
//   --eval JS        run after loading (e.g. a click), then wait --wait again
//   --attach URL     use a running Chrome via CDP instead of starting one (e.g. http://127.0.0.1:<port>):
//                    opens its own new tab (/json/new), emulates viewport/DPR/touch/colour scheme,
//                    brings it to the front (otherwise Chrome throttles) and closes only this tab at the end.
//                    The browser, profile and other tabs are never touched. Needed where an own headless
//                    Chrome may not open HTTP connections (some sandboxes).
//
// Without --attach: Chrome runs with its own temporary profile, own port and own PID; at the end exactly this
// process is stopped and the profile deleted. Never use the profile of a running browser.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, emulate, sleep } from './lib/cdp.mjs';

const SIZES = {
  phone: { w: 390, h: 844, dpr: 3, mobile: true },
  tablet: { w: 820, h: 1180, dpr: 2, mobile: true },
  desktop: { w: 1440, h: 900, dpr: 1, mobile: false },
};

function parseArgs(argv) {
  const o = { sizes: 'phone,desktop', themes: 'dark,light', wait: 700, port: 0, full: false, urls: [], prefix: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) die(`${a} needs a value`); return argv[++i]; };
    if (a === '--out') o.out = next();
    else if (a === '--sizes') o.sizes = next();
    else if (a === '--themes') o.themes = next();
    else if (a === '--wait') o.wait = Number(next());
    else if (a === '--port') o.port = Number(next());
    else if (a === '--chrome') o.chrome = next();
    else if (a === '--tmp') o.tmp = next();
    else if (a === '--prefix') o.prefix = next();
    else if (a === '--eval') o.eval = next();
    else if (a === '--attach') o.attach = next().replace(/\/+$/, '');
    else if (a === '--full') o.full = true;
    else if (a === '-h' || a === '--help') { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n')); process.exit(0); }
    else if (a.startsWith('--')) die(`unknown option ${a}`);
    else o.urls.push(a);
  }
  return o;
}
function die(msg) { console.error(`shoot: ${msg}`); process.exit(2); }

function parseSize(s) {
  if (SIZES[s]) return { name: s, ...SIZES[s] };
  const m = /^(\d+)x(\d+)(?:@(\d+(?:\.\d+)?))?(t)?$/.exec(s);
  if (!m) die(`unknown size ${s}`);
  return { name: `${m[1]}x${m[2]}`, w: +m[1], h: +m[2], dpr: m[3] ? +m[3] : 1, mobile: !!m[4] };
}

function repoRoot(start) {
  let d = start;
  while (d !== path.dirname(d)) { if (fs.existsSync(path.join(d, '.git'))) return d; d = path.dirname(d); }
  return path.resolve(start, '..');
}

const OVERFLOW_JS = `(() => {
  const de = document.documentElement, w = de.clientWidth, sw = de.scrollWidth;
  const out = [];
  if (sw > w + 1) {
    const desc = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + [...el.classList].slice(0, 3).join('.') : '');
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > w + 1 && !el.closest('[inert]')) {
        const p = el.parentElement, pr = p && p.getBoundingClientRect();
        if (!pr || pr.right <= w + 1) out.push(desc(el) + ' (right ' + Math.round(r.right) + ' px)');
        if (out.length >= 8) break;
      }
    }
  }
  return { w, sw, out };
})()`;

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!o.out) die('--out DIR is required (a folder outside the repo)');
  if (!o.urls.length) die('give at least one URL');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = repoRoot(here);
  const out = path.resolve(o.out);
  if (out === root || out.startsWith(root + path.sep)) die(`--out is inside the repo (${root}); please use a folder outside`);
  fs.mkdirSync(out, { recursive: true });
  const sizes = o.sizes.split(',').map((s) => parseSize(s.trim()));
  const themes = o.themes.split(',').map((s) => s.trim()).filter((t) => t === 'dark' || t === 'light');
  if (!themes.length) die('--themes: dark and/or light');

  let page, problems = 0;
  const cleanup = async () => { await page?.close().catch(() => {}); page = null; };
  process.on('SIGINT', async () => { await cleanup(); process.exit(130); });

  try {
    page = await openBrowser({ attach: o.attach, chrome: o.chrome, port: o.port, tmp: o.tmp, log: (t) => console.log(`shoot: ${t}`) });
    const S = (m, p) => page.send(m, p);
    await S('Page.enable'); await S('Runtime.enable'); await S('Log.enable');
    await S('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Berlin' });
    await S('Emulation.setLocaleOverride', { locale: 'en-US' }).catch(() => {});

    let errs = [];
    page.on((m) => {
      if (m.method === 'Runtime.exceptionThrown') errs.push(`exception: ${m.params.exceptionDetails.exception?.description?.split('\n')[0] || m.params.exceptionDetails.text}`);
      else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'assert')) errs.push(`console.${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)}`);
      else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errs.push(`${m.params.entry.source}: ${m.params.entry.text.slice(0, 300)}${m.params.entry.url ? ` (${m.params.entry.url})` : ''}`);
    });

    for (const url of o.urls) {
      const slug = (o.prefix ? `${o.prefix}-` : '') + (url.replace(/^https?:\/\/[^/]+/, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'root');
      for (const sz of sizes) {
        for (const theme of themes) {
          errs = [];
          await emulate(page, sz, theme);
          await S('Page.navigate', { url: 'about:blank' });
          const loaded = page.waitFor((m) => m.method === 'Page.loadEventFired', 20000);
          if (o.attach) await S('Page.bringToFront');
          await S('Page.navigate', { url });
          await loaded.catch(() => errs.push('loading: timeout'));
          await sleep(o.wait);
          if (o.eval) {
            const r = await S('Runtime.evaluate', { expression: o.eval, awaitPromise: true });
            if (r.exceptionDetails) errs.push(`--eval: ${r.exceptionDetails.exception?.description?.split('\n')[0]}`);
            await sleep(o.wait);
          }
          const docUrl = (await S('Runtime.evaluate', { expression: 'document.URL', returnByValue: true })).result.value;
          if (/^chrome-error:/.test(docUrl)) errs.push('page not reachable (Chrome error page) – is the server running?');
          const ov = (await S('Runtime.evaluate', { expression: OVERFLOW_JS, returnByValue: true })).result.value;
          const shot = { format: 'png' };
          if (o.full) {
            const m = await S('Page.getLayoutMetrics');
            const hgt = Math.min(Math.ceil((m.cssContentSize || m.contentSize).height), 6000);
            Object.assign(shot, { captureBeyondViewport: true, clip: { x: 0, y: 0, width: sz.w, height: hgt, scale: 1 } });
          }
          const { data } = await S('Page.captureScreenshot', shot);
          const file = path.join(out, `${slug}-${sz.name}-${theme}.png`);
          fs.writeFileSync(file, Buffer.from(data, 'base64'));
          const bad = errs.length || ov.sw > ov.w + 1;
          if (bad) problems++;
          console.log(`${bad ? 'ERROR' : 'ok   '} ${path.basename(file)}${ov.sw > ov.w + 1 ? ` · overflow ${ov.sw}>${ov.w}: ${ov.out.join(', ')}` : ''}`);
          for (const e of [...new Set(errs)].slice(0, 10)) console.log(`       ${e}`);
        }
      }
    }
  } catch (e) {
    console.error(`shoot: ${e.message}`);
    problems++;
  } finally {
    await cleanup();
  }
  console.log(`shoot: ${problems ? `${problems} capture(s) with problems` : 'no problems'} · output ${out}`);
  process.exit(problems ? 1 : 0);
}

main();
