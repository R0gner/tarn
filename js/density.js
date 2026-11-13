// @ts-check
// tarn · density: "compact" (default, the ops-console look) or "comfortable" (car touchscreen: larger type, more space,
// every interactive element ≥ 48 px, higher contrast). Only an attribute on <html>; the values live in css/tokens.css.
// The choice is stored as 'tn-density'; css/tokens.css and js/theme-init.js (classic script, before first paint) apply it.
export const DENSITIES = ['compact', 'comfortable'];
const KEY = 'tn-density';

/** @returns {'compact' | 'comfortable'} the density in effect on this page */
export function getDensity() {
  return document.documentElement.getAttribute('data-density') === 'comfortable' ? 'comfortable' : 'compact';
}

/**
 * Set the density of the page. { persist: true } also stores the choice (read again by theme-init.js on the next load).
 * @param {'compact' | 'comfortable'} density
 * @param {{ persist?: boolean }} [o]
 */
export function setDensity(density, { persist = false } = {}) {
  if (!DENSITIES.includes(density)) throw new Error(`unknown density ${density} (${DENSITIES.join(' | ')})`);
  if (density === 'comfortable') document.documentElement.setAttribute('data-density', 'comfortable');
  else document.documentElement.removeAttribute('data-density');
  if (persist) { try { density === 'comfortable' ? localStorage.setItem(KEY, density) : localStorage.removeItem(KEY); } catch { /* storage blocked */ } }
}

/**
 * Call `fn(density)` whenever the density of the page changes, whoever changes it (setDensity(), a board, the verify tools): an observer on <html>, no polling.
 * @param {(density: 'compact' | 'comfortable') => void} fn
 * @returns {() => void} stop watching
 */
export function watchDensity(fn) {
  const mo = new MutationObserver(() => fn(getDensity()));
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-density'] });
  return () => mo.disconnect();
}
