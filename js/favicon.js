// @ts-check
// dashkit · favicon({ icon, color }): board icon without an image file.
// Draws a rounded square in card gray with a hairline border and a single-color kit symbol (icon()) inside, in the
// board's accent color as an SVG data URL and sets it as <link rel="icon">. CSP-friendly (img-src data:), no build.
// Colors are resolved from the tokens at call time (system light/dark); when the
// system scheme changes it is redrawn. Anyone with their own file links it instead via <link rel="icon">
// (see example/favicon.svg as a template).
import { iconParts } from './icons.js';

/** @typedef {{ icon?: string, color?: string }} FaviconOptions icon: a name from icon(); color: token name (blue, green, accent, …) or a CSS colour. */

const SAFE = /^[\w\s.,%()/#+-]+$/;

/**
 * Token or CSS color → resolved (computed) color. name: 'blue' | 'accent' | … | any CSS color.
 * @param {string} value
 * @param {string} fallback
 * @returns {string}
 */
function resolve(value, fallback) {
  const probe = document.createElement('span');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none';
  probe.style.color = /^[a-z]+$/.test(value) && value !== 'transparent' ? `var(--dk-${value}, ${value})` : value;
  document.body.append(probe);
  const c = getComputedStyle(probe).color;
  probe.remove();
  return SAFE.test(c) ? c : fallback;
}

/**
 * SVG text of the board icon (32×32). Pure function of the resolved colors, testable in Node.
 * @param {{ icon?: string, color?: string, card?: string, line?: string }} [o]
 * @returns {string}
 */
export function faviconSvg({ icon = 'grid', color = '#4a82f5', card = '#2a2b30', line = '#4a4b52' } = {}) {
  const ok = (v, d) => (SAFE.test(v) ? v : d); // color characters only, never markup
  color = ok(color, '#4a82f5'); card = ok(card, '#2a2b30'); line = ok(line, '#4a4b52');
  const shapes = iconParts(icon) || iconParts('grid') || [];
  const attr = (v) => String(v).replace(/[^\w\s.,#%+-]/g, '');
  const glyph = shapes.map(([tag, a]) => `<${tag} ${Object.entries(a).map(([k, v]) => `${k}="${attr(v)}"`).join(' ')}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">`
    + `<rect x=".5" y=".5" width="31" height="31" rx="7" fill="${card}" stroke="${line}"/>`
    + `<g transform="translate(6 6) scale(.8333)" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph}</g></svg>`;
}

/**
 * Data URL of the board icon { icon, color } (colors resolved now). Also for icons in the header and the board switcher: one way for everything.
 * @param {FaviconOptions} [o]
 * @returns {string}
 */
export function faviconHref({ icon = 'grid', color = 'accent' } = {}) {
  const svg = faviconSvg({ icon, color: resolve(color, '#4a82f5'), card: resolve('card', '#2a2b30'), line: resolve('border', '#4a4b52') });
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** @type {MediaQueryList | null} */
let mq = null;
/**
 * Sets the page icon. favicon({ icon = 'grid', color = 'accent' }) → data URL.
 * icon: name from icon() (ICON_NAMES); color: token name (blue, green, orange, purple, pink, accent …) or CSS color.
 * @param {FaviconOptions} [o]
 * @returns {string}
 */
export function favicon({ icon = 'grid', color = 'accent' } = {}) {
  const draw = () => {
    const href = faviconHref({ icon, color });
    let link = /** @type {HTMLLinkElement | null} */ (document.head.querySelector('link[rel~="icon"]'));
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.append(link); }
    link.type = 'image/svg+xml';
    link.href = href;
    return href;
  };
  const href = draw();
  if (!mq && window.matchMedia) { const m = mq = window.matchMedia('(prefers-color-scheme: dark)'); m.addEventListener('change', () => draw()); }
  return href;
}
