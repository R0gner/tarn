// @ts-check
// tarn · viewport check ("Messanzeige"): a small live overlay for a page that scrolls although its content fits (round 11b, HL board as an
// installed PWA on Android). Only with `?tn-debug=viewport` in the address (createApp starts it); without the parameter nothing is created.
// Shows innerHeight, visualViewport, documentElement client/scroll height, body/.tn-app heights, the measured 100vh/dvh/svh/lvh, the display
// mode, the safe-area insets, the scroll position, the three elements that reach furthest below the viewport and every scroll container that
// scrolls. Updates on resize, scroll and visualViewport changes; ✕ closes it until the next load. Technical names are not translated.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t } from './i18n.js';

const UNITS = ['vh', 'dvh', 'svh', 'lvh'];
const MODES = ['fullscreen', 'standalone', 'minimal-ui', 'browser'];

/** @param {Element} el */
function path(el) {
  const parts = [];
  for (let e = /** @type {Element | null} */ (el); e && e !== document.documentElement && parts.length < 3; e = e.parentElement) {
    const c = [...e.classList].filter((x) => x.startsWith('tn-')).slice(0, 2).join('.');
    parts.unshift(e.tagName.toLowerCase() + (c ? `.${c}` : ''));
  }
  return parts.join(' > ');
}
const px = (/** @type {number} */ n) => `${Math.round(n * 10) / 10}`;

/** Whether the address asks for the overlay (`?tn-debug=viewport`, also in the hash part). @param {string} [href] */
export function wantsViewportDebug(href = location.href) {
  const u = new URL(href);
  const hq = u.hash.includes('?') ? new URLSearchParams(u.hash.slice(u.hash.indexOf('?') + 1)) : null;
  return (u.searchParams.get('tn-debug') || hq?.get('tn-debug') || '').split(',').includes('viewport');
}

/** Starts the overlay (once). @returns {() => void} closes it */
export function viewportDebug() {
  const probes = h('div', { class: 'tn-vpdbg-probes', 'aria-hidden': 'true' },
    UNITS.map((u) => h('div', { class: 'tn-vpdbg-probe', 'data-u': u })), h('div', { class: 'tn-vpdbg-probe tn-vpdbg-safe' }));
  const out = h('pre', { class: 'tn-vpdbg-out' });
  const close = h('button', { class: 'tn-vpdbg-x', type: 'button', 'aria-label': t('common.close'), onclick: () => stop() }, icon('x', { size: 14 }));
  const box = h('div', { class: 'tn-vpdbg', role: 'status' }, close, out);
  document.body.append(probes, box);
  let frame = 0;
  const own = (/** @type {Element} */ e) => box.contains(e) || probes.contains(e);
  function measure() {
    frame = 0;
    const de = document.documentElement, b = document.body, app = document.querySelector('.tn-app');
    const vv = window.visualViewport;
    const unit = Object.fromEntries(UNITS.map((u) => [u, /** @type {HTMLElement} */ (probes.querySelector(`[data-u="${u}"]`)).getBoundingClientRect().height]));
    const sa = getComputedStyle(/** @type {Element} */ (probes.querySelector('.tn-vpdbg-safe')));
    const mode = MODES.find((m) => matchMedia(`(display-mode: ${m})`).matches) || '?';
    const vh = de.clientHeight;
    /* what reaches below the viewport bottom (page coordinates), deepest first; fixed elements and the overlay itself do not count */
    const below = [];
    for (const el of [document.body, ...document.body.querySelectorAll('*')]) {
      if (own(el)) continue;
      const r = el.getBoundingClientRect();
      if (!r.height && !r.width) continue;
      const bottom = r.bottom + scrollY;
      if (bottom <= vh + 0.5) continue;
      if (getComputedStyle(el).position === 'fixed') continue;
      below.push({ el, bottom });
    }
    below.sort((a, c) => c.bottom - a.bottom);
    const scrollers = [];
    for (const el of [de, ...document.body.querySelectorAll('*')]) {
      if (own(el) || el.scrollHeight <= el.clientHeight + 1) continue;
      const oy = getComputedStyle(el).overflowY;
      if (el !== de && el !== b && !/(auto|scroll)/.test(oy)) continue;
      scrollers.push(`${el === de ? 'html' : path(el)} ${el.scrollHeight}/${el.clientHeight}`);
    }
    const lines = [
      `mode ${mode} · inner ${innerWidth}×${innerHeight}`,
      `visual ${vv ? `${px(vv.height)} @${px(vv.offsetTop)} page ${px(vv.pageTop)} ×${px(vv.scale)}` : '–'}`,
      `html client ${de.clientHeight} scroll ${de.scrollHeight}`,
      `body ${px(b.getBoundingClientRect().height)} · app ${app ? px(app.getBoundingClientRect().height) : '–'}`,
      `100vh ${px(unit.vh)} dvh ${px(unit.dvh)} svh ${px(unit.svh)} lvh ${px(unit.lvh)}`,
      `safe t ${sa.paddingTop} r ${sa.paddingRight} b ${sa.paddingBottom} l ${sa.paddingLeft}`,
      `scrollY ${px(scrollY)} of ${Math.max(0, de.scrollHeight - de.clientHeight)}`,
      'below:',
      ...(below.length ? below.slice(0, 3).map((x) => `  +${px(x.bottom - vh)} ${path(x.el)}`) : ['  –']),
      'scrolls:',
      ...(scrollers.length ? scrollers.slice(0, 4).map((s) => `  ${s}`) : ['  –']),
    ];
    out.textContent = lines.join('\n');
  }
  const later = () => { if (!frame) frame = requestAnimationFrame(measure); };
  const targets = [window, window.visualViewport].filter(Boolean);
  for (const t of targets) { t?.addEventListener('resize', later); t?.addEventListener('scroll', later); }
  const mo = new MutationObserver((ms) => { if (ms.some((m) => !own(/** @type {Element} */ (m.target)))) later(); });
  mo.observe(document.body, { childList: true, subtree: true });
  later();
  function stop() {
    for (const t of targets) { t?.removeEventListener('resize', later); t?.removeEventListener('scroll', later); }
    mo.disconnect(); cancelAnimationFrame(frame);
    box.remove(); probes.remove();
  }
  return stop;
}
