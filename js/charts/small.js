// @ts-check
// tarn · small charts: sparkline, donut/ring, heatmap row (runs ok/fail as small boxes).
import { h, s } from '../dom.js';
import { fmtNum, fmtPct, fmtWhen } from '../format.js';
import { STATUS_TEXT } from '../primitives.js';
import { linear, extent, linePath, areaPath, arcPath } from './scale.js';
import { chartFrame, colorClass, svg, tipRow } from './base.js';
import { dataCard } from '../datacard.js';
import { t } from '../i18n.js';

/** @typedef {import('../dom.js').Child} Child */
/** @typedef {{ values?: Array<number | null | undefined>, color?: string, height?: number, width?: number, area?: boolean, last?: boolean, label?: string, min?: number, max?: number }} SparklineOptions Without width the sparkline fills its container. */
/** @typedef {{ label: string, value: number, color?: string, status?: string }} DonutSegment */
/** @typedef {{ segments?: DonutSegment[], value?: number, max?: number, color?: string, size?: number, thickness?: number, center?: Child, sub?: Child, legend?: boolean, label?: string, ariaLabel?: string }} DonutOptions */
/** @typedef {{ status: string, t?: number | null, label?: string, id?: string }} HeatItem One run in a heat row (status: ok, bad, …). */
/** @typedef {{ items?: HeatItem[], max?: number, onItem?: (item: HeatItem) => void, label?: string, size?: 'lg' }} HeatRowOptions */

/**
 * sparkline({ values, color = 'blue', height = 24, width?, area = true, last = true, label? })
 * Without width it fills the container (e.g. in statTile or metricRow). No axes, no tooltip.
 * @param {SparklineOptions} [o]
 * @returns {HTMLElement}
 */
export function sparkline({ values = [], color = 'blue', height = 24, width, area = true, last = true, label, min, max } = {}) {
  const draw = (W) => {
    const vs = values.map((v) => (v == null ? null : +v));
    if (vs.filter((v) => v != null).length < 2) return svg(W, height, s('line', { class: 'tn-grid', x1: 0, x2: W, y1: height / 2, y2: height / 2 }));
    let [lo, hi] = extent(vs);
    if (min != null) lo = min; if (max != null) hi = max;
    const xs = linear([0, vs.length - 1], [1.5, W - 2.5]), ys = linear([lo, hi], [height - 2, 2]);
    const pts = vs.map((v, i) => [xs(i), v == null ? null : ys(v)]);
    const cc = colorClass(color);
    const li = vs.length - 1;
    return svg(W, height,
      area && s('path', { class: `tn-area ${cc}`, d: areaPath(pts, height) }),
      s('path', { class: `tn-line ${cc}`, d: linePath(pts) }),
      last && vs[li] != null && s('circle', { class: `tn-dot-pt ${cc}`, cx: pts[li][0], cy: pts[li][1], r: 2 }));
  };
  if (width) { const el = h('span', { class: 'tn-spark', role: 'img', 'aria-label': label || null }, draw(width)); return el; }
  const f = chartFrame({ className: 'tn-spark', label, height, draw });
  return f.el;
}

/**
 * donut({ segments: [{ label, value, color? | status? }], size = 72, thickness = 9, center?, sub?, legend = true, label? })
 * Ring with a center (e.g. "82 %"). One segment + max → fill-level ring: donut({ value: .82, max: 1, color: 'warn' }).
 * @param {DonutOptions} [o]
 * @returns {HTMLElement}
 */
export function donut(o = {}) {
  const size = o.size || 72, th = o.thickness || 9;
  let segs = o.segments;
  if (!segs) segs = [{ label: o.label || '', value: o.value ?? 0, color: o.color || 'blue' }];
  const total = o.max ?? segs.reduce((a, x) => a + Math.max(0, x.value || 0), 0);
  const r = size / 2, kids = [s('circle', { class: 'tn-ring-track', cx: r, cy: r, r: r - th / 2, 'stroke-width': th })];
  let a = 0;
  segs.forEach((x, i) => {
    const v = Math.max(0, x.value || 0);
    if (!total || !v) return;
    const a1 = a + (v / total) * Math.PI * 2;
    const gap = segs.length > 1 ? 0.025 : 0;
    kids.push(s('path', { class: `tn-ring-seg ${colorClass(x.status || x.color, i)}`, d: arcPath(r, r, r, r - th, a + gap / 2, Math.max(a + gap / 2 + 0.001, a1 - gap / 2)) }));
    a = a1;
  });
  const center = o.center ?? (o.segments ? fmtNum(total, 0) : fmtPct(total ? (o.value ?? 0) / total : 0, 0));
  const ring = h('div', { class: 'tn-donut-ring', style: { width: `${size}px`, height: `${size}px` } },
    s('svg', { width: size, height: size, viewBox: `0 0 ${size} ${size}`, class: 'tn-svg', 'aria-hidden': 'true' }, ...kids),
    h('div', { class: 'tn-donut-center' }, h('span', { class: cls2(size) }, center), o.sub && h('span', { class: 'tn-donut-sub' }, o.sub)));
  const lg = o.segments && o.legend !== false ? h('div', { class: 'tn-donut-legend' }, segs.map((x, i) => h('div', { class: 'tn-tip-row' },
    h('span', { class: `tn-tip-sw ${colorClass(x.status || x.color, i)}` }), h('span', { class: 'tn-tip-name' }, x.label), h('span', { class: 'tn-tip-val tn-num' }, fmtNum(x.value))))) : null;
  const aria = o.ariaLabel || segs.map((x) => `${x.label} ${fmtNum(x.value)}`).join(', ');
  return h('div', { class: 'tn-donut', role: 'img', 'aria-label': aria }, ring, lg);
}
const cls2 = (size) => `tn-donut-val${size < 60 ? ' is-small' : ''}`;

/**
 * heatRow({ items: [{ status, t?, label?, id? }], max = 30, onItem?(item), label? })
 * Latest runs as small boxes, newest on the right. Tooltip with time and status; tappable with onItem.
 * @param {HeatRowOptions} [o]
 * @returns {HTMLElement}
 */
export function heatRow({ items = [], max = 30, onItem, label, size } = {}) {
  const shown = items.slice(-max);
  const pad = Math.max(0, max - shown.length);
  const cells = [
    ...Array.from({ length: pad }, () => h('span', { class: 'tn-heat-cell tn-heat-none' })),
    ...shown.map((it) => {
      const text = [it.t != null && fmtWhen(it.t), it.label, STATUS_TEXT[it.status] || it.status].filter(Boolean).join(' · ');
      const el = onItem
        ? h('button', { class: `tn-heat-cell tn-s-${it.status}`, type: 'button', 'aria-label': text })
        : h('span', { class: `tn-heat-cell tn-s-${it.status}` });
      // Data card: time, status, run; with onItem the click (on touch the second tap) triggers the action
      return dataCard(el, () => [it.t != null && h('div', { class: 'tn-tip-head' }, fmtWhen(it.t)), tipRow(it.status, STATUS_TEXT[it.status] || it.status, it.label || '')], { onItem: onItem ? () => onItem(it) : undefined });
    }),
  ];
  const nBad = shown.filter((x) => x.status === 'bad').length;
  return h('div', { class: `tn-heat${size === 'lg' ? ' is-lg' : ''}`, role: onItem ? 'group' : 'img', 'aria-label': label || t('chart.runs', { count: shown.length, bad: nBad }), 'data-tn-cards': '' }, cells);
}
