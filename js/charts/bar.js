// @ts-check
// tarn · bar chart: vertical or horizontal, grouped or stacked, tooltip, optionally clickable.
import '../locales/shell.js';   // shell texts
import { h, s } from '../dom.js';
import { fmtNum } from '../format.js';
import { linear, extent, niceDomain, ticks, stack } from './scale.js';
import { t } from '../i18n.js';
import { chartFrame, colorClass, svg, legend, showTip, hideTip, tipRow, scrub } from './base.js';

/** @typedef {{ label: string, values: Array<number | null | undefined>, color?: string }} BarSeries */
/** @typedef {{ labels: Array<string | number>, series: BarSeries[], stacked?: boolean, horizontal?: boolean, height?: number, rowHeight?: number, yFormat?: (v: number) => string, onBar?: (index: number) => void, label?: string, empty?: string }} BarChartOptions */

/**
 * barChart({
 *   labels: ['Mo', …], series: [{ label, values, color? }], stacked = false, horizontal = false,
 *   height = 180 (vertical) · rowHeight = 22 (horizontal), yFormat = fmtNum, onBar?(index), label?
 * }) → element
 * Horizontal suits rankings with long names (storage per host); vertical suits time series (runs per day).
 * @param {BarChartOptions} o
 * @returns {HTMLElement}
 */
export function barChart(o) {
  const { labels = [], series = [], stacked = false, horizontal = false } = o;
  const yFmt = o.yFormat || ((v) => fmtNum(v, 1));
  const n = labels.length;
  const rowH = o.rowHeight || 22;
  const height = horizontal ? n * rowH + 2 : (o.height || 180);
  const stacks = stack(series.map((r) => r.values));
  const totals = Array.from({ length: n }, (_, k) => (stacked ? stacks[stacks.length - 1]?.[k]?.[1] ?? 0 : Math.max(...series.map((r) => r.values[k] ?? 0))));
  const frame = chartFrame({ className: `tn-chart-bar${horizontal ? ' is-h' : ''}`, label: o.label, height, draw });

  function tip(k) {
    const rows = series.map((r, i) => tipRow(r.color, r.label || '', r.values[k] == null ? '–' : yFmt(r.values[k]), i));
    if (stacked && series.length > 1) rows.push(h('div', { class: 'tn-tip-row tn-tip-sum' }, h('span', { class: 'tn-tip-name' }, t('chart.sum')), h('span', { class: 'tn-tip-val tn-num' }, yFmt(totals[k]))));
    return [h('div', { class: 'tn-tip-head' }, labels[k]), ...rows];
  }

  function draw(W) {
    if (!n) return h('div', { class: 'tn-chart-empty' }, o.empty || t('chart.noData'));
    const dom = niceDomain(extent(totals), 4, { zeroBased: true });
    const g = [], hits = [];
    if (horizontal) {
      const labW = Math.min(Math.round(W * 0.38), Math.max(...labels.map((l) => String(l).length)) * 6.6 + 12);
      const valW = Math.max(...totals.map((v) => yFmt(v).length)) * 6.6 + 10;
      const xs = linear(dom, [labW, W - valW]);
      labels.forEach((l, k) => {
        const y = k * rowH;
        g.push(s('text', { class: 'tn-axis tn-axis-label', x: 0, y: y + rowH / 2 + 4 }, clip(String(l), Math.floor((labW - 10) / 6.4))));
        if (stacked || series.length === 1) {
          series.forEach((r, i) => {
            const [a, b] = stacked ? stacks[i][k] : [0, r.values[k] ?? 0];
            if (b > a) g.push(s('rect', { class: `tn-bar ${colorClass(r.color, i)}`, x: xs(a), y: y + 5, width: Math.max(1, xs(b) - xs(a)), height: rowH - 10, rx: 2 }));
          });
        } else {
          const bh = (rowH - 8) / series.length;
          series.forEach((r, i) => { const v = r.values[k] ?? 0; if (v > 0) g.push(s('rect', { class: `tn-bar ${colorClass(r.color, i)}`, x: xs(0), y: y + 4 + i * bh, width: Math.max(1, xs(v) - xs(0)), height: bh - 1, rx: 1.5 })); });
        }
        g.push(s('text', { class: 'tn-axis tn-num', x: xs(totals[k]) + 6, y: y + rowH / 2 + 4 }, yFmt(totals[k])));
        hits.push(s('rect', { class: 'tn-hit', x: 0, y, width: W, height: rowH, 'data-k': k }));
      });
    } else {
      const yt = ticks(dom, 4);
      const padL = Math.max(28, Math.max(...yt.map((v) => yFmt(v).length)) * 6.4 + 10), padB = 22, padT = 8;
      const ys = linear(dom, [height - padB, padT]);
      const band = (W - padL) / n, bw = Math.max(2, Math.min(36, band * 0.62));
      for (const v of yt) {
        g.push(s('line', { class: 'tn-grid', x1: padL, x2: W, y1: Math.round(ys(v)) + 0.5, y2: Math.round(ys(v)) + 0.5 }));
        g.push(s('text', { class: 'tn-axis', x: padL - 6, y: ys(v) + 3.5, 'text-anchor': 'end' }, yFmt(v)));
      }
      const every = Math.max(1, Math.ceil(n / Math.max(1, Math.floor((W - padL) / 44))));
      labels.forEach((l, k) => {
        const cx = padL + band * (k + 0.5);
        if (k % every === 0) g.push(s('text', { class: 'tn-axis', x: cx, y: height - 6, 'text-anchor': 'middle' }, clip(String(l), 8)));
        if (stacked || series.length === 1) {
          series.forEach((r, i) => {
            const [a, b] = stacked ? stacks[i][k] : [0, r.values[k] ?? 0];
            if (b > a) g.push(s('rect', { class: `tn-bar ${colorClass(r.color, i)}`, x: cx - bw / 2, y: ys(b), width: bw, height: Math.max(1, ys(a) - ys(b)), rx: 1.5 }));
          });
        } else {
          const sw = bw / series.length;
          series.forEach((r, i) => { const v = r.values[k] ?? 0; if (v > 0) g.push(s('rect', { class: `tn-bar ${colorClass(r.color, i)}`, x: cx - bw / 2 + i * sw, y: ys(v), width: Math.max(1, sw - 1), height: Math.max(1, ys(0) - ys(v)), rx: 1 })); });
        }
        hits.push(s('rect', { class: 'tn-hit', x: padL + band * k, y: 0, width: band, height, 'data-k': k }));
      });
    }
    const hl = s('rect', { class: 'tn-bar-hl', x: -10, y: 0, width: 0, height: 0 });
    const layer = s('g', { class: o.onBar ? 'tn-bar-click' : null }, ...hits);
    const kAt = (px, py) => {
      for (const el of hits) { const x = +el.getAttribute('x'), y = +el.getAttribute('y'); if (px >= x && px < x + +el.getAttribute('width') && py >= y && py < y + +el.getAttribute('height')) return +el.dataset.k; }
      return -1;
    };
    scrub(layer, {
      onMove(px, py) {
        const k = kAt(px, py); if (k < 0) return;
        const el = hits[k];
        for (const a of ['x', 'y', 'width', 'height']) hl.setAttribute(a, el.getAttribute(a));
        showTip(frame, horizontal ? Math.min(px, W - 60) : +el.getAttribute('x') + +el.getAttribute('width') / 2, horizontal ? +el.getAttribute('y') : 8, tip(k));
      },
      onEnd() { hl.setAttribute('width', '0'); hideTip(frame); },
    });
    const onBar = o.onBar;
    if (onBar) layer.addEventListener('click', (e) => { const k = Number(/** @type {HTMLElement} */ (e.target).dataset?.k); if (!Number.isNaN(k)) onBar(k); });
    return svg(W, height, hl, ...g, layer);
  }
  const lg = legend(series);
  if (lg) frame.el.append(lg);
  return frame.el;
}

const clip = (t, max) => (t.length > max ? `${t.slice(0, Math.max(1, max - 1))}…` : t);
