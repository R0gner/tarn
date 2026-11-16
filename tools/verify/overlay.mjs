// tarn · verify check "overlay": menus, toasts, tooltips, sheets and panels are on top.
// For each scenario an overlay is opened with real input (tap or click, hover, long press), then checked:
//   overlay-missing  overlay does not appear
//   overlay-top      elementFromPoint at the centre does not hit the overlay (it lies underneath)
//   overlay-inert    overlay is inert (ancestor [inert] or outside an open modal dialog)
//   overlay-focus    focus does not move into the overlay (menus, modal sheets; the inspector is not modal,
//                    there the focus deliberately stays in the list)
//   overlay-behaviour  behaviour cases (assert): a menu does not close on a height change (address bar) but on a
//                    width change; Esc closes the menu inside a sheet first; a tooltip stays on touch after
//                    release and closes by tapping elsewhere; data card appears (mouse/touch); hint only
//                    on truncated text
//   overlay-shift    a scenario marked `steady` (its control does not change what the view contains: a menu, a range choice) moved or
//                    resized a block of the view: the boxes of the view's blocks are recorded every frame and on every DOM change from
//                    before the first click until the assert is done
import fs from 'node:fs';
import path from 'node:path';
import { emulate, evaluate, sleep } from '../lib/cdp.mjs';
import { load, settle, injectCss } from './geometry.mjs';
import { PAGES, parseSize } from './targets.mjs';

export const OVERLAY_SIZES = ['phone', 'tablet-s', 'desktop'];
export const kitModule = (url) => `import(new URL(${JSON.stringify(url)}, location.href).href)`;
const MOD = kitModule('../js/tarn.js');
/* The browser's own Back (Alt+Left goes through the browser like the Android back button): unlike history.back() it skips the entries Chrome's
   history-manipulation intervention marks (added without a user activation), so the deep-link and view scenarios see what a user sees. */
const browserBack = async (io) => {
  for (const type of ['rawKeyDown', 'keyUp']) await io.page.send('Input.dispatchKeyEvent', { type, modifiers: 1, key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 });
  await sleep(150);
};

/* Scenarios: page, hash, open(io) opens the overlay, overlay = selector of the expected overlay, focus = check focus. */
export const SCENARIOS = [
  { id: 'menu', page: 'gallery', hash: 'feedback', overlay: '.tn-menu', focus: true,
    open: (io) => io.press('button[aria-label="Actions"]') },
  { id: 'toast', page: 'gallery', hash: 'feedback', overlay: '.tn-toast:last-child',
    open: (io) => io.press('.tn-btn', 'with action') },
  { id: 'tooltip', page: 'gallery', hash: 'controls', overlay: '.tn-tooltip:not([hidden])',
    open: (io) => io.hint('button[aria-label="Info"]') },
  { id: 'sidebar', page: 'board', hash: 'overview', overlay: '.tn-sidebar', when: (sz) => sz.w < 1000,
    open: (io) => io.press('.tn-sb-toggle') },
  { id: 'drawer-current', page: 'board', hash: 'overview', overlay: '.tn-sidebar', when: (sz) => sz.w < 1000,
    open: (io) => io.press('.tn-sb-toggle'),
    // a tap on the entry of the view already shown closes the drawer too (the hash does not change)
    assert: async (io) => {
      await io.press('.tn-nav-item[aria-current="page"]');
      const shut = await io.until(`document.querySelector('.tn-app').dataset.drawer !== 'open'`, 500);
      return shut ? [] : ['a tap on the current entry leaves the drawer open'];
    } },
  { id: 'timeline-pan', page: 'gallery', hash: 'charts', overlay: '.tn-tl-scroll', focus: false, when: (sz) => sz.mobile,
    open: (io) => io.eval(`(() => { document.querySelector('.tn-tl-scroll').scrollIntoView({ block: 'center', behavior: 'instant' }); return null; })()`),
    // a vertical swipe that starts on the timeline scrolls the page, never the timeline; a horizontal swipe on a wide timeline scrolls it sideways
    assert: async (io) => {
      const left = [];
      const drag = async (x, y, dx, dy) => {
        const tp = (type, px, py) => io.page.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py, id: 0 }] });
        await tp('touchStart', x, y); await sleep(30);
        for (let i = 1; i <= 10; i++) { await tp('touchMove', x + (dx * i) / 10, y + (dy * i) / 10); await sleep(16); }
        await tp('touchEnd', x + dx, y + dy); await sleep(250);
      };
      // room below the timeline (the gallery may end right after it): the finger moves up, the page must scroll down. A timeline that can scroll
      // a few px down takes the whole gesture (scroll latching), which is the fault on the phone
      const at = await io.eval(`(() => { const sp = document.createElement('div'); sp.style.height = '1200px'; sp.setAttribute('data-verify-ignore', ''); document.querySelector('.tn-content').append(sp);
        const r = document.querySelector('.tn-tl-scroll').getBoundingClientRect(); return { x: Math.round(r.left + r.width * 0.6), y: Math.round(r.top + r.height / 2), sy: scrollY }; })()`);
      await drag(at.x, at.y, 0, -160);
      const v = await io.eval(`({ sy: scrollY, top: document.querySelector('.tn-tl-scroll').scrollTop })`);
      if (v.top !== 0) left.push(`a vertical swipe scrolls the timeline by ${v.top} px`);
      if (v.sy <= at.sy) left.push(`a vertical swipe on the timeline does not scroll the page (${at.sy} → ${v.sy})`);
      await io.eval(`(() => { document.querySelector('.tn-tl-grid').style.minWidth = '900px'; document.querySelector('.tn-tl-scroll').scrollIntoView({ block: 'center', behavior: 'instant' }); return true; })()`);
      const at2 = await io.eval(`(() => { const r = document.querySelector('.tn-tl-scroll').getBoundingClientRect(); return { x: Math.round(r.left + r.width * 0.8), y: Math.round(r.top + r.height / 2) }; })()`);
      await drag(at2.x, at2.y, -160, 0);
      if (!((await io.eval(`document.querySelector('.tn-tl-scroll').scrollLeft`)) > 0)) left.push('a horizontal swipe does not scroll a wide timeline sideways');
      return left;
    } },
  // ---- Back by levels (createApp back: 'levels', js/levels.js): the real browser history, driven with taps and history.back() ----
  { id: 'back-views', page: 'board', hash: 'overview', overlay: '.tn-nav-item.is-active', focus: false, when: (sz) => sz.w >= 1000,
    // three view changes, then one Back: the default view; the history grew by one entry at most
    open: async (io) => {
      await io.eval('(() => { window.__h0 = history.length; return true; })()');
      for (const v of ['jobs', 'hosts', 'deploy']) { await io.press(`.tn-nav-item[href="#/${v}"]`); await io.settle(); }
    },
    assert: async (io) => {
      const left = [];
      const st = await io.eval(`({ hash: location.hash, grew: history.length - window.__h0 })`);
      if (st.hash !== '#/deploy') left.push(`after three view changes the hash is ${st.hash}`);
      if (st.grew > 1) left.push(`three view changes added ${st.grew} history entries (at most 1)`);
      await browserBack(io);
      const back = await io.until(`location.hash === '#/overview' && document.querySelector('.tn-nav-item.is-active')?.getAttribute('href') === '#/overview'`, 1000);
      if (!back) left.push(`Back after three view changes shows ${await io.eval('location.hash')} instead of the default view`);
      return left;
    } },
  { id: 'back-detail', page: 'board', hash: 'jobs', overlay: 'dialog.tn-sheet[open], .tn-inspector:not([hidden])', focus: 'modal',
    open: (io) => io.press('[data-key="offsite-sync"], tr[data-key="offsite-sync"], .tn-row-btn', 'Offsite archive sync'),
    // detail, then Back: the same view without the detail; Back again: the default view
    assert: async (io) => {
      const left = [];
      await browserBack(io); await io.gone('dialog.tn-sheet[open], .tn-inspector:not([hidden])', 600);
      if (await io.count('dialog.tn-sheet[open], .tn-inspector:not([hidden])')) left.push('Back does not close the detail');
      const h1 = await io.eval('location.hash');
      if (h1 !== '#/jobs') left.push(`Back from the detail shows ${h1} instead of #/jobs`);
      await browserBack(io);
      if (!(await io.until(`location.hash === '#/overview'`, 1000))) left.push(`second Back shows ${await io.eval('location.hash')} instead of the default view`);
      return left;
    } },
  { id: 'back-deeplink', page: 'board', hash: 'jobs?open=offsite-sync', overlay: 'dialog.tn-sheet[open], .tn-inspector:not([hidden])', focus: false,
    // a deep link at level 2 (also from a notification), then one touch (it adds both missing entries), then the browser's Back walks down the levels
    open: async (io) => { await io.press('dialog.tn-sheet[open] .tn-sheet-title, .tn-inspector:not([hidden]) .tn-sheet-title'); await sleep(60); },
    assert: async (io) => {
      const left = [];
      await browserBack(io); await io.gone('dialog.tn-sheet[open], .tn-inspector:not([hidden])', 600);
      if (await io.count('dialog.tn-sheet[open], .tn-inspector:not([hidden])')) left.push('Back does not close the deep-linked detail');
      if ((await io.eval('location.hash')) !== '#/jobs') left.push(`Back from the deep link shows ${await io.eval('location.hash')} instead of #/jobs`);
      await browserBack(io);
      if (!(await io.until(`location.hash === '#/overview'`, 1000))) left.push(`second Back shows ${await io.eval('location.hash')} instead of the default view`);
      return left;
    } },
  { id: 'back-sheet', page: 'gallery', hash: 'states', overlay: 'dialog.tn-sheet[open]', focus: true,
    open: (io) => io.press('.tn-btn', 'Open sheet'),
    // a sheet closes on Back and nothing else changes
    assert: async (io) => {
      const left = [];
      await io.eval('history.back()'); await io.gone('dialog.tn-sheet[open]', 600);
      if (await io.count('dialog.tn-sheet[open]')) left.push('Back does not close the sheet');
      if ((await io.eval('location.hash')) !== '#/states') left.push(`Back on a sheet changes the view to ${await io.eval('location.hash')}`);
      return left;
    } },
  { id: 'back-confirm', page: 'gallery', hash: 'states', overlay: 'dialog.tn-confirm[open]', focus: 'modal',
    open: async (io) => {
      await io.eval(`${MOD}.then((m) => { window.__ans = 'open'; const b = m.button('Delete …', { variant: 'danger', onClick: () => m.confirm({ title: 'Delete?', danger: true }).then((v) => { window.__ans = v; }) });
        b.id = 'verify-delete'; document.querySelector('.tn-content').prepend(b); return true; })`);
      await io.press('#verify-delete'); await sleep(80);
    },
    // a confirm dialog closes on Back (answer: no) and nothing else changes
    assert: async (io) => {
      const left = [];
      await io.eval('history.back()'); await io.gone('dialog.tn-confirm[open]', 600);
      if (await io.count('dialog.tn-confirm[open]')) left.push('Back does not close the confirm dialog');
      if (!(await io.until('window.__ans === false', 500))) left.push('Back does not answer false');   // the dialog's close event comes one task later
      if ((await io.eval('location.hash')) !== '#/states') left.push(`Back on a confirm dialog changes the view to ${await io.eval('location.hash')}`);
      return left;
    } },
  { id: 'back-drawer', page: 'board', hash: 'jobs', overlay: '.tn-sidebar', when: (sz) => sz.w < 1000,
    open: (io) => io.press('.tn-sb-toggle'),
    // the phone drawer closes on Back and nothing else changes
    assert: async (io) => {
      const left = [];
      await io.eval('history.back()');
      if (!(await io.until(`document.querySelector('.tn-app').dataset.drawer !== 'open'`, 800))) left.push('Back does not close the drawer');
      if ((await io.eval('location.hash')) !== '#/jobs') left.push(`Back on the drawer changes the view to ${await io.eval('location.hash')}`);
      return left;
    } },
  { id: 'exit-hint', page: 'board', hash: 'overview', overlay: '.tn-toolbar-title', focus: false, when: (sz) => sz.mobile,
    // installed app (emulated display-mode standalone): Back on the default view shows the exit hint and stays; a browser tab has none
    open: async (io) => {
      await io.page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'display-mode', value: 'standalone' }] });
      if (!(await io.eval(`matchMedia('(display-mode: standalone)').matches`))) {
        // this Chrome ignores the emulated display-mode (157 does): a script answers matchMedia for display-mode as an installed app, before the kit loads
        const { identifier } = await io.page.send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => { const mm = window.matchMedia.bind(window);
          window.matchMedia = (q) => /display-mode/.test(q) ? { matches: /standalone/.test(q), media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } : mm(q); })()` });
        await io.page.send('Page.reload', {});
        await sleep(200); await io.until(`document.readyState === 'complete' && !!document.querySelector('.tn-toolbar-title')?.textContent`, 3000); await io.settle();
        await io.page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier });
      }
      await io.press('.tn-toolbar-title');   // the first touch sets the entry that catches Back
    },
    assert: async (io) => {
      const left = [];
      if (!(await io.eval(`matchMedia('(display-mode: standalone)').matches`))) return ['display-mode standalone could not be emulated'];
      await io.eval('history.back()');
      const hint = await io.until(`[...document.querySelectorAll('.tn-toast')].some((e) => e.textContent.includes('Press back again to close'))`, 1000);
      if (!hint) left.push('Back on the default view of an installed app shows no exit hint');
      if ((await io.eval('location.hash')) !== '#/overview') left.push(`the exit hint changed the view to ${await io.eval('location.hash')}`);
      return left;
    } },
  { id: 'detail', page: 'board', hash: 'jobs', overlay: 'dialog.tn-sheet[open], .tn-inspector:not([hidden])', focus: 'modal',
    open: (io) => io.press('[data-key="offsite-sync"], tr[data-key="offsite-sync"], .tn-row-btn', 'Offsite archive sync') },
  { id: 'sheet', page: 'gallery', hash: 'states', overlay: 'dialog.tn-sheet[open]', focus: true,
    open: (io) => io.press('.tn-btn', 'Open sheet') },
  { id: 'sheet-menu', page: 'board', hash: 'jobs?open=offsite-sync', overlay: '.tn-menu', focus: true,
    open: (io) => io.press('dialog.tn-sheet[open] [aria-label="More actions"], .tn-inspector [aria-label="More actions"]') },
  { id: 'sheet-toast', page: 'board', hash: 'jobs?open=offsite-sync', overlay: '.tn-toast:last-child',
    open: (io) => io.press('dialog.tn-sheet[open] .tn-btn, .tn-inspector .tn-btn', 'Run now') },
  { id: 'sheet-tooltip', page: 'gallery', hash: 'states', overlay: '.tn-tooltip:not([hidden])',
    open: async (io) => {
      // open a sheet with a tooltip button through the public API (as a board would), then hover/long press
      await io.eval(`${MOD}.then((m) => { const b = m.tooltip(m.iconButton('info', { label: 'Info about the run' }), 'Explanation in the sheet');
        b.id = 'verify-tip'; m.openSheet({ title: 'Check', body: [b] }); return true; })`);
      await io.settle();
      return io.hint('#verify-tip');
    } },
  // ---- Behaviour ----
  { id: 'board-switcher', page: 'board', hash: 'overview', overlay: '.tn-boards-body', focus: false,
    // Board switcher (popover ≥ 700 px, bottom sheet below): on top, tiles are links, exactly one current board,
    // arrow keys move through the grid, Esc closes and returns the focus to the title
    open: async (io) => { if (io.size.w < 1000) await io.press('.tn-sb-toggle'); await io.press('.tn-brand-btn'); },
    assert: async (io) => {
      const left = [];
      const st = await io.eval(`(() => { const r = document.querySelector('.tn-boards-body'); const t = [...r.querySelectorAll('a.tn-board')];
        return { n: t.length, links: t.every((a) => a.getAttribute('href')), current: [...r.querySelectorAll('[aria-current="true"]')].map((a) => a.dataset.id), cats: r.querySelectorAll('.tn-boards-cat').length,
          expanded: document.querySelector('.tn-brand-btn').getAttribute('aria-expanded'), letters: r.querySelectorAll('.tn-bicon.is-letter').length }; })()`);
      if (st.n < 5 || !st.links) left.push(`tiles are not links (${st.n} tiles)`);
      if (st.current.length !== 1 || st.current[0] !== 'sample') left.push(`current board not marked exactly once (${st.current.join(',') || 'none'})`);
      if (st.cats !== 4) left.push(`${st.cats} category headings instead of 4`);
      if (st.expanded !== 'true') left.push('aria-expanded is not true');
      if (st.letters < 2) left.push('letter tiles for boards without an icon are missing');
      const cut = await io.eval(`(() => { const rg = document.createRange(); const bad = [];
        for (const el of document.querySelectorAll('.tn-boards-body .tn-board-name')) { const n = el.firstChild; if (!n) continue;
          for (const m of n.nodeValue.matchAll(/\\p{L}{10,}/gu)) { rg.setStart(n, m.index); rg.setEnd(n, m.index + m[0].length);
            const tops = [...rg.getClientRects()].map((r) => Math.round(r.top)); if (tops.length > 1 && Math.max(...tops) - Math.min(...tops) > 3) bad.push(m[0]); } }
        return bad; })()`);
      if (cut.length) left.push(`tile name broken letter by letter: ${cut.join(', ')}`);
      const id0 = await io.eval(`(() => { const a = document.querySelector('.tn-boards-body a.tn-board'); a.focus(); return a.dataset.id; })()`);
      await io.key('ArrowRight', 39); await sleep(50);
      const id1 = await io.eval('document.activeElement?.dataset?.id');
      if (!id1 || id1 === id0) left.push('arrow right does not move the focus');
      await io.key('ArrowDown', 40); await sleep(50);
      const id2 = await io.eval('document.activeElement?.dataset?.id');
      if (!id2 || id2 === id1) left.push('arrow down does not move the focus');
      await io.key('Escape'); await io.gone('.tn-boards-body', 400);
      if (await io.count('.tn-boards-body')) left.push('Esc does not close the switcher');
      if (!(await io.eval(`document.activeElement === document.querySelector('.tn-brand-btn')`))) left.push('focus does not return to the title after Esc');
      return left;
    } },
  { id: 'detail-board-switcher', page: 'board', hash: 'jobs?open=offsite-sync', overlay: '.tn-boards-body', focus: false, when: (sz) => sz.w >= 1000,
    // from the open detail (inspector, not modal): the switcher is on top
    open: (io) => io.press('.tn-brand-btn') },
  { id: 'install', page: 'board', hash: 'overview', overlay: '.tn-install', focus: false,
    // “Install as app”: after beforeinstallprompt (here an artificial event; a real Chrome fires it for the
    // manifest itself) at the bottom of the sidebar; a click calls prompt() and
    // hides it; in standalone mode the button stays away
    open: async (io) => {
      await io.eval(`(() => { window.__fake = () => { const e = new Event('beforeinstallprompt', { cancelable: true }); window.__prompted = 0;
        e.prompt = () => { window.__prompted++; return Promise.resolve(); }; e.userChoice = Promise.resolve({ outcome: 'accepted' }); window.dispatchEvent(e); }; window.__fake(); return true; })()`);
      if (io.size.w < 1000) await io.press('.tn-sb-toggle');
    },
    assert: async (io) => {
      const left = [];
      await sleep(250);
      const pos = await io.eval(`(() => { const b = document.querySelector('.tn-install'); const s = b.closest('.tn-sidebar').getBoundingClientRect(), r = b.getBoundingClientRect(); return { fromBottom: Math.round(s.bottom - r.bottom), text: b.textContent.trim() }; })()`);
      if (pos.fromBottom > 40) left.push(`button not at the bottom of the sidebar (distance ${pos.fromBottom} px)`);
      if (pos.text !== 'Install as app') left.push(`label “${pos.text}”`);
      await io.press('.tn-install'); await io.until('window.__prompted === 1', 150);
      if ((await io.eval('window.__prompted')) !== 1) left.push('click does not call prompt()');
      if (await io.count('.tn-install')) left.push('button stays visible after the click');
      const standalone = (on) => io.eval(`Object.defineProperty(navigator, 'standalone', { value: ${on}, configurable: true })`); // iOS way; display-mode cannot be emulated
      await standalone(true); await io.eval('window.__fake()'); await sleep(150);
      if (await io.count('.tn-install')) left.push('button visible in standalone mode');
      await standalone(false); await io.eval('window.__fake()'); await sleep(150);
      if (!(await io.count('.tn-install'))) left.push('button does not come back after standalone mode');
      return left;
    } },
  { id: 'panel-close', page: 'board', hash: 'jobs', overlay: 'dialog.tn-sheet[open]', focus: 'modal', when: (sz) => sz.w >= 700 && sz.w < 1000,
    open: (io) => io.press('[data-key="offsite-sync"], tr[data-key="offsite-sync"], .tn-row-btn', 'Offsite archive sync'),
    // 700–999 px: panel from the right; swipe right, Esc and Back close it
    assert: async (io, size) => {
      const left = [], open = () => io.count('dialog.tn-sheet[open]');
      const r = await evaluate(io.page, `(() => { const d = document.querySelector('dialog.tn-sheet[open]'); const b = d.getBoundingClientRect(); return { x: b.left, w: b.width, r: Math.round(b.right) }; })()`);
      if (Math.abs(r.r - size.w) > 1 || r.w >= size.w) left.push(`no panel from the right (width ${Math.round(r.w)} of ${size.w})`);
      await io.swipe(r.x + 60, 120, 220); await io.gone('dialog.tn-sheet[open]', 400);
      if (await open()) left.push('swipe right does not close the panel');
      await io.eval("location.hash = '#/jobs?open=offsite-sync'"); await io.settle();
      await io.key('Escape'); await io.gone('dialog.tn-sheet[open]', 400);
      if (await open()) left.push('Esc does not close the panel');
      await io.eval("location.hash = '#/jobs?open=offsite-sync'"); await io.settle();
      await io.eval('history.back()'); await io.gone('dialog.tn-sheet[open]', 400);
      if (await open()) left.push('Back does not close the panel');
      return left;
    } },
  { id: 'info', page: 'gallery', hash: 'cards', overlay: '.tn-info', focus: true,
    open: (io) => io.press('.tn-card .tn-card-head .tn-info-btn') },
  { id: 'sheet-info', page: 'gallery', hash: 'cards', overlay: '.tn-info', focus: true,
    open: async (io) => {
      // a card with an info inside a sheet, through the public API (as a board would), then tap the "i"
      await io.eval(`${MOD}.then((m) => { m.openSheet({ title: 'Check', body: [m.card({ title: 'Runs', info: 'Explanation in the sheet' }, m.h('p', null, 'x'))] }); return true; })`);
      await io.settle();
      return io.press('dialog.tn-sheet[open] .tn-info-btn');
    },
    // Esc closes the explanation first, not the sheet, and the focus is back on the "i"; a second tap on the "i" opens it again
    assert: async (io) => {
      await io.key('Escape'); await sleep(120);
      const left = [];
      if (await io.count('.tn-info')) left.push('Esc does not close the explanation');
      if (!(await io.count('dialog.tn-sheet[open]'))) left.push('Esc closes the sheet instead of the explanation first');
      if (!(await io.eval(`document.activeElement?.classList.contains('tn-info-btn')`))) left.push('focus is not back on the "i" after Esc');
      return left;
    } },
  // ---- time range (0.7.0): the control in the toolbar is a kit menu; a choice replaces the history entry and never shows the old range's data under the new label ----
  { id: 'range-menu', page: 'gallery', hash: 'datasources', overlay: '.tn-menu', focus: true, steady: true,
    open: (io) => io.press('.tn-range-btn') },
  { id: 'range-change', page: 'gallery', hash: 'datasources', overlay: '.tn-menu', focus: true, steady: true,
    open: async (io) => { await io.until(`!!document.querySelector('[aria-label^="Busy CPU"]')`, 3000); await io.press('.tn-range-btn'); },
    // every redraw is recorded (range button text, span the chart says it shows, whether it is marked refreshing); while the button says the
    // new range the chart shows the new range's data or is marked as refreshing (aria-busy); its box does not move (steady)
    assert: async (io) => {
      const left = [];
      await io.eval(`(() => { window.__h0 = history.length; window.__rs = [];
        const rec = () => { const c = document.querySelector('[aria-label^="Busy CPU"]'); window.__rs.push([document.querySelector('.tn-range-btn')?.textContent || '', c?.getAttribute('aria-label') || null, !!c?.closest('[aria-busy="true"]')]); };
        rec(); new MutationObserver(rec).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); return true; })()`);
      const before = await io.eval(`window.__rs[0]`);
      await io.press('.tn-menu-item', '7');
      const done = await io.until(`(() => { const l = document.querySelector('[aria-label^="Busy CPU"]')?.getAttribute('aria-label'); return !!l && l !== ${JSON.stringify('')} + window.__rs[0][1]; })()`, 3000);
      if (!done) { left.push('after choosing 7 days the chart does not show a new range'); return left; }
      const st = await io.eval(`({ hash: location.hash, grew: history.length - window.__h0, rs: window.__rs, now: [document.querySelector('.tn-range-btn')?.textContent, document.querySelector('[aria-label^="Busy CPU"]')?.getAttribute('aria-label')] })`);
      if (!/[?&]range=7d\b/.test(st.hash)) left.push(`the hash after choosing 7 days is ${st.hash} (range=7d expected)`);
      if (st.grew > 0) left.push(`choosing a range added ${st.grew} history entries (it replaces)`);
      if (st.now[0] === before[0]) left.push(`the range button still says “${st.now[0]}”`);
      const wrong = st.rs.filter(([btn, chart, busy]) => btn === st.now[0] && chart && chart !== st.now[1] && !busy);
      if (wrong.length) left.push(`under “${st.now[0]}” the chart showed “${wrong[0][1]}” (data of the old range) without the refreshing mark`);
      if (!st.rs.some(([btn, chart, busy]) => btn === st.now[0] && chart && busy) && st.rs.some(([btn, chart]) => btn === st.now[0] && !chart)) left.push(`under “${st.now[0]}” the chart was gone while the new range loaded (loading state instead of the old values)`);
      return left;
    } },
  { id: 'menu-height', page: 'gallery', hash: 'feedback', overlay: '.tn-menu', focus: true,
    open: (io) => io.press('button[aria-label="Actions"]'),
    // the address bar slides in/out: only the height changes, the menu stays
    assert: async (io, size) => { await io.resize(size.w, size.h - 70); await sleep(150); return (await io.count('.tn-menu')) ? [] : ['menu closes on a pure height change']; } },
  { id: 'menu-width', page: 'gallery', hash: 'feedback', overlay: '.tn-menu', focus: true,
    open: (io) => io.press('button[aria-label="Actions"]'),
    // real width change (rotating, window): the menu closes (positive control for menu-height)
    assert: async (io, size) => { await io.resize(size.w - 120, size.h); await sleep(150); return (await io.count('.tn-menu')) ? ['menu stays open on a width change'] : []; } },
  { id: 'sheet-menu-esc', page: 'board', hash: 'jobs?open=offsite-sync', overlay: '.tn-menu', focus: true,
    open: (io) => io.press('dialog.tn-sheet[open] [aria-label="More actions"], .tn-inspector [aria-label="More actions"]'),
    // Esc closes the menu first, not the sheet/detail
    assert: async (io) => {
      await io.key('Escape'); await sleep(120);
      const left = [];
      if (await io.count('.tn-menu')) left.push('Esc does not close the menu');
      if (!(await io.count('dialog.tn-sheet[open], .tn-inspector:not([hidden])'))) left.push('Esc closes the detail instead of the menu first');
      return left;
    } },
  { id: 'tooltip-stays', page: 'gallery', hash: 'controls', overlay: '.tn-tooltip:not([hidden])', when: (sz) => sz.mobile,
    open: (io) => io.hint('button[aria-label="Info"]'),
    // touch: after release the hint stays; a tap elsewhere closes it
    assert: async (io) => {
      const left = [];
      await sleep(500);
      if (!(await io.count('.tn-tooltip:not([hidden])'))) left.push('tooltip disappears on release');
      await io.tapAt(8, 8); await sleep(120);
      if (await io.count('.tn-tooltip:not([hidden])')) left.push('tap elsewhere does not close the tooltip');
      return left;
    } },
  { id: 'datacard', page: 'gallery', hash: 'charts', overlay: '.tn-datacard:not([hidden])',
    open: async (io) => (io.mobile ? io.tap('.tn-heat-cell:not(.tn-heat-none)') : io.hover('.tn-heat-cell:not(.tn-heat-none)')),
    assert: async (io) => {
      if (io.mobile) return [];
      await io.hover('.tn-heat-cell:not(.tn-heat-none)', { away: true });
      return (await io.count('.tn-datacard:not([hidden])')) ? ['data card stays after leaving'] : [];
    } },
  { id: 'hint-truncated', page: 'gallery', hash: 'controls', overlay: '.tn-tooltip:not([hidden])', when: (sz) => !sz.mobile,
    open: (io) => io.hover('.g-clip', { text: 'offsite-sync' }),
    // fully visible text gets no hint
    assert: async (io) => { await io.hover('.g-clip', { text: 'Short' }); await sleep(500); return (await io.count('.tn-tooltip:not([hidden])')) ? ['hint on fully visible text'] : []; } },

  // ---- Notifications (stage N): every state of the sheet over mocked browser APIs, the flow, the install hint, the phone settings ----
  { id: 'notifications', page: 'gallery', hash: 'shell', overlay: 'dialog.tn-sheet[open]', focus: true,
    // the real way: the sidebar entry opens the sheet (mock browser and backend of the gallery); then every state through the demo buttons
    open: async (io) => { if (io.size.w < 1000) await io.press('.tn-sb-toggle'); await io.press('.tn-notif-entry'); },
    assert: async (io) => {
      const left = [];
      const kind = (k) => io.until(`!!document.querySelector('dialog.tn-sheet[open] .tn-notif[data-kind="${k}"]')`, 1500);
      // a button is ready when it exists and is not locked by a running action (the sheet redraws after every step)
      const tap = async (act) => { await io.until(`(() => { const b = document.querySelector('dialog.tn-sheet[open] [data-act="${act}"]'); return !!b && !b.disabled; })()`, 2000); await io.press(`dialog.tn-sheet[open] [data-act="${act}"]`); };
      if (!(await kind('off'))) { left.push('the sheet does not reach the state “not asked yet” (off)'); return left; }
      if (!(await io.count('dialog.tn-sheet[open] [data-act="enable"]'))) left.push('state off: no button that asks');
      await io.key('Escape'); await io.gone('dialog.tn-sheet[open]', 600);
      // state → what must be there (a button of its own, the steps, …)
      const EXPECT = { off: ['[data-act="enable"]'], on: ['[data-act="test"]', '[data-act="disable"]'], blocked: ['[data-act="retry"]'], unsupported: [], insecure: [],
        'ios-install': ['.tn-steps li:nth-child(3)'], disabled: [], unreachable: ['[data-act="retry"]'], error: ['[data-act="retry"]'] };
      const texts = new Set();
      for (const [k, need] of Object.entries(EXPECT)) {
        await io.eval(`document.querySelector('[data-notif-state="${k}"]').scrollIntoView({ block: 'center' })`);
        await io.press(`[data-notif-state="${k}"]`);
        if (!(await kind(k))) { left.push(`state ${k}: the sheet does not show it`); await io.key('Escape'); await io.gone('dialog.tn-sheet[open]', 600); continue; }
        await io.settle(); await sleep(350);   // the sheet slides in
        const st = await io.eval(`(() => { const p = document.querySelector('dialog.tn-sheet[open] .tn-notif'); const r = p.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + 10);
          return { text: p.textContent.trim(), top: !!e && p.closest('dialog').contains(e), asked: globalThis.__tnPushMock?.server.asked.count }; })()`);
        for (const sel of need) if (!(await io.count(`dialog.tn-sheet[open] ${sel}`))) left.push(`state ${k}: ${sel} is missing`);
        if (!st.top) left.push(`state ${k}: the sheet is not on top`);
        if (st.text.length < 25) left.push(`state ${k}: no text`);
        if (texts.has(st.text)) left.push(`state ${k}: the same text as another state`);
        texts.add(st.text);
        if (st.asked) left.push(`state ${k}: the permission was asked without a tap on the button`);
        if (k === 'off') {
          // the flow: tap → permission asked once → on → test → server saw it → off again
          await tap('enable');
          if (!(await kind('on'))) left.push('enable: the state does not become on');
          const a = await io.eval(`({ asked: globalThis.__tnPushMock.server.asked.count, sub: globalThis.__tnPushMock.server.calls.filter((c) => c.path === 'subscribe').length, msg: document.querySelectorAll('dialog.tn-sheet[open] .tn-banner-ok').length })`);
          if (a.asked !== 1 || a.sub !== 1) left.push(`enable: permission asked ${a.asked}×, subscribe sent ${a.sub}× (1 and 1 expected)`);
          if (!a.msg) left.push('enable: no confirmation message');
          await tap('test');
          if (!(await io.until(`document.querySelectorAll('dialog.tn-sheet[open] .tn-banner-ok').length === 1 && globalThis.__tnPushMock.server.calls.some((c) => c.path === 'test')`, 1500))) left.push('test: the server did not get the request');
          await tap('disable');
          if (!(await kind('off'))) left.push('disable: the state does not become off');
          if (!(await io.eval(`globalThis.__tnPushMock.server.calls.some((c) => c.path === 'unsubscribe')`))) left.push('disable: the server was not told');
        }
        await io.key('Escape'); await io.gone('dialog.tn-sheet[open]', 600);
      }
      return left;
    } },
  { id: 'install-hint', page: 'board', hash: 'overview', overlay: '.tn-install', focus: false,
    // Safari and iPhone have no install prompt: the install entry is still there and shows "Add to Home Screen" instead (steps in a sheet)
    open: async (io) => {
      await io.eval(`(() => { Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1', configurable: true });
        window.dispatchEvent(new Event('appinstalled')); return true; })()`);
      if (io.size.w < 1000) await io.press('.tn-sb-toggle');
    },
    assert: async (io) => {
      const left = [];
      await sleep(250);
      if (!(await io.count('.tn-install'))) { left.push('no install entry on iPhone without an install prompt'); return left; }
      await io.press('.tn-install');
      if (!(await io.until(`!!document.querySelector('dialog.tn-sheet[open] .tn-steps')`, 1500))) { left.push('the install entry does not show the Add-to-Home-Screen hint'); return left; }
      const n = await io.eval(`document.querySelectorAll('dialog.tn-sheet[open] .tn-steps li').length`);
      if (n !== 3) left.push(`${n} steps instead of 3`);
      await io.key('Escape'); await io.gone('dialog.tn-sheet[open]', 600);
      await io.eval(`Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })`);
      await io.eval(`window.dispatchEvent(new Event('appinstalled'))`); await sleep(150);
      if (await io.count('.tn-install')) left.push('the entry stays visible in an installed app');
      return left;
    } },
  { id: 'settings-phone', page: 'gallery', hash: 'foundations', overlay: 'dialog.tn-sheet[open]', focus: true, when: (sz) => sz.w < 600,
    // phone: theme, density and language are ONE settings entry in the toolbar (not three buttons); the sheet changes them
    open: (io) => io.press('.tn-settings-btn'),
    assert: async (io) => {
      const left = [];
      const hidden = await io.eval(`['.tn-toolbar .tn-hide-phone'].flatMap((s) => [...document.querySelectorAll(s)]).filter((e) => e.checkVisibility()).length`);
      if (hidden) left.push(`${hidden} toolbar buttons that belong in the settings sheet are still visible`);
      const n = await io.eval(`({ seg: document.querySelectorAll('dialog.tn-sheet[open] .tn-seg').length, sel: document.querySelectorAll('dialog.tn-sheet[open] select').length })`);
      if (n.seg !== 2 || n.sel !== 1) left.push(`settings sheet: ${n.seg} segmented controls and ${n.sel} language choice (2 and 1 expected: theme, density, language)`);
      await io.press('dialog.tn-sheet[open] .tn-seg-btn[data-value="light"]'); await sleep(80);
      if ((await io.eval(`document.documentElement.dataset.theme`)) !== 'light') left.push('the theme choice does not apply');
      await io.press('dialog.tn-sheet[open] .tn-seg-btn[data-value="comfortable"]'); await sleep(80);
      if ((await io.eval(`document.documentElement.getAttribute('data-density')`)) !== 'comfortable') left.push('the density choice does not apply');
      await io.eval(`(() => { localStorage.removeItem('tn-theme'); localStorage.removeItem('tn-density'); return true; })()`);
      return left;
    } },

  // ---- Gb: a filter bar survives a data refresh ----
  { id: 'filter-refresh', page: 'board', hash: 'jobs', overlay: '.tn-filterbar input[type="search"]', focus: true,
    // the sample board rebuilds its filter bar on every redraw (app.refresh() after new data): the search field keeps focus, caret and text, and typing goes on
    open: async (io) => { await io.press('.tn-filterbar input[type="search"]'); await io.page.send('Input.insertText', { text: 'back' }); await sleep(120); },
    assert: async (io) => {
      const left = [];
      await io.eval(`(() => { document.querySelector('.tn-filterbar input[type="search"]').__old = true; window.tnApp.refresh(); return true; })()`);
      await sleep(150);
      const st = await io.eval(`(() => { const a = document.activeElement, q = document.querySelector('.tn-filterbar input[type="search"]');
        return { same: a === q, rebuilt: !!q && !q.__old, value: q?.value, caret: q ? [q.selectionStart, q.selectionEnd] : null, shown: document.querySelector('.tn-filterbar')?.textContent.replace(/\\s+/g, ' ') }; })()`);
      if (!st.rebuilt) left.push('the redraw did not rebuild the filter bar (the check proves nothing)');
      if (!st.same) left.push('the search field lost the focus on a redraw');
      if (st.value !== 'back') left.push(`the search text is “${st.value}” after a redraw (“back” expected)`);
      if (!st.caret || st.caret[0] !== 4 || st.caret[1] !== 4) left.push(`the caret is at ${st.caret} after a redraw (4 expected)`);
      await io.page.send('Input.insertText', { text: 's' }); await sleep(120);
      const v = await io.eval(`document.querySelector('.tn-filterbar input[type="search"]')?.value`);
      if (v !== 'backs') left.push(`typing after a redraw gives “${v}” (“backs” expected)`);
      return left;
    } },

  { id: 'param-redraw', page: 'board', hash: 'history', overlay: '.tn-seg', focus: false,
    // a switch that writes a view parameter (app.go(view, { params })) redraws the same view at once: clicked, not opened by link; the same
    // parameters again, opening and closing a detail draw nothing; the history does not grow, the page does not jump
    open: (io) => io.until(`!!document.querySelector('.tn-seg-btn[data-value="48h"]') && !!document.querySelector('.tn-chart .tn-line')`, 3000),
    assert: async (io) => {
      const left = [];
      const pts = `(document.querySelector('.tn-chart .tn-line')?.getAttribute('d') || '').split('L').length`;
      const st0 = await io.eval(`(() => { window.__y0 = scrollY; document.querySelector('.tn-chart').__old = true; return { pts: ${pts} }; })()`);
      if (st0.pts !== 24) left.push(`the CPU chart shows ${st0.pts} points before the switch (24 expected)`);
      await io.press('.tn-seg-btn[data-value="48h"]');
      const drawn = await io.until(`${pts} === 48`, 2000);
      const st = await io.eval(`(() => { const c = document.querySelector('.tn-chart');
        return { hash: location.hash, rebuilt: !!c && !c.__old, pts: ${pts}, checked: document.querySelector('.tn-seg-btn[aria-checked="true"]')?.dataset.value, dy: scrollY - window.__y0 }; })()`);
      if (!/[?&]cpu=48h\b/.test(st.hash)) left.push(`the hash after the switch is ${st.hash} (cpu=48h expected)`);
      if (!drawn || !st.rebuilt) left.push(`after the switch the view still shows ${st.pts} points (the parameter changed, the view was not redrawn)`);
      if (st.checked !== '48h') left.push(`the switch shows “${st.checked}” after the redraw (48h expected)`);
      if (st.dy) left.push(`the page scrolled by ${st.dy} px on the redraw`);
      // the first touch adds the entries the deep link is missing (Back by levels); the history is measured from there: switching back replaces
      await io.eval(`(() => { window.__h1 = history.length; return true; })()`);
      await io.press('.tn-seg-btn[data-value="24h"]');
      const back = await io.until(`${pts} === 24`, 2000);
      const st2 = await io.eval(`({ hash: location.hash, grew: history.length - window.__h1 })`);
      if (!back) left.push('switching back to 24 h did not redraw the view');
      if (/[?&]cpu=48h\b/.test(st2.hash)) left.push(`the hash after switching back is ${st2.hash}`);
      if (st2.grew > 0) left.push(`switching added ${st2.grew} history entries (a parameter replaces)`);
      await io.eval(`(() => { document.querySelector('.tn-chart').__mark = 1; window.tnApp.go('history', { params: { cpu: '24h' } }); return true; })()`);
      await sleep(120);
      if (!(await io.eval(`document.querySelector('.tn-chart')?.__mark === 1`))) left.push('the same parameters again redrew the view');
      await io.eval(`(() => { window.tnApp.open('x-none'); return true; })()`); await sleep(200);
      await io.eval(`(() => { window.tnApp.closeDetail(); return true; })()`); await sleep(200);
      if (!(await io.eval(`document.querySelector('.tn-chart')?.__mark === 1`))) left.push('opening or closing a detail redrew the view');
      return left;
    } },

  { id: 'edge-scrollbar', page: 'board', hash: 'jobs', overlay: '.tn-tooltip:not([hidden])', focus: false, when: (sz) => !sz.mobile && sz.w >= 1000,
    // a control at the right edge with a scrollbar that takes space: the hint and the menu stay inside the laid-out page, both while the page
    // does not scroll (html { scrollbar-gutter: stable } reserves the gutter, documentElement.clientWidth still counts it) and while it scrolls
    open: async (io) => {
      await io.eval(`(() => { const bs = [...document.querySelectorAll('.tn-toolbar button')].filter((b) => b.checkVisibility());
        bs[bs.length - 1].dataset.tnProbe = 'tip'; const m = bs.filter((b) => b.hasAttribute('aria-haspopup')).pop(); if (m) m.dataset.tnProbe = 'menu'; return true; })()`);
      await io.hover('[data-tn-probe="tip"]');
    },
    assert: async (io) => {
      const left = [];
      const box = `(() => { const d = document.documentElement, r = d.getBoundingClientRect(), o = document.querySelector(SEL); const q = o && o.checkVisibility() ? o.getBoundingClientRect() : null;
        return { page: r.right, gutter: innerWidth - r.width, scrolls: d.scrollHeight > d.clientHeight, right: q ? q.right : null }; })()`;
      for (const scroll of [false, true]) {
        if (scroll) {
          await io.eval(`(() => { document.querySelector('.tn-main').append(Object.assign(document.createElement('div'), { className: 'tn-probe-tall' })); document.querySelector('.tn-probe-tall').style.height = '3000px'; return true; })()`);
          await io.hover('[data-tn-probe="tip"]', { away: true }); await io.hover('[data-tn-probe="tip"]');
        }
        const how = scroll ? 'page scrolls' : 'page does not scroll';
        const tip = await io.eval(box.replace('SEL', JSON.stringify('.tn-tooltip:not([hidden])')));
        if (tip.gutter < 1) { left.push('the test Chrome shows no scrollbar that takes space (the check proves nothing)'); return left; }
        if (tip.scrolls !== scroll) left.push(`${how} expected, the page ${tip.scrolls ? 'scrolls' : 'does not scroll'} (the check proves nothing)`);
        if (tip.right == null) left.push(`${how}: the hint of the last toolbar button does not appear`);
        else if (tip.right > tip.page + 0.5) left.push(`${how}: the hint ends at ${Math.round(tip.right)} px, the page at ${Math.round(tip.page)} px (cut by the ${Math.round(tip.gutter)} px scrollbar)`);
        if (!(await io.eval(`!!document.querySelector('[data-tn-probe="menu"]')`))) continue;
        await io.press('[data-tn-probe="menu"]'); await sleep(150);
        const m = await io.eval(box.replace('SEL', JSON.stringify('.tn-menu')));
        if (m.right == null) left.push(`${how}: the menu at the right edge does not open`);
        else if (m.right > m.page + 0.5) left.push(`${how}: the menu ends at ${Math.round(m.right)} px, the page at ${Math.round(m.page)} px`);
        await io.key('Escape'); await sleep(100);
      }
      await io.eval(`(() => { document.querySelector('.tn-probe-tall')?.remove(); return true; })()`);
      return left;
    } },

  { id: 'confirm-typed', page: 'gallery', hash: 'states', overlay: 'dialog.tn-confirm[open]', focus: 'modal', when: (sz) => !sz.mobile,
    // confirm({ typeToConfirm }): a click beside the dialog keeps it and the typed text; Enter while an input method composes a character does
    // not confirm; the real Enter does
    open: async (io) => {
      await io.eval(`${MOD}.then((m) => { window.__ans = 'open'; const b = m.button('Remove …', { variant: 'danger', onClick: () => m.confirm({ title: 'Remove?', danger: true, typeToConfirm: 'nas-a' }).then((v) => { window.__ans = v; }) });
        b.id = 'verify-typed'; document.querySelector('.tn-content').prepend(b); return true; })`);
      await io.press('#verify-typed'); await sleep(80);
    },
    assert: async (io) => {
      const left = [];
      await io.page.send('Input.insertText', { text: 'nas-' }); await sleep(60);
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await io.page.send('Input.dispatchMouseEvent', { type, x: 6, y: 6, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1 });
      await sleep(150);
      const st = await io.eval(`({ open: !!document.querySelector('dialog.tn-confirm[open]'), ans: window.__ans, value: document.querySelector('dialog.tn-confirm input')?.value })`);
      if (!st.open) left.push(`a click beside the dialog closed it (answer ${st.ans}) and dropped the typed text`);
      else if (st.value !== 'nas-') left.push(`the typed text is “${st.value}” after a click beside the dialog (“nas-” expected)`);
      if (!st.open) return left;
      await io.eval(`(() => { const q = document.querySelector('dialog.tn-confirm input'); q.focus(); return true; })()`);
      await io.page.send('Input.insertText', { text: 'a' }); await sleep(60);
      await io.eval(`(() => { document.querySelector('dialog.tn-confirm input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true })); return true; })()`);
      await sleep(120);
      if (!(await io.eval(`!!document.querySelector('dialog.tn-confirm[open]') && window.__ans === 'open'`))) left.push('Enter during an input method composition confirmed');
      await io.key('Enter', 13); await sleep(150);
      const end = await io.eval(`({ open: !!document.querySelector('dialog.tn-confirm[open]'), ans: window.__ans })`);
      if (end.open || end.ans !== true) left.push(`Enter after the composition did not confirm (open ${end.open}, answer ${end.ans})`);
      return left;
    } },
  { id: 'combobox-ime', page: 'gallery', hash: 'inputs', overlay: '.tn-combo-pop', focus: false, when: (sz) => !sz.mobile,
    // Enter in the combobox search while an input method composes a character does not choose; the real Enter does
    open: (io) => io.press('.tn-combo-btn'),
    assert: async (io) => {
      const left = [];
      await io.key('ArrowDown', 40); await sleep(60);
      await io.eval(`(() => { document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, isComposing: true, bubbles: true, cancelable: true })); return true; })()`);
      await sleep(120);
      if (!(await io.eval(`!!document.querySelector('.tn-combo-pop') && document.querySelector('.tn-combo-pop').checkVisibility()`))) left.push('Enter during an input method composition chose an option and closed the list');
      await io.key('Enter', 13); await sleep(150);
      if (await io.eval(`!!document.querySelector('.tn-combo-pop')?.checkVisibility()`)) left.push('the real Enter did not choose');
      return left;
    } },

  { id: 'menu-disabled', page: 'gallery', hash: 'feedback', overlay: '.tn-menu', focus: true, when: (sz) => !sz.mobile,
    // a disabled menu item stays in the menu with its reason: reachable with the arrow keys, aria-disabled (not the disabled attribute, which hides
    // it from the arrow keys and from some screen readers), its reason in its text; choosing it does nothing
    open: (io) => io.press('button[aria-label="Actions"]'),
    assert: async (io) => {
      const left = [];
      const st = await io.eval(`(() => { const it = [...document.querySelectorAll('.tn-menu .tn-menu-item')].find((b) => b.textContent.includes('Pause'));
        return it ? { aria: it.getAttribute('aria-disabled'), attr: it.disabled, text: it.textContent } : null; })()`);
      if (!st) { left.push('the gallery menu has no “Pause” item'); return left; }
      if (st.aria !== 'true') left.push('the disabled item has no aria-disabled="true"');
      if (st.attr) left.push('the disabled item carries the disabled attribute (arrow keys and some screen readers skip it)');
      if (!/Already off/.test(st.text)) left.push(`the disabled item does not show its reason (“${st.text}”)`);
      let reached = false;
      for (let i = 0; i < 6 && !reached; i++) { await io.key('ArrowDown', 40); await sleep(40); reached = await io.eval(`!!document.activeElement?.textContent.includes('Pause')`); }
      if (!reached) left.push('the arrow keys never reach the disabled item');
      else {
        await io.key('Enter', 13); await sleep(120);
        if (!(await io.eval(`!!document.querySelector('.tn-menu')?.checkVisibility()`))) left.push('Enter on the disabled item closed the menu (it acted)');
      }
      return left;
    } },

  { id: 'row-refresh', page: 'board', hash: 'jobs', overlay: '.tn-table [data-key]', focus: false, when: (sz) => !sz.mobile,
    // a row focused with the keyboard keeps the focus when new data redraws the view (app.refresh())
    open: async (io) => { await io.until(`!!document.querySelector('.tn-table [data-key]')`, 3000); },
    assert: async (io) => {
      const left = [];
      const key = await io.eval(`(() => { const r = document.querySelectorAll('.tn-table [data-key]')[2]; r.focus(); r.__old = true; window.tnApp.refresh(); return r.dataset.key; })()`);
      await sleep(120);
      const st = await io.eval(`(() => { const a = document.activeElement; return { key: a?.dataset?.key ?? null, rebuilt: !a?.__old, tag: a?.tagName }; })()`);
      if (st.key !== key) left.push(`after a redraw the focus is on ${st.tag}${st.key ? ` (${st.key})` : ''}, not on the row ${key}`);
      else if (!st.rebuilt) left.push('the redraw did not rebuild the row (the check proves nothing)');
      return left;
    } },

  // ---- Gb: detail in place – a row that stands for a thing another view owns opens that thing's detail HERE; the way to the other view is a link inside ----
  { id: 'detail-in-place', page: 'board', hash: 'overview', overlay: 'dialog.tn-sheet[open], .tn-inspector:not([hidden])', focus: 'modal',
    open: (io) => io.press('.tn-row-btn[data-key]'),
    assert: async (io) => {
      const left = [];
      await sleep(150);
      const st = await io.eval(`({ hash: location.hash, link: [...document.querySelectorAll('dialog.tn-sheet[open] .tn-btn, .tn-inspector:not([hidden]) .tn-btn')].map((b) => b.textContent.trim()).filter((x) => /^(Open in|In .+ öffnen)/.test(x)) })`);
      if (!/^#\/overview\?open=/.test(st.hash)) left.push(`tapping a problem row moved to ${st.hash} instead of opening the detail in the overview`);
      if (st.link.length !== 1) left.push(`${st.link.length} “Open in …” links in the detail (1 expected: the explicit way to the other view)`);
      if (!st.link.length) return left;
      await io.press('dialog.tn-sheet[open] .tn-btn, .tn-inspector:not([hidden]) .tn-btn', 'Open in');
      await sleep(250);
      const h2 = await io.eval('location.hash');
      if (!/^#\/(jobs|hosts)\?open=/.test(h2)) left.push(`the link inside the detail leads to ${h2} (the owning view with the thing open expected)`);
      return left;
    } },

  // ---- Inputs, filters, forms (stage D) ----
  { id: 'combobox', page: 'gallery', hash: 'inputs', overlay: '.tn-combo-pop', focus: false,
    // popover in the overlay layer: on top, inside the viewport, search field with focus (not on touch: the keyboard would cover the list),
    // arrow keys + Enter choose, the choice closes it and the focus returns to the button; Esc closes first
    open: (io) => io.press('.tn-combo-btn'),
    assert: async (io) => {
      const left = [];
      const st = await io.eval(`(() => { const p = document.querySelector('.tn-combo-pop'), b = document.querySelector('.tn-combo-btn[aria-expanded="true"]'); const r = p.getBoundingClientRect();
        return { opts: p.querySelectorAll('[role=option]').length, expanded: !!b, selected: p.querySelectorAll('[aria-selected=true]').length, inView: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 && r.bottom <= innerHeight + 1,
          search: !!p.querySelector('input[role=combobox]'), focusQ: !!document.activeElement?.matches('.tn-combo-q') }; })()`);
      if (!st.expanded) left.push('aria-expanded is not true on the button');
      if (st.opts < 10) left.push(`${st.opts} options instead of 16`);
      if (st.selected !== 1) left.push(`${st.selected} options marked as selected instead of 1`);
      if (!st.inView) left.push('popover reaches outside the viewport');
      if (!st.search) left.push('no search field');
      if (!io.mobile) {
        if (!st.focusQ) left.push('focus is not in the search field');
        const a0 = await io.eval(`[...document.querySelectorAll('.tn-combo-opt')].findIndex((o) => o.classList.contains('is-active'))`);
        await io.key('ArrowDown', 40); await sleep(40);
        const a1 = await io.eval(`[...document.querySelectorAll('.tn-combo-opt')].findIndex((o) => o.classList.contains('is-active'))`);
        if (a1 !== a0 + 1) left.push('arrow down does not move the active option');
        await io.eval(`(() => { const q = document.querySelector('.tn-combo-q'); q.value = 'mist'; q.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`); await sleep(40);
        const n = await io.eval(`document.querySelectorAll('.tn-combo-opt').length`);
        if (n !== 1) left.push(`search “mist” leaves ${n} options instead of 1`);
        await io.key('Enter', 13); await sleep(60);
        if (await io.count('.tn-combo-pop')) left.push('Enter does not choose and close');
        const lab = await io.eval(`(() => { const b = document.querySelector('.tn-combo-btn'); return { t: b.textContent.trim(), f: document.activeElement === b }; })()`);
        if (lab.t !== 'mistral') left.push(`choice not shown on the button (“${lab.t}”)`);
        if (!lab.f) left.push('focus does not return to the button after choosing');
        await io.press('.tn-combo-btn'); await sleep(60);
        await io.key('Escape'); await sleep(60);
        if (await io.count('.tn-combo-pop')) left.push('Esc does not close the popover');
        if (!(await io.eval(`document.activeElement === document.querySelector('.tn-combo-btn')`))) left.push('focus does not return to the button after Esc');
      } else {
        await io.press('.tn-combo-opt', 'mistral'); await sleep(60);
        if (await io.count('.tn-combo-pop')) left.push('tapping an option does not close the popover');
        if (!(await io.eval(`document.querySelector('.tn-combo-btn').textContent.includes('mistral')`))) left.push('choice not shown on the button');
      }
      return left;
    } },
  { id: 'sheet-combobox', page: 'gallery', hash: 'inputs', overlay: '.tn-combo-pop', focus: false,
    // from an open sheet: the popover is above it, usable, Esc closes the popover first (not the sheet), a multiple choice keeps the search field focused
    open: async (io) => { await io.press('.tn-btn', 'Open sheet with inputs'); await io.settle(); await io.press('dialog.tn-sheet[open] .tn-combo-btn'); },
    assert: async (io) => {
      const left = [];
      if (!io.mobile) {
        const f = await io.eval(`document.activeElement?.matches('.tn-combo-q')`);
        if (!f) left.push('focus is not in the search field inside the sheet');
      }
      await io.key('Escape'); await sleep(80);
      if (await io.count('.tn-combo-pop')) left.push('Esc does not close the popover');
      if (!(await io.count('dialog.tn-sheet[open]'))) left.push('Esc closes the sheet instead of the popover first');
      // multiple: choosing keeps the popover open
      await io.press('dialog.tn-sheet[open] .tn-field:nth-of-type(2) .tn-combo-btn'); await sleep(80);
      const multi = await io.eval(`document.querySelector('.tn-combo-list')?.getAttribute('aria-multiselectable')`);
      if (multi !== 'true') left.push('multiple choice is not marked aria-multiselectable');
      await io.press('.tn-combo-opt', 'cedar'); await sleep(80);
      if (!(await io.count('.tn-combo-pop'))) left.push('a multiple choice closes the popover');
      await io.key('Escape'); await sleep(60);
      return left;
    } },
  { id: 'confirm-over-panel', page: 'gallery', hash: 'states', overlay: 'dialog.tn-confirm[open]', focus: 'modal',
    // confirm() opened by a tap inside an open sheet/panel: on top, focus inside (on “Cancel” for dangerous actions), a toast sits above it,
    // Esc answers “no” and leaves the sheet open
    open: async (io) => {
      await io.eval(`${MOD}.then((m) => { window.__ans = 'open';
        const b = m.button('Restart …', { variant: 'danger', onClick: () => m.confirm({ title: 'Restart delta?', text: 'Running jobs are interrupted.', danger: true, confirmLabel: 'Restart' }).then((v) => { window.__ans = v; }) });
        b.id = 'verify-restart'; m.openSheet({ title: 'Host delta', body: b }); return true; })`);
      await io.settle();
      await io.press('#verify-restart'); await sleep(80);
    },
    assert: async (io) => {
      const left = [];
      const f = await io.eval(`document.activeElement?.textContent`);
      if (f !== 'Cancel') left.push(`focus starts on “${f}” instead of Cancel for a dangerous action`);
      await io.eval(`${MOD}.then((m) => { m.toast('Saved', { tone: 'ok', duration: 0 }); return true; })`); await sleep(120);
      const top = await io.eval(`(() => { const t = [...document.querySelectorAll('.tn-toast')].pop(); if (!t) return 'missing'; const r = t.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return t.contains(e) ? 'top' : 'under ' + e?.className; })()`);
      if (top !== 'top') left.push(`toast over confirm: ${top}`);
      await io.key('Escape'); await sleep(150);
      if (await io.count('dialog.tn-confirm[open]')) left.push('Esc does not close the confirm dialog');
      if ((await io.eval('window.__ans')) !== false) left.push('Esc does not answer false');
      if (!(await io.count('dialog.tn-sheet[open]'))) left.push('the sheet closed with the confirm dialog');
      return left;
    } },
  { id: 'filter-sheet', page: 'gallery', hash: 'table', overlay: 'dialog.tn-sheet[open]', focus: true,
    // filter sheet with all types: choosing keeps the focus on the pressed control (no re-render), a chip appears, a combobox in the sheet is on top
    open: (io) => io.press('.tn-btn', 'Filter'),
    assert: async (io) => {
      const left = [];
      const groups = await io.eval(`document.querySelectorAll('dialog.tn-sheet[open] .tn-fgroup').length`);
      if (groups < 6) left.push(`${groups} filter groups instead of 6`);
      await io.press('dialog.tn-sheet[open] .tn-pill', 'Backup'); await sleep(80);
      const st = await io.eval(`(() => { const a = document.activeElement; return { pill: a?.matches('.tn-pill') && a.textContent.includes('Backup'), on: a?.getAttribute('aria-pressed'), chips: [...document.querySelectorAll('.tn-filterbar .tn-chip')].map((c) => c.textContent.trim()).join('|') }; })()`);
      if (!st.pill) left.push('focus is lost after choosing a pill');
      if (st.on !== 'true') left.push('pill is not marked as pressed');
      if (!/Backup/.test(st.chips)) left.push('no chip for the choice');
      await io.press('dialog.tn-sheet[open] .tn-seg-btn', 'Yes'); await sleep(80);
      await io.press('dialog.tn-sheet[open] .tn-combo-btn'); await sleep(80);
      const pop = await io.eval(`(() => { const p = document.querySelector('.tn-combo-pop'); if (!p) return 'missing'; const r = p.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + 40); return p.contains(e) ? 'top' : 'under ' + e?.className; })()`);
      if (pop !== 'top') left.push(`host combobox in the filter sheet: ${pop}`);
      await io.key('Escape'); await sleep(80);
      if (!(await io.count('dialog.tn-sheet[open]'))) left.push('Esc closes the sheet instead of the combobox first');
      const chips = await io.eval(`[...document.querySelectorAll('.tn-filterbar .tn-chip')].map((c) => c.textContent.trim())`);
      if (!chips.some((c) => /Yes/.test(c))) left.push('no chip for the yes/no choice');
      return left;
    } },
  { id: 'form-submit', page: 'gallery', hash: 'states', overlay: 'dialog.tn-sheet[open]', focus: true,
    // form in a sheet: invalid fields show an error and focus the first field (nothing is sent); a valid submit sends exactly once, even when it is
    // pressed again while it runs (button, Enter); the button says “Running …” and the fields are locked meanwhile
    open: async (io) => {
      await io.eval(`${MOD}.then((m) => { window.__subs = 0; const f = m.form({ fields: [{ name: 'v', label: 'Version', value: '', required: true }, { name: 'n', type: 'toggle', label: 'Notify' }], submitLabel: 'Send',
        onSubmit: async () => { window.__subs++; await new Promise((r) => setTimeout(r, 500)); } });
        window.__f = f; m.openSheet({ title: 'Check', body: f, footer: f.buttons() }); return true; })`);
      await io.settle();
    },
    assert: async (io) => {
      const left = [];
      await io.press('dialog.tn-sheet[open] button[type=submit]'); await sleep(120);
      const e = await io.eval(`({ err: document.querySelectorAll('dialog.tn-sheet[open] .tn-form .tn-field-error:not([hidden])').length, focus: document.activeElement?.matches('.tn-form input[type=text]'), subs: window.__subs, invalid: document.querySelector('dialog.tn-sheet[open] .tn-form input[type=text]')?.getAttribute('aria-invalid') })`);
      if (e.subs !== 0) left.push('an invalid form is submitted');
      if (e.err < 1 || e.invalid !== 'true') left.push('no error on the empty required field');
      if (!e.focus) left.push('focus does not go to the first invalid field');
      await io.eval(`(() => { const i = document.querySelector('dialog.tn-sheet[open] .tn-form input[type=text]'); i.value = '1.0.0'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`);
      await io.press('dialog.tn-sheet[open] button[type=submit]'); await sleep(60);
      // the second tap: a running button no longer takes pointer events, so the repeated click is sent to the element itself (a double tap on a slow device)
      await io.eval(`document.querySelector('dialog.tn-sheet[open] button[type=submit]').click()`); await sleep(30);
      await io.eval(`window.__f.requestSubmit()`); await sleep(100);
      const run = await io.eval(`({ label: document.querySelector('dialog.tn-sheet[open] button[type=submit]').textContent.trim(), busy: window.__f.busy, locked: document.querySelectorAll('dialog.tn-sheet[open] .tn-form .is-disabled').length })`);
      if (run.label !== 'Running …') left.push(`button says “${run.label}” while running`);
      if (run.locked < 1) left.push('fields are not locked while running');
      await io.until('!window.__f.busy', 700);
      const done = await io.eval(`({ subs: window.__subs, label: document.querySelector('dialog.tn-sheet[open] button[type=submit]').textContent.trim(), busy: window.__f.busy })`);
      if (done.subs !== 1) left.push(`${done.subs} submits instead of 1`);
      if (done.busy || done.label !== 'Send') left.push('the form does not return to its normal state');
      return left;
    } },
];

/** Input/output helpers for a scenario. */
export function makeIO(page, size) {
  // a hint or data card shows after a delay (hover 500 ms, long press 650 ms): wait for it, at most the old fixed pause; when none is expected
  // (e.g. fully visible text) the whole pause passes, as before
  const popped = async (max) => {
    const t0 = Date.now();
    while (Date.now() - t0 < max) {
      if (await evaluate(page, `!!document.querySelector('.tn-tooltip:not([hidden]), .tn-datacard:not([hidden])')`)) { await sleep(60); return; }
      await sleep(20);
    }
  };
  // centre of the trigger; if a hit test there does not yet reach the trigger (transition running), wait briefly.
  const center = async (sel, text) => {
    for (let i = 0; i < 5; i++) {
      const r = await locate(sel, text);
      if (!r || r.hit) return r && (await sleep(50), r);
      await sleep(120);
    }
    return locate(sel, text);
  };
  const locate = async (sel, text) => {
    const r = await evaluate(page, `(() => {
      const t = ${JSON.stringify(text || '')};
      const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => e.checkVisibility() && (!t || e.textContent.includes(t)));
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      const r = el.getBoundingClientRect(), vv = window.visualViewport;
      const t2 = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      // input coordinates refer to the visible viewport (shifted on zoom/overflow)
      return { x: (r.left + r.width / 2 - vv.offsetLeft) * vv.scale, y: (r.top + r.height / 2 - vv.offsetTop) * vv.scale, hit: !!t2 && (t2 === el || el.contains(t2)) };
    })()`);
    if (!r) throw Object.assign(new Error(`trigger not found: ${sel}${text ? ` „${text}“` : ''}`), { missing: true });
    return r;
  };
  const touch = (type, p) => page.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: p.x, y: p.y, id: 0 }] });
  const mouse = (type, p) => page.send('Input.dispatchMouseEvent', { type, x: p.x, y: p.y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1, pointerType: 'mouse' });
  const IO = {
    mobile: size.mobile, page, size,
    async swipe(x, y, dx) { // horizontal swipe with the finger
      await touch('touchStart', { x, y }); await sleep(30);
      for (let i = 1; i <= 8; i++) { await touch('touchMove', { x: x + (dx * i) / 8, y }); await sleep(16); }
      await touch('touchEnd', { x: x + dx, y });
    },
    eval: (js) => evaluate(page, js),
    settle: () => settle(page),
    count: (sel) => evaluate(page, `[...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => e.checkVisibility()).length`),
    // wait for a condition instead of a fixed pause: returns as soon as the expression is truthy, after at most `max` ms (the old pause) with the last value
    until: async (expr, max = 1000) => { const t0 = Date.now(); for (;;) { const v = await evaluate(page, expr); if (v || Date.now() - t0 >= max) return v; await sleep(20); } },
    // wait until no visible element matches (closing animation done); same upper bound as the pause it replaces
    gone: async (sel, max = 500) => { const t0 = Date.now(); const js = `![...document.querySelectorAll(${JSON.stringify(sel)})].some((e) => e.checkVisibility())`; for (;;) { if (await evaluate(page, js) || Date.now() - t0 >= max) return; await sleep(20); } },
    // change the viewport (height: address bar, width: rotating/window), the page stays loaded
    resize: (w, hgt) => page.send('Emulation.setDeviceMetricsOverride', { width: w, height: hgt, deviceScaleFactor: size.dpr, mobile: size.mobile }),
    key: async (k, code = 0) => { for (const type of ['rawKeyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: k === 'Escape' ? 27 : code }); },
    async tapAt(x, y) {
      if (size.mobile) { await touch('touchStart', { x, y }); await sleep(40); await touch('touchEnd', { x, y }); }
      else { await mouse('mouseMoved', { x, y }); await mouse('mousePressed', { x, y }); await mouse('mouseReleased', { x, y }); }
    },
    async tap(sel, text) { const p = await center(sel, text); await IO.tapAt(p.x, p.y); },
    // mouse: move onto the element (away: move off)
    async hover(sel, o = {}) {
      const p = await center(sel, o.text);
      if (o.away) { await mouse('mouseMoved', { x: 2, y: 2 }); await sleep(80); return; }
      await mouse('mouseMoved', { x: p.x - 30, y: p.y - 30 }); await mouse('mouseMoved', p); await popped(o.wait ?? 500);
    },
    async press(sel, text) {
      const p = await center(sel, text);
      if (size.mobile) { await touch('touchStart', p); await sleep(40); await touch('touchEnd', p); }
      else { await mouse('mouseMoved', p); await mouse('mousePressed', p); await sleep(30); await mouse('mouseReleased', p); }
    },
    // trigger a tooltip: mouse = hover, touch = long press. Checked while the finger is held; the
    // returned function lifts it afterwards.
    async hint(sel) {
      const p = await center(sel);
      if (size.mobile) { await touch('touchStart', p); await popped(650); return () => touch('touchEnd', p); }
      await mouse('mouseMoved', { x: p.x - 30, y: p.y - 30 }); await mouse('mouseMoved', p); await popped(500);
      return null;
    },
  };
  return IO;
}

const STATE_JS = (sel, focus) => `(() => {
  const els = [...document.querySelectorAll(${JSON.stringify(sel)})].filter((e) => e.checkVisibility({ opacityProperty: true }));
  const el = els[els.length - 1];
  if (!el) return { missing: true };
  const r = el.getBoundingClientRect();
  const cx = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1), cy = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
  const pe = el.style.pointerEvents; el.style.pointerEvents = 'auto';
  const hit = document.elementFromPoint(cx, cy);
  el.style.pointerEvents = pe;
  const modal = [...document.querySelectorAll('dialog:modal')].pop();   // the topmost one is the one opened last
  const d = (e) => e ? e.tagName.toLowerCase() + (e.classList.length ? '.' + [...e.classList].slice(0, 2).join('.') : '') : 'nothing';
  el.setAttribute('data-verify-hit', 'overlay');
  return {
    top: !!hit && (hit === el || el.contains(hit)), hit: d(hit),
    inert: !!el.closest('[inert]') || (!!modal && !modal.contains(el)), modal: modal ? d(modal) : null,
    focus: ${focus === 'modal' ? "!el.matches('dialog:modal') || el.contains(document.activeElement)" : focus ? 'el.contains(document.activeElement)' : 'true'}, active: d(document.activeElement),
    rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
  };
})()`;

/** One task per size × scenario (every task reloads the page: clean state; the unit that one worker runs). */
export function overlayTasks({ sizes, only, scenarios = SCENARIOS } = {}) {
  const list = sizes && sizes.length ? sizes : OVERLAY_SIZES.map(parseSize);
  const tasks = [];
  for (const size of list) for (const sc of scenarios) {
    if (only && !only.includes(sc.id)) continue;
    if (sc.when && !sc.when(size)) continue;
    tasks.push({ kind: 'overlay', size, sc, label: `overlay ${sc.id} ${size.name}` });
  }
  return tasks;
}

/**
 * One scenario at one size on one worker → { findings, scenarios: 1 }.
 * opts: { base?, outDir, css, js }; (scenarios carry `pg` for a board outside the kit); css/js: mutants for the self-test (inject CSS or a script after loading).
 */
export async function overlayTask(w, task, opts = {}) {
  const { size, sc } = task;
  const { outDir, css, js } = opts;
  const base = opts.base || w.base;
  const { page, con } = w;
  const findings = [];
  const pg = sc.pg || PAGES.find((p) => p.id === sc.page);   // a board outside the kit brings its own page object
  await emulate(page, size, 'dark');
  await load(page, `${base}${pg.path}#/${sc.hash}`, { push: con.push });
  await settle(page);
  if (css) await injectCss(page, css);
  if (js) await evaluate(page, js);
  const ctx = { check: 'overlay', page: sc.page, view: sc.id, size: size.name, theme: 'dark', sel: sc.overlay };
  const io = makeIO(page, size);
  let release = null;
  try {
    if (sc.setup) await sc.setup(io);   // preparation that is not the overlay under test (a board's generic menu scenario opens its sheet here)
    if (sc.steady) await evaluate(page, STEADY_START_JS);
    release = await sc.open(io);
  } catch (e) {
    if (!e.missing) throw e;
    findings.push({ ...ctx, rule: 'overlay-missing', where: '', text: e.message });
    return { findings, scenarios: 1 };
  }
  await sleep(80);
  if (!release) await settle(page);
  const st = await evaluate(page, STATE_JS(sc.overlay, sc.focus));
  if (typeof release === 'function') await release();
  const add = (rule, text) => findings.push({ ...ctx, rule, where: sc.hash, text });
  if (sc.assert) for (const text of await sc.assert(io, size)) add('overlay-behaviour', text);
  if (sc.steady) { await sleep(120); for (const text of await evaluate(page, STEADY_END_JS)) add('overlay-shift', text); }
  if (st.missing) add('overlay-missing', `${sc.overlay} does not appear`);
  else {
    if (!st.top) add('overlay-top', `lies under ${st.hit}${st.modal ? ` (open: ${st.modal})` : ''}`);
    if (st.inert) add('overlay-inert', `inert${st.modal ? ` – outside ${st.modal}` : ''}`);
    if (!st.focus) add('overlay-focus', `focus stays on ${st.active}`);
  }
  if (outDir && findings.length) {
    const file = path.join(outDir, `overlay-${sc.id}-${size.name}.png`);
    await evaluate(page, `(() => { const el = document.querySelector('[data-verify-hit="overlay"]'); if (el) { el.style.outline = '2px solid magenta'; } return true; })()`).catch(() => {});
    const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    findings[findings.length - 1].shot = file;
  }
  con.take();
  return { findings, scenarios: 1 };
}

/* Steady scenarios: the blocks of the view (elements in .tn-content up to four levels deep, at least 24 px high, keyed by their place in the
   tree) are recorded before the first click, on every DOM change and every frame until the end; a block that moves, resizes, disappears or
   appears is a finding (1 px tolerance; scroll is taken out, the boxes are page coordinates). */
const STEADY_START_JS = `(() => {
  const root = document.querySelector('.tn-content'); if (!root) return false;
  const key = (el) => { const p = []; for (let e = el; e && e !== root; e = e.parentElement) p.unshift(e.tagName + '.' + ([...e.classList].filter((c) => !c.startsWith('is-')).join('.')) + ':' + [...e.parentElement.children].indexOf(e)); return p.join('>'); };
  const boxes = () => { const m = new Map(); const walk = (el, d) => { for (const c of el.children) { if (!(c instanceof HTMLElement)) continue; const r = c.getBoundingClientRect(); if (r.height >= 24 && r.width > 0) m.set(key(c), [Math.round(r.x), Math.round(r.y + scrollY), Math.round(r.width), Math.round(r.height)]); if (d < 4) walk(c, d + 1); } }; walk(root, 1); return m; };
  const s = window.__steady = { base: boxes(), bad: [], on: true };
  const cmp = () => { if (!s.on || s.bad.length > 4) return; const now = boxes();
    for (const [k, b] of s.base) { const n = now.get(k); if (!n) { s.bad.push('block ' + k.split('>').pop() + ' disappeared'); return; }
      if (b.some((v, i) => Math.abs(v - n[i]) > 1)) { s.bad.push('block ' + k.split('>').pop() + ' moved or resized from ' + b.join(',') + ' to ' + n.join(',')); return; } }
    for (const k of now.keys()) if (!s.base.has(k)) { s.bad.push('block ' + k.split('>').pop() + ' appeared'); return; } };
  s.mo = new MutationObserver(cmp); s.mo.observe(root, { subtree: true, childList: true, attributes: true, characterData: true });
  const loop = () => { if (!s.on) return; cmp(); requestAnimationFrame(loop); }; requestAnimationFrame(loop);
  return true; })()`;
const STEADY_END_JS = `(() => { const s = window.__steady; if (!s) return ['steady: the view has no .tn-content']; s.on = false; s.mo.disconnect(); return [...new Set(s.bad)].slice(0, 3); })()`;

/** Scenarios one after the other on one worker (mutants). opts: { sizes, only, scenarios, base, css, js } */
export async function runOverlayOn(w, opts = {}) {
  const out = { findings: [], scenarios: 0 };
  for (const task of overlayTasks(opts)) {
    const r = await overlayTask(w, task, opts);
    out.findings.push(...r.findings); out.scenarios += r.scenarios;
  }
  return out;
}

/** All scenarios on all workers of the pool, merged in task order. opts: { sizes, only, outDir } */
export async function runOverlay(pool, opts = {}) {
  const res = await pool.run(overlayTasks(opts), (t, w) => overlayTask(w, t, opts));
  return mergeOverlay(res);
}

export const mergeOverlay = (res) => ({ findings: res.flatMap((r) => r.findings), scenarios: res.reduce((n, r) => n + r.scenarios, 0) });
