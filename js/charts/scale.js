// @ts-check
// tarn · chart math without DOM (testable with node --test): scales, ticks, stacks, conflicts.
import { getTimeZone } from '../i18n.js';
import { fmtTime, fmtDay } from '../format.js';

/** @typedef {number[]} Pair Two numbers [from, to]. */
/** @typedef {{ (v: number): number, invert: (px: number) => number, domain: number[], range: number[] }} LinearScale */
/** @typedef {{ a: string, b: string, start: number, end: number }} Conflict Overlap of two heavy runs in different rows (a, b = row ids). */

/**
 * Minimum/maximum over values (null/NaN ignored). Empty input → [0, 1].
 * @param {Array<number | null | undefined>} values
 * @returns {number[]}
 */
export function extent(values) {
  let lo = Infinity, hi = -Infinity;
  for (const v of values) if (v != null && !Number.isNaN(v)) { if (v < lo) lo = v; if (v > hi) hi = v; }
  return lo === Infinity ? [0, 1] : [lo, hi];
}

/**
 * Linear scale: domain → range; .invert for scrubbing. Constant domain → midpoint.
 * @param {number[]} domain
 * @param {number[]} range
 * @returns {LinearScale}
 */
export function linear([d0, d1], [r0, r1]) {
  const span = d1 - d0;
  const f = Object.assign((/** @type {number} */ v) => (span === 0 ? (r0 + r1) / 2 : r0 + ((v - d0) / span) * (r1 - r0)), {
    invert: (/** @type {number} */ px) => (r1 === r0 ? d0 : d0 + ((px - r0) / (r1 - r0)) * span),
    domain: [d0, d1], range: [r0, r1],
  });
  return f;
}

/**
 * "Nice" step size (1, 2, 2.5, 5 × 10^n) for about `count` intervals.
 * @param {number} span
 * @param {number} [count]
 * @returns {number}
 */
export function niceStep(span, count = 5) {
  if (!(span > 0)) return 1;
  const raw = span / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
}

/**
 * Extend the domain to nice bounds; zeroBased includes 0 (bars, areas).
 * @param {number[]} domain
 * @param {number} [count]
 * @param {{ zeroBased?: boolean }} [o]
 * @returns {number[]}
 */
export function niceDomain([lo, hi], count = 4, { zeroBased = false } = {}) {
  if (zeroBased) { lo = Math.min(0, lo); hi = Math.max(0, hi); }
  if (lo === hi) { if (lo === 0) return [0, 1]; const p = Math.abs(lo) * 0.1; lo -= p; hi += p; if (zeroBased) { lo = Math.min(0, lo); hi = Math.max(0, hi); } }
  const step = niceStep(hi - lo, count);
  return [Math.floor(lo / step + 1e-9) * step, Math.ceil(hi / step - 1e-9) * step];
}

/**
 * Ticks within [lo, hi] with a nice step size.
 * @param {number[]} domain
 * @param {number} [count]
 * @returns {number[]}
 */
export function ticks([lo, hi], count = 4) {
  const step = niceStep(hi - lo, count);
  const out = [];
  const start = Math.ceil(lo / step - 1e-9) * step;
  for (let v = start; v <= hi + step * 1e-9; v += step) out.push(Math.round(v / step) * step === 0 ? 0 : +(Math.round(v / step) * step).toPrecision(12));
  return out;
}

const H = 3600e3, D = 24 * H;
const TIME_STEPS = [5 * 60e3, 10 * 60e3, 15 * 60e3, 30 * 60e3, H, 2 * H, 3 * H, 6 * H, 12 * H, D, 2 * D, 7 * D];
const AXIS_STEPS = [60e3, 2 * 60e3, ...TIME_STEPS, 14 * D, 28 * D];

/** Offset of the active time zone (ms) at a point in time – for ticks on local full hours/days. */
const offFmts = new Map();
const offFmt = () => { const z = getTimeZone(); let f = offFmts.get(z); if (!f) { f = new Intl.DateTimeFormat('en-US', { timeZone: z, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }); offFmts.set(z, f); } return f; };
/**
 * @param {number} ms
 * @returns {number}
 */
export function tzOffset(ms) {
  const p = Object.fromEntries(offFmt().formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000;
}

/**
 * Time ticks (ms) on round local times (active time zone) for about `count` marks.
 * → { step, ticks: [ms…], unit: 'min' | 'hour' | 'day' }
 * @param {number[]} range
 * @param {number} [count]
 * @returns {{ step: number, ticks: number[], unit: 'min' | 'hour' | 'day' }}
 */
export function timeTicks([a, b], count = 6) {
  const span = Math.max(1, b - a);
  const step = TIME_STEPS.find((s) => span / s <= count) || TIME_STEPS[TIME_STEPS.length - 1];
  return { step, ticks: ticksAt([a, b], step), unit: step >= D ? 'day' : step >= H ? 'hour' : 'min' };
}

/**
 * Ticks (ms) every `step` on round local times (active time zone) within [a, b].
 * @param {number[]} range
 * @param {number} step
 * @returns {number[]}
 */
function ticksAt([a, b], step) {
  const out = [];
  // align locally: local time = ms + offset
  let t = a + tzOffset(a);
  t = Math.ceil(t / step) * step;
  for (let i = 0; i < 500; i++) {
    const local = t + i * step;
    const ms = local - tzOffset(local - tzOffset(local));
    if (ms > b) break;
    if (ms >= a) out.push(ms);
  }
  return out;
}

/**
 * Label of a time tick: day and month for day steps and at local midnight, otherwise the time of day (Intl, active locale and time zone).
 * @param {number} t
 * @param {number} step
 * @returns {string}
 */
export function timeLabel(t, step) {
  return step >= D || (t + tzOffset(t)) % D === 0 ? fmtDay(t) : fmtTime(t);
}

/** @typedef {{ t: number, px: number, text: string, anchor: 'start' | 'middle' | 'end', l: number, r: number }} AxisTick One labelled tick: position, text, text-anchor and the label's estimated box [l, r]. */

/**
 * Time axis that fits its width: the smallest round step whose labels neither leave [0, width] nor come closer than `gap` to their neighbour,
 * with ticks at least `minSpacing` px apart. Labels near an edge are anchored to it instead of being cut. The label width is estimated as
 * characters × `charW` (the caller derives it from the axis font size).
 * @param {number[]} range [a, b] in ms
 * @param {{ left: number, right: number, width: number, charW: number, gap?: number, minSpacing?: number }} o plot from `left` to `right` px inside an axis `width` px wide
 * @returns {{ step: number, unit: 'min' | 'hour' | 'day', ticks: AxisTick[] }}
 */
export function timeAxis([a, b], { left, right, width, charW, gap = 10, minSpacing = 72 }) {
  const span = Math.max(1, b - a), plotW = Math.max(1, right - left);
  /** @param {number} step @returns {AxisTick[]} */
  const place = (step) => ticksAt([a, b], step).map((t) => {
    const text = timeLabel(t, step), w = text.length * charW, px = left + ((t - a) / span) * plotW;
    /** @type {'start' | 'middle' | 'end'} */
    let anchor = 'middle', l = px - w / 2;
    if (l < 0) { anchor = 'start'; l = px; }
    if (l + w > width) { anchor = 'end'; l = px - w; }
    return { t, px, text, anchor, l, r: l + w };
  });
  const fits = (/** @type {AxisTick[]} */ ts) => ts.every((x, i) => x.l >= 0 && x.r <= width && (i === 0 || (x.px - ts[i - 1].px >= minSpacing && x.l - ts[i - 1].r >= gap)));
  const unit = (/** @type {number} */ step) => (step >= D ? 'day' : step >= H ? 'hour' : 'min');
  for (const step of AXIS_STEPS) {
    if (span / step > 200) continue;
    const ts = place(step);
    if (ts.length && fits(ts)) return { step, unit: unit(step), ticks: ts };
  }
  // nothing fits (a very narrow chart): the largest step, keeping only labels that fit
  const step = AXIS_STEPS[AXIS_STEPS.length - 1];
  /** @type {AxisTick[]} */
  const kept = [];
  for (const x of place(step)) if (x.l >= 0 && x.r <= width && (!kept.length || x.l - kept[kept.length - 1].r >= gap)) kept.push(x);
  return { step, unit: unit(step), ticks: kept };
}

/**
 * Index of the point whose x is nearest to `x` in ascending sorted xs (binary search).
 * @param {number[]} xs
 * @param {number} x
 * @returns {number}
 */
export function nearestIndex(xs, x) {
  if (!xs.length) return -1;
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
  return Math.abs(xs[hi] - x) < Math.abs(xs[lo] - x) ? hi : lo;
}

/**
 * Stacked values: series [[v…], [v…]] → [[[y0, y1]…]…] (positive values; null counts as 0).
 * @param {Array<Array<number | null | undefined>>} series
 * @returns {number[][][]}
 */
export function stack(series) {
  const n = Math.max(0, ...series.map((s) => s.length));
  const base = new Array(n).fill(0);
  return series.map((s) => Array.from({ length: n }, (_, i) => { const y0 = base[i]; base[i] += Math.max(0, s[i] ?? 0); return [y0, base[i]]; }));
}

/**
 * SVG path from points [[x, y]…]; a null y breaks the line.
 * @param {Array<Array<number | null | undefined>>} points
 * @returns {string}
 */
export function linePath(points) {
  let d = '', pen = false;
  for (const [x, y] of points) {
    if (y == null || Number.isNaN(y)) { pen = false; continue; }
    d += `${pen ? 'L' : 'M'}${r1(x)},${r1(y)}`; pen = true;
  }
  return d;
}
/**
 * Area between line and baseline y0 (closed per contiguous segment).
 * @param {Array<Array<number | null | undefined>>} points
 * @param {number} y0
 * @returns {string}
 */
export function areaPath(points, y0) {
  let d = '', seg = [];
  const flush = () => { if (seg.length) d += `M${r1(seg[0][0])},${r1(y0)}` + seg.map(([x, y]) => `L${r1(x)},${r1(y)}`).join('') + `L${r1(seg[seg.length - 1][0])},${r1(y0)}Z`; seg = []; };
  for (const p of points) { if (p[1] == null || Number.isNaN(p[1])) flush(); else seg.push(p); }
  flush();
  return d;
}
const r1 = (v) => Math.round(v * 10) / 10;

/**
 * Ring segment (donut) from angle a0 to a1 (radians, 0 = top, clockwise).
 * @param {number} cx
 * @param {number} cy
 * @param {number} r
 * @param {number} inner
 * @param {number} a0
 * @param {number} a1
 * @returns {string}
 */
export function arcPath(cx, cy, r, inner, a0, a1) {
  const full = a1 - a0 >= Math.PI * 2 - 1e-6;
  if (full) a1 = a0 + Math.PI * 2 - 1e-4;
  const pt = (rad, a) => [cx + rad * Math.sin(a), cy - rad * Math.cos(a)];
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = pt(r, a0), [x1, y1] = pt(r, a1), [x2, y2] = pt(inner, a1), [x3, y3] = pt(inner, a0);
  return `M${r1(x0)},${r1(y0)}A${r},${r} 0 ${large} 1 ${r1(x1)},${r1(y1)}L${r1(x2)},${r1(y2)}A${inner},${inner} 0 ${large} 0 ${r1(x3)},${r1(y3)}Z`;
}

/**
 * Conflicts in the schedule: overlaps of heavy runs (heavy) in different rows.
 * rows: [{ id, heavy, items: [{ start, end }] }] → [{ a, b, start, end }] (a < b by order)
 * @param {Array<{ id: string, heavy?: boolean, items?: Array<{ start: number, end?: number }> }>} rows
 * @returns {Conflict[]}
 */
export function findConflicts(rows) {
  const ev = [];
  rows.forEach((r, ri) => { if (r.heavy) for (const it of r.items || []) if (it.end != null && it.end > it.start) ev.push({ ri, id: r.id, start: it.start, end: it.end }); });
  ev.sort((x, y) => x.start - y.start);
  const out = [], seen = new Set();
  for (let i = 0; i < ev.length; i++) {
    for (let j = i + 1; j < ev.length && ev[j].start < ev[i].end; j++) {
      if (ev[i].ri === ev[j].ri) continue;
      const [p, q] = ev[i].ri < ev[j].ri ? [ev[i], ev[j]] : [ev[j], ev[i]];
      const start = Math.max(p.start, q.start), end = Math.min(p.end, q.end);
      const k = `${p.id}|${q.id}|${start}`;
      if (!seen.has(k)) { seen.add(k); out.push({ a: p.id, b: q.id, start, end }); }
    }
  }
  return out;
}
