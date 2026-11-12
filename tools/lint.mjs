#!/usr/bin/env node
// tarn · lint: check kit rules statically. Node ≥ 22, no npm packages.
//
//   node tools/lint.mjs [-v] [--write-known]
//
// Rules (list and exceptions: tools/lint/allow.json):
//   color       colour literal (#…, rgb(), oklch(), colour names …) outside css/tokens.css
//   size        length literal (px, rem, em, ch, vh …) outside css/tokens.css
//   radius      like size, in border-radius
//   duration    time literal (ms, s) outside css/tokens.css
//   transition  transition on anything but transform/opacity (background-color only for hover/press)
//   keyframes   animation (@keyframes) changes anything but transform/opacity
//   html        innerHTML, outerHTML, insertAdjacentHTML
//   timer       JS timer with a number literal (animation timers must read tokens)
//   i18n        visible text hard-wired in the code (kit, sample board): umlauts in literals or a text literal at
//               label/title/text/sub/placeholder/aria-label/h() children; everything goes through t()
//   title       native title attribute or SVG <title> (tooltips come from the kit: tooltip(), dataCard(); name via aria-label)
//   gallery     exported building block without a gallery entry (call in gallery/*.js)
//   emoji       emoji in UI texts
//   legacy      the old name or prefix (renamed from dashkit) anywhere in the repo except the migration code and the CHANGELOG
//   page        HTML page without <link rel="icon"> or without a non-empty <title> (every board has a favicon and a title)
//
// Checked: kit (css/, js/) and sample board (example/); html and emoji also gallery/.
// Output ≤ 10 lines, exit 0 green · 1 finding (new violations) · 2 tool error.
// An inventory of known violations may be listed as "known" in allow.json; --write-known writes the current
// state there (deliberately only, reason in the commit).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALLOW = path.join(ROOT, 'tools', 'lint', 'allow.json');

const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const walk = (dir, ext) => {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p, ext)); else if (ext.includes(path.extname(e.name))) out.push(p);
  }
  return out.sort();
};
const lineOf = (src, idx) => src.slice(0, idx).split('\n').length;

/* ---- CSS ---- */
const NAMED = 'white|black|red|green|blue|gray|grey|silver|orange|yellow|purple|pink|navy|teal|maroon|olive|lime|aqua|fuchsia|cyan|magenta';
const RE_COLOR = new RegExp(`#[0-9a-fA-F]{3,8}\\b|\\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\\(|(?<![\\w-])(?:${NAMED})(?![\\w-])`, 'g');
const RE_LEN = /(?<![\w.#-])-?(?:\d+\.?\d*|\.\d+)(px|rem|em|ch|ex|vh|vw|vmin|vmax|svh|dvh|lvh|svw|dvw|pt|cm|mm|in|cqi|cqw)\b/g;
const RE_TIME = /(?<![\w.#-])(?:\d+\.?\d*|\.\d+)(ms|s)\b/g;
const ANIM_OK = new Set(['transform', 'opacity']);

/** Split CSS into declarations: { prop, value, line, within } (comments removed, preludes skipped). */
function cssDecls(src) {
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const out = [], stack = [];
  let start = 0;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (c !== '{' && c !== '}' && c !== ';') continue;
    const seg = clean.slice(start, i), off = start + (seg.length - seg.trimStart().length);
    if (c === '{') stack.push(seg.trim());
    else {
      const m = /^\s*([-\w]+)\s*:([\s\S]*)$/.exec(seg);
      if (m && seg.trim()) out.push({ prop: m[1].toLowerCase(), value: m[2].trim(), line: lineOf(clean, off), within: [...stack] });
      if (c === '}') stack.pop();
    }
    start = i + 1;
  }
  return out;
}
function keyframes(src) {
  const map = new Map();
  const re = /@keyframes\s+([-\w]+)\s*\{/g;
  for (let m; (m = re.exec(src));) {
    let depth = 1, i = re.lastIndex;
    for (; i < src.length && depth; i++) { if (src[i] === '{') depth++; else if (src[i] === '}') depth--; }
    const body = src.slice(re.lastIndex, i - 1);
    map.set(m[1], [...new Set([...body.matchAll(/([-\w]+)\s*:/g)].map((x) => x[1].toLowerCase()))]);
  }
  return map;
}

export function lintCss(file, add) {
  const src = fs.readFileSync(file, 'utf8');
  const f = rel(file);
  const isTokens = f === 'css/tokens.css';
  const kf = keyframes(src);
  for (const d of cssDecls(src)) {
    const where = { file: f, line: d.line };
    if (!isTokens) {
      const v = d.value.replace(/var\(--[\w-]+/g, '');
      for (const m of v.matchAll(RE_COLOR)) add({ rule: 'color', ...where, text: `${d.prop}: ${m[0].replace(/\($/, '()')}` });
      if (!/^(transition|animation)/.test(d.prop)) for (const m of v.matchAll(RE_LEN)) {
        if (parseFloat(m[0]) === 0) continue;
        add({ rule: /radius/.test(d.prop) ? 'radius' : 'size', ...where, text: `${d.prop}: ${m[0]}` });
      }
      for (const m of v.matchAll(RE_TIME)) if (parseFloat(m[0]) !== 0) add({ rule: 'duration', ...where, text: `${d.prop}: ${m[0]}` });
    }
    if (d.prop === 'transition' || d.prop === 'transition-property') {
      for (const part of d.value.split(',')) {
        const p = part.trim().split(/\s+/)[0];
        if (!p || p === 'none' || ANIM_OK.has(p) || /^var\(/.test(p)) continue;
        if (p === 'background-color') continue; // hover/press; "instant on press" is checked by tempo
        add({ rule: 'transition', ...where, text: `transition: ${p}` });
      }
    }
    if (d.prop === 'animation' || d.prop === 'animation-name') {
      for (const part of d.value.split(',')) {
        const name = part.trim().split(/\s+/).find((t) => kf.has(t));
        if (!name) continue;
        for (const p of kf.get(name)) if (!ANIM_OK.has(p)) add({ rule: 'keyframes', ...where, text: `@keyframes ${name}: ${p}` });
      }
    }
  }
}

/* ---- JS ---- */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, (m, a) => a + ' '.repeat(m.length - a.length));
const RE_EMOJI = /\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u;

export function lintJs(file, add, { timers = true, i18n = false } = {}) {
  const opts = { i18n };
  const src = fs.readFileSync(file, 'utf8');
  const code = stripComments(src);
  const f = rel(file);
  for (const m of code.matchAll(/\b(innerHTML|outerHTML|insertAdjacentHTML)\b/g)) add({ rule: 'html', file: f, line: lineOf(code, m.index), text: m[1] });
  if (timers) for (const m of code.matchAll(/\b(setTimeout|setInterval)\s*\(/g)) {
    // find the last argument inside the parentheses
    let depth = 0, i = m.index + m[0].length - 1, lastComma = -1;
    for (; i < code.length; i++) {
      const c = code[i];
      if ('([{'.includes(c)) depth++;
      else if (')]}'.includes(c)) { depth--; if (depth === 0) break; }
      else if (c === ',' && depth === 1) lastComma = i;
    }
    if (lastComma < 0) continue;
    const arg = code.slice(lastComma + 1, i).trim();
    if (/^[\d_.]+$/.test(arg)) add({ rule: 'timer', file: f, line: lineOf(code, m.index), text: `${m[1]}(…, ${arg})` });
  }
  // no native title tooltips (white, ~1 s delay): attribute in the h() call, .title =, setAttribute('title'), SVG <title>
  const titleHits = [
    ...code.matchAll(/\bh\(\s*(?:'[a-z0-9]+'|"[a-z0-9]+"|[\w.]+)\s*,\s*\{[^}]*\btitle\s*:/g),
    ...code.matchAll(/(?<![\w.])(?!document\.)[\w.]+\.title\s*=(?!=)/g),
    ...code.matchAll(/setAttribute\(\s*['"]title['"]/g),
    ...code.matchAll(/\bs\(\s*['"]title['"]/g),
  ];
  for (const m of titleHits) if (!/document\.title\s*=/.test(m[0])) add({ rule: 'title', file: f, line: lineOf(code, m.index), text: m[0].replace(/\s+/g, ' ').slice(0, 60) });
  // visible text must come from t(): umlauts in literals, or a text-like literal in a text-carrying position
  if (opts.i18n) {
    const seen = new Set();
    const hit = (idx, text) => { const l = lineOf(code, idx); if (!seen.has(`${l}|${text}`)) { seen.add(`${l}|${text}`); add({ rule: 'i18n', file: f, line: l, text: text.slice(0, 50) }); } };
    for (const m of code.matchAll(/(['"`])((?:[^'"`\\\n]|\\.)*[äöüÄÖÜß](?:[^'"`\\\n]|\\.)*)\1/g)) hit(m.index, `„${m[2]}“`);
    const TEXTY = (v) => /\p{L}{3}/u.test(v) && (/^\p{Lu}/u.test(v) || /\s/.test(v)) && !/^[\w.-]+(\/[\w.-]+)*$/.test(v) && !/[{}$<>=\\]/.test(v.replace(/\$\{[^}]*\}/g, ''));
    for (const m of code.matchAll(/(?:['"]?(?:aria-label|label|title|text|sub|placeholder|empty)['"]?)\s*:\s*(['"])([^'"\n]{3,})\1/g)) if (TEXTY(m[2])) hit(m.index, `${m[0].split(':')[0].trim()}: „${m[2]}“`);
    for (const m of code.matchAll(/\b(?:h|button|toast|banner|badge|empty|section|facts|statusDot)\(\s*(?:'[a-z0-9]+'\s*,\s*(?:null|\{[^{}]*\})\s*,\s*)?(['"])([^'"\n]{3,})\1/g)) if (TEXTY(m[2]) && !/^[a-z0-9]+$/.test(m[2])) hit(m.index, `„${m[2]}“`);
  }
  // emoji only in string/template literals
  for (const m of code.matchAll(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g)) {
    const e = RE_EMOJI.exec(m[0]);
    if (e) add({ rule: 'emoji', file: f, line: lineOf(code, m.index), text: `„${e[0]}“` });
  }
}
export function lintHtml(file, add) {
  const src = fs.readFileSync(file, 'utf8');
  const body = src.replace(/<!--[\s\S]*?-->/g, '');
  if (!/<link\b[^>]*\brel\s*=\s*["'](?:shortcut )?icon["'][^>]*\bhref\s*=\s*["'][^"']+["']|<link\b[^>]*\bhref\s*=\s*["'][^"']+["'][^>]*\brel\s*=\s*["'](?:shortcut )?icon["']/i.test(body)) add({ rule: 'page', file: rel(file), line: 1, text: 'kein <link rel="icon">' });
  if (!/<title>\s*\S[^<]*<\/title>/i.test(body)) add({ rule: 'page', file: rel(file), line: 1, text: 'kein <title>' });
  const e = RE_EMOJI.exec(body);
  if (e) add({ rule: 'emoji', file: rel(file), line: lineOf(src, e.index), text: `„${e[0]}“` });
}

/* ---- Gallery coverage ---- */
function moduleExports(file, seen = new Set()) {
  if (seen.has(file)) return [];
  seen.add(file);
  const src = stripComments(fs.readFileSync(file, 'utf8'));
  const names = [];
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([\w$]+)/g)) names.push({ name: m[1], mod: rel(file) });
  for (const m of src.matchAll(/export\s*\{([^}]*)\}\s*(?:from\s*['"]([^'"]+)['"])?/g)) {
    const from = m[2] ? rel(path.resolve(path.dirname(file), m[2])) : rel(file);
    for (const part of m[1].split(',').map((x) => x.trim()).filter(Boolean)) names.push({ name: part.split(/\s+as\s+/).pop(), mod: from });
  }
  for (const m of src.matchAll(/export\s*\*\s*as\s+([\w$]+)\s+from\s*['"]([^'"]+)['"]/g)) names.push({ name: m[1], mod: rel(path.resolve(path.dirname(file), m[2])) });
  for (const m of src.matchAll(/export\s*\*\s*from\s*['"]([^'"]+)['"]/g)) names.push(...moduleExports(path.resolve(path.dirname(file), m[1]), seen));
  return names;
}
function lintGallery(add, allow) {
  const entry = path.join(ROOT, 'js', 'tarn.js');
  const exp = moduleExports(entry);
  const gal = walk(path.join(ROOT, 'gallery'), ['.js']).map((f) => stripComments(fs.readFileSync(f, 'utf8')).replace(/^\s*import[\s\S]*?from\s*['"][^'"]+['"];?/gm, '')).join('\n');
  const skipMods = new Set(allow.galleryModules || []);
  for (const { name, mod } of exp) {
    if (skipMods.has(mod)) continue;
    if (!new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}\\s*[([.]`).test(gal)) add({ rule: 'gallery', file: mod, line: 0, text: name });
  }
}

/* ---- Legacy name (renamed from dashkit): allowed only in the migration code and in the CHANGELOG history ---- */
const LEGACY_ALLOWED = new Set(['CHANGELOG.md', 'js/theme-init.js', 'tools/lint.mjs']);
const LEGACY_SKIP_DIRS = new Set(['.git', 'node_modules', '.verify-out']);
const LEGACY_EXT = new Set(['.js', '.mjs', '.css', '.html', '.md', '.json', '.yml', '.yaml', '.svg', '.webmanifest', '.txt', '.py', '']);
const RE_LEGACY = new RegExp(['dash' + 'kit', '(?<![A-Za-z0-9_])d' + 'k-', '__d' + 'k', '\\bD' + 'K_', '\\bd' + 'kApp'].join('|'));
export function lintLegacy(add, root = ROOT) {
  const visit = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name), r = path.relative(root, p).split(path.sep).join('/');
      if (e.isDirectory()) { if (!LEGACY_SKIP_DIRS.has(e.name)) visit(p); continue; }
      if (RE_LEGACY.test(r)) add({ rule: 'legacy', file: r, line: 0, text: 'file name' });
      if (LEGACY_ALLOWED.has(r) || !LEGACY_EXT.has(path.extname(e.name))) continue;
      const lines = fs.readFileSync(p, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) { const m = RE_LEGACY.exec(lines[i]); if (m) add({ rule: 'legacy', file: r, line: i + 1, text: m[0] }); }
    }
  };
  visit(root);
}

/* ---- Run ---- */
export function runLint({ allowFile = ALLOW } = {}) {
  const allow = JSON.parse(fs.readFileSync(allowFile, 'utf8'));
  const found = [];
  const add = (f) => found.push(f);
  for (const f of [...walk(path.join(ROOT, 'css'), ['.css']), ...walk(path.join(ROOT, 'example'), ['.css'])]) lintCss(f, add);
  for (const f of [...walk(path.join(ROOT, 'js'), ['.js']), ...walk(path.join(ROOT, 'example'), ['.js'])]) lintJs(f, add, { i18n: !/^(js\/locales\/|js\/i18n\.js|example\/messages\.js|js\/markdown\.js)/.test(rel(f)) });
  for (const f of walk(path.join(ROOT, 'gallery'), ['.js'])) lintJs(f, (x) => (x.rule === 'html' || x.rule === 'emoji') && add(x), { timers: false });
  for (const f of [...walk(path.join(ROOT, 'gallery'), ['.html']), ...walk(path.join(ROOT, 'example'), ['.html']), path.join(ROOT, 'index.html')].filter((x) => fs.existsSync(x))) lintHtml(f, add);
  lintGallery(add, allow);
  lintLegacy(add);
  const sig = (x) => `${x.rule}|${x.file}|${x.text}`;
  const exc = (allow.exceptions || []).map((e) => ({ ...e, re: Object.fromEntries(Object.entries(e.match).map(([k, v]) => [k, new RegExp(v)])) }));
  const known = new Set((allow.known || []).map((k) => `${k.rule}|${k.file}|${k.text}`));
  const out = [];
  let excepted = 0;
  for (const x of found) {
    const e = exc.find((e) => Object.entries(e.re).every(([k, re]) => re.test(String(x[k] ?? ''))));
    if (e) { excepted++; continue; }
    out.push({ ...x, known: known.has(sig(x)) ? 'lint-backlog' : undefined });
  }
  return { findings: out, excepted, allow };
}

/** For verify: findings in verify format. */
export function lintFindings() {
  const r = runLint();
  return {
    findings: r.findings.map((x) => ({ check: 'lint', rule: x.rule, page: '-', view: x.file, size: '-', theme: '-', sel: `${x.file}${x.line ? `:${x.line}` : ''}`, where: '', text: x.text, known: x.known })),
    summary: `lint ${r.findings.filter((x) => !x.known).length ? `${r.findings.filter((x) => !x.known).length} new` : 'ok'} (${r.findings.filter((x) => x.known).length} inventory)`,
  };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('-h') || argv.includes('--help')) {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
    return 0;
  }
  const verbose = argv.includes('-v');
  const r = runLint();
  if (argv.includes('--write-known')) {
    const seen = new Set();
    r.allow.known = r.findings.map(({ rule, file, text }) => ({ rule, file, text })).filter((k) => { const s = `${k.rule}|${k.file}|${k.text}`; return !seen.has(s) && seen.add(s); });
    // compact: one entry per line so diffs stay readable
    const { known, ...rest } = r.allow;
    const head = JSON.stringify(rest, null, 1).replace(/\n}$/, '');
    fs.writeFileSync(ALLOW, `${head},\n "known": [\n${known.map((k) => `  ${JSON.stringify(k)}`).join(',\n')}\n ]\n}\n`);
    console.log(`lint: ${r.allow.known.length} inventory entries written to ${rel(ALLOW)}`);
    return 0;
  }
  const fresh = r.findings.filter((x) => !x.known), known = r.findings.filter((x) => x.known);
  const byRule = (list) => Object.entries(list.reduce((a, x) => ((a[x.rule] = (a[x.rule] || 0) + 1), a), {})).map(([k, n]) => `${k} ${n}`).join(', ');
  const lines = [`lint: ${r.findings.length + r.excepted} hits · ${fresh.length} new · ${known.length} inventory (${byRule(known) || '–'}) · ${r.excepted} exceptions`];
  const show = verbose ? r.findings : fresh.slice(0, 7);
  for (const x of show) lines.push(`${x.known ? 'KNOWN' : 'NEW  '} ${x.rule} ${x.file}${x.line ? `:${x.line}` : ''} – ${x.text}`);
  if (!verbose && fresh.length > show.length) lines.push(`… ${fresh.length - show.length} more (-v)`);
  lines.push(fresh.length ? `RED: ${fresh.length} new violations · exit 1` : `GREEN (inventory ${known.length}) · exit 0`);
  for (const l of lines) console.log(l);
  return fresh.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exit(main()); } catch (e) { console.log(`lint: internal error – ${e.message}`); process.exit(2); }
}
