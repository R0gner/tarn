// @ts-check
// tarn · line/area chart with multiple series and scrubbing (mouse and touch).
import '../locales/shell.js';   // shell texts
import { h, s } from '../dom.js';
import { fmtNum, fmtWhen } from '../format.js';
import { linear, extent, niceDomain, ticks, timeAxis, nearestIndex, linePath, areaPath, stack } from './scale.js';
import { t } from '../i18n.js';
import { chartFrame, colorClass, svg, legend, showTip, hideTip, tipRow, scrub } from './base.js';

/** @typedef {{ label: string, values: Array<number | null | undefined>, color?: string, area?: boolean }} LineSeries values align with x; null breaks the line. */
/** @typedef {{ x: number[], series: LineSeries[], height?: number, area?: boolean, stacked?: boolean, zeroBased?: boolean, yFormat?: (v: number) => string, xFormat?: (v: number) => string, time?: boolean, yTicks?: number, yMin?: number, yMax?: number, label?: string, empty?: string }} LineChartOptions x in epoch ms when time is true. */

/**
 * lineChart({
 *   x: [ms…] (time) or [number…], series: [{ label, values: [y|null…], color?, area? }],
 *   height = 180, area = false, stacked = false, zeroBased = area || stacked,
 *   yFormat = fmtNum, xFormat?, time = true, yTicks = 4, label?, empty = 'No data'
 * }) → element
 * Scrubbing: moving the mouse or swiping horizontally shows a line + tooltip with all values.
 * @param {LineChartOptions} o
 * @returns {HTMLElement}
 */
export function lineChart(o) {
  const { x = [], series = [], height = 180, time = true, yTicks = 4 } = o;
  const area = !!o.area, stacked = !!o.stacked;
  const yFmt = o.yFormat || ((v) => fmtNum(v, 1));
  const xFmt = o.xFormat || (time ? (t) => fmtWhen(t) : (v) => fmtNum(v));
  const hasData = x.length > 1 && series.some((r) => r.values.some((v) => v != null));
  const stacks = stacked ? stack(series.map((r) => r.values)) : [];

  const frame = chartFrame({ className: 'tn-chart-line', label: o.label, height, draw });
  function draw(W) {
    if (!hasData) return h('div', { class: 'tn-chart-empty' }, o.empty || t('chart.noData'));
    const yVals = stacked ? stacks.flat().map((p) => p[1]) : series.flatMap((r) => r.values);
    let dom = extent(yVals);
    if (o.yMin != null) dom[0] = o.yMin;
    if (o.yMax != null) dom[1] = o.yMax;
    dom = niceDomain(dom, yTicks, { zeroBased: o.zeroBased ?? (area || stacked) });
    const yt = ticks(dom, yTicks);
    const padL = Math.max(28, Math.max(...yt.map((v) => yFmt(v).length)) * 6.4 + 10), padR = 8, padT = 8, padB = 22;
    const xs = linear(extent(x), [padL, W - padR]);
    const ys = linear(dom, [height - padB, padT]);
    const g = [];
    // Grid + y axis
    for (const v of yt) {
      g.push(s('line', { class: 'tn-grid', x1: padL, x2: W - padR, y1: Math.round(ys(v)) + 0.5, y2: Math.round(ys(v)) + 0.5 }));
      g.push(s('text', { class: 'tn-axis', x: padL - 6, y: ys(v) + 3.5, 'text-anchor': 'end' }, yFmt(v)));
    }
    // x axis
    const [x0, x1] = extent(x);
    /** @type {{ ticks: number[], unit?: string }} */
    if (time) {
      /* the label width follows the axis font (density is a token matter): about 0.62 em per character of digits and AM/PM */
      const fs = parseFloat(getComputedStyle(frame.plot).getPropertyValue('--tn-fs-xs')) || 11;
      for (const k of timeAxis([x0, x1], { left: padL, right: W - padR, width: W, charW: fs * 0.62 }).ticks) g.push(s('text', { class: 'tn-axis', x: k.px, y: height - 6, 'text-anchor': k.anchor }, k.text));
    } else {
      for (const v of ticks([x0, x1], Math.max(2, Math.floor((W - padL) / 70)))) {
        const px = xs(v), anchor = px < padL + 20 ? 'start' : px > W - padR - 20 ? 'end' : 'middle';
        g.push(s('text', { class: 'tn-axis', x: px, y: height - 6, 'text-anchor': anchor }, fmtNum(v)));
      }
    }
    // Series (area first, then line)
    series.forEach((r, i) => {
      const pts = x.map((t, k) => [xs(t), stacked ? (r.values[k] == null ? null : ys(stacks[i][k][1])) : (r.values[k] == null ? null : ys(r.values[k]))]);
      const cc = colorClass(r.color, i);
      if (stacked) {
        const lower = x.map((t, k) => [xs(t), ys(stacks[i][k][0])]);
        const top = pts.filter((p) => p[1] != null);
        if (top.length) g.push(s('path', { class: `tn-area ${cc}`, d: `M${top.map((p) => p.join(',')).join('L')}L${lower.reverse().map((p) => p.join(',')).join('L')}Z` }));
      } else if (r.area ?? area) g.push(s('path', { class: `tn-area ${cc}`, d: areaPath(pts, ys(Math.max(dom[0], 0))) }));
      g.push(s('path', { class: `tn-line ${cc}`, d: linePath(pts) }));
    });
    // Scrub layer
    const cursor = s('line', { class: 'tn-cursor', y1: padT, y2: height - padB, x1: 0, x2: 0, visibility: 'hidden' });
    const dots = s('g');
    const hit = s('rect', { class: 'tn-hit', x: padL, y: 0, width: Math.max(0, W - padL - padR), height });
    const sx = x.map(xs);
    scrub(hit, {
      onMove(px) {
        const k = nearestIndex(sx, px);
        if (k < 0) return;
        const cx = sx[k];
        cursor.setAttribute('x1', String(cx)); cursor.setAttribute('x2', String(cx)); cursor.setAttribute('visibility', 'visible');
        dots.replaceChildren(...series.map((r, i) => {
          const v = r.values[k];
          if (v == null) return null;
          return s('circle', { class: `tn-dot-pt ${colorClass(r.color, i)}`, cx, cy: ys(stacked ? stacks[i][k][1] : v), r: 3 });
        }).filter((/** @type {SVGElement | null} */ c) => c != null));
        const rows = series.map((r, i) => tipRow(r.color, r.label || '', r.values[k] == null ? '–' : yFmt(r.values[k]), i));
        showTip(frame, cx, padT + 4, [h('div', { class: 'tn-tip-head' }, xFmt(x[k])), ...rows]);
      },
      onEnd() { cursor.setAttribute('visibility', 'hidden'); dots.replaceChildren(); hideTip(frame); },
    });
    return svg(W, height, ...g, cursor, dots, hit);
  }
  const lg = legend(series);
  if (lg) frame.el.append(lg);
  return frame.el;
}
