// @ts-check
// dashkit · shared chart frame: width via ResizeObserver, tooltip, legend, color classes.
import { h, s } from '../dom.js';

/** @typedef {import('../dom.js').Child} Child */
/** @typedef {{ el: HTMLElement, plot: HTMLElement, tip: HTMLElement, redraw: () => void }} ChartFrame */
/** @typedef {{ label: string, color?: string }} LegendEntry */

/** Allowed color names (tokens): accents and status. Series without a color get PALETTE[i]. */
export const PALETTE = ['blue', 'green', 'orange', 'purple', 'pink', 'graphite'];
export const COLORS = new Set([...PALETTE, 'ok', 'warn', 'bad', 'unknown', 'pending', 'info']);
/**
 * @param {string | undefined} c
 * @param {number} [i]
 */
export const colorClass = (c, i = 0) => `dk-c-${c && COLORS.has(c) ? c : PALETTE[i % PALETTE.length]}`;

/**
 * Frame that redraws when the width changes. draw(width) → SVG/Node. Returns { el, tip, redraw }.
 * Draws only when the (rounded) width changed, batched via requestAnimationFrame.
 * @param {{ className?: string, label?: string, height?: number, draw: (width: number) => Node }} o
 * @returns {ChartFrame}
 */
export function chartFrame({ className, label, height, draw }) {
  const tip = h('div', { class: 'dk-chart-tip', 'aria-hidden': 'true', hidden: true });
  const plot = h('div', { class: 'dk-chart-plot', style: height ? { height: `${height}px` } : null });
  const el = h('div', { class: `dk-chart ${className || ''}`.trim(), role: 'img', 'aria-label': label || null }, plot, tip);
  let w = 0, raf = 0;
  /** @param {boolean} [force] */
  const redraw = (force) => {
    const nw = Math.round(plot.clientWidth);
    if (!nw || (nw === w && !force)) return;
    w = nw; tip.hidden = true;
    plot.replaceChildren(draw(w));
  };
  const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => redraw()); });
  ro.observe(plot);
  return { el, plot, tip, redraw: () => redraw(true) };
}

/**
 * Show the tooltip in the frame at x/y (px relative to the plot); stays within the width.
 * @param {ChartFrame} frame
 * @param {number} x
 * @param {number} y
 * @param {Child} content
 */
export function showTip(frame, x, y, content) {
  const { tip, plot } = frame;
  tip.replaceChildren(...[content].flat().filter(Boolean));
  tip.hidden = false;
  const pw = plot.clientWidth, tw = tip.offsetWidth;
  const left = Math.max(0, Math.min(pw - tw, x - tw / 2));
  tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(Math.max(0, y - tip.offsetHeight - 8))}px)`;
}
/**
 * @param {ChartFrame} frame
 */
export const hideTip = (frame) => { frame.tip.hidden = true; };

/**
 * Tooltip row: color dot, name, value.
 * @param {string | undefined} color
 * @param {Child} name
 * @param {Child} value
 * @param {number} [i]
 * @returns {HTMLElement}
 */
export function tipRow(color, name, value, i) {
  return h('div', { class: 'dk-tip-row' }, h('span', { class: `dk-tip-sw ${colorClass(color, i)}` }), h('span', { class: 'dk-tip-name' }, name), h('span', { class: 'dk-tip-val dk-num' }, value));
}

/**
 * Legend below the chart.
 * @param {LegendEntry[] | null | undefined} series
 * @returns {HTMLElement | null}
 */
export function legend(series) {
  if (!series || series.length < 2) return null;
  return h('div', { class: 'dk-legend' }, series.map((r, i) => h('span', { class: 'dk-legend-item' }, h('span', { class: `dk-tip-sw ${colorClass(r.color, i)}` }), r.label)));
}

/**
 * @param {number} w
 * @param {number} hgt
 * @param {...Child} kids
 * @returns {SVGElement}
 */
export const svg = (w, hgt, ...kids) => s('svg', { width: w, height: hgt, viewBox: `0 0 ${w} ${hgt}`, class: 'dk-svg', 'aria-hidden': 'true' }, ...kids);

/**
 * Pointer scrubbing: calls onMove(xPx, yPx) (relative to the SVG) / onEnd(). Mouse: moving shows, leaving closes.
 * Touch: tap shows, dragging horizontally scrubs (vertical scrolls); the display stays after release
 * until tapping elsewhere or scrolling.
 * @param {Element} target
 * @param {{ onMove: (x: number, y: number) => void, onEnd: () => void }} o
 */
export function scrub(target, { onMove, onEnd }) {
  /** @type {(() => void) | null} */
  let off = null;
  const ref = () => /** @type {SVGElement} */ (target).ownerSVGElement || target;
  /** @param {MouseEvent} e */
  const pos = (e) => { const r = ref().getBoundingClientRect(); return /** @type {[number, number]} */ ([e.clientX - r.left, e.clientY - r.top]); };
  const disarm = () => off?.();
  const arm = () => {
    disarm();
    /** @param {Event} e */
    const away = (e) => { if (e.type === 'pointerdown' && e.target === target) return; disarm(); onEnd(); };
    document.addEventListener('pointerdown', away, true); window.addEventListener('scroll', away, true);
    off = () => { document.removeEventListener('pointerdown', away, true); window.removeEventListener('scroll', away, true); off = null; };
  };
  target.addEventListener('pointerdown', (e) => { disarm(); onMove(...pos(/** @type {PointerEvent} */ (e))); });
  target.addEventListener('pointermove', (ev) => { const e = /** @type {PointerEvent} */ (ev); if (e.pointerType === 'mouse' || e.buttons || e.pressure) onMove(...pos(e)); });
  target.addEventListener('pointerleave', (e) => { if (/** @type {PointerEvent} */ (e).pointerType === 'mouse') onEnd(); });
  target.addEventListener('pointerup', (e) => { if (/** @type {PointerEvent} */ (e).pointerType !== 'mouse') arm(); });
  target.addEventListener('pointercancel', () => { disarm(); onEnd(); });
}
