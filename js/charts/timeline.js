// @ts-check
// tarn · schedule/Gantt: rows with bars on a time axis, band for frequent runs,
// maintenance windows in the background, now line, conflict marking. HTML instead of SVG (text, click, scroll).
import '../locales/shell.js';   // shell texts
import { h } from '../dom.js';
import { fmtTime, fmtDate, fmtWhen, fmtDuration } from '../format.js';
import { timeTicks, findConflicts } from './scale.js';
import { dataCard } from '../datacard.js';
import { tipRow } from './base.js';
import { t } from '../i18n.js';

/** @typedef {import('./scale.js').Conflict} Conflict */
/** @typedef {{ start: number, end?: number, label?: string }} TimelineItem end missing = a point in time. */
/** @typedef {{ id: string, label: string, sub?: string, group?: string, heavy?: boolean, status?: string, items?: TimelineItem[], band?: number[][] }} TimelineRow */
/** @typedef {{ start: number, end: number, label?: string, tone?: 'info' | 'warn' }} TimelineWindow Maintenance window drawn in the background. */
/** @typedef {{ start: number, end: number, now?: number, rows: TimelineRow[], groups?: Array<{ id?: string, label: string | null }>, windows?: TimelineWindow[], conflicts?: 'auto' | Conflict[] | null, conflictTone?: 'bad' | 'warn', title?: string, minPxPerHour?: number, nameWidth?: number, minBar?: number, onRow?: (row: TimelineRow) => void, onItem?: (row: TimelineRow, item: TimelineItem) => void }} TimelineOptions start, end, now in epoch milliseconds. */
/** @typedef {HTMLElement & { conflicts: Conflict[] }} TimelineElement */

/**
 * timeline({
 *   start, end (ms), now?,
 *   rows: [{ id, label, sub?, group?, heavy?, status?, items: [{ start, end?, label? }], band?: [[start, end]…] }],
 *   groups?: [{ id, label }], windows?: [{ start, end, label, tone?: 'info'|'warn' }],
 *   conflicts = 'auto' | [{ a, b, start, end }], conflictTone = 'bad' | 'warn', minPxPerHour?, nameWidth?,
 *   onRow?(row), onItem?(row, item)
 * }) → element
 * The time axis adapts to the container width (no horizontal scrolling; zoom follows in round 4).
 * From NARROW_BELOW px container width a narrow name column sits on the left (at most 180 px or a quarter, with
 * ellipsis and tooltip); below that, name and subline sit small above the track, and the track uses the full width.
 * The number of axis marks follows the track width. With minPxPerHour (opt-in) the track scrolls horizontally again.
 * Conflicts: row and affected bars red; conflictTone 'warn' paints them in the warning colour (an overlap that is a risk, not a failure). Tapping a row (onRow) opens the detail with the individual runs.
 */
export const NARROW_BELOW = 560; // container width (px) below which the name sits above the track
/**
 * @param {TimelineOptions} o
 * @returns {TimelineElement}
 */
export function timeline(o) {
  const { start: a, end: b, rows = [] } = o;
  const conflicts = o.conflicts === 'auto' || o.conflicts == null ? findConflicts(rows) : o.conflicts;
  /** @type {Map<string, Conflict[]>} */
  const hot = new Map();
  for (const c of conflicts) for (const id of [c.a, c.b]) { if (!hot.has(id)) hot.set(id, []); /** @type {Conflict[]} */ (hot.get(id)).push(c); }

  const hours = (b - a) / 3600e3;
  const host = /** @type {TimelineElement} */ (/** @type {HTMLElement} */ (h('div', { class: 'tn-tl' })));
  if (o.nameWidth) host.style.setProperty('--tn-tl-name', `${o.nameWidth}px`);
  if (o.conflictTone === 'warn') host.classList.add('is-conflict-warn');

  const build = (avail) => {
    const narrow = avail < NARROW_BELOW;
    host.classList.toggle('is-narrow', narrow);
    const nameW = narrow ? 0 : Math.min(o.nameWidth || 180, Math.round(avail * (o.nameWidth ? 1 : 0.25)));
    if (o.minPxPerHour) host.style.setProperty('--tn-tl-name', `${nameW}px`);
    const fit = Math.max(avail - nameW, 0);
    const W = o.minPxPerHour ? Math.max(Math.round(hours * o.minPxPerHour), fit) : fit;
    const pct = (t) => `${(Math.max(0, Math.min(1, (t - a) / (b - a))) * 100).toFixed(3)}%`;
    const minBar = o.minBar ?? 4; // minimum width of a bar (px), stays within the track
    const span = (s, e) => ({ left: `min(${pct(s)}, calc(100% - ${minBar}px))`, width: `max(${minBar}px, ${(((Math.min(e, b) - Math.max(s, a)) / (b - a)) * 100).toFixed(3)}%)` });
    const grid = h('div', { class: 'tn-tl-grid', style: o.minPxPerHour ? { width: `${nameW + W}px` } : null });

    // Header with time axis
    const labelW = fmtTime(Date.UTC(2026, 0, 1, 12, 0)).length * 6.4 + 22; // width of one tick label in the active language ("12:00 AM" is wider than "12:00")
    const tt = timeTicks([a, b], Math.max(2, Math.floor(W / labelW) - 1)); // N intervals show N + 1 labels
    const multiDay = b - a > 30 * 3600e3;
    const fmt = tt.unit === 'day' ? (t) => fmtDate(t).slice(0, 6) : multiDay ? (t) => (fmtTime(t) === '00:00' ? fmtDate(t).slice(0, 6) : fmtTime(t)) : fmtTime;
    const axis = h('div', { class: 'tn-tl-track tn-tl-axis' }, tt.ticks.map((t) => h('span', { class: (t - a) / (b - a) > 0.92 ? 'tn-tl-tick is-end' : 'tn-tl-tick', style: { left: pct(t) } }, fmt(t))));
    grid.append(h('div', { class: 'tn-tl-row tn-tl-head' }, !narrow && h('div', { class: 'tn-tl-name' }, o.title || ''), axis));

    // Background: windows, hour lines, now
    const bg = h('div', { class: 'tn-tl-bg', 'aria-hidden': 'true' },
      (o.windows || []).filter((w) => w.end > a && w.start < b).map((w) => h('span', { class: `tn-tl-win tn-tl-win-${w.tone || 'info'}`, style: span(w.start, w.end) })),
      tt.ticks.filter((t) => t < b).map((t) => h('span', { class: 'tn-tl-vline', style: { left: pct(t) } })),
      o.now != null && o.now >= a && o.now < b && h('span', { class: 'tn-tl-now', style: { left: pct(o.now) } }));
    grid.append(bg);

    const groups = o.groups || [{ id: undefined, label: null }];
    for (const g of groups) {
      const rs = rows.filter((r) => g.id === undefined || r.group === g.id);
      if (!rs.length) continue;
      if (g.label) grid.append(h('div', { class: 'tn-tl-row tn-tl-group' }, h('div', { class: 'tn-tl-name' }, g.label, h('span', { class: 'tn-tl-count' }, rs.length)), h('div', { class: 'tn-tl-track' })));
      for (const r of rs) {
        const cs = hot.get(r.id) || [];
        const track = h('div', { class: 'tn-tl-track' });
        for (const [s, e] of r.band || []) if (e > a && s < b) track.append(h('span', { class: 'tn-tl-band', style: span(s, e) }));
        for (const it of r.items || []) {
          const e = it.end ?? it.start;
          if (e < a || it.start >= b) continue;
          const isHot = cs.some((c) => it.start < c.end && e > c.start);
          const text = `${r.label}: ${fmtWhen(it.start)}${it.end ? `–${fmtTime(it.end)} (${fmtDuration((it.end - it.start) / 1000)})` : ''}${it.label ? ` · ${it.label}` : ''}${isHot ? ` · ${t('chart.overlap')}` : ''}`;
          const onItem = o.onItem;
          const bar = h(onItem ? 'button' : 'span', {
            class: `tn-tl-bar${r.heavy ? ' is-heavy' : ''}${isHot ? ' is-hot' : ''}${r.status ? ` tn-s-${r.status}` : ''}`,
            type: o.onItem ? 'button' : null, 'aria-label': o.onItem ? text : null, style: span(it.start, e),
          });
          // Data card: name, time, duration, note; with onItem the click (on touch the second tap) triggers the action
          track.append(dataCard(bar, () => [
            h('div', { class: 'tn-tip-head' }, r.label),
            tipRow('graphite', t('chart.time'), `${fmtWhen(it.start)}${it.end ? `–${fmtTime(it.end)}` : ''}`),
            it.end && tipRow('graphite', t('chart.duration'), fmtDuration((it.end - it.start) / 1000)),
            it.label && tipRow('graphite', t('chart.run'), it.label),
            isHot && tipRow('bad', t('chart.overlap'), t('chart.yes')),
          ], { onItem: onItem ? () => onItem(r, it) : undefined }));
        }
        const onRow = o.onRow;
        const name = h(onRow ? 'button' : 'div', { class: 'tn-tl-name', type: onRow ? 'button' : null, onclick: onRow ? () => onRow(r) : null },
          h('span', { class: 'tn-tl-title tn-ellipsis' }, r.label), r.sub && h('span', { class: 'tn-tl-sub tn-ellipsis' }, r.sub));
        grid.append(h('div', { class: `tn-tl-row${cs.length ? ' is-hot' : ''}`, 'data-key': r.id }, name, track));
      }
    }
    return h('div', { class: 'tn-tl-scroll' }, grid);
  };

  let lastW = 0;
  const ro = new ResizeObserver(() => {
    const w = Math.round(host.clientWidth);
    if (!w || w === lastW) return;
    const sc = /** @type {HTMLElement | null} */ (host.firstChild)?.scrollLeft || 0;
    lastW = w; host.replaceChildren(build(w));
    const scroller = /** @type {HTMLElement} */ (host.firstChild);
    if (o.minPxPerHour) { // Opt-in scrolling: first to the now line, later keep position
      if (!sc && o.now != null && o.now > a && o.now < b) scroller.scrollLeft = Math.max(0, ((o.now - a) / (b - a)) * scroller.scrollWidth - w / 3);
      else scroller.scrollLeft = sc;
    }
  });
  ro.observe(host);
  host.conflicts = conflicts;
  return host;
}
