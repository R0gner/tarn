// @ts-check
// tarn · pure formatting and sorting functions (no DOM, testable with node --test).
// Everything runs through Intl with the active locale and time zone from i18n.js (setLocale / setTimeZone);
// without a call the locale is English and the time zone the browser's.
import { getLocale, getTimeZone, baseLang, t } from './i18n.js';

const cache = new Map();
/**
 * Intl formatter cached per locale, time zone and kind.
 * @template T
 * @param {string} kind
 * @param {() => T} make
 * @param {unknown} opts
 * @returns {T}
 */
function fmt(kind, make, opts) {
  const k = `${kind}|${getLocale()}|${getTimeZone()}|${opts}`;
  let f = cache.get(k);
  if (!f) { f = make(); cache.set(k, f); }
  return f;
}
const numFmt = (digits, min = 0) => fmt('n', () => new Intl.NumberFormat(getLocale(), { minimumFractionDigits: Math.min(min, digits), maximumFractionDigits: digits }), `${digits}/${min}`);
const dtf = (kind, o) => fmt(`d${kind}`, () => new Intl.DateTimeFormat(getLocale(), { timeZone: getTimeZone(), ...o }), kind);

/**
 * 12345.678 → "12,345.68" (en) / "12.345,68" (de); at most `digits` decimals, at least `min` (amounts: fmtNum(9.9, 2, 2) → "9.90"). null → "–"
 * @param {number | null | undefined} n
 * @param {number} [digits]
 * @param {number} [min]
 * @returns {string}
 */
export function fmtNum(n, digits = 2, min = 0) {
  if (n == null || Number.isNaN(n)) return '–';
  return (digits === 0 ? numFmt(0).format(Math.round(n)) : numFmt(digits, min).format(n));
}

/**
 * 0.4567 → "45.7%" (en) / "45,7 %" (de): percent style of the locale.
 * @param {number | null | undefined} ratio
 * @param {number} [digits]
 * @returns {string}
 */
export function fmtPct(ratio, digits = 1) {
  if (ratio == null || Number.isNaN(ratio)) return '–';
  return fmt('p', () => new Intl.NumberFormat(getLocale(), { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: digits }), digits).format(ratio);
}

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
/**
 * Bytes, binary (1024): 1536 → "1.5 KB". From 100 without, from 10 with 1, below with 2 decimals.
 * @param {number | null | undefined} b
 * @returns {string}
 */
export function fmtBytes(b) {
  if (b == null || Number.isNaN(b)) return '–';
  const neg = b < 0; let v = Math.abs(b); let i = 0;
  while (v >= 1024 && i < UNITS.length - 1) { v /= 1024; i++; }
  const d = i === 0 || v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${neg ? '−' : ''}${numFmt(d).format(v)} ${UNITS[i]}`;
}

/**
 * Duration in seconds, compact: 42 → "42 s", 125 → "2 min 5 s", 7300 → "2 h 1 min", 200000 → "2 d 7 h" (unit names from the catalog).
 * @param {number | null | undefined} sec
 * @returns {string}
 */
export function fmtDuration(sec) {
  if (sec == null || Number.isNaN(sec)) return '–';
  const u = { s: t('unit.s'), m: t('unit.min'), h: t('unit.h'), d: t('unit.d') };
  sec = Math.max(0, Math.round(sec));
  if (sec < 60) return `${sec} ${u.s}`;
  const m = Math.floor(sec / 60), s = sec % 60;
  if (m < 60) return s ? `${m} ${u.m} ${s} ${u.s}` : `${m} ${u.m}`;
  const hh = Math.floor(m / 60), mm = m % 60;
  if (hh < 24) return mm ? `${hh} ${u.h} ${mm} ${u.m}` : `${hh} ${u.h}`;
  const d = Math.floor(hh / 24), rh = hh % 24;
  return rh ? `${d} ${u.d} ${rh} ${u.h}` : `${d} ${u.d}`;
}

/**
 * Relative age via Intl.RelativeTimeFormat: 5 → "now", 300 → "5 min. ago" / "vor 5 Min.", 3 days → "3 days ago"; negative: "in 2 hr.".
 * @param {number | null | undefined} sec seconds ago (negative = in the future)
 * @returns {string}
 */
export function fmtAgo(sec) {
  if (sec == null || Number.isNaN(sec)) return '–';
  const rtf = fmt('r', () => new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto', style: 'short' }), '');
  const a = Math.abs(sec), sign = sec < 0 ? 1 : -1;
  if (a < 45) return rtf.format(0, 'second');
  if (a < 3600) return rtf.format(sign * Math.max(1, Math.round(a / 60)), 'minute');
  if (a < 86400) return rtf.format(sign * Math.floor(a / 3600), 'hour');
  return rtf.format(sign * Math.floor(a / 86400), 'day');
}

const toDate = (t) => (t instanceof Date ? t : new Date(t));
const dayKey = (v) => fmt('tn', () => new Intl.DateTimeFormat('en-CA', { timeZone: getTimeZone(), year: 'numeric', month: '2-digit', day: '2-digit' }), '').format(toDate(v));
/**
 * Time of day: "07:15" (de) / "7:15 AM" (en)
 * @param {number | Date | null | undefined} t epoch milliseconds or Date
 * @returns {string}
 */
export const fmtTime = (t) => (t == null ? '–' : dtf('time', { hour: '2-digit', minute: '2-digit' }).format(toDate(t)));
/**
 * Date: "09.11.2026" (de) / "11/09/2026" (en-US)
 * @param {number | Date | null | undefined} t epoch milliseconds or Date
 * @returns {string}
 */
export const fmtDate = (t) => (t == null ? '–' : dtf('date', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(toDate(t)));
/**
 * Day, month, time: "09.11., 07:15"
 * @param {number | Date | null | undefined} t epoch milliseconds or Date
 * @returns {string}
 */
export const fmtShort = (t) => (t == null ? '–' : dtf('short', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(toDate(t)));
/**
 * Short date without time: "09.11." (de) / "11/09" (en-US)
 * @param {number | Date | null | undefined} t epoch milliseconds or Date
 * @returns {string}
 */
export const fmtDay = (t) => (t == null ? '–' : dtf('day', { day: '2-digit', month: '2-digit' }).format(toDate(t)));
/**
 * Full: "09.11.2026, 07:15:02"
 * @param {number | Date | null | undefined} t epoch milliseconds or Date
 * @returns {string}
 */
export const fmtFull = (t) => (t == null ? '–' : dtf('full', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(toDate(t)));

/**
 * Date/time in context: today → "07:15", yesterday → "yesterday 22:10" (Intl wording), otherwise day and time: "07.11. 22:10" (de: date, space, time – no comma
 * after the full stop of the date) / "11/07, 10:10 PM" (en-US, Intl's own pattern).
 * @param {number | Date | null | undefined} t
 * @param {number} [now]
 * @returns {string}
 */
export function fmtWhen(t, now = Date.now()) {
  if (t == null) return '–';
  const k = dayKey(t);
  if (k === dayKey(now)) return fmtTime(t);
  if (k === dayKey(+toDate(now) - 86400e3)) return `${fmt('r', () => new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto', style: 'short' }), '').format(-1, 'day')} ${fmtTime(t)}`;
  return baseLang(getLocale()) === 'de' ? `${fmtDay(t)} ${fmtTime(t)}` : fmtShort(t);
}

/* ---- Sorting ---- */
export const collator = { compare: (a, b) => fmt('c', () => new Intl.Collator(getLocale(), { numeric: true, sensitivity: 'base' }), '').compare(a, b) };

/** Status rank for sorting (worst first when ascending). */
export const STATUS_RANK = { bad: 0, warn: 1, pending: 2, unknown: 3, info: 4, ok: 5, off: 6 };

/**
 * Compare two values: numbers/dates numerically, strings naturally in the active locale, empty always last.
 * @param {any} a
 * @param {any} b
 * @returns {number}
 */
export function compareValues(a, b) {
  const ea = a == null || a === '', eb = b == null || b === '';
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
  if (a instanceof Date) a = +a;
  if (b instanceof Date) b = +b;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return collator.compare(String(a), String(b));
}

/**
 * Stable sort without mutation. get(row) returns the sort value; dir 'asc'|'desc'.
 * Empty values stay at the end in both directions.
 * @template T
 * @param {T[]} rows
 * @param {(row: T) => any} get
 * @param {'asc' | 'desc'} [dir]
 * @returns {T[]}
 */
export function sortRows(rows, get, dir = 'asc') {
  const sign = dir === 'desc' ? -1 : 1;
  return rows
    .map((r, i) => [r, get(r), i])
    .sort((x, y) => {
      const ex = x[1] == null || x[1] === '', ey = y[1] == null || y[1] === '';
      if (ex || ey) return ex === ey ? x[2] - y[2] : ex ? 1 : -1;
      return sign * compareValues(x[1], y[1]) || x[2] - y[2];
    })
    .map((x) => x[0]);
}

/**
 * Simple full-text search: every word of the query must occur (case- and accent-insensitive).
 * @param {unknown} text
 * @param {unknown} query
 * @returns {boolean}
 */
export function matchQuery(text, query) {
  const q = norm(query).split(/\s+/).filter(Boolean);
  if (!q.length) return true;
  const t = norm(text);
  return q.every((w) => t.includes(w));
}
const norm = (x) => String(x ?? '').toLocaleLowerCase(getLocale()).replace(/\u00df/g, 'ss').normalize('NFD').replace(/\p{M}/gu, '');
