// @ts-check
// tarn · Overlay layer for menu, toast, tooltip and data card.
//
// Problem: A modal sheet (dialog.showModal) sits in the top layer and makes everything outside inert. A menu attached to
// <body> would lie underneath and be unusable; inside the transformed sheet, position: fixed would also
// be relative to the sheet instead of the viewport.
// Solution: overlays are attached to the topmost open modal dialog (otherwise to body) and are lifted into the
// top layer themselves via the Popover API (popover="manual"). That puts them above the sheet, not inert, and
// relative to the viewport. Without the Popover API it stays with position: fixed on the host.
const POPOVER = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;

/**
 * Topmost open modal dialog, otherwise document.body.
 * @returns {HTMLElement}
 */
export function overlayHost() {
  const open = document.querySelectorAll('dialog[open]:modal');
  return /** @type {HTMLElement} */ (open[open.length - 1] || document.body);
}

/**
 * Show an overlay: attach it to the host (if needed) and lift it into the top layer. Takes effect in the same frame.
 * @param {HTMLElement} el
 * @param {HTMLElement} [host]
 */
export function showOverlay(el, host = overlayHost()) {
  if (el.parentNode !== host) host.append(el);
  el.hidden = false;
  if (!POPOVER) return el;
  if (!el.hasAttribute('popover')) el.setAttribute('popover', 'manual');
  if (!el.matches(':popover-open')) el.showPopover();
  return el;
}

/**
 * Hide an overlay (stays in the DOM).
 * @param {HTMLElement} el
 */
export function hideOverlay(el) {
  if (POPOVER && el.matches(':popover-open')) el.hidePopover();
  el.hidden = true;
  return el;
}

/**
 * Remove an overlay.
 * @param {HTMLElement} el
 */
export function removeOverlay(el) {
  if (POPOVER && el.isConnected && el.matches(':popover-open')) el.hidePopover();
  el.remove();
}

/**
 * Width of the box overlays are kept inside: the viewport without the scrollbar and without a reserved scrollbar gutter. `html {
 * scrollbar-gutter: stable }` (css/base.css) reserves the gutter while the page does not scroll; documentElement.clientWidth then still counts it,
 * the page is laid out without it and the gutter paints over whatever reaches into it. The root's own box is the laid-out width.
 * @returns {number}
 */
export function viewWidth() {
  const d = document.documentElement, w = d.getBoundingClientRect().width;
  return w > 0 ? Math.min(d.clientWidth, Math.floor(w)) : d.clientWidth;
}

/** @typedef {{ side?: 'below' | 'above', align?: 'start' | 'center' | 'end', gap?: number, fit?: 'flip' | 'clamp' }} PlaceOptions */
/**
 * The one placement of every anchored overlay (tooltip, data card, menu, info popover, combobox list, board switcher): at the anchor, kept 4 px
 * inside viewWidth() and the viewport height. side 'below' (default) flips above when there is no room below and room above (fit 'flip') or is
 * pushed up into the viewport (fit 'clamp'); side 'above' goes below when there is no room above.
 * @param {HTMLElement} el
 * @param {DOMRect} r anchor rect
 * @param {PlaceOptions} [o]
 */
export function placeOverlay(el, r, { side = 'below', align = 'start', gap = 4, fit = 'flip' } = {}) {
  const vw = viewWidth(), vh = window.innerHeight;
  const w = el.offsetWidth, ht = el.offsetHeight;
  let x = align === 'center' ? r.left + r.width / 2 - w / 2 : align === 'end' ? r.right - w : r.left;
  x = Math.max(4, Math.min(vw - w - 4, x));
  let y;
  if (side === 'above') { y = r.top - ht - gap; if (y < 4) y = r.bottom + gap; }
  else {
    y = r.bottom + gap;
    if (y + ht > vh - 4) { if (fit === 'clamp') y = Math.max(4, vh - 4 - ht); else if (r.top - ht - gap > 4) y = r.top - ht - gap; }
  }
  el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

/**
 * Position of a card/tooltip at the anchor: above, centered, kept inside the viewport; below if there is no room.
 * @param {HTMLElement} el
 * @param {DOMRect} anchorRect
 * @param {number} [gap]
 */
export function placeAbove(el, anchorRect, gap = 6) { placeOverlay(el, anchorRect, { side: 'above', align: 'center', gap }); }
