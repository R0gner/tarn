// tarn · geometry probe. Runs in the page context (injected via CDP Runtime.evaluate), not in the kit.
// Expression: (function …)(opts) → { findings: [...], warnings: [...], stats }
// Rules (finding = error, warning = hint only):
//   overflow   child sticks out of its container (parents with overflow: visible; scrolling/clipping ones excluded)
//   page       page wider than the viewport
//   clip       text cut off without an ellipsis (overflow hidden/clip, text sticks out, no text-overflow: ellipsis)
//   overlap    text boxes overlap; siblings in flex/grid overlap
//   align      siblings in a flex row or grid row misaligned (per align-items/align-self)
//   touch      touch target < minTouch px (hit area via elementFromPoint, only with opts.touch)
//   contained  moving part (toggle thumb, progress fill) sticks out of its track
//   touch48    comfortable density (opts.strictTouch): interactive element, own box < 48 px; no exceptions
//   contrast   text/background contrast below 4.5 (large 3) – warning
(function tnGeometry(opts) {
  const o = Object.assign({ tol: 1, alignTol: 1.5, minTouch: 40, touch: false, contrast: true, maxPerRule: 60 }, opts || {});
  const findings = [], warnings = [];
  const de = document.documentElement;
  const VW = de.clientWidth;
  const counts = {};
  const push = (list, f) => { counts[f.rule] = (counts[f.rule] || 0) + 1; if (counts[f.rule] <= o.maxPerRule) list.push(f); };

  /* ---- Helpers ---- */
  const pick = (el) => {
    const c = [...el.classList];
    const pref = c.filter((x) => /^(tn|g)-/.test(x) && !/^(is|has)-/.test(x));
    return (pref.length ? pref : c).slice(0, 2);
  };
  const desc = (el) => {
    if (!el || el.nodeType !== 1) return '?';
    const cl = pick(el);
    const role = el.getAttribute('role');
    return el.tagName.toLowerCase() + (cl.length ? '.' + cl.join('.') : '') + (!cl.length && role ? `[role=${role}]` : '');
  };
  const path = (el) => `${desc(el.parentElement)} > ${desc(el)}`;
  const where = (el) => {
    const host = el.closest('.tn-card, .tn-section, dialog, .tn-inspector, .tn-toolbar, .tn-sidebar');
    const head = host?.querySelector('.tn-card-title, .tn-section-title, .tn-sheet-title, h1, h2, h3');
    return (head?.textContent || '').trim().slice(0, 40) || desc(host || el.parentElement || el);
  };
  const snippet = (el) => (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50);
  const R = (r) => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
  const cs = (el) => getComputedStyle(el);
  const inSvg = (el) => el instanceof SVGElement && el.tagName.toLowerCase() !== 'svg';
  const visible = (el) => el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : !!el.getClientRects().length;
  const ignored = (el) => !!el.closest('[inert], [data-verify-ignore]');
  const inFlow = (s) => s.position !== 'absolute' && s.position !== 'fixed';
  const isScroll = (v) => v === 'auto' || v === 'scroll';
  const clips = (v) => v !== 'visible';

  const all = [...document.querySelectorAll('body *')].filter((el) => !inSvg(el) && !ignored(el) && visible(el));
  const styleOf = new Map(all.map((el) => [el, cs(el)]));
  const S = (el) => styleOf.get(el) || cs(el);
  // screen-reader only (1 px box with clip): no visible text
  const srOnly = (el) => { const r = el.getBoundingClientRect(); return r.width <= 2 || r.height <= 2; };
  // Layer: open dialog, popover, fixed or sticky – content on different layers may cover each other
  const layerCache = new Map();
  const layerOf = (el) => {
    if (!el || el === document.body || el === de) return document.body;
    if (layerCache.has(el)) return layerCache.get(el);
    const s = S(el);
    const own = (el.tagName === 'DIALOG' && el.open) || el.matches(':popover-open') || s.position === 'fixed' || s.position === 'sticky';
    const v = own ? el : layerOf(el.parentElement);
    layerCache.set(el, v);
    return v;
  };

  /* ---- page: page wider than viewport ---- */
  if (de.scrollWidth > VW + o.tol) {
    let culprit = null;
    for (const el of all) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > VW + o.tol) { const p = el.parentElement, pr = p?.getBoundingClientRect(); if (!pr || pr.right <= VW + o.tol) { culprit = el; break; } }
    }
    push(findings, { rule: 'page', sel: culprit ? path(culprit) : 'html', where: culprit ? where(culprit) : '', px: de.scrollWidth - VW, text: `page ${de.scrollWidth} px wide, viewport ${VW} px` });
  }

  /* ---- scroll-x: a segmented control shows all its options; one that was squeezed scrolls sideways and hides some (.tn-seg has overflow-x: auto as a last resort) ---- */
  for (const el of document.querySelectorAll('.tn-seg')) {
    if (ignored(el) || !visible(el)) continue;
    if (el.scrollWidth > el.clientWidth + o.tol) push(findings, { rule: 'scroll-x', sel: path(el), where: where(el), px: el.scrollWidth - el.clientWidth, text: `segmented control scrolls sideways, options hidden (${el.scrollWidth} px in ${el.clientWidth} px)`, rect: R(el.getBoundingClientRect()), el });
  }

  /* ---- identity: every board has a favicon and a meaningful title “View · Board” ---- */
  if (!document.head.querySelector('link[rel~="icon"][href]')) push(findings, { rule: 'identity', sel: 'head', where: '', text: 'no <link rel="icon"> (every board has its own favicon)' });
  if (!/\S.*·.*\S/.test(document.title)) push(findings, { rule: 'identity', sel: 'head > title', where: '', text: `title “${document.title}” is not “View · Board”` });

  /* ---- scroll-x: timeline adapts to the width, no sideways scrolling (except opt-in minPxPerHour) ---- */
  for (const el of document.querySelectorAll('.tn-tl-scroll')) {
    if (!el.checkVisibility() || el.firstElementChild?.style.width) continue;
    if (el.scrollWidth > el.clientWidth + o.tol) push(findings, { rule: 'scroll-x', sel: path(el), where: where(el), px: el.scrollWidth - el.clientWidth, text: `timeline scrolls sideways (${el.scrollWidth} px in ${el.clientWidth} px)`, rect: R(el.getBoundingClientRect()), el });
  }

  /* ---- overflow: child sticks out of its container ---- */
  const flagged = new Set();
  for (const el of all) {
    const s = S(el);
    if (!inFlow(s) || s.display === 'contents' || el.tagName === 'DIALOG') continue;
    let p = el.parentElement;
    while (p && S(p).display === 'contents') p = p.parentElement;
    if (!p || p === document.body || p === de) continue;
    const ps = S(p);
    if (ps.display === 'inline') continue;
    if (flagged.has(p)) continue;
    const r = el.getBoundingClientRect(), pr = p.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const right = r.right - pr.right, left = pr.left - r.left, bottom = r.bottom - pr.bottom;
    const hx = !clips(ps.overflowX) && Math.max(right, left) > o.tol;
    // vertical only for block children (inline boxes may extend beyond the line height)
    const hy = !clips(ps.overflowY) && bottom > o.tol && s.display !== 'inline';
    if (hx || hy) {
      flagged.add(el);
      const px = Math.round(hx ? Math.max(right, left) : bottom);
      push(findings, { rule: 'overflow', sel: `${desc(p)} > ${desc(el)}`, where: where(el), px, text: `sticks out ${px} px ${hx ? 'sideways' : 'at the bottom'} over ${desc(p)}`, rect: R(r), el });
    }
  }

  /* ---- clip: text cut off without an ellipsis ---- */
  const textNodes = [];
  {
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeValue.trim() && n.parentElement && styleOf.has(n.parentElement) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    for (let n; (n = tw.nextNode());) textNodes.push(n);
  }
  const range = document.createRange();
  const rectsOf = (n) => { range.selectNodeContents(n); return [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5); };
  const textRects = new Map(textNodes.map((n) => [n, rectsOf(n)]));
  for (const el of all) {
    const s = S(el);
    const cx = clips(s.overflowX) && !isScroll(s.overflowX), cy = clips(s.overflowY) && !isScroll(s.overflowY);
    if (!cx && !cy) continue;
    const overX = cx && el.scrollWidth > el.clientWidth + o.tol, overY = cy && el.scrollHeight > el.clientHeight + o.tol;
    if (!overX && !overY) continue;
    if (srOnly(el)) continue;
    const box = el.getBoundingClientRect();
    const bl = box.left + el.clientLeft, bt = box.top + el.clientTop, br = bl + el.clientWidth, bb = bt + el.clientHeight;
    for (const n of textNodes) {
      if (!el.contains(n)) continue;
      const tp = n.parentElement, ts = S(tp);
      const cut = textRects.get(n).some((r) => (overX && (r.right > br + o.tol || r.left < bl - o.tol)) || (overY && (r.bottom > bb + o.tol + 2 || r.top < bt - o.tol - 2)));
      if (!cut) continue;
      // ellipsis present: the element itself or an inline chain up to the clipping element with text-overflow: ellipsis
      let ell = false;
      for (let e = tp; e; e = e.parentElement) {
        const es = S(e);
        if (es.textOverflow === 'ellipsis' && clips(es.overflowX) && e === el) { ell = true; break; }
        if (e === el) break;
        if (!/^inline/.test(es.display)) break;
      }
      const clamp = s.webkitLineClamp && s.webkitLineClamp !== 'none';
      if ((overX && ell) || (overY && !overX && clamp)) continue;
      push(findings, { rule: 'clip', sel: `${desc(el.parentElement)} > ${desc(el)}`, where: where(el), text: `text cut off without “…”: “${n.nodeValue.trim().slice(0, 40)}”`, rect: R(box), el });
      break;
    }
  }

  /* ---- wordbreak: words (letters only, ≥ 10 characters, e.g. German compounds) are never broken letter by letter ----
     Paths, IDs, URLs (with / . _ - digits) and code may break anywhere; a pure letter word gets instead
     an ellipsis + hint, a wider tile or hyphenation. */
  for (const n of textNodes) {
    const rects = textRects.get(n);
    if (rects.length < 2 || n.nodeValue.length < 10) continue;
    const p = n.parentElement;
    if (p.closest('pre, code, kbd, samp, svg, .tn-mono, .tn-log, [role="log"], .tn-sr')) continue;
    for (const m of n.nodeValue.matchAll(/(?<![\p{L}\p{N}\/._-])\p{L}{10,}(?![\p{L}\p{N}\/._-])/gu)) {
      if (m[0].length > 26) continue; // absurdly long stress words may break (names get an ellipsis, checked by the clip rule)
      range.setStart(n, m.index); range.setEnd(n, m.index + m[0].length);
      const tops = [...range.getClientRects()].filter((r) => r.width > 0.5).map((r) => Math.round(r.top));
      if (tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 3) {
        push(findings, { rule: 'wordbreak', sel: `${desc(p.parentElement)} > ${desc(p)}`, where: where(p), text: `word broken letter by letter: “${m[0]}”`, rect: R(p.getBoundingClientRect()), el: p });
        break;
      }
    }
  }

  /* ---- overlap: text boxes ---- */
  const clipCache = new Map();
  const clipRect = (el) => {
    if (clipCache.has(el)) return clipCache.get(el);
    let r = { l: -1e9, t: -1e9, r: 1e9, b: 1e9 };
    const p = el.parentElement;
    if (p && p !== de) r = { ...clipRect(p) };
    const s = S(el);
    if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
      const b = el.getBoundingClientRect();
      if (s.overflowX !== 'visible') { r.l = Math.max(r.l, b.left); r.r = Math.min(r.r, b.right); }
      if (s.overflowY !== 'visible') { r.t = Math.max(r.t, b.top); r.b = Math.min(r.b, b.bottom); }
    }
    clipCache.set(el, r);
    return r;
  };
  const boxes = [];
  for (const n of textNodes) {
    const el = n.parentElement;
    if (el.closest('[aria-hidden="true"]') || srOnly(el)) continue;
    const c = clipRect(el), layer = layerOf(el);
    for (const r of textRects.get(n)) {
      const b = { l: Math.max(r.left, c.l), t: Math.max(r.top, c.t), r: Math.min(r.right, c.r), b: Math.min(r.bottom, c.b) };
      if (b.r - b.l > 1 && b.b - b.t > 1) boxes.push({ ...b, el, n, layer });
    }
  }
  {
    const CELL = 64, grid = new Map(), seen = new Set();
    boxes.forEach((b, i) => {
      for (let gx = Math.floor(b.l / CELL); gx <= Math.floor(b.r / CELL); gx++) for (let gy = Math.floor(b.t / CELL); gy <= Math.floor(b.b / CELL); gy++) {
        const k = gx + ':' + gy; (grid.get(k) || grid.set(k, []).get(k)).push(i);
      }
    });
    for (const idx of grid.values()) for (let a = 0; a < idx.length; a++) for (let z = a + 1; z < idx.length; z++) {
      const A = boxes[idx[a]], B = boxes[idx[z]];
      if (A.n === B.n || A.el === B.el || A.layer !== B.layer) continue;
      const w = Math.min(A.r, B.r) - Math.max(A.l, B.l), hh = Math.min(A.b, B.b) - Math.max(A.t, B.t);
      if (w <= 2 || hh <= Math.max(2, 0.3 * Math.min(A.b - A.t, B.b - B.t))) continue;
      const key = [idx[a], idx[z]].sort().join('-');
      if (seen.has(key)) continue; seen.add(key);
      push(findings, { rule: 'overlap', sel: `${desc(A.el)} ∩ ${desc(B.el)}`, where: where(A.el), text: `text overlaps: “${A.n.nodeValue.trim().slice(0, 20)}” and “${B.n.nodeValue.trim().slice(0, 20)}”`, rect: [Math.round(A.l), Math.round(A.t), Math.round(w), Math.round(hh)], el: A.el });
    }
  }

  /* ---- overlap (siblings) and align: flex/grid children ---- */
  const containers = all.filter((el) => /(^|-)(flex|grid)$/.test(S(el).display));
  for (const c of containers) {
    const s = S(c);
    const kids = [...c.children].filter((k) => styleOf.has(k) && inFlow(S(k)) && S(k).display !== 'contents').map((k) => ({ k, r: k.getBoundingClientRect(), s: S(k) })).filter((x) => x.r.width > 0 && x.r.height > 0);
    if (kids.length < 2) continue;
    // siblings overlap
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const A = kids[i], B = kids[j];
      const w = Math.min(A.r.right, B.r.right) - Math.max(A.r.left, B.r.left), hh = Math.min(A.r.bottom, B.r.bottom) - Math.max(A.r.top, B.r.top);
      if (w > o.tol && hh > o.tol) {
        if (A.s.position === 'sticky' || B.s.position === 'sticky') continue; // sticky deliberately covers scrolled content
        if (s.display.endsWith('grid') && A.s.gridArea === B.s.gridArea && A.s.gridRowStart !== 'auto') continue; // stacked on purpose
        push(findings, { rule: 'overlap', sel: `${desc(c)} > ${desc(A.k)} ∩ ${desc(B.k)}`, where: where(c), text: `siblings overlap ${Math.round(w)}×${Math.round(hh)} px`, rect: R(B.r), el: B.k });
      }
    }
    // alignment
    const isFlexRow = s.display.endsWith('flex') && s.flexDirection.startsWith('row');
    const isGrid = s.display.endsWith('grid');
    if (!isFlexRow && !isGrid) continue;
    const lines = [];
    if (isFlexRow) {
      let cur = [];
      // new flex line: wrap to the left or below the previous line
      for (const x of kids) {
        const bottom = Math.max(...cur.map((y) => y.r.bottom));
        if (cur.length && ((x.r.left < cur[cur.length - 1].r.left - o.tol && s.flexDirection === 'row') || x.r.top >= bottom - o.tol)) { lines.push(cur); cur = []; }
        cur.push(x);
      }
      lines.push(cur);
    } else {
      // Grid: form rows from overlapping vertical ranges
      for (const x of [...kids].sort((a, b) => a.r.top - b.r.top)) {
        const line = lines.find((l) => l.some((y) => Math.min(y.r.bottom, x.r.bottom) - Math.max(y.r.top, x.r.top) > Math.min(y.r.height, x.r.height) * 0.5));
        line ? line.push(x) : lines.push([x]);
      }
      // cells unknown (ranges spanning several rows): compare only elements of equal height
      for (let li = 0; li < lines.length; li++) {
        const l = lines[li], byH = new Map();
        for (const x of l) { const k = Math.round(x.r.height); const key = [...byH.keys()].find((q) => Math.abs(q - k) <= 1) ?? k; (byH.get(key) || byH.set(key, []).get(key)).push(x); }
        lines.splice(li, 1, ...byH.values()); li += byH.size - 1;
      }
    }
    for (const line of lines) {
      if (line.length < 2) continue;
      const ref = (x) => {
        let a = x.s.alignSelf;
        if (a === 'auto' || a === 'normal') a = s.alignItems;
        if (a === 'normal') a = 'stretch';
        if (/baseline/.test(a)) return null;
        const mt = parseFloat(x.s.marginTop) || 0, mb = parseFloat(x.s.marginBottom) || 0;
        if (/center/.test(a)) return { k: 'Centre', v: (x.r.top - mt + x.r.bottom + mb) / 2, raw: (x.r.top + x.r.bottom) / 2 };
        if (/end/.test(a)) return { k: 'Bottom edge', v: x.r.bottom + mb, raw: x.r.bottom };
        return { k: 'Top edge', v: x.r.top - mt, raw: x.r.top };
      };
      const refs = line.map((x) => ({ x, a: ref(x) })).filter((y) => y.a);
      if (refs.length < 2) continue;
      // majority value, report outliers (the visible box counts, margins must not shift it)
      const vals = refs.map((y) => y.a.raw).sort((p, q) => p - q);
      const med = vals[Math.floor(vals.length / 2)];
      const majority = refs.filter((y) => Math.abs(y.a.raw - med) <= o.alignTol).length;
      if (majority < 1) continue;
      for (const y of refs) {
        const d = y.a.raw - med;
        if (Math.abs(d) > o.alignTol && (majority >= 2 || refs.length === 2)) {
          push(findings, { rule: 'align', sel: `${desc(c)} > ${desc(y.x.k)}`, where: where(c), px: Math.round(Math.abs(d) * 10) / 10, text: `${y.a.k} by ${Math.round(Math.abs(d) * 10) / 10} px misaligned (“${snippet(y.x.k).slice(0, 24)}”)`, rect: R(y.x.r), el: y.x.k });
          if (refs.length === 2) break;
        }
      }
    }
  }

  /* ---- contrast (warning) ---- */
  if (o.contrast) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const g = cv.getContext('2d', { willReadFrequently: true });
    const bgCache = new Map();
    const layers = (el) => {
      if (bgCache.has(el)) return bgCache.get(el);
      const s = S(el);
      let v;
      if (s.backgroundImage !== 'none') v = null;
      else {
        const parent = el.parentElement ? layers(el.parentElement) : ['canvas'];
        v = parent === null ? null : (s.backgroundColor && !/^rgba\(0, 0, 0, 0\)$|transparent/.test(s.backgroundColor) ? [...parent, s.backgroundColor] : parent);
      }
      bgCache.set(el, v);
      return v;
    };
    const paint = (list) => { g.globalCompositeOperation = 'copy'; g.fillStyle = '#000'; g.fillRect(0, 0, 1, 1); g.globalCompositeOperation = 'source-over'; for (const c of list) { g.fillStyle = c; g.fillRect(0, 0, 1, 1); } const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
    const lum = ([r, gg, b]) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b); };
    const rootBg = S(document.body).backgroundColor;
    const done = new Set();
    // resolve colour tokens (for the contrast list: which token on which background)
    const tokenNames = new Set();
    for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch { continue; } for (const r of rules) if (r.style) for (const n of r.style) if (n.startsWith('--tn-')) tokenNames.add(n); }
    const probe = document.createElement('span'); document.body.append(probe);
    const tokenOf = new Map();
    for (const n of tokenNames) { probe.style.color = ''; probe.style.color = `var(${n})`; const v = getComputedStyle(probe).color; if (v && !tokenOf.has(v) && probe.style.color) tokenOf.set(v, n); }
    probe.remove();
    const bgTop = (el) => { for (let e = el; e && e !== de; e = e.parentElement) { const c = S(e).backgroundColor; if (c && !/^rgba\(0, 0, 0, 0\)$/.test(c)) return c; } return rootBg; };
    for (const n of textNodes) {
      const el = n.parentElement;
      if (done.has(el) || el.closest(':disabled, [aria-disabled="true"], [aria-hidden="true"]')) continue;
      done.add(el);
      const L = layers(el);
      if (!L) continue;
      const base = L[0] === 'canvas' ? L.slice(1) : L;
      const bgList = [de.style.background || cs(de).backgroundColor, rootBg, ...base].filter((c) => c && !/^rgba\(0, 0, 0, 0\)$/.test(c));
      const bg = paint(bgList), fg = paint([...bgList, S(el).color]);
      const l1 = lum(bg), l2 = lum(fg), ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const fs = parseFloat(S(el).fontSize), fw = parseInt(S(el).fontWeight, 10);
      const need = fs >= 24 || (fs >= 18.66 && fw >= 700) ? 3 : 4.5;
      if (ratio < need) push(warnings, { rule: 'contrast', sel: path(el), where: where(el), text: `contrast ${ratio.toFixed(2)} < ${need} (“${n.nodeValue.trim().slice(0, 24)}”)`, ratio: Math.round(ratio * 100) / 100,
        fg: tokenOf.get(S(el).color) || S(el).color, bg: tokenOf.get(bgTop(el)) || bgTop(el), size: fs, weight: fw });
    }
  }

  /* ---- touch: hit area ≥ minTouch (touch sizes only) ---- */
  const touchCandidates = [];
  if (o.touch) {
    const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=radio], [role=checkbox], [role=switch], [role=option], [tabindex]:not([tabindex="-1"])';
    for (const el of all) {
      if (!el.matches(SEL) || el.matches(':disabled')) continue;
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
      const s = S(el);
      // inline link in running text: exception under WCAG 2.5.8
      if (s.display === 'inline' && el.parentElement && [...el.parentElement.childNodes].some((c) => c !== el && c.nodeType === 3 && c.nodeValue.trim())) continue;
      // interactive element inside a larger interactive element: the outer one counts
      if (el.parentElement?.closest(SEL)) continue;
      const r = el.getBoundingClientRect();
      if (r.width >= o.minTouch - 0.5 && r.height >= o.minTouch - 0.5) continue;
      touchCandidates.push(el);
    }
    const sx = scrollX, sy = scrollY;
    for (const el of touchCandidates) {
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const own = (x, y) => { const t = document.elementFromPoint(x, y); return !!t && (t === el || el.contains(t)); };
      if (!own(cx, cy)) continue; // covered (e.g. under an overlay) – cannot be assessed
      // measure the hit-area extension beyond the edge in quarter pixels (whole pixels swallowed up to 1 px per side,
      // so the result depended on fractions of the position: 39 instead of 40 px for a 36 px button with a 2 px extension)
      const ext = (dx, dy, half) => { let d = 0; while (d < o.minTouch && own(cx + dx * (half + d + 0.25), cy + dy * (half + d + 0.25))) d += 0.25; return d; };
      const w = r.width + ext(1, 0, r.width / 2) + ext(-1, 0, r.width / 2);
      const hgt = r.height + ext(0, 1, r.height / 2) + ext(0, -1, r.height / 2);
      if (w < o.minTouch - 0.5 || hgt < o.minTouch - 0.5) {
        push(findings, { rule: 'touch', sel: path(el), where: where(el), px: Math.round(Math.min(w, hgt)), text: `hit area ${Math.round(w)}×${Math.round(hgt)} px < ${o.minTouch} (“${snippet(el).slice(0, 24)}”)`, rect: R(r), el });
      }
    }
    window.scrollTo(sx, sy);
  }

  /* ---- touch48: comfortable density, every interactive element ≥ strictTouch px in both directions (own box, no exceptions) ----
     No hit-area extension (the box itself is the target), no skipped cases: disabled controls, inline links, nested controls and covered
     controls count. Checkbox and toggle: the native input is invisible, the target is its label row. Not interactive controls:
     scroll regions that are only focusable (tabindex) and the insides of SVG graphics. */
  if (o.strictTouch) {
    const MIN = o.strictTouch;
    const SEL48 = 'button, a[href], input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=menuitem], [role=menuitemcheckbox], [role=menuitemradio], [role=radio], [role=checkbox], [role=switch], [role=option], [role=combobox], [role=textbox]';
    const targets = new Set();
    for (const el of document.querySelectorAll(SEL48)) {
      if (ignored(el) || inSvg(el)) continue;
      if (visible(el)) { targets.add(el); continue; }
      // invisible native checkbox/radio (opacity 0): the row around it is what is tapped
      if (el.matches('input[type=checkbox], input[type=radio]') && el.checkVisibility({ visibilityProperty: true }) !== false && getComputedStyle(el).display !== 'none') {
        const row = el.closest('label');
        if (row && visible(row)) targets.add(row); else targets.add(el);
      }
    }
    for (const el of targets) {
      const r = el.getBoundingClientRect();
      if (r.width >= MIN - 0.5 && r.height >= MIN - 0.5) continue;
      push(findings, { rule: 'touch48', sel: path(el), where: where(el), px: Math.round(Math.min(r.width, r.height)), text: `target ${Math.round(r.width)}×${Math.round(r.height)} px < ${MIN} (“${snippet(el).slice(0, 24)}”)`, rect: R(r), el });
    }
  }

  /* ---- contained: the moving part of a control lies inside its track (toggle thumb, determinate progress fill), in the state shown ----
     The gallery shows checked and unchecked toggles, so both states are measured. Rects in px; tolerance 0.5 px. */
  for (const [partSel, trackSel] of [['.tn-toggle-thumb', '.tn-toggle-track'], ['.tn-progress:not(.is-indeterminate) > .tn-progress-fill', '.tn-progress']]) {
    for (const part of document.querySelectorAll(partSel)) {
      const track = part.closest(trackSel);
      if (!track || ignored(part) || !visible(part)) continue;
      const a = part.getBoundingClientRect(), b = track.getBoundingClientRect();
      const over = Math.max(b.left - a.left, a.right - b.right, b.top - a.top, a.bottom - b.bottom);
      if (over > 0.5) push(findings, { rule: 'contained', sel: path(part), where: where(part), px: Math.round(over), text: `${partSel.replace(/:not\(.*?\)/, '').replace(/ > .*/, '')} sticks out ${Math.round(over * 10) / 10} px of its track (${track.closest('.tn-tick')?.querySelector('input')?.checked ? 'on' : 'off'})`, rect: R(a), el: part });
    }
  }

  // mark elements for the screenshot (data-verify-hit = running number), then remove el (not serialisable)
  let i = 0;
  for (const f of findings) { if (f.el) { f.el.setAttribute('data-verify-hit', String(++i)); f.hit = i; delete f.el; } }
  return { findings, warnings, stats: { elements: all.length, texts: textNodes.length, touch: touchCandidates.length, counts } };
})
