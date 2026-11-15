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
import fs from 'node:fs';
import path from 'node:path';
import { emulate, evaluate, sleep } from '../lib/cdp.mjs';
import { load, settle, injectCss } from './geometry.mjs';
import { PAGES, parseSize } from './targets.mjs';

export const OVERLAY_SIZES = ['phone', 'tablet-s', 'desktop'];
export const kitModule = (url) => `import(new URL(${JSON.stringify(url)}, location.href).href)`;
const MOD = kitModule('../js/tarn.js');

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
