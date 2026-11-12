// @ts-check
// dashkit · Overlay layer for menu, toast, tooltip and data card.
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
 * Position of a card/tooltip at the anchor: above, centered, kept inside the viewport; below if there is no room.
 * @param {HTMLElement} el
 * @param {DOMRect} anchorRect
 * @param {number} [gap]
 */
export function placeAbove(el, anchorRect, gap = 6) {
  const vw = document.documentElement.clientWidth;
  const tw = el.offsetWidth, th = el.offsetHeight;
  let x = anchorRect.left + anchorRect.width / 2 - tw / 2;
  let y = anchorRect.top - th - gap;
  if (y < 4) y = anchorRect.bottom + gap;
  x = Math.max(4, Math.min(vw - tw - 4, x));
  el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}
