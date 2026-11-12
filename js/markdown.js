// @ts-check
// dashkit · Markdown for agent reports: markdown(text, { compact, images }) → element.
//
// Own parser, no library. Two stages: parseMarkdown(text) returns an AST (pure function, testable in Node),
// renderMarkdown(ast) builds DOM nodes from it. HTML is never created from strings: text always goes through
// text nodes, raw HTML in the source (<script>, <b> …) is shown as text.
//
// Scope: headings (#), paragraphs, **bold**, *italic*, ~~strikethrough~~, `code`, code blocks (```/~~~),
// quotes (>), nested lists (-, *, +, 1.), task lists (- [ ] / - [x]), GFM tables, horizontal rule,
// links [t](url) and autolinks (<https://…>, bare http(s) URLs). Not included: HTML, footnotes, reference links,
// setext headings, indented code blocks.
//
// Security: links only http, https, mailto and relative (javascript:, data:, vbscript:, //host … become plain
// text); external links with rel="noopener noreferrer" and target="_blank". Images are off (alt text instead of image);
// with { images: true } only for relative paths. Nesting is limited to MAX_DEPTH.
import { h, cls } from './dom.js';
import { t } from './i18n.js';

export const MAX_DEPTH = 12;

/* ============================== Helpers ============================== */
const WS = /\s/;
const PUNCT = /[\p{P}\p{S}]/u;
const ESCAPABLE = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', copy: '©', times: '×', middot: '·', laquo: '«', raquo: '»', bdquo: '„', ldquo: '“', rdquo: '”', euro: '€', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß' };

function decodeEntity(name) {
  if (name[0] === '#') {
    const cp = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
    if (!Number.isFinite(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '�';
    return String.fromCodePoint(cp);
  }
  return ENTITIES[name] ?? null;
}

/** Check a URL: { href, ext } or null. Allows http, https, mailto and relative addresses. */
export function safeUrl(raw, { image = false } = {}) {
  const href = String(raw ?? '').trim();
  if (!href || /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(href)) return null;
  const clean = href.replace(/[\s\u00ad\u200b-\u200f\u2060\ufeff]/g, '');
  const m = /^([a-z][a-z0-9+.-]*):/i.exec(clean);
  if (m) {
    const scheme = m[1].toLowerCase();
    if (image) return null; // images relative only
    if (scheme === 'http' || scheme === 'https') return { href, ext: true };
    if (scheme === 'mailto') return { href, ext: false };
    return null;
  }
  if (/^[\\/]{2}/.test(clean) || /^\\/.test(clean)) return null; // protocol-relative (//host, /\host) and backslash paths
  return { href, ext: false };
}

const text = (v) => ({ t: 'text', v });

/* ============================== Inline ============================== */
const SPECIAL = /[\\`*_~[!<&\n]|https?:\/\//g;

function plain(nodes) {
  return nodes.map((n) => (n.t === 'text' || n.t === 'code' ? n.v : n.t === 'br' ? ' ' : n.t === 'img' ? n.alt : n.c ? plain(n.c) : '')).join('');
}

/** Find the closing bracket: ‹[› at i → index of ‹]› (nested, escapes and code spans skipped) or -1. */
function findBracketEnd(s, i) {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    const c = s[j];
    if (c === '\\') { j++; continue; }
    if (c === '`') { let k = j; while (s[k] === '`') k++; const run = s.slice(j, k), e = s.indexOf(run, k); if (e > 0) j = e + run.length - 1; else j = k - 1; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (!depth) return j; }
  }
  return -1;
}

/** Destination and title after ‹](›: { url, end } (end = index after ‹)›) or null. */
function parseDest(s, i) {
  let j = i;
  const ws = () => { while (j < s.length && /[ \t\n]/.test(s[j])) j++; };
  ws();
  let url = '';
  if (s[j] === '<') {
    const e = s.indexOf('>', j);
    if (e < 0 || s.slice(j, e).includes('\n')) return null;
    url = s.slice(j + 1, e); j = e + 1;
  } else {
    let depth = 0;
    for (; j < s.length; j++) {
      const c = s[j];
      if (c === '\\' && ESCAPABLE.includes(s[j + 1] ?? '')) { url += s[j + 1]; j++; continue; }
      if (WS.test(c)) break;
      if (c === '(') depth++;
      else if (c === ')') { if (!depth) break; depth--; }
      url += c;
    }
    if (depth) return null;
  }
  ws();
  if (s[j] === '"' || s[j] === "'" || s[j] === '(') { // skip title
    const close = s[j] === '(' ? ')' : s[j];
    let k = j + 1;
    for (; k < s.length && s[k] !== close; k++) if (s[k] === '\\') k++;
    if (k >= s.length) return null;
    j = k + 1; ws();
  }
  return s[j] === ')' ? { url, end: j + 1 } : null;
}

/** Inline text → nodes. depth limits nested link texts. */
export function parseInline(src, o = {}, depth = 0) {
  const toks = [];            // nodes and delimiters { d: true, ch, n, open, close }
  let buf = '', pos = 0;
  const flush = () => { if (buf) { toks.push(text(buf)); buf = ''; } };
  const push = (node) => { flush(); toks.push(node); };
  SPECIAL.lastIndex = 0;
  while (pos < src.length) {
    SPECIAL.lastIndex = pos;
    const m = SPECIAL.exec(src);
    if (!m) { buf += src.slice(pos); break; }
    const i = m.index;
    if (i > pos) buf += src.slice(pos, i);
    const c = src[i];
    pos = i + 1;
    if (c === 'h') { // bare http(s) URL (not mid-word)
      if (i > 0 && /[\p{L}\p{N}]/u.test(src[i - 1])) { buf += c; continue; }
      const um = /** @type {RegExpExecArray} */ (/^https?:\/\/[^\s<]+/.exec(src.slice(i))); // SPECIAL only stops at 'h' before http(s)://, so this matches
      let u = um[0];
      u = u.replace(/[?!.,:;*_~'"]+$/, '');
      while (u.endsWith(')') && ((u.match(/\)/g) || []).length > (u.match(/\(/g) || []).length)) u = u.slice(0, -1);
      const ok = u.length > 8 && safeUrl(u);
      if (!ok) { buf += src[i]; continue; }
      push({ t: 'a', href: ok.href, ext: ok.ext, c: [text(u)] });
      pos = i + u.length;
    } else if (c === '\\') {
      const n = src[pos];
      if (n === '\n') { push({ t: 'br' }); pos++; }
      else if (n && ESCAPABLE.includes(n)) { buf += n; pos++; }
      else buf += '\\';
    } else if (c === '`') {
      let k = i; while (src[k] === '`') k++;
      const run = src.slice(i, k), e = src.indexOf(run, k);
      let end = -1;
      for (let from = k, p; (p = src.indexOf(run, from)) >= 0; from = p + 1) { // run of exactly the same length
        if (src[p + run.length] !== '`' && src[p - 1] !== '`') { end = p; break; }
        from = p + run.length - 1;
      }
      if (end < 0 || e < 0) { buf += run; pos = k; continue; }
      let v = src.slice(k, end).replace(/\n/g, ' ');
      if (v.length > 2 && v.startsWith(' ') && v.endsWith(' ') && v.trim()) v = v.slice(1, -1);
      push({ t: 'code', v }); pos = end + run.length;
    } else if (c === '*' || c === '_' || c === '~') {
      let k = i; while (src[k] === c) k++;
      const n = k - i;
      if (c === '~' && n !== 2) { buf += src.slice(i, k); pos = k; continue; }
      const prev = i ? src[i - 1] : ' ', next = k < src.length ? src[k] : ' ';
      const left = !WS.test(next) && (!PUNCT.test(next) || WS.test(prev) || PUNCT.test(prev));
      const right = !WS.test(prev) && (!PUNCT.test(prev) || WS.test(next) || PUNCT.test(next));
      const open = c === '_' ? left && (!right || PUNCT.test(prev)) : left;
      const close = c === '_' ? right && (!left || PUNCT.test(next)) : right;
      push({ d: true, ch: c, n, n0: n, open, close, both: left && right }); pos = k;
    } else if (c === '[' || (c === '!' && src[pos] === '[')) {
      const img = c === '!';
      const b0 = img ? pos : i;
      const e = depth < MAX_DEPTH ? findBracketEnd(src, b0) : -1;
      const dest = e > 0 && src[e + 1] === '(' ? parseDest(src, e + 2) : null;
      if (!dest) { buf += c; continue; }
      const inner = src.slice(b0 + 1, e);
      if (img) {
        const ok = o.images ? safeUrl(dest.url, { image: true }) : null;
        const alt = plain(parseInline(inner, o, depth + 1));
        push(ok ? { t: 'img', src: ok.href, alt } : { t: 'imgoff', alt });
      } else {
        const ok = safeUrl(unescapeUrl(dest.url));
        const kids = parseInline(inner, o, depth + 1);
        if (ok) push({ t: 'a', href: ok.href, ext: ok.ext, c: kids }); else for (const kd of kids) push(kd); // unsafe: text only
      }
      pos = dest.end;
    } else if (c === '<') {
      const am = /^<([a-zA-Z][a-zA-Z0-9+.-]*:[^\s<>]*|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)>/.exec(src.slice(i, i + 2048));
      if (am) {
        const raw = am[1], full = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) ? raw : `mailto:${raw}`;
        const ok = safeUrl(full);
        if (ok) { push({ t: 'a', href: ok.href, ext: ok.ext, c: [text(raw)] }); pos = i + am[0].length; continue; }
      }
      buf += c; // raw HTML stays text
    } else if (c === '&') {
      const em = /^&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z]{2,8});/.exec(src.slice(i, i + 12));
      const dec = em && decodeEntity(em[1]);
      if (em && dec != null) { buf += dec; pos = i + em[0].length; } else buf += c;
    } else if (c === '\n') {
      const hard = / {2,}$/.test(buf);
      buf = buf.replace(/ +$/, '');
      if (hard) push({ t: 'br' }); else buf += '\n';
      while (src[pos] === ' ') pos++;
    } else buf += c;
  }
  flush();
  return resolveEmphasis(toks);
}
const unescapeUrl = (u) => u.replace(/&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[a-zA-Z]{2,8});/g, (m, n) => decodeEntity(n) ?? m);

/** Resolve emphasis (simplified CommonMark delimiter algorithm). */
function resolveEmphasis(toks) {
  for (let ci = 0; ci < toks.length; ci++) {
    const cl = toks[ci];
    if (!cl.d || !cl.close) continue;
    for (let oi = ci - 1; oi >= 0; oi--) {
      const op = toks[oi];
      if (!op.d || !op.open || op.ch !== cl.ch) continue;
      if ((op.both || cl.both) && (op.n + cl.n) % 3 === 0 && !(op.n % 3 === 0 && cl.n % 3 === 0)) continue;
      const strong = op.n >= 2 && cl.n >= 2;
      if (cl.ch === '~' && !strong) continue;
      const use = strong ? 2 : 1;
      const inner = toks.slice(oi + 1, ci).map(undelim);
      const node = { t: cl.ch === '~' ? 'del' : strong ? 'strong' : 'em', c: mergeText(inner) };
      op.n -= use; cl.n -= use;
      toks.splice(oi + 1, ci - oi - 1, node);
      ci = oi + 1;
      if (op.n === 0) { toks.splice(oi, 1); ci--; }
      if (cl.n === 0) { toks.splice(ci + 1, 1); ci--; } // remove closer, continue with the node before it
      else ci--;                                          // retry the rest of the closer
      break;
    }
  }
  return mergeText(toks.map(undelim));
}
const undelim = (t) => (t.d ? text(t.ch.repeat(t.n)) : t);
function mergeText(nodes) {
  const out = [];
  for (const n of nodes) {
    if (n.t === 'text' && out.length && out[out.length - 1].t === 'text') out[out.length - 1] = text(out[out.length - 1].v + n.v);
    else if (n.t !== 'text' || n.v) out.push(n);
  }
  return out;
}

/* ============================== Blocks ============================== */
const RE = {
  fence: /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)[^`]*$/,
  heading: /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/,
  hr: /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/,
  quote: /^ {0,3}>/,
  item: /^( {0,3})([-*+]|\d{1,9}[.)])( +|$)(.*)$/,
  delim: /^ *\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|? *$/,
};

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = []; let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; }
    else if (s[i] === '`') { let k = i; while (s[k] === '`') k++; const run = s.slice(i, k), e = s.indexOf(run, k); if (e > 0) { cur += s.slice(i, e + run.length).replace(/\\\|/g, '|'); i = e + run.length - 1; } else { cur += run; i = k - 1; } }
    else if (s[i] === '|') { cells.push(cur.trim()); cur = ''; }
    else cur += s[i];
  }
  cells.push(cur.trim());
  return cells;
}
const isTableStart = (lines, i) => i + 1 < lines.length && lines[i].includes('|') && RE.delim.test(lines[i + 1]) && lines[i + 1].includes('-')
  && (lines[i + 1].includes('|') || splitRow(lines[i]).length === 1) && splitRow(lines[i]).length === splitRow(lines[i + 1]).length;
const blank = (l) => !l.trim();

function startsBlock(lines, i, inPara) {
  const l = lines[i];
  if (RE.fence.test(l) || RE.heading.test(l) || RE.hr.test(l) || RE.quote.test(l)) return true;
  const m = RE.item.exec(l);
  if (m && m[4].trim() && (!inPara || !/\d/.test(m[2]) || /^1[.)]$/.test(m[2]))) return true; // non-empty only; numbered lists interrupt only with 1.
  return inPara && isTableStart(lines, i);
}

/** Lines → block nodes. */
function parseBlocks(lines, o, depth) {
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (blank(l)) { i++; continue; }
    if (depth >= MAX_DEPTH) { out.push({ t: 'p', c: parseInline(lines.slice(i).join('\n').trim(), o) }); break; }
    let m;
    if ((m = RE.fence.exec(l))) {
      const fence = m[1], ind = l.search(/\S/);
      const body = [];
      for (i++; i < lines.length; i++) {
        const t = lines[i].trim();
        if (t.startsWith(fence[0]) && /^(`{3,}|~{3,})$/.test(t) && t.length >= fence.length && t[0] === fence[0]) { i++; break; }
        body.push(ind ? lines[i].replace(new RegExp(`^ {0,${ind}}`), '') : lines[i]);
      }
      out.push({ t: 'pre', lang: m[2] || '', v: body.join('\n') });
    } else if ((m = RE.heading.exec(l))) {
      out.push({ t: 'h', n: m[1].length, c: parseInline((m[2] || '').trim(), o) }); i++;
    } else if (RE.hr.test(l)) {
      out.push({ t: 'hr' }); i++;
    } else if (RE.quote.test(l)) {
      const q = [];
      for (; i < lines.length && RE.quote.test(lines[i]); i++) q.push(lines[i].replace(/^ {0,3}> ?/, ''));
      out.push({ t: 'quote', c: parseBlocks(q, o, depth + 1) });
    } else if (RE.item.test(l)) {
      const r = parseList(lines, i, o, depth);
      out.push(r.node); i = r.next;
    } else if (isTableStart(lines, i)) {
      const head = splitRow(lines[i]);
      const align = splitRow(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? 'center' : /^-+:$/.test(c) ? 'right' : /^:-+$/.test(c) ? 'left' : null));
      const rows = [];
      for (i += 2; i < lines.length && !blank(lines[i]) && !RE.fence.test(lines[i]) && !RE.heading.test(lines[i]) && !RE.quote.test(lines[i]); i++) {
        const cells = splitRow(lines[i]);
        rows.push(head.map((_, k) => parseInline(cells[k] ?? '', o)));
      }
      out.push({ t: 'table', align, head: head.map((c) => parseInline(c, o)), rows });
    } else {
      const para = [l];
      for (i++; i < lines.length && !blank(lines[i]) && !startsBlock(lines, i, true); i++) para.push(lines[i]);
      out.push({ t: 'p', c: parseInline(para.map((x, k) => (k ? x.replace(/^[ \t]+/, '') : x)).join('\n').replace(/[ \t]+$/, ''), o) });
    }
  }
  return out;
}

function parseList(lines, start, o, depth) {
  const first = /** @type {RegExpExecArray} */ (RE.item.exec(lines[start])); // the caller checked that the line is a list item
  const ordered = /\d/.test(first[2]), bullet = first[2], delimCh = ordered ? first[2].slice(-1) : bullet;
  const items = [];
  let loose = false, i = start;
  const startNum = ordered ? parseInt(first[2], 10) : null;
  while (i < lines.length) {
    const m = RE.item.exec(lines[i]);
    if (!m || /\d/.test(m[2]) !== ordered || (ordered ? m[2].slice(-1) : m[2]) !== delimCh) break;
    const spaces = m[3].length, rest = m[4];
    const contentIndent = m[1].length + m[2].length + (rest.trim() && spaces <= 4 ? spaces : 1);
    const body = [rest];
    let j = i + 1, sawBlank = false;
    for (; j < lines.length; j++) {
      const ln = lines[j];
      if (blank(ln)) { body.push(''); sawBlank = true; continue; }
      const ind = ln.search(/\S/);
      if (ind >= contentIndent) { body.push(ln.slice(contentIndent)); sawBlank = false; continue; }
      if (!sawBlank && !startsBlock(lines, j, true) && !RE.item.test(ln)) { body.push(ln.trim()); continue; } // lazy continuation
      break;
    }
    while (body.length && blank(body[body.length - 1])) body.pop();
    const sibling = j < lines.length && (m2 => m2 && /\d/.test(m2[2]) === ordered && (ordered ? m2[2].slice(-1) : m2[2]) === delimCh)(RE.item.exec(lines[j]));
    if (sibling && j - 1 > i && blank(lines[j - 1])) loose = true;              // blank line between items
    const blocks = parseBlocks(body, o, depth + 1);
    if (blocks.length > 1 && body.some((b, k) => k > 0 && blank(b))) loose = true; // blank line between blocks in the item
    /** @type {boolean | null} */
    let task = null;
    if (blocks[0]?.t === 'p') {
      const f = blocks[0].c[0];
      const tm = f?.t === 'text' && /^\[([ xX])\](?:\s+|$)/.exec(f.v);
      if (tm) { task = tm[1] !== ' '; f.v = f.v.slice(tm[0].length); if (!f.v) blocks[0].c.shift(); }
    }
    items.push({ task, c: blocks });
    i = j;
    if (!sibling) break;
  }
  return { node: { t: 'list', ordered, start: ordered && startNum !== 1 ? startNum : null, loose, items }, next: i };
}

/** Markdown text → AST (block nodes). opts: { images }. */
export function parseMarkdown(src, opts = {}) {
  const s = String(src ?? '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/\u0000/g, '�');
  return parseBlocks(s.split('\n'), opts, 0);
}

/* ============================== DOM ============================== */
// Directly via document.createElement instead of h(): for 50 KB reports (≈ 2,300 nodes) this saves about a third of the build time.
const E = (tag, className, parent) => { const e = document.createElement(tag); if (className) e.className = className; if (parent) parent.append(e); return e; };
const T = (v, parent) => { parent.append(document.createTextNode(v)); };

function inline(nodes, parent) {
  for (const n of nodes) {
    switch (n.t) {
      case 'text': T(n.v, parent); break;
      case 'em': inline(n.c, E('em', null, parent)); break;
      case 'strong': inline(n.c, E('strong', null, parent)); break;
      case 'del': inline(n.c, E('del', null, parent)); break;
      case 'code': T(n.v, E('code', 'dk-md-code', parent)); break;
      case 'br': E('br', null, parent); break;
      case 'a': {
        const a = E('a', 'dk-md-link', parent);
        a.setAttribute('href', n.href);
        if (n.ext) { a.setAttribute('rel', 'noopener noreferrer'); a.setAttribute('target', '_blank'); }
        inline(n.c, a); break;
      }
      case 'img': {
        const im = E('img', 'dk-md-img', parent);
        im.setAttribute('src', n.src); im.setAttribute('alt', n.alt); im.setAttribute('loading', 'lazy'); im.setAttribute('decoding', 'async'); break;
      }
      case 'imgoff': T(n.alt || t('md.image'), E('span', 'dk-md-imgoff', parent)); break;
      default: break;
    }
  }
  return parent;
}
function cell(tag, c, align, parent) {
  const e = E(tag, align ? `is-${align}` : null, parent);
  if (tag === 'th') e.setAttribute('scope', 'col');
  return inline(c, e);
}
function block(n, parent) {
  switch (n.t) {
    case 'h': inline(n.c, E(`h${n.n}`, `dk-md-h dk-md-h${n.n}`, parent)); break;
    case 'p': inline(n.c, E('p', null, parent)); break;
    case 'hr': E('hr', 'dk-md-hr', parent); break;
    case 'quote': { const q = E('blockquote', 'dk-md-quote', parent); for (const k of n.c) block(k, q); break; }
    case 'pre': {
      const pre = E('pre', 'dk-md-pre', parent); pre.setAttribute('tabindex', '0');
      const code = E('code', n.lang ? `language-${n.lang.replace(/[^\w-]/g, '')}` : null, pre); T(n.v, code); break;
    }
    case 'list': {
      const tasks = n.items.some((x) => x.task != null);
      const list = E(n.ordered ? 'ol' : 'ul', tasks ? 'dk-md-list is-tasks' : 'dk-md-list', parent);
      if (n.start != null) list.setAttribute('start', String(n.start));
      for (const it of n.items) {
        const li = E('li', it.task != null ? 'dk-md-task' : null, list);
        if (it.task != null) {
          const cb = E('input', null, li); cb.type = 'checkbox'; cb.checked = it.task; cb.disabled = true; cb.setAttribute('aria-label', it.task ? t('md.done') : t('md.open'));
        }
        const tight = !n.loose && it.c[0]?.t === 'p';
        if (tight) inline(it.c[0].c, it.task != null ? E('span', null, li) : li);
        for (let k = tight ? 1 : 0; k < it.c.length; k++) block(it.c[k], li);
      }
      break;
    }
    case 'table': {
      const wrap = E('div', 'dk-md-table', parent); wrap.setAttribute('role', 'region'); wrap.setAttribute('tabindex', '0');
      const table = E('table', null, wrap);
      const hr = E('tr', null, E('thead', null, table));
      n.head.forEach((c, k) => cell('th', c, n.align[k], hr));
      const tb = E('tbody', null, table);
      for (const r of n.rows) { const tr = E('tr', null, tb); r.forEach((c, k) => cell('td', c, n.align[k], tr)); }
      break;
    }
    default: break;
  }
}

/** AST → DOM nodes (array). */
export function renderMarkdown(ast) {
  const frag = document.createDocumentFragment();
  for (const n of ast) block(n, frag);
  return [...frag.childNodes];
}

/**
 * Markdown text → element (div.dk-md). opts: { compact = false (sheets/inspector), images = false (relative paths only) }.
 * Raw HTML in the text is shown as text, never interpreted as HTML.
 */
export const LONG_CHARS = 20000; // above this the report gets .is-long (layout only for visible content)
/**
 * @param {unknown} src
 * @param {{ compact?: boolean, images?: boolean, className?: string }} [o]
 * @returns {HTMLElement}
 */
export function markdown(src, { compact = false, images = false, className } = {}) {
  const root = h('div', { class: cls('dk-md', compact && 'dk-md-compact', String(src ?? '').length > LONG_CHARS && 'is-long', className) });
  for (const n of parseMarkdown(src, { images })) block(n, root);
  return root;
}
