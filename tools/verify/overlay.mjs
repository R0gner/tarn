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
  { id: 'segmented-swipe', page: 'gallery', hash: 'controls', overlay: '.g-swipe .tn-segpane', focus: false, when: (sz) => sz.mobile,
    open: (io) => io.eval(`(() => { document.querySelector('.g-swipe').scrollIntoView({ block: 'start', behavior: 'instant' }); return null; })()`),
    // segmented({ pane, swipe }): a sideways swipe on the content switches to the neighbour, which follows the finger while the marker glides;
    // a swipe in the image strip scrolls the strip and switches nothing; at the first part a rubber band, no wrap; a vertical drag scrolls the
    // page and switches nothing; with reduced motion nothing moves with the finger and the swipe switches on release
    assert: async (io) => {
      const left = [];
      const tp = (type, px, py) => io.page.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py, id: 0 }] });
      const drag = async (x, y, dx, dy, { hold = false } = {}) => {
        await tp('touchStart', x, y); await sleep(30);
        for (let i = 1; i <= 10; i++) { await tp('touchMove', x + (dx * i) / 10, y + (dy * i) / 10); await sleep(16); }
        if (!hold) { await tp('touchEnd', x + dx, y + dy); await sleep(350); }
      };
      const st = () => io.eval(`(() => { const s = document.querySelector('.g-swipe'); const on = s.querySelector('.tn-seg-btn[aria-checked="true"]');
        const tr = s.querySelector('.tn-segpane-track'), m = s.querySelector('.tn-seg-marker');
        return { on: on && on.textContent.trim(), track: tr.style.transform, next: !!s.querySelector('.tn-segpane-next'), marker: !!m && m.checkVisibility(),
          dx: Math.round(new DOMMatrix(getComputedStyle(tr).transform).m41), strip: !!s.querySelector('.tn-segpane-body > .tn-imgstrip, .tn-segpane-body .tn-imgstrip') }; })()`);
      const point = async (sel, fx = 0.7) => {
        const p = await io.eval(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left + r.width * ${fx}), y: Math.round(r.top + Math.min(r.height / 2, 40)) }; })()`);
        if (!p) throw Object.assign(new Error(`segmented-swipe: ${sel} is missing`), { missing: true });
        return p;
      };
      let s = await st();
      if (!/^Runs/.test(s.on || '')) return [`the demo does not start on Runs (${s.on})`];
      // to the left, held: the neighbour is drawn beside the content and follows the finger, the marker glides
      // a held pull of 40 % of the width (a slow drag switches from a quarter)
      const pull = Math.round(0.4 * (await io.eval(`document.querySelector('.g-swipe .tn-segpane').clientWidth`)));
      let p = await point('.g-swipe .tn-segpane-body .tn-list, .g-swipe .tn-segpane-body');
      await drag(p.x, p.y, -pull, 0, { hold: true });
      s = await st();
      if (!s.next) left.push('while the finger pulls, no neighbour is drawn beside the content');
      if (!(s.dx < -pull / 2)) left.push(`the content does not follow the finger (offset ${s.dx} px for a ${pull} px pull)`);
      if (!s.marker) left.push('the marker does not glide while the finger pulls');
      await tp('touchEnd', p.x - pull, p.y); await sleep(350);
      s = await st();
      if (!/^Photos/.test(s.on || '')) return [...left, `a swipe to the left on Runs shows ${s.on} instead of Photos`];
      if (s.next || s.track) left.push(`after the swipe the panes do not rest (neighbour ${s.next}, transform “${s.track}”)`);
      if (!s.strip) left.push('Photos does not show its content after the swipe');
      // a swipe that starts in the image strip (it scrolls sideways itself) belongs to the strip
      p = await point('.g-swipe .tn-imgstrip', 0.8);
      await drag(p.x, p.y, -150, 0);
      s = await st();
      if (!/^Photos/.test(s.on || '')) left.push(`a swipe in the image strip switched to ${s.on}`);
      if (!((await io.eval(`document.querySelector('.g-swipe .tn-imgstrip').scrollLeft`)) > 0)) left.push('a swipe in the image strip does not scroll the strip');
      // … also at its end, where the strip has nothing left to scroll
      await io.eval(`(() => { const e = document.querySelector('.g-swipe .tn-imgstrip'); e.scrollLeft = e.scrollWidth; return null; })()`); await sleep(60);
      p = await point('.g-swipe .tn-imgstrip', 0.8);
      await drag(p.x, p.y, -150, 0);
      s = await st();
      if (!/^Photos/.test(s.on || '')) return [...left, `a swipe in the image strip at its end switched to ${s.on}`];
      // back to the right from below the strip
      p = await point('.g-swipe .tn-segpane-body > .tn-card', 0.3);
      await drag(p.x, p.y, 160, 0);
      s = await st();
      if (!/^Runs/.test(s.on || '')) left.push(`a swipe to the right on Photos shows ${s.on} instead of Runs`);
      // the first part: a rubber band (moves a little), no wrap to the last part
      p = await point('.g-swipe .tn-segpane-body', 0.3);
      await drag(p.x, p.y, 200, 0, { hold: true });
      s = await st();
      if (!(s.dx > 0 && s.dx < 60)) left.push(`at the first part the content moves ${s.dx} px for a 200 px pull (rubber band expected)`);
      await tp('touchEnd', p.x + 200, p.y); await sleep(350);
      s = await st();
      if (!/^Runs/.test(s.on || '')) left.push(`a swipe to the right on the first part shows ${s.on}`);
      // vertical drag: the page scrolls, nothing switches (room below: the gallery may end soon after the demo)
      await io.eval(`(() => { const sp = document.createElement('div'); sp.style.height = '1200px'; sp.setAttribute('data-verify-ignore', ''); document.querySelector('.tn-content').append(sp); return null; })()`);
      await io.eval(`(() => { document.querySelector('.g-swipe').scrollIntoView({ block: 'start', behavior: 'instant' }); return null; })()`);
      const y0 = await io.eval('scrollY');
      p = await point('.g-swipe .tn-segpane-body', 0.5);
      await drag(p.x, p.y + 40, 40, -160);
      s = await st();
      if (!/^Runs/.test(s.on || '')) left.push(`a mostly vertical drag switched to ${s.on}`);
      if (!((await io.eval('scrollY')) > y0)) left.push('a mostly vertical drag on the content does not scroll the page');
      // reduced motion: nothing moves with the finger, the swipe switches on release
      await io.page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
      try {
        await io.eval(`(() => { document.querySelector('.g-swipe').scrollIntoView({ block: 'start', behavior: 'instant' }); return null; })()`);
        p = await point('.g-swipe .tn-segpane-body', 0.7);
        await drag(p.x, p.y, -pull, 0, { hold: true });
        s = await st();
        if (s.track || s.next) left.push(`with reduced motion the content moves with the finger (transform “${s.track}”)`);
        await tp('touchEnd', p.x - pull, p.y); await sleep(120);
        s = await st();
        if (!/^Photos/.test(s.on || '')) left.push(`with reduced motion a swipe to the left shows ${s.on} instead of Photos`);
      } finally {
        await io.page.send('Emulation.setEmulatedMedia', { features: [] });
      }
      return left;
    } },
  { id: 'segmented-swipe-empty-room', page: 'gallery', hash: 'controls', overlay: '.g-swipe .tn-segpane', focus: false, when: (sz) => sz.mobile,
    // the swipe demo alone in the view (its siblings hidden), on the short part Notes: empty room below it down to the lower edge of the screen.
    // A sideways swipe that starts there switches (0.15.0, the owner swipes with the thumb at the lower edge); while a long neighbour (the drawn slide
    // 1600 px taller) is held half pulled in, the page does not grow; after the switch nothing of the gesture stays
    open: (io) => io.eval(`(() => {
      for (let e = document.querySelector('.g-swipe'); e && !e.matches('.tn-content'); e = e.parentElement)
        for (const sib of e.parentElement.children) if (sib !== e) sib.style.display = 'none';
      const sh = new CSSStyleSheet(); sh.replaceSync(".g-swipe .tn-segpane-next::after { content: ''; display: block; height: 1600px; }"); document.adoptedStyleSheets = [...document.adoptedStyleSheets, sh];   /* CSP: no <style> */
      document.querySelector('.g-swipe .tn-seg-btn[data-value="notes"]').click(); scrollTo(0, 0); return null; })()`),
    assert: async (io) => {
      const left = [];
      const tp = (type, px, py) => io.page.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py, id: 0 }] });
      const drag = async (x, y, dx, { hold = false } = {}) => {
        await tp('touchStart', x, y); await sleep(30);
        for (let i = 1; i <= 10; i++) { await tp('touchMove', x + (dx * i) / 10, y); await sleep(16); }
        if (!hold) { await tp('touchEnd', x + dx, y); await sleep(350); }
      };
      const st = () => io.eval(`(() => { const s = document.querySelector('.g-swipe'); const on = s.querySelector('.tn-seg-btn[aria-checked="true"]');
        const r = s.querySelector('.tn-segpane').getBoundingClientRect();
        return { on: on && on.textContent.trim(), sh: document.scrollingElement.scrollHeight, ih: innerHeight, bottom: Math.round(r.bottom),
          next: !!s.querySelector('.tn-segpane-next'), track: s.querySelector('.tn-segpane-track').style.transform }; })()`);
      let s = await st();
      if (!/^Notes/.test(s.on || '')) return [`the demo does not show Notes (${s.on})`];
      if (s.sh > s.ih + 1) return [`the view with only the demo is taller than the screen (${s.sh} > ${s.ih}): no empty room to test`];
      const h0 = s.sh, y = s.ih - 40;
      if (y <= s.bottom + 20) return [`no empty room below the short part (content ends at ${s.bottom}, screen ${s.ih})`];
      // held half pulled in from the content: the long neighbour must not make the page taller
      const pull = Math.round(0.4 * (await io.eval(`document.querySelector('.g-swipe .tn-segpane').clientWidth`)));
      await drag(40, s.bottom - 20, pull, { hold: true });
      s = await st();
      if (!s.next) left.push('while the finger pulls on the short part, no neighbour is drawn');
      if (s.sh > h0 + 1) left.push(`the page grows while the long neighbour is pulled in (${h0} → ${s.sh} px)`);
      await tp('touchEnd', 40 + pull, s.bottom - 20); await sleep(350);
      await io.eval(`(() => { document.querySelector('.g-swipe .tn-seg-btn[data-value="notes"]').click(); scrollTo(0, 0); return null; })()`); await sleep(100);
      // a sideways swipe that starts in the empty room below the short part, near the lower edge of the screen
      await drag(40, y, 200);
      s = await st();
      if (!/^Photos/.test(s.on || '')) left.push(`a swipe in the empty room below the short part (y ${y}) does not switch (shows ${s.on})`);
      if (s.next || s.track) left.push(`after the swipe from the empty room the panes do not rest (neighbour ${s.next}, transform “${s.track}”)`);
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
  { id: 'back-viewer', page: 'gallery', hash: 'table?open=offsite-sync', overlay: 'dialog.tn-viewer[open]', focus: true,
    // the image viewer opened from a detail (a board's photos): one touch first (it adds the missing entries), then the browser's Back closes the
    // viewer only, the next Back the detail, the next one goes to the default view
    open: async (io) => {
      await io.press('dialog.tn-sheet[open] .tn-sheet-title, .tn-inspector:not([hidden]) .tn-sheet-title'); await sleep(60);
      await io.eval(`${MOD}.then((m) => { m.openImageViewer(['./img/photo-1.svg', './img/photo-2.svg'], { index: 1 }); return true; })`);
      await sleep(80);
    },
    assert: async (io) => {
      const left = [], detail = 'dialog.tn-sheet[open], .tn-inspector:not([hidden])';
      await browserBack(io); await io.gone('dialog.tn-viewer[open]', 600);
      if (await io.count('dialog.tn-viewer[open]')) left.push('Back does not close the image viewer');
      if (!(await io.count(detail))) left.push('Back on the image viewer also closed the detail');
      if ((await io.eval('location.hash')) !== '#/table?open=offsite-sync') left.push(`Back on the image viewer changes the hash to ${await io.eval('location.hash')}`);
      await browserBack(io); await io.gone(detail, 600);
      if (await io.count(detail)) left.push('second Back does not close the detail');
      if ((await io.eval('location.hash')) !== '#/table') left.push(`second Back shows ${await io.eval('location.hash')} instead of #/table`);
      await browserBack(io);
      if (!(await io.until(`location.hash === '#/foundations'`, 1000))) left.push(`third Back shows ${await io.eval('location.hash')} instead of the default view`);
      return left;
    } },
  { id: 'image-viewer', page: 'gallery', hash: 'states', overlay: 'dialog.tn-viewer[open]', focus: true,
    open: (io) => io.press('.tn-imgstrip-btn'),
    // a thumbnail opens the viewer at its image; arrow keys page (no wrap, the button at an end is hidden), a swipe pages on touch, Esc closes and
    // gives the focus back to the thumbnail of the image last shown, a tap beside the image closes, a swipe down closes
    assert: async (io) => {
      const left = [];
      const st = () => io.eval(`(() => { const d = document.querySelector('dialog.tn-viewer[open]'); if (!d) return null;
        return { count: d.querySelector('.tn-viewer-count').textContent, src: d.querySelector('.tn-viewer-slide.is-current .tn-viewer-img').getAttribute('src'),
          prev: d.querySelector('.tn-viewer-prev').checkVisibility(), next: d.querySelector('.tn-viewer-next').checkVisibility(), alt: d.querySelector('.tn-viewer-slide.is-current .tn-viewer-img').alt }; })()`);
      let s = await st();
      if (!s || s.count !== '1 / 6' || !/photo-1/.test(s.src)) return [`the first thumbnail opens ${JSON.stringify(s)}`];
      if (s.prev || !s.next) left.push('on the first image the previous button shows or the next button is missing');
      // the whole image is visible below the head (a larger file is scaled down, never cut)
      const fit = await io.eval(`(() => { const d = document.querySelector('dialog.tn-viewer[open]'); const i = d.querySelector('.tn-viewer-slide.is-current .tn-viewer-img').getBoundingClientRect(), hd = d.querySelector('.tn-viewer-head').getBoundingClientRect();
        const vw = document.documentElement.clientWidth, n = d.querySelector('.tn-viewer-next').getBoundingClientRect();   // never under a reserved scrollbar gutter
        return { ok: i.width > 0 && i.top >= hd.bottom - 1 && i.bottom <= innerHeight + 1 && i.left >= -1 && i.right <= vw + 1 && n.right <= vw + 1, r: [i.left, i.top, i.right, i.bottom, n.right, vw].map(Math.round).join(',') }; })()`);
      if (!fit.ok) left.push(`the image does not fit the free area below the head (${fit.r})`);
      if (s.alt !== 'Front view, image 1 of 6') left.push(`image name is “${s.alt}”`);
      // counter, close and paging lie over the picture (a zoomed image reaches under the head): each wears the viewer's own background, opaque –
      // beside an image of another aspect ratio it melts into the margin, over the picture the text stays readable (contrast ≥ 4.5 on that
      // background); targets ≥ 44 px, outside the zooming stage. Paging: a visible circle of about 36 px (the background's content box), 8–14 px
      // from the screen edge
      const chrome = await io.eval(`(() => { const d = document.querySelector('dialog.tn-viewer[open]');
        const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true });
        const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const p = cx.getImageData(0, 0, 1, 1).data; return { r: p[0], g: p[1], b: p[2], a: Math.round(p[3] / 2.55) / 100 }; };   // any CSS colour (oklch too) as sRGB
        const lum = (rgb) => { const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); };
        const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
        const own = rgba(getComputedStyle(d).backgroundColor), vw = Math.min(document.documentElement.clientWidth, d.getBoundingClientRect().right);
        return [['counter', '.tn-viewer-badge'], ['close', '.tn-viewer-x'], ['next', '.tn-viewer-next']].map(([name, sel]) => {
          const el = d.querySelector(sel), s = getComputedStyle(el), bg = rgba(s.backgroundColor), fg = rgba(s.color), r = el.getBoundingClientRect();
          const same = bg.a === 1 && ['r', 'g', 'b'].every((k) => Math.abs(bg[k] - own[k]) <= 1);
          const fgOn = [fg.r, fg.g, fg.b].map((v, i) => v * fg.a + [bg.r, bg.g, bg.b][i] * (1 - fg.a));
          const pad = s.backgroundClip === 'content-box' ? parseFloat(s.paddingRight) || 0 : 0;
          return { name, same, bg: s.backgroundColor, own: getComputedStyle(d).backgroundColor, contrast: Math.round(ratio(fgOn, [bg.r, bg.g, bg.b]) * 100) / 100,
            w: Math.round(r.width), h: Math.round(r.height), circle: Math.round(r.width - 2 * pad), gap: Math.round(vw - (r.right - pad)),
            inStage: !!el.closest('.tn-viewer-stage'), button: el.tagName === 'BUTTON' };
        }); })()`);
      for (const c of chrome) {
        if (!c.same) left.push(`the ${c.name} does not wear the viewer background (${c.bg} on ${c.own})`);
        if (c.contrast < 4.5) left.push(`the ${c.name} is not readable (contrast ${c.contrast} on its background)`);
        if (c.button && (c.w < 44 || c.h < 44)) left.push(`the ${c.name} button is ${c.w}×${c.h} px, below 44 px`);
        if (c.inStage) left.push(`the ${c.name} lies inside the stage and zooms with the picture`);
        if (c.name === 'next' && (c.circle < 34 || c.circle > 38)) left.push(`the paging circle is ${c.circle} px, not about 36 px`);
        if (c.name === 'next' && (c.gap < 8 || c.gap > 14)) left.push(`the paging circle is ${c.gap} px from the screen edge, not 8–14 px`);
      }
      await io.key('ArrowRight', 39); await sleep(40);
      s = await st();
      if (s.count !== '2 / 6' || !/photo-2/.test(s.src)) left.push(`ArrowRight shows ${s.count}`);
      await io.key('End', 35); await sleep(40);
      s = await st();
      if (s.count !== '6 / 6' || s.next || !s.prev) left.push(`End shows ${s.count}, next button ${s.next ? 'visible' : 'hidden'}`);
      await io.key('ArrowRight', 39); await sleep(40);
      if ((await st()).count !== '6 / 6') left.push('ArrowRight on the last image wraps');
      if (io.mobile) {
        const c = await io.eval(`(() => { const r = document.querySelector('dialog.tn-viewer[open] .tn-viewer-stage').getBoundingClientRect(); return { x: Math.round(r.left + r.width * 0.7), y: Math.round(r.top + r.height / 2) }; })()`);
        await io.swipe(c.x, c.y, 160); await sleep(250);
        if ((await st()).count !== '5 / 6') left.push(`a swipe to the right shows ${(await st()).count} instead of 5 / 6`);
      }
      await io.key('Escape'); await io.gone('dialog.tn-viewer[open]', 600);
      if (await io.count('dialog.tn-viewer[open]')) return [...left, 'Esc does not close the viewer'];
      const back = await io.eval(`(() => { const b = [...document.querySelectorAll('.tn-imgstrip-btn')]; return b.indexOf(document.activeElement); })()`);
      if (back !== (io.mobile ? 4 : 5)) left.push(`after Esc the focus is on thumbnail ${back + 1}, not on the image last shown`);
      if ((await io.eval('location.hash')) !== '#/states') left.push(`closing the viewer changed the hash to ${await io.eval('location.hash')}`);
      // a tap beside the image (the stage's left edge, below the head, the image is centred and narrower) closes
      await io.press('.tn-imgstrip-btn', ''); await io.until(`!!document.querySelector('dialog.tn-viewer.is-open')`, 500); await sleep(60);
      const edge = await io.eval(`(() => { return { x: Math.round(innerWidth / 2), y: Math.round(innerHeight - 6), hit: document.elementFromPoint(innerWidth / 2, innerHeight - 6)?.className || '' }; })()`);
      await io.tapAt(edge.x, edge.y); await io.gone('dialog.tn-viewer[open]', 900);   // a single tap waits for a possible second one first
      if (await io.count('dialog.tn-viewer[open]')) left.push(`a tap beside the image (on ${edge.hit}) does not close the viewer`);
      return left;
    } },
  { id: 'image-zoom', page: 'gallery', hash: 'states', overlay: 'dialog.tn-viewer[open]', focus: true,
    open: (io) => io.press('.tn-imgstrip-btn'),
    // the carousel and the zoom, on image 2 of 6 (neighbours on both sides): a double tap steps 1× → 2× → 3.5× → 1× and never closes; on touch
    // the neighbour is loaded and in view while a finger drags; zoomed, a drag pans inside the limits, a drag down does not close, and only a
    // drag beyond the image's edge pages (the new image at 1×); a pinch zooms; zoomed, a fast drag glides on (not with reduced motion) and a new
    // finger holds it; a single tap beside the image closes after the double-tap wait
    assert: async (io) => {
      const left = [];
      const VIEW = 'dialog.tn-viewer[open]';
      const st = () => io.eval(`(() => { const d = document.querySelector('${VIEW}'); if (!d) return null;
        const sl = d.querySelector('.tn-viewer-slide.is-current'), img = sl.querySelector('.tn-viewer-img'), tr = getComputedStyle(img).transform;
        const m = new DOMMatrix(tr === 'none' ? undefined : tr), f = sl.querySelector('.tn-viewer-frame').getBoundingClientRect(), r = img.getBoundingClientRect();
        return { count: d.querySelector('.tn-viewer-count').textContent, s: Math.round(m.a * 100) / 100, tx: Math.round(m.e), ty: Math.round(m.f),
          lx: Math.round(Math.max(0, (m.a * img.offsetWidth - f.width) / 2)), ly: Math.round(Math.max(0, (m.a * img.offsetHeight - f.height) / 2)),
          cx: Math.round(f.left + f.width / 2), cy: Math.round(f.top + f.height / 2), bottom: Math.round(Math.min(innerHeight - 6, r.bottom + (innerHeight - r.bottom) / 2)) }; })()`);
      // the slide after the current one: its image loaded and decoded, and (while a finger drags) partly in view
      const nextSlide = () => io.eval(`(() => { const d = document.querySelector('${VIEW}'); const sl = d.querySelector('.tn-viewer-slide.is-current + .tn-viewer-slide'); if (!sl) return null;
        const img = sl.querySelector('.tn-viewer-img'), r = img.getBoundingClientRect();
        return { ready: img.complete && img.naturalWidth > 0, inView: r.width > 0 && r.left < document.documentElement.clientWidth - 20 && r.right > 0, left: Math.round(r.left) }; })()`);
      const dbl = async (x, y) => { await io.tapAt(x, y); await sleep(60); await io.tapAt(x, y); await sleep(320); };
      const tp = (type, pts) => io.page.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, id) => ({ x: Math.round(p.x), y: Math.round(p.y), id })) });
      // a finger drag in 8 steps; end: false keeps the finger down (for a look during the drag), finish() lifts it
      const drag = async (x, y, dx, dy, end = true) => {
        await tp('touchStart', [{ x, y }]); await sleep(30);
        for (let i = 1; i <= 8; i++) { await tp('touchMove', [{ x: x + (dx * i) / 8, y: y + (dy * i) / 8 }]); await sleep(16); }
        if (end) { await tp('touchEnd', []); await sleep(250); }
      };
      const lift = async () => { await tp('touchEnd', []); await sleep(250); };
      await io.key('ArrowRight', 39); await sleep(250);
      let s = await st();
      if (!s || s.count !== '2 / 6') return [`ArrowRight shows ${JSON.stringify(s)} instead of 2 / 6`];
      const steps = [];
      for (let i = 0; i < 4; i++) { await dbl(s.cx, s.cy); const z = await st(); steps.push(z ? z.s : 'closed'); }
      if (steps.join(' ') !== '2 3.5 1 2') left.push(`double taps step through ${steps.join(' → ')} instead of 2 → 3.5 → 1 → 2`);
      if (!(await io.count(VIEW))) return [...left, 'a double tap closed the viewer'];
      if (io.mobile) {
        // zoomed 2×: a drag down pans (here: nothing to pan vertically) and does not close
        s = await st();
        await drag(s.cx, s.cy, 0, 200);
        let z = await st();
        if (!z) return [...left, 'a drag down on a zoomed image closes the viewer'];
        if (z.s !== 2 || Math.abs(z.ty) > z.ly + 1) left.push(`a drag down at 2× leaves scale ${z.s}, shift ${z.ty} (limit ${z.ly})`);
        // a short drag left pans the image and stays on it (its edge is not reached)
        await drag(s.cx, s.cy, -Math.round(z.lx * 0.6), 0);
        z = await st();
        if (z.count !== '2 / 6') left.push(`a drag inside the zoomed image pages to ${z.count} before its edge`);
        else if (!(z.tx < -5) || Math.abs(z.tx) > z.lx + 1) left.push(`a drag inside the zoomed image shifts it by ${z.tx} (limit ${z.lx})`);
        // a long drag on: the image stops at its edge, the rest pulls the next slide in; on release it pages and the new image is at 1×
        await drag(s.cx, s.cy, -Math.round(z.lx + 200), 0, false);
        const mid = await st(), nb = await nextSlide();
        if (Math.abs(mid.tx + mid.lx) > 1) left.push(`the zoomed image does not stop at its edge (${mid.tx}, limit -${mid.lx})`);
        if (!nb || !nb.ready || !nb.inView) left.push(`dragging beyond the zoomed image's edge does not pull the next image in (${JSON.stringify(nb)})`);
        await lift();
        z = await st();
        if (z.count !== '3 / 6' || z.s !== 1) left.push(`a drag beyond the zoomed image's edge shows ${z.count} at ${z.s}× instead of 3 / 6 at 1×`);
        // at 1×: the neighbour is loaded and slides in with the finger (never black); dragged back, nothing pages
        await drag(z.cx, z.cy, -120, 0, false);
        const nb2 = await nextSlide();
        if (!nb2 || !nb2.ready || !nb2.inView) left.push(`while a finger drags, the next image is not in view or not loaded (${JSON.stringify(nb2)})`);
        await tp('touchMove', [{ x: z.cx, y: z.cy }]); await lift();
        if ((await st()).count !== '3 / 6') left.push('a drag that comes back to its start pages');
        // a pinch from 60 to 220 px apart zooms in about the fingers' centre
        await tp('touchStart', [{ x: z.cx - 30, y: z.cy }, { x: z.cx + 30, y: z.cy }]); await sleep(30);
        for (let i = 1; i <= 8; i++) { const h2 = 30 + (80 * i) / 8; await tp('touchMove', [{ x: z.cx - h2, y: z.cy }, { x: z.cx + h2, y: z.cy }]); await sleep(16); }
        await lift();
        const p = await st();
        if (!p || !(p.s > 2)) left.push(`a pinch to the 3.7-fold distance gives scale ${p && p.s}`);
        // fling: zoomed, a fast drag that is released while moving glides on in its direction and slows down; it never pages; a new finger holds
        // it where it is (and that press does not close); with reduced motion the image stops where the finger lifted
        const fast = async (dx) => {   // 60 px in 6 moves of 8 ms (about 1 px/ms), released at once
          await tp('touchStart', [{ x: p.cx, y: p.cy }]); await sleep(20);
          for (let i = 1; i <= 6; i++) { await tp('touchMove', [{ x: p.cx + (dx * i) / 6, y: p.cy }]); await sleep(8); }
          await tp('touchEnd', []);
        };
        if (p && p.s > 2 && p.lx > 300) {
          let f0 = await st();
          if (f0.count !== '3 / 6') f0 = null;
          if (f0) {
            await fast(-60); await sleep(30);
            const a1 = await st(); await sleep(600);
            const a2 = await st();
            if (a2.count !== f0.count) left.push(`a fling inside the zoomed image pages to ${a2.count}`);
            else if (!(a2.tx < a1.tx - 20)) left.push(`a fast drag on a zoomed image stops where the finger lifts (${a1.tx} → ${a2.tx} px, no glide)`);
            else if (Math.abs(a2.tx) > a2.lx + 1) left.push(`the glide goes beyond the image's edge (${a2.tx}, limit ${a2.lx})`);
            await sleep(1600);
            // a new finger during the glide holds the image
            await fast(60); await sleep(30);
            await tp('touchStart', [{ x: p.cx, y: p.cy }]); await sleep(30);
            const h1 = await st(); await sleep(250);
            const h2 = await st();
            if (Math.abs(h2.tx - h1.tx) > 1) left.push(`a finger on a gliding image does not stop it (${h1.tx} → ${h2.tx} px)`);
            await tp('touchEnd', []); await sleep(450);
            if (!(await io.count(VIEW))) return [...left, 'the finger that stopped a glide closed the viewer'];
            // reduced motion: no glide
            await io.page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }, { name: 'prefers-reduced-motion', value: 'reduce' }] });
            await fast(-60); await sleep(30);
            const r1 = await st(); await sleep(400);
            const r2 = await st();
            await io.page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
            if (Math.abs(r2.tx - r1.tx) > 1) left.push(`with reduced motion a zoomed image still glides (${r1.tx} → ${r2.tx} px)`);
            await sleep(1800);   // a faulty glide is over before the next taps (a press on a gliding image is no tap)
          } else left.push('before the fling check the viewer is not on image 3 / 6');
        } else left.push(`the pinch left no room for a fling check (${JSON.stringify(p)})`);
      }
      // a double tap beside the image zooms there and never closes; a single tap beside it closes, but only after the double-tap wait
      s = await st();
      await dbl(s.cx, s.bottom);
      if (!(await io.count(VIEW))) return [...left, 'a double tap beside the image closes the viewer'];
      await io.key('-'); await sleep(250);   // back to 1× (zoomed on a wide screen the image covers everything: no "beside" left)
      if ((await st()).s !== 1) left.push('the - key does not zoom back to 1×');
      await io.tapAt(s.cx, (await st()).bottom); await sleep(120);
      if (!(await io.count(VIEW))) left.push('a single tap closes before the double-tap wait is over');
      await io.gone(VIEW, 900);
      if (await io.count(VIEW)) left.push('a single tap beside the image does not close the viewer');
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
  { id: 'touch-press', page: 'board', hash: 'jobs', overlay: '.tn-toolbar-title', focus: false, when: (sz) => sz.mobile,
    // round 11 (HL board on a phone): a touch that starts a scroll or a swipe on a row lights nothing up (no .is-down, no :active colour
    // while the finger rests); a real tap (down and up in place) shows a short pressed flash that goes away by itself
    open: (io) => io.until(`!!document.querySelector('[data-key="offsite-sync"]')`, 3000),
    assert: async (io) => {
      const left = [];
      const tp = (type, px, py) => io.page.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: px, y: py, id: 0 }] });
      await io.eval(`(() => { window.__downs = []; new MutationObserver((ms) => { for (const m of ms) if (m.target.classList?.contains('is-down')) window.__downs.push(m.target.tagName); })
        .observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] }); document.querySelector('[data-key="offsite-sync"]').scrollIntoView({ block: 'center', behavior: 'instant' }); return null; })()`);
      const SEL = JSON.stringify('[data-key="offsite-sync"]');
      const look = () => io.eval(`(() => { const r = document.querySelector(${SEL}); const td = r.querySelector('td'); const b = r.getBoundingClientRect();
        return { bg: getComputedStyle(r).backgroundColor + '|' + (td ? getComputedStyle(td).backgroundColor : ''), x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2), down: r.classList.contains('is-down') }; })()`);
      const rest = await look();
      // the thumb rests on the row, then scrolls the page up
      await tp('touchStart', rest.x, rest.y); await sleep(180);
      const held = await look();
      if (held.bg !== rest.bg || held.down) left.push('a finger resting on a row (start of a scroll) already shows the pressed state');
      for (let i = 1; i <= 10; i++) { await tp('touchMove', rest.x, rest.y - 12 * i); await sleep(16); }
      await tp('touchEnd', rest.x, rest.y - 120); await sleep(250);
      // a sideways swipe across the row
      const r2 = await look();
      await tp('touchStart', r2.x, r2.y); await sleep(30);
      for (let i = 1; i <= 10; i++) { await tp('touchMove', r2.x - 14 * i, r2.y); await sleep(16); }
      await tp('touchEnd', r2.x - 140, r2.y); await sleep(250);
      const n = await io.eval('window.__downs.length');
      if (n) left.push(`a scroll or a swipe that started on a row set the pressed state ${n}×`);
      if (await io.eval(`!!document.querySelector('dialog.tn-sheet[open], .tn-inspector:not([hidden])')`)) left.push('a scroll that started on a row opened its detail');
      // a real tap: a short flash, then gone
      const r3 = await look();
      await tp('touchStart', r3.x, r3.y); await sleep(40); await tp('touchEnd', r3.x, r3.y);
      if (!(await io.until('window.__downs.length > 0', 400))) left.push('a real tap on a row shows no pressed flash');
      if (!(await io.until(`!document.querySelector('.is-down')`, 1000))) left.push('the pressed flash after a tap does not go away');
      return left;
    } },
  { id: 'detail-mark-cleared', page: 'board', hash: 'jobs', overlay: '.tn-toolbar-title', focus: false,
    // round 11 (HL board, phone): a row is marked while its detail is open and looks like every other row once the detail is closed, by
    // any path – here the close button and Back, on a phone also after the tap left its (sticky) :hover on the row, beside an inspector
    // also Escape. Checked: no is-selected, no aria-current, the row's colour (row and cell) equals the colour it had before the tap.
    open: (io) => io.until(`!!document.querySelector('[data-key="offsite-sync"]')`, 3000),
    assert: async (io) => {
      const left = [];
      const KEY = JSON.stringify('[data-key="offsite-sync"]');
      const DET = 'dialog.tn-sheet[open], .tn-inspector:not([hidden])';
      const look = () => io.eval(`(() => { const r = document.querySelector(${KEY}); const td = r.querySelector('td');
        return { bg: getComputedStyle(r).backgroundColor + '|' + (td ? getComputedStyle(td).backgroundColor : ''), sel: r.classList.contains('is-selected'), cur: r.hasAttribute('aria-current') }; })()`);
      const rest = await look();
      const inspector = io.size.w >= 1000;
      const closers = [
        ['the close button', () => io.press(`dialog.tn-sheet[open] .tn-sheet-head .tn-iconbtn, .tn-inspector:not([hidden]) .tn-sheet-head .tn-iconbtn`)],
        ['Back', () => io.eval('(history.back(), null)')],
        ...(inspector ? [['Escape', () => io.key('Escape')]] : []),
      ];
      for (const [name, close] of closers) {
        await io.press('[data-key="offsite-sync"]');
        if (!(await io.until(`!!document.querySelector(${JSON.stringify(DET)})`, 2000))) { left.push(`a tap on the row opened no detail (before ${name})`); break; }
        await sleep(200);
        const open = await look();
        if (!open.cur) left.push('the row whose detail is open has no aria-current');
        if (inspector && !open.sel) left.push('the row beside the open inspector is not marked');
        await close();
        await io.gone(DET, 1500); await sleep(250);
        const after = await look();
        if (after.sel || after.cur || after.bg !== rest.bg) left.push(`after closing the detail with ${name} the row stays marked (${[after.sel && 'is-selected', after.cur && 'aria-current', after.bg !== rest.bg && `colour ${after.bg}`].filter(Boolean).join(', ')})`);
      }
      return left;
    } },
  { id: 'media-row', page: 'gallery', hash: 'rows', overlay: '.tn-mrow', focus: false, when: (sz) => sz.mobile,
    // mediaRow() (0.9.3, Markt-Scout listing rows): the whole row is the button, the title takes the full width beside the picture and up to
    // three lines, no chevron and no status dot; the picture keeps its square
    open: (io) => io.eval(`(() => { document.querySelector('.tn-mrow').scrollIntoView({ block: 'center', behavior: 'instant' }); return true; })()`),
    assert: async (io) => {
      const left = [];
      const st = await io.eval(`(() => { const row = document.querySelector('.tn-mrow'), title = row.querySelector('.tn-mrow-title'), main = row.querySelector('.tn-mrow-main');
        const media = row.querySelector('.tn-mrow-media').getBoundingClientRect(), r = row.getBoundingClientRect(), tr = title.getBoundingClientRect(), mr = main.getBoundingClientRect();
        const lh = parseFloat(getComputedStyle(title).lineHeight) || 20;
        return { button: row.tagName === 'BUTTON', chevron: !!row.querySelector('.tn-go'), dot: !!row.querySelector('.tn-row-status'),
          fullWidth: Math.abs(tr.right - mr.right) <= 1 && mr.right >= r.right - 24, lines: Math.round(tr.height / lh), clipped: title.scrollHeight > title.clientHeight + 1,
          square: Math.abs(media.width - media.height) <= 1 && media.width >= 56 }; })()`);
      if (!st.button) left.push('the media row is not a button');
      if (st.chevron || st.dot) left.push('the media row shows a chevron or a status dot');
      if (!st.fullWidth) left.push('the title does not take the full width beside the picture');
      if (st.lines > 3 || (st.clipped && st.lines !== 3)) left.push(`the long title takes ${st.lines} line(s)${st.clipped ? ' and is cut' : ''} (up to 3 lines, then "…", expected)`);
      if (!st.square) left.push('the picture is not a square of at least 56 px');
      return left;
    } },
  { id: 'table-load-more', page: 'gallery', hash: 'table?rows=300', overlay: '.tn-toolbar-title', focus: false,
    // long tables (0.9.2): 50 rows at first, the next 50 come by themselves when the footer scrolls near the visible area; the "Show more"
    // button stays and still works (fallback); at the end the footer disappears
    open: (io) => io.until(`!!document.querySelector('.tn-table-more:not([hidden])')`, 4000),
    assert: async (io) => {
      const left = [];
      const n = () => io.eval(`Math.max(...[...document.querySelectorAll('.tn-table')].map((t) => t.tBodies[0]?.rows.length || 0))`);
      const n0 = await n();
      if (n0 !== 50) left.push(`the table draws ${n0} rows at first (50 expected)`);
      await io.eval(`(() => { document.querySelector('.tn-table-more').scrollIntoView({ block: 'end', behavior: 'instant' }); return null; })()`);
      if (!(await io.until(`Math.max(...[...document.querySelectorAll('.tn-table')].map((t) => t.tBodies[0]?.rows.length || 0)) >= 100`, 2000))) left.push(`scrolling to the end of the table loaded nothing (${await n()} rows)`);
      const n1 = await n();
      await io.press('.tn-table-more .tn-btn');
      await sleep(200);
      if (!((await n()) > n1)) left.push('the "Show more" button no longer adds rows');
      for (let i = 0; i < 10 && (await n()) < 300; i++) {
        await io.eval(`(() => { const m = document.querySelector('.tn-table-more'); if (m && !m.hidden) m.scrollIntoView({ block: 'end', behavior: 'instant' }); return null; })()`);
        await sleep(150);
      }
      if ((await n()) !== 300) left.push(`scrolling down did not reach all rows (${await n()} of 300)`);
      if (!(await io.eval(`!!document.querySelector('.tn-table-more')?.hidden`))) left.push('the footer stays after the last row');
      return left;
    } },
  { id: 'detail-long-title', page: 'board', hash: 'jobs?open=offsite-sync', overlay: 'dialog.tn-sheet[open], .tn-inspector:not([hidden])', focus: false,
    // the title of a detail is always whole (0.9.2, Markt-Scout: long listing titles ended in "…"): it wraps, nothing is cut, the close button
    // keeps its place; also in a sheet opened through openSheet()
    open: (io) => io.until(`!!document.querySelector('dialog.tn-sheet[open] .tn-sheet-title, .tn-inspector:not([hidden]) .tn-sheet-title')`, 3000),
    assert: async (io) => {
      const left = [];
      const LONG = 'Offsite archive sync of the complete photo library and all family videos to the second NAS in the garage, weekly full run with checksum verification';
      const probe = (sel) => io.eval(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null; el.textContent = ${JSON.stringify(LONG)};
        const s = getComputedStyle(el), r = el.getBoundingClientRect(), lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.3;
        const x = el.closest('.tn-sheet-head')?.querySelector('button')?.getBoundingClientRect();
        return { cut: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1 || s.textOverflow === 'ellipsis' || s.whiteSpace === 'nowrap',
          lines: Math.round(r.height / lh), inside: r.right <= innerWidth + 1, xOk: !x || (x.width >= 24 && x.left >= r.right - 1) }; })()`);
      const a = await probe('dialog.tn-sheet[open] .tn-sheet-title, .tn-inspector:not([hidden]) .tn-sheet-title');
      if (!a) return ['no detail title'];
      if (a.cut) left.push('the detail title is cut off instead of wrapping');
      if (a.lines < 2) left.push(`the long detail title takes ${a.lines} line(s)`);
      if (!a.inside || !a.xOk) left.push('the wrapped title pushes the close button away or leaves the screen');
      await io.eval(`(() => { window.tnApp.closeDetail(); return true; })()`); await sleep(300);
      await io.eval(`${MOD}.then((m) => { m.openSheet({ title: 'x', body: ['text'] }); return true; })`); await sleep(400);
      const b = await probe('dialog.tn-sheet[open] .tn-sheet-title');
      if (b && b.cut) left.push('the title of openSheet() is cut off instead of wrapping');
      return left;
    } },
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
  // ---- freshness text (0.8.0): a click opens the source list of the view (every source with age and interval, the note); reload turns visibly
  //      for at least ~0.5 s even when the answer is instant, then the text shows the new age; the view's blocks do not move ----
  { id: 'fresh-sources', page: 'gallery', hash: 'datasources', overlay: '.tn-pop', focus: true, steady: true,
    open: async (io) => { await io.until(`!!document.querySelector('[aria-label^="Busy CPU"]')`, 3000); await io.press('.tn-fresh'); },
    assert: async (io) => {
      const left = [];
      const rows = await io.eval(`[...document.querySelectorAll('.tn-pop-src')].map((r) => r.textContent)`);
      if (rows.length < 3) left.push(`the source list shows ${rows.length} sources (app, metrics, snapshot expected)`);
      if (!rows.some((r) => /Snapshot/.test(r) && /collector/.test(r))) left.push('the snapshot source shows neither its label nor its note');
      if (!rows.every((r) => /every /.test(r))) left.push('a source in the list has no refresh interval');
      await io.eval(`(() => { window.__rl = []; const b = document.querySelector('.tn-pop-reload'); const rec = () => window.__rl.push([performance.now(), b.classList.contains('is-busy'), !!b.querySelector('svg.tn-spin')]);
        new MutationObserver(rec).observe(b, { subtree: true, attributes: true }); return true; })()`);
      await io.press('.tn-pop-reload');
      const done = await io.until(`!document.querySelector('.tn-pop-reload')?.classList.contains('is-busy')`, 4000);
      const rl = await io.eval(`window.__rl`);
      const on = rl.find((r) => r[1]), off = rl.findLast((r) => !r[1]);
      if (!on) left.push('the reload button shows no busy state');
      else if (!on[2]) left.push('the reload icon does not turn while the reload runs');
      if (!done) left.push('the reload button stays busy for more than 4 s');
      else if (on && off && off[0] - on[0] < 450) left.push(`the reload was visible for ${Math.round(off[0] - on[0])} ms only (≥ 500 ms expected)`);
      if (!(await io.count('.tn-pop'))) left.push('the source list closed on reload');
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

  { id: 'param-stale-open', page: 'board', hash: 'history', overlay: '.tn-seg', focus: false,
    // a view drawn while a detail is open (new data: refresh()) and a switch that keeps the other parameters (go(view, { params: { ...ctx.params,
    // x } })): after the detail is closed, the switch must not open it again – ctx.params never holds `open` (0.9.1, Markt-Scout: swiping to the
    // next tab after closing a listing reopened it). go() also drops an `open` handed in through params.
    open: (io) => io.until(`!!document.querySelector('.tn-seg-btn[data-value="48h"]')`, 3000),
    assert: async (io) => {
      const left = [];
      const shown = `!!document.querySelector('dialog.tn-sheet[open], .tn-inspector:not([hidden])')`;
      await io.eval(`(() => { window.tnApp.open('offsite-sync'); return true; })()`);
      if (!(await io.until(shown, 2000))) return ['the detail did not open'];
      await io.eval(`(() => { window.tnApp.refresh(); return true; })()`); await sleep(150);   // the view is drawn anew while the detail is open
      await io.eval(`(() => { window.tnApp.closeDetail(); return true; })()`);
      if (!(await io.until(`!(${shown})`, 2000))) left.push('the detail did not close');
      await sleep(300);
      await io.press('.tn-seg-btn[data-value="48h"]');
      await sleep(400);
      const st = await io.eval(`({ hash: location.hash, open: ${shown}, id: window.tnApp.openId })`);
      if (!/[?&]cpu=48h\b/.test(st.hash)) left.push(`the switch did not take (hash ${st.hash})`);
      if (st.open || st.id || /[?&]open=/.test(st.hash)) left.push(`the switch after closing the detail opened it again (hash ${st.hash}, open ${st.id})`);
      await io.eval(`(() => { window.tnApp.go('history', { params: { cpu: '24h', open: 'offsite-sync' } }); return true; })()`); await sleep(400);
      if (await io.eval(`${shown} || !!window.tnApp.openId`)) left.push('go() opened a detail handed in through params (only `open` opens one)');
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

  { id: 'detail-current-row', page: 'board', hash: 'overview', overlay: 'dialog.tn-sheet[open], .tn-inspector:not([hidden])', focus: false,
    // aria-current marks the row whose detail is open and no other – also when opening or switching the detail draws nothing anew (0.15.0: it was
    // set only by drawing, so it depended on data arriving afterwards and stayed on the row of the detail opened before)
    open: (io) => io.press('.tn-row-btn[data-key]'),
    assert: async (io) => {
      const left = [];
      await sleep(150);
      const st = () => io.eval(`(() => { const open = new URLSearchParams(location.hash.split('?')[1] || '').get('open');
        const cur = [...document.querySelectorAll('.tn-content [data-key][aria-current]')].map((e) => e.dataset.key);
        const keys = [...new Set([...document.querySelectorAll('.tn-content .tn-row-btn[data-key]')].map((e) => e.dataset.key))];
        return { open, cur, keys }; })()`);
      let s = await st();
      if (!s.open) return ['tapping a row opened no detail'];
      if (s.cur.length !== 1 || s.cur[0] !== s.open) left.push(`after opening ${s.open}, aria-current is on [${s.cur.join(', ')}] (exactly the open row expected)`);
      const other = s.keys.find((k) => k !== s.open);
      if (!other) return left;
      const was = s.open;
      await io.eval(`(() => { location.hash = location.hash.replace(/open=[^&]*/, 'open=' + encodeURIComponent(${JSON.stringify(other)})); return null; })()`);
      await sleep(250);
      s = await st();
      if (s.open !== other) return [...left, `switching the detail by address shows ${s.open} instead of ${other}`];
      if (s.cur.includes(was)) left.push(`after switching to ${other}, the row of ${was} still carries aria-current`);
      if (!s.cur.includes(other)) left.push(`after switching to ${other}, its row does not carry aria-current`);
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
    // a scenario script that reaches for an element the page does not have (a mutant removed it, the gallery moved it) reports it as missing
    // instead of aborting the whole measurement
    eval: (js) => evaluate(page, js).catch((e) => { if (/Cannot read properties of (null|undefined)/.test(e.message)) e.missing = true; throw e; }),
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
  if (sc.assert) {
    try { for (const text of await sc.assert(io, size)) add('overlay-behaviour', text); }
    catch (e) { if (!e.missing) throw e; add('overlay-missing', e.message); }
  }
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
