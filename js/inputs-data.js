// @ts-check
// tarn · input logic without a DOM (testable in Node): number parsing, validation, option search, day presets.
// The controls in inputs.js, form() and the filters (filters-data.js) build on this.
import { t } from './i18n.js';
import { matchQuery } from './format.js';

/** @typedef {import('./inputs.js').ValidationRules} ValidationRules */
/** @typedef {{ key: string | null, vars?: Record<string, string | number>, text?: string }} ValidationResult Catalog key plus variables for t(), or a ready text from rules.validate. */

/**
 * Parse user input into a number: accepts "1,5" and "1.5" (decimal comma or point), spaces; '' → null, junk → NaN.
 * @param {unknown} text
 * @returns {number | null}
 */
export function parseNumber(text) {
  if (typeof text === 'number') return Number.isFinite(text) ? text : NaN;
  const s = String(text ?? '').trim().replace(/\s+/g, '');
  if (!s) return null;
  if (!/^[+-]?(\d+([.,]\d*)?|[.,]\d+)$/.test(s)) return NaN;
  return Number(s.replace(',', '.'));
}

/**
 * Round to the precision of step (avoids 0.1 + 0.2 noise): roundTo(0.30000000000000004, 0.1) → 0.3
 * @param {number} n
 * @param {number} [step]
 */
export function roundTo(n, step = 1) {
  const dec = (String(step).split('.')[1] || '').length;
  return Number(n.toFixed(Math.min(10, dec)));
}

/**
 * Validate a value against rules → null (valid) or { key, vars } (catalog key for t()) or { text }.
 * rules: { required, min, max, minLength, maxLength, pattern: RegExp, number: true, validate: (v) → string | null }
 * Empty values pass unless `required`. For numbers min/max compare the number, for text the length.
 * @param {any} value
 * @param {ValidationRules} [rules]
 * @returns {ValidationResult | null}
 */
export function validateValue(value, rules = {}) {
  const empty = value == null || value === '' || (Array.isArray(value) && !value.length);
  if (empty) return rules.required ? { key: 'validate.required' } : null;
  if (rules.number || typeof value === 'number') {
    const n = parseNumber(value);
    if (Number.isNaN(n)) return { key: 'validate.number' };
    if (n == null) return null; // whitespace only: nothing to compare
    if (rules.min != null && n < rules.min) return { key: 'validate.min', vars: { min: rules.min } };
    if (rules.max != null && n > rules.max) return { key: 'validate.max', vars: { max: rules.max } };
  } else if (typeof value === 'string') {
    if (rules.minLength != null && value.length < rules.minLength) return { key: 'validate.minLength', vars: { count: rules.minLength } };
    if (rules.maxLength != null && value.length > rules.maxLength) return { key: 'validate.maxLength', vars: { count: rules.maxLength } };
    if (rules.pattern && !rules.pattern.test(value)) return { key: 'validate.pattern' };
  }
  if (rules.validate) {
    const r = rules.validate(value);
    if (r) return { key: null, text: String(r) };
  }
  return null;
}

/**
 * Message text of a validation result (null stays null).
 * @param {ValidationResult | null | undefined} r
 * @returns {string | null}
 */
export const validationText = (r) => (r ? (r.text ?? t(/** @type {string} */ (r.key), r.vars)) : null);

/**
 * Is this key event part of an input method composition (a character being put together, e.g. Japanese, Chinese, Korean, dead keys)? Then Enter
 * commits the character and must not submit, confirm or choose. `isComposing`, and keyCode 229 for the keydown some browsers send around it.
 * @param {{ isComposing?: boolean, keyCode?: number }} e
 * @returns {boolean}
 */
export const imeComposing = (e) => !!e.isComposing || e.keyCode === 229;

/**
 * Options that match the search text (all words, accent- and case-insensitive via matchQuery); empty query → all.
 * @template {{ label: string, hint?: string, value: any }} O
 * @param {O[]} options
 * @param {unknown} q
 * @returns {O[]}
 */
export function filterOptions(options, q) {
  const query = String(q || '').trim();
  if (!query) return options;
  return options.filter((o) => matchQuery(`${o.label} ${o.hint || ''} ${o.value}`, query));
}

/**
 * Local calendar day 'YYYY-MM-DD' of a point in time in a time zone.
 * @param {number} ms
 * @param {string} [timeZone]
 */
export function isoDay(ms, timeZone) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(ms);
  const g = (/** @type {string} */ k) => p.find((x) => x.type === k)?.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

/** Add days to a 'YYYY-MM-DD' (calendar arithmetic, no time zone involved). */
export function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Presets of dateRange: 'today' | '7d' | '30d' | 'month' (this month) → { from, to } as 'YYYY-MM-DD'. */
export function rangeFromPreset(id, nowMs, timeZone) {
  const today = isoDay(nowMs, timeZone);
  switch (id) {
    case 'today': return { from: today, to: today };
    case '7d': return { from: addDays(today, -6), to: today };
    case '30d': return { from: addDays(today, -29), to: today };
    case 'month': return { from: `${today.slice(0, 8)}01`, to: today };
    default: return null;
  }
}

/** Which preset does a range equal? (to highlight it) → id | null */
export function presetOf(range, nowMs, timeZone, ids = ['today', '7d', '30d', 'month']) {
  return ids.find((id) => { const r = rangeFromPreset(id, nowMs, timeZone); return r && r.from === range?.from && r.to === range?.to; }) || null;
}

const dayCache = new Map();
/** 'YYYY-MM-DD' → start of that day in the time zone (ms). The end of the day is dayStart(addDays(day, 1)) − 1. Cached (filters call it per row). */
export function dayStart(day, timeZone) {
  const key = `${timeZone}|${day}`;
  let v = dayCache.get(key);
  if (v === undefined) {
    const [y, m, d] = day.split('-').map(Number);
    const wall = Date.UTC(y, m - 1, d);
    v = wall;
    for (let i = 0; i < 2; i++) v = wall - tzOffset(v, timeZone); // twice: the offset can differ at the DST edge
    if (dayCache.size > 500) dayCache.clear();
    dayCache.set(key, v);
  }
  return v;
}
const zoneFmt = new Map();
function tzOffset(ms, timeZone) {
  let f = zoneFmt.get(timeZone);
  if (!f) zoneFmt.set(timeZone, f = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }));
  const p = f.formatToParts(ms);
  const g = (k) => Number(p.find((x) => x.type === k).value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(ms / 1000) * 1000;
}

/**
 * Validate values against field definitions → { errors: { name: text }, first: name | null }.
 * fields: [{ name, required?, rules? }]; values: { name: value }. Texts come from the active language.
 * @param {Array<{ name: string, required?: boolean, rules?: ValidationRules, skip?: boolean }>} fields
 * @param {Record<string, any>} values
 * @returns {{ errors: Record<string, string>, first: string | null }}
 */
export function validateFields(fields, values) {
  /** @type {Record<string, string>} */
  const errors = {};
  for (const f of fields) {
    if (f.skip) continue;
    const msg = validationText(validateValue(values[f.name], { ...(f.rules || {}), required: !!(f.required || f.rules?.required) }));
    if (msg) errors[f.name] = msg;
  }
  return { errors, first: fields.find((f) => errors[f.name])?.name ?? null };
}
