// @ts-check
// tarn · filter logic without a DOM (testable in Node): matching per data type and readable chip texts.
//
// A filter state is { q, f } where f maps a filter key to a value; the type follows from the value:
//   options  string[]                        row value (or array of values) must be one of them
//   bool     true | false                    row value, read as boolean, must equal it (key absent = all)
//   range    { min?, max? }                  number: min ≤ value ≤ max (a row without a number does not match)
//   time     { preset } | { from?, to? }     preset '1h' | '6h' | '24h' | '7d' | '30d' (the last …, relative to now),
//                                            or calendar days 'YYYY-MM-DD' (from/to inclusive, in the time zone)
import { t, getTimeZone } from './i18n.js';
import { fmtNum, fmtDate } from './format.js';
import { addDays, dayStart } from './inputs-data.js';

/** @typedef {any} FilterValue One of: string[] (options) · boolean (bool) · { min?, max? } (range) · { preset } or { from?, to? } (time). Deliberately `any`: the kind is decided at runtime by kindOf(), a union would need a check at every use. */
/** @typedef {Record<string, FilterValue>} FilterValues Filter key → value. */
/** @typedef {{ q: string, f: FilterValues }} FilterState Search text and filter values. */

export const TIME_PRESETS = ['1h', '6h', '24h', '7d', '30d'];
/**
 * Length of a time preset in ms ('24h' → 86400000) or null.
 * @param {unknown} id
 * @returns {number | null}
 */
export function presetMs(id) {
  const m = /^(\d+)([hd])$/.exec(String(id));
  return m ? Number(m[1]) * (m[2] === 'h' ? 3600e3 : 86400e3) : null;
}

/** Kind of a filter value: 'options' | 'bool' | 'range' | 'time' | null (empty or unknown). */
export function kindOf(v) {
  if (Array.isArray(v)) return v.length ? 'options' : null;
  if (typeof v === 'boolean') return 'bool';
  if (v && typeof v === 'object') {
    if ('min' in v || 'max' in v) return v.min != null || v.max != null ? 'range' : null;
    if ('preset' in v || 'from' in v || 'to' in v) return v.preset || v.from || v.to ? 'time' : null;
  }
  return null;
}

/** Point in time of a row value: number (ms), Date, ISO string → ms | null. */
export function toMs(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const n = v instanceof Date ? +v : Date.parse(v);
  return Number.isNaN(n) ? null : n;
}

/** { from, to } in ms (to exclusive; null = open) for a time filter value. */
export function timeBounds(v, now = Date.now(), timeZone = getTimeZone()) {
  if (v.preset) { const ms = presetMs(v.preset); return { from: ms == null ? null : now - ms, to: null }; }
  return { from: v.from ? dayStart(v.from, timeZone) : null, to: v.to ? dayStart(addDays(v.to, 1), timeZone) : null };
}

/**
 * Does a row match the active filters? get(row, key) returns the value (or array); default row[key].
 * opts: { now, timeZone } for time filters. Existing calls with option arrays only stay valid.
 */
/* Bounds of time filter values, computed once per value object and (now, zone), not per row. */
const boundsCache = new WeakMap();
/**
 * @param {any} row
 * @param {FilterValues} f
 * @param {(row: any, key: string) => any} [get] reads the value of a row for a filter key (default row[key])
 * @param {{ now?: number, timeZone?: string }} [o]
 * @returns {boolean}
 */
export function matchFilters(row, f, get = (r, k) => r[k], { now = Date.now(), timeZone } = {}) {
  const bounds = { get: (fv) => { const c = boundsCache.get(fv); return c && c.now === now && c.tz === (timeZone || getTimeZone()) ? c.b : undefined; }, set: (fv, b) => boundsCache.set(fv, { now, tz: timeZone || getTimeZone(), b }) };
  return Object.entries(f || {}).every(([k, fv]) => {
    const kind = kindOf(fv);
    if (!kind) return true;
    const v = get(row, k);
    if (kind === 'options') return Array.isArray(v) ? v.some((x) => fv.includes(x)) : fv.includes(v);
    if (kind === 'bool') return !!v === fv;
    if (kind === 'range') {
      const n = typeof v === 'number' ? v : v == null || v === '' ? NaN : Number(v);
      return Number.isFinite(n) && (fv.min == null || n >= fv.min) && (fv.max == null || n <= fv.max);
    }
    const ms = toMs(v);
    if (ms == null) return false;
    const b = bounds.get(fv) || (bounds.set(fv, timeBounds(fv, now, timeZone)), bounds.get(fv));
    return (b.from == null || ms >= b.from) && (b.to == null || ms < b.to);
  });
}

/** Clean up what a control produced: empty range → undefined (remove the key). */
export function cleanValue(v) { return kindOf(v) ? v : undefined; }

const dayText = (day, tz) => fmtDate(dayStart(day, tz));

/**
 * Readable chips of the active filters: [{ key, value?, group, text, sep }].
 * options: one chip per value ("Status: Error"); bool "Failing: Yes"; range "Duration ≥ 10 min" / "10–20 min" (no separator);
 * time "Time: last 24 hours" / "since 3 Nov" / "3 Nov – 10 Nov".
 * defs: [{ key, label, type?, options?, unit?, format?(n), labels?: { yes, no } }]
 */
export function chipsOf(defs, f, timeZone = getTimeZone()) {
  const out = [];
  for (const [key, fv] of Object.entries(f || {})) {
    const def = defs.find((d) => d.key === key) || { key };
    const group = def.label || key;
    const kind = kindOf(fv);
    if (kind === 'options') {
      for (const v of fv) out.push({ key, value: v, group, text: def.options?.find((o) => o.value === v)?.label ?? String(v), sep: ':' });
    } else if (kind === 'bool') {
      out.push({ key, group, text: fv ? (def.labels?.yes ?? t('filter.yes')) : (def.labels?.no ?? t('filter.no')), sep: ':' });
    } else if (kind === 'range') {
      const n = (x) => `${(def.format || ((y) => fmtNum(y, 2)))(x)}${def.unit ? ` ${def.unit}` : ''}`;
      const text = fv.min != null && fv.max != null ? `${(def.format || ((y) => fmtNum(y, 2)))(fv.min)}–${n(fv.max)}` : fv.min != null ? `≥ ${n(fv.min)}` : `≤ ${n(fv.max)}`;
      out.push({ key, group, text, sep: '' });
    } else if (kind === 'time') {
      const text = fv.preset ? t(`filter.time.last.${fv.preset}`)
        : fv.from && fv.to ? t('filter.time.between', { from: dayText(fv.from, timeZone), to: dayText(fv.to, timeZone) })
          : fv.from ? t('filter.time.since', { day: dayText(fv.from, timeZone) }) : t('filter.time.until', { day: dayText(fv.to, timeZone) });
      out.push({ key, group, text, sep: ':' });
    }
  }
  return out;
}

/** Remove one chip from the state (an option value or the whole key). Returns a new f. */
export function withoutChip(f, chip) {
  const next = { ...f };
  if (chip.value !== undefined && Array.isArray(next[chip.key])) {
    next[chip.key] = next[chip.key].filter((x) => x !== chip.value);
    if (!next[chip.key].length) delete next[chip.key];
  } else delete next[chip.key];
  return next;
}
