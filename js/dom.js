// @ts-check
// tarn · DOM helpers. No dependencies, CSP-friendly (no innerHTML, no style attribute).

/** @typedef {Node | string | number | boolean | null | undefined | any[]} Child Anything h() accepts as a child; null, undefined and booleans are ignored. */
/** @typedef {Record<string, any>} Attrs Attributes and `on*` listeners for h(); `style` and `dataset` take objects, `class` a string or an array for cls(). */

/**
 * h('div', { class: 'x', onclick: fn, dataset: { id: 1 }, style: { '--w': '20%' } }, child, [children], 'text')
 * - Attributes with null/undefined/false are omitted, true sets an empty attribute.
 * - on* functions are bound as listeners.
 * - style only as an object (CSSOM, CSP-allowed); custom properties with a leading '--'.
 * - Children: Node, string/number, arrays (nested arbitrarily); null/false are ignored.
 *
 * Typing: a known tag name returns its element type (h('input') is an HTMLInputElement), anything else an HTMLElement.
 * @typedef {{
 *   <K extends keyof HTMLElementTagNameMap>(tag: K, attrs?: Attrs | null, ...kids: Child[]): HTMLElementTagNameMap[K];
 *   (tag: string | HTMLElement, attrs?: Attrs | null, ...kids: Child[]): HTMLElement;
 * }} HFn
 */
/** @type {HFn} */
export const h = (tag, attrs, ...kids) => {
  const el = typeof tag === 'string' ? document.createElement(tag) : tag;
  if (attrs) setAttrs(el, attrs);
  append(el, kids);
  return /** @type {any} */ (el); // overloaded signature (HFn): the implementation is checked loosely by design
};

const SVG_NS = 'http://www.w3.org/2000/svg';
/**
 * SVG element (namespace set), same attribute rules as h().
 * @param {string} tag
 * @param {Attrs | null} [attrs]
 * @param {...Child} kids
 * @returns {SVGElement}
 */
export function s(tag, attrs, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  if (attrs) setAttrs(el, attrs);
  append(el, kids);
  return el;
}

/** @param {Element} el @param {Attrs} attrs */
function setAttrs(el, attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [p, val] of Object.entries(v)) if (val != null) /** @type {HTMLElement} */ (el).style.setProperty(p.startsWith('--') ? p : kebab(p), String(val));
    } else if (k === 'dataset') Object.assign(/** @type {HTMLElement} */ (el).dataset, v);
    else if (k === 'class' && Array.isArray(v)) el.setAttribute('class', cls(...v));
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

/**
 * Append children (nested arrays allowed) to an element.
 * @template {Element | DocumentFragment} T
 * @param {T} el
 * @param {Child[]} kids
 * @returns {T}
 */
export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false || k === true) continue;
    el.append(k instanceof Node ? k : String(k));
  }
  return el;
}

/**
 * Compose classes: cls('a', cond && 'b', { c: true })
 * @param {...(string | false | null | undefined | 0 | Record<string, any> | any[])} parts
 * @returns {string}
 */
export function cls(...parts) {
  const out = [];
  for (const p of parts.flat()) {
    if (!p) continue;
    if (typeof p === 'object') { for (const [k, v] of Object.entries(p)) if (v) out.push(k); }
    else out.push(p);
  }
  return out.join(' ');
}

/** @param {string} x */
const kebab = (x) => x.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());

/** First element matching a selector. @param {string} sel @param {ParentNode} [root] @returns {HTMLElement | null} */
export const $ = (sel, root = document) => root.querySelector(sel);
/** All elements matching a selector. @param {string} sel @param {ParentNode} [root] @returns {HTMLElement[]} */
export const $$ = (sel, root = document) => [.../** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(sel))];

/**
 * Replace children (arrays/strings as with h).
 * @template {Element} T
 * @param {T} el
 * @param {...Child} kids
 * @returns {T}
 */
export function mount(el, ...kids) {
  el.replaceChildren();
  return append(el, kids);
}

/**
 * Duration of a token (e.g. '--tn-t-close') in ms. JS timers for transitions read their duration here, not as a literal.
 * @param {string} name
 * @returns {number}
 */
export function tokenMs(name) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v.endsWith('ms') ? parseFloat(v) : v.endsWith('s') ? parseFloat(v) * 1000 : parseFloat(v) || 0;
}

let uid = 0;
/** Unique element id with a prefix. @param {string} [p] */
export const nextId = (p = 'tn') => `${p}-${++uid}`;
