// tarn · content probe. Runs in the page context (injected via CDP Runtime.evaluate) after the geometry probe, on the same states.
// Expression: (function …)(opts) → { findings: [...], runs?: [...] }. The rules of docs/dashboard-guidelines.md that a machine can measure:
//   prose        running text always visible on a view (not in a detail or sheet): a card, section, tile or row holds more than the limit of
//                visible prose characters. Prose is a text run of at least opts.words words; data does not count (values, table cells, logs,
//                code, Markdown, key–value facts, form fields, buttons, badges, charts)
//   banner-info  an info or neutral banner (tone info/off) on a view outside a detail: a note that is there regardless of the data
//   info-length  the text behind an "i" (card/section info) is longer than INFO_MAX characters
//   go-symbol    an element marked as a jump into another view (data-go="view": metricRow/statTile/mediaRow/table/button with go: 'view') does
//                not show the visible link symbol (arrow-up-right) or still shows the chevron; an element that stays in the view
//                (data-go="detail") shows the link symbol. Symbols are found by their path, not by a class the same code sets
// Limits (opts): words, row, tile, card, section, info; measured on the gallery and the sample board (docs/checks.md "Content").
(function tnContent(opts) {
  const o = Object.assign({ words: 5, row: 120, tile: 40, card: 100, section: 60, info: 280, measure: false }, opts || {});
  const findings = [], runs = [];
  const LAYER = 'dialog, .tn-inspector, .tn-sidebar, .tn-toolbar, [popover], .tn-info, .tn-menu, .tn-toast, .tn-datacard, .tn-tooltip';
  const DATA = 'table, .tn-table, .tn-log, pre, code, .tn-md, .tn-num, .tn-mono, .tn-kv, .tn-badge, .tn-chart, svg, .tn-heat, .tn-tl, .tn-field, .tn-form, '
    + 'input, textarea, select, label, button:not(.tn-row-btn):not(.tn-stat-btn), .tn-seg, .tn-tabs, .tn-filterbar, .tn-progress, .tn-usage, .g-code, .g-state-l, .g-swatch';
  const UNIT = '.tn-row, .tn-stat, .tn-card, .tn-section';
  const kindOf = (el) => (el.matches('.tn-row') ? 'row' : el.matches('.tn-stat') ? 'tile' : el.matches('.tn-card') ? 'card' : 'section');
  const ignored = (el) => !!el.closest('[inert], [data-verify-ignore]');
  const visible = (el) => (el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : !!el.getClientRects().length);
  const words = (s) => (s.match(/\p{L}[\p{L}'’-]+/gu) || []).length;
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  const desc = (el) => el.tagName.toLowerCase() + [...el.classList].filter((c) => /^(tn|g)-/.test(c)).slice(0, 2).map((c) => '.' + c).join('');
  const where = (el) => norm(el.querySelector('.tn-card-title, .tn-section-title, .tn-stat-label, .tn-row-title')?.textContent || '').slice(0, 40) || desc(el);
  const blockOf = (n) => {
    let el = n.parentElement;
    while (el && getComputedStyle(el).display.startsWith('inline') && !el.matches(UNIT)) el = el.parentElement;
    return el;
  };

  /* ---- prose per unit ---- */
  const units = [...document.querySelectorAll(UNIT)].filter((u) => !u.closest(LAYER) && !ignored(u) && visible(u));
  for (const u of units) {
    const kind = kindOf(u);
    const blocks = new Map();
    const tw = document.createTreeWalker(u, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const p = n.parentElement;
      if (!p || !n.nodeValue.trim() || p.closest(DATA) || p.closest(UNIT) !== u || ignored(p) || !visible(p)) continue;
      const b = blockOf(n);
      blocks.set(b, (blocks.get(b) || '') + n.nodeValue);
    }
    let chars = 0;
    const prose = [];
    for (const [b, txt] of blocks) {
      const s = norm(txt);
      const w = words(s);
      if (o.measure) runs.push({ kind, where: where(u), sel: desc(b), chars: s.length, words: w, text: s.slice(0, 60) });
      if (w >= o.words) { chars += s.length; prose.push(s); }
    }
    if (chars > o[kind]) {
      findings.push({ rule: 'prose', sel: `${kind} ${desc(u)}`, where: where(u), px: chars, el: u,
        text: `${chars} characters of always-visible text in a ${kind} (limit ${o[kind]}): “${prose[0].slice(0, 60)}”` });
    }
  }

  /* ---- banner-info: a note on a view regardless of the data ---- */
  for (const b of document.querySelectorAll('.tn-banner-info, .tn-banner-off')) {
    if (b.closest(LAYER) || ignored(b) || !visible(b)) continue;
    findings.push({ rule: 'banner-info', sel: desc(b), where: norm(b.textContent || '').slice(0, 40), el: b,
      text: `info banner on the view: “${norm(b.textContent || '').slice(0, 60)}” – a note goes into the report, a key behind an "i"` });
  }

  /* ---- info-length ---- */
  for (const btn of document.querySelectorAll('.tn-info-btn')) {
    if (ignored(btn)) continue;
    const v = /** @type {any} */ (btn).tnInfo;
    const s = norm(typeof v === 'string' ? v : v?.textContent || '');
    if (o.measure) runs.push({ kind: 'info', where: where(btn.closest(UNIT) || btn), sel: 'info', chars: s.length, words: words(s), text: s.slice(0, 60) });
    if (s.length > o.info) {
      findings.push({ rule: 'info-length', sel: desc(btn), where: where(btn.closest(UNIT) || btn), px: s.length, el: btn,
        text: `info text has ${s.length} characters (limit ${o.info}): “${s.slice(0, 60)}”` });
    }
  }

  /* ---- go-symbol: the chevron stays in the view, the link symbol leads into another one (HL-72/TN-22) ---- */
  const CHEVRON = 'm9 18 6-6-6-6', LINK = 'M7 17 17 7';
  const marks = (el, d) => [...el.querySelectorAll(':scope > .tn-go path, :scope > .tn-td-go path, :scope > svg path')]
    .filter((p) => p.getAttribute('d') === d && visible(/** @type {Element} */ (p.closest('svg'))));
  for (const el of document.querySelectorAll('[data-go]')) {
    if (ignored(el) || !visible(el)) continue;
    const go = el.getAttribute('data-go'), link = marks(el, LINK).length, chev = marks(el, CHEVRON).length;
    const bad = go === 'view' ? (!link ? 'shows no link symbol' : chev ? 'shows the chevron as well' : '') : link ? 'stays in the view but shows the link symbol' : '';
    if (!bad) continue;
    const name = norm(el.getAttribute('aria-label') || el.textContent || '').slice(0, 40);
    findings.push({ rule: 'go-symbol', sel: desc(el), where: name || desc(el), el,
      text: `${go === 'view' ? 'jump into another view' : 'row/tile'} “${name}” ${bad} (go: '${go}')` });
  }

  let i = document.querySelectorAll('[data-verify-hit]').length;
  for (const f of findings) { if (f.el) { f.el.setAttribute('data-verify-hit', String(++i)); f.hit = i; delete f.el; } }
  return { findings, runs };
})
