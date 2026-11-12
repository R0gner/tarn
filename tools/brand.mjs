#!/usr/bin/env node
// tarn · brand: create a board identity (favicon, app icons, manifest). Node ≥ 22, no npm packages.
//
//   node tools/brand.mjs --name "My board" --icon server --accent purple --out <folder> [options]
//
// Writes to --out (required, is created):
//   favicon.svg             rounded square in card grey with a hairline and a single-colour Lucide symbol in the
//                           accent colour (light and dark via prefers-color-scheme)
//   icon-192.png, icon-512.png            the same as PNG (purpose "any", transparent corners)
//   icon-maskable-512.png   edge to edge, symbol inside the safe zone (80 %), purpose "maskable"
//   apple-touch-icon.png    180 px, edge to edge (iOS rounds it itself)
//   manifest.webmanifest    name, short_name, icons, start_url, display standalone, colours, lang
// A headless Chrome renders the PNGs (CDP, no image library); on hosts without their own Chrome use --attach.
// Then in the <head> of the board (printed at the end):
//   <link rel="icon" type="image/svg+xml" href="favicon.svg"> · apple-touch-icon · manifest (crossorigin="use-credentials")
//
// Options:
//   --name TEXT        board name (required)        --short-name TEXT   short name (default: name)
//   --icon NAME        symbol from icons/manifest.json (kit name, e.g. server, chart, home, box) – required without --source
//   --accent COLOUR    token name (blue, purple, green, orange, pink, graphite) or CSS colour (default: blue)
//   --source SVG       existing drawing instead of a symbol (e.g. icons/logo.svg); favicon.svg is then copied and
//                      --bg COLOUR (default dark card grey) fills the edge-to-edge variants
//   --lang CODE        manifest language (default en)
//   --start-url URL    default "."                  --scope URL         default "."
//   --attach URL       use a running Chrome via CDP (own tab)      --chrome PATH   Chrome binary
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openBrowser, evaluate } from './lib/cdp.mjs';
import { ICONS } from '../js/icons-data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = (msg, code = 2) => { console.log(`brand: ${msg}`); process.exit(code); };

const o = { accent: 'blue', startUrl: '.', scope: '.' };
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i], v = () => process.argv[++i] ?? fail(`${a} needs a value`);
  if (a === '--name') o.name = v(); else if (a === '--short-name') o.short = v(); else if (a === '--icon') o.icon = v();
  else if (a === '--accent') o.accent = v(); else if (a === '--out') o.out = v(); else if (a === '--source') o.source = v();
  else if (a === '--bg') o.bg = v(); else if (a === '--lang') o.lang = v(); else if (a === '--start-url') o.startUrl = v(); else if (a === '--scope') o.scope = v();
  else if (a === '--attach') o.attach = v(); else if (a === '--chrome') o.chrome = v();
  else fail(`unknown option ${a} (see the header of the file)`);
}
if (!o.name) fail('--name missing');
if (!o.out) fail('--out missing (output folder, is created)');
if (!o.source && !o.icon) fail('--icon NAME or --source SVG missing');
if (o.icon && !ICONS[o.icon]) fail(`symbol “${o.icon}” is not in the kit (${Object.keys(ICONS).join(', ')}); fetch it with: node tools/icons.mjs add <lucide-name>`);
const OUT = path.resolve(o.out);
if (OUT === ROOT || (OUT.startsWith(ROOT + path.sep) && /^(css|js|fonts|icons|tools|tests)$/.test(path.relative(ROOT, OUT).split(path.sep)[0]))) fail('--out must not be a kit folder (css, js, fonts, icons, tools, tests)');

/* ---- Colours from the tokens: --tn-<name>: light-dark(LIGHT, DARK) ---- */
const tokens = fs.readFileSync(path.join(ROOT, 'css', 'tokens.css'), 'utf8');
function tokenPair(name) {
  const m = new RegExp(`--tn-${name}:\\s*light-dark\\(([^;]+)\\);`).exec(tokens);
  if (!m) return null;
  let depth = 0, cut = -1;
  for (let i = 0; i < m[1].length; i++) { const c = m[1][i]; if (c === '(') depth++; else if (c === ')') depth--; else if (c === ',' && !depth) { cut = i; break; } }
  return cut < 0 ? null : { light: m[1].slice(0, cut).trim(), dark: m[1].slice(cut + 1).trim() };
}
const SAFE = /^[\w\s.,%()/#+-]+$/;
const accent = tokenPair(o.accent) || { light: o.accent, dark: o.accent };
if (!SAFE.test(accent.light) || !SAFE.test(accent.dark)) fail(`invalid colour “${o.accent}”`);
const CARD = { dark: tokenPair('card')?.dark || '#2a2b30', light: '#fff', lineDark: 'rgba(255,255,255,.09)', lineLight: 'rgba(0,0,0,.10)' };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shapes = (name) => ICONS[name].map(([tag, a]) => `<${tag} ${Object.entries(a).map(([k, v]) => `${k}="${esc(v)}"`).join(' ')}/>`).join('');

/** Symbol in a box of side length `size` (24 grid, absolute stroke ≈ size/16). */
const glyph = (name, color, box, size) => {
  const k = box / 24, off = (size - box) / 2;
  return `<g transform="translate(${off} ${off}) scale(${+k.toFixed(4)})" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${shapes(name)}</g>`;
};

/** favicon.svg (light/dark via media query). */
function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <title>${esc(o.name)}</title>
  <style>
    .bg { fill: ${CARD.dark}; stroke: ${CARD.lineDark}; }
    .fg { stroke: ${accent.dark}; }
    @media (prefers-color-scheme: light) { .bg { fill: ${CARD.light}; stroke: ${CARD.lineLight}; } .fg { stroke: ${accent.light}; } }
  </style>
  <rect class="bg" x=".5" y=".5" width="31" height="31" rx="7"/>
  <g class="fg" transform="translate(6 6) scale(.8333)" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${shapes(o.icon)}</g>
</svg>
`;
}

/** SVG for PNGs: kind = 'any' (rounded, hairline) | 'full' (edge to edge, symbol inside the safe zone). */
function pngSvg(kind, S) {
  const art = o.source ? fs.readFileSync(path.resolve(o.source), 'utf8') : null;
  const bg = o.bg || CARD.dark;
  if (art) {
    const url = `data:image/svg+xml,${encodeURIComponent(art)}`;
    if (kind === 'any') return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><image href="${url}" width="${S}" height="${S}"/></svg>`;
    const inner = S * 0.6;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect width="${S}" height="${S}" fill="${esc(bg)}"/><image href="${url}" x="${(S - inner) / 2}" y="${(S - inner) / 2}" width="${inner}" height="${inner}"/></svg>`;
  }
  if (kind === 'any') {
    const r = S * 7 / 32;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect x="${S / 64}" y="${S / 64}" width="${S - S / 32}" height="${S - S / 32}" rx="${r}" fill="${CARD.dark}" stroke="${CARD.lineDark}" stroke-width="${S / 32}"/>${glyph(o.icon, accent.dark, S * 0.625, S)}</svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect width="${S}" height="${S}" fill="${CARD.dark}"/>${glyph(o.icon, accent.dark, S * 0.5, S)}</svg>`;
}

/* ---- Output ---- */
fs.mkdirSync(OUT, { recursive: true });
if (o.source) fs.copyFileSync(path.resolve(o.source), path.join(OUT, 'favicon.svg')); else fs.writeFileSync(path.join(OUT, 'favicon.svg'), faviconSvg());

let page;
try {
  page = await openBrowser({ attach: o.attach, chrome: o.chrome });
  await page.send('Page.enable');
  const shot = async (svg, S, file) => {
    await page.send('Emulation.setDeviceMetricsOverride', { width: S, height: S, deviceScaleFactor: 1, mobile: false });
    await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
    const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent}img{display:block}</style><img width="${S}" height="${S}" src="data:image/svg+xml,${encodeURIComponent(svg)}">`;
    const loaded = page.waitFor((m) => m.method === 'Page.loadEventFired', 15000);
    await page.send('Page.navigate', { url: `data:text/html;charset=utf-8,${encodeURIComponent(html)}` });
    await loaded;
    await evaluate(page, 'document.images[0].decode().then(() => true)');
    const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: S, height: S, scale: 1 }, fromSurface: true });
    fs.writeFileSync(path.join(OUT, file), Buffer.from(data, 'base64'));
  };
  await shot(pngSvg('any', 192), 192, 'icon-192.png');
  await shot(pngSvg('any', 512), 512, 'icon-512.png');
  await shot(pngSvg('full', 512), 512, 'icon-maskable-512.png');
  await shot(pngSvg('full', 180), 180, 'apple-touch-icon.png');
  // manifest colours as hex (Chrome converts oklch → sRGB)
  const hex = await evaluate(page, `(() => { const c = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    return ${JSON.stringify([tokenPair('bg')?.dark || '#16171a', o.bg || CARD.dark])}.map((col) => { c.clearRect(0, 0, 1, 1); c.fillStyle = '#000'; c.fillStyle = col; c.fillRect(0, 0, 1, 1);
      const d = c.getImageData(0, 0, 1, 1).data; return '#' + [d[0], d[1], d[2]].map((x) => x.toString(16).padStart(2, '0')).join(''); }); })()`);
  const manifest = {
    name: o.name, short_name: o.short || o.name, lang: o.lang || 'en', start_url: o.startUrl, scope: o.scope, display: 'standalone',
    background_color: hex[1], theme_color: hex[0],
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
  };
  fs.writeFileSync(path.join(OUT, 'manifest.webmanifest'), `${JSON.stringify(manifest, null, 2)}\n`);
} catch (e) {
  fail(`${e.message}${/HTTP|connection|connect/i.test(e.message) ? ' – on hosts without their own Chrome: --attach http://127.0.0.1:<port>' : ''}`);
} finally {
  try { await page?.send?.('Emulation.setDefaultBackgroundColorOverride', {}); } catch {}
  try { await page?.close?.(); } catch {}
}
const rel = path.relative(process.cwd(), OUT) || '.';
console.log(`brand: ${o.name} → ${rel}/ (favicon.svg, icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png, manifest.webmanifest)`);
console.log('in <head>:');
console.log('  <link rel="icon" type="image/svg+xml" href="favicon.svg">');
console.log('  <link rel="apple-touch-icon" href="apple-touch-icon.png">');
console.log('  <link rel="manifest" href="manifest.webmanifest" crossorigin="use-credentials">');
process.exit(0);
