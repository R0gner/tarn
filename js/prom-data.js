// @ts-check
// tarn · pure helpers of promSource: Prometheus HTTP API answers (matrix, vector, scalar) to chart-ready data, the step of a
// range query, legend templates, the escape helper for label values and the time range presets. No DOM, no fetch.
// The kit does not parse or build PromQL; a board writes its expressions and may use promEscape() for label values.

/** @typedef {Record<string, string>} PromLabels Label set of one series (`__name__` included when the server sends it). */
/** @typedef {string | ((labels: PromLabels) => string)} PromLegend Template like `'{{instance}}'` or a function of the labels. */
/** @typedef {{ label: string, labels: PromLabels, values: (number | null)[] }} PromSeries One line: values on the common grid, `null` where the series has no sample. */
/** @typedef {{ x: number[], series: PromSeries[] }} PromMatrix Result of a range query: times in ms, one common grid (what lineChart/barChart take). */
/** @typedef {{ label: string, labels: PromLabels, value: number | null }} PromSample One row of an instant query. */
/** @typedef {{ id: string, seconds: number, label?: string }} TimeRange A time range "the last `seconds` seconds"; `id` is what the view parameter keeps. */

/** Default presets of the time range control: 1 h, 6 h, 24 h, 7 d, 30 d. @type {TimeRange[]} */
export const RANGE_PRESETS = [
  { id: '1h', seconds: 3600 },
  { id: '6h', seconds: 6 * 3600 },
  { id: '24h', seconds: 24 * 3600 },
  { id: '7d', seconds: 7 * 86400 },
  { id: '30d', seconds: 30 * 86400 },
];

/** Steps a range query may use (seconds); the derived step is the smallest of these that keeps a series at most `maxPoints` long. */
const NICE_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];

/**
 * Step of a range query in seconds: at most about `maxPoints` points over `seconds`, rounded up to a calm value, never below `minStep`.
 * promStep(3600) → 15, promStep(86400) → 300, promStep(3600, { minStep: 60 }) → 60.
 * @param {number} seconds length of the range
 * @param {{ minStep?: number, maxPoints?: number }} [o]
 * @returns {number}
 */
export function promStep(seconds, { minStep = 0, maxPoints = 300 } = {}) {
  const raw = Math.max(seconds / maxPoints, minStep, 1);
  return NICE_STEPS.find((s) => s >= raw) ?? Math.ceil(raw / 86400) * 86400;
}

/**
 * start/end/step (seconds) of a range query over the last `range.seconds` before `nowMs`. end is aligned down to the step so that
 * two fetches within one step ask for the same grid.
 * @param {{ seconds: number }} range
 * @param {number} nowMs
 * @param {{ step?: number, minStep?: number, maxPoints?: number }} [o] `step` fixes the step (seconds)
 * @returns {{ start: number, end: number, step: number }}
 */
export function promRangeParams(range, nowMs, { step, minStep, maxPoints } = {}) {
  const st = step && step > 0 ? step : promStep(range.seconds, { minStep, maxPoints });
  const end = Math.floor(nowMs / 1000 / st) * st;
  return { start: end - Math.ceil(range.seconds / st) * st, end, step: st };
}

/**
 * Escape a value for a double-quoted PromQL string (label matcher `{job="…"}`): backslash, double quote, line breaks.
 * For a regular expression matcher (`=~`) pass `{ regex: true }`: regex metacharacters are escaped as well.
 * @param {unknown} value
 * @param {{ regex?: boolean }} [o]
 * @returns {string}
 */
export function promEscape(value, { regex = false } = {}) {
  let s = String(value ?? '');
  if (regex) s = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r');
}

/**
 * Label of one series: template `'{{instance}} {{job}}'` (missing labels become empty), a function of the labels, or – without a
 * legend – `name{a="x", b="y"}` like Prometheus prints it; a series without any label gets `fallback` (the query name).
 * @param {PromLabels} labels
 * @param {PromLegend | undefined} legend
 * @param {string} [fallback]
 * @returns {string}
 */
export function promLegend(labels, legend, fallback = '') {
  if (typeof legend === 'function') return String(legend(labels) ?? '');
  if (typeof legend === 'string') return legend.replace(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g, (_, k) => labels[k] ?? '').trim();
  const { __name__: name = '', ...rest } = labels;
  const keys = Object.keys(rest).sort();
  if (!keys.length) return name || fallback;
  return `${name}{${keys.map((k) => `${k}="${rest[k]}"`).join(', ')}}`;
}

/** @param {unknown} v @returns {number | null} */
function num(v) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Matrix result (range query) to `{ x, series }` on one common time grid: the union of all sample times, sorted; a series without a
 * sample at a time gets `null` there (a gap in the line). Non-finite values (`NaN`, `±Inf`) become `null` as well.
 * @param {Array<{ metric?: PromLabels, values?: Array<[number, string]> }>} result
 * @param {{ legend?: PromLegend, name?: string }} [o]
 * @returns {PromMatrix}
 */
export function promMatrix(result, { legend, name = '' } = {}) {
  const times = new Set();
  for (const r of result || []) for (const [ts] of r.values || []) times.add(Math.round(Number(ts) * 1000));
  const x = [...times].sort((a, b) => a - b);
  const at = new Map(x.map((t, i) => [t, i]));
  const series = (result || []).map((r) => {
    const labels = { ...(r.metric || {}) };
    /** @type {(number | null)[]} */
    const values = new Array(x.length).fill(null);
    for (const [ts, v] of r.values || []) values[/** @type {number} */ (at.get(Math.round(Number(ts) * 1000)))] = num(v);
    return { label: promLegend(labels, legend, name), labels, values };
  });
  return { x, series };
}

/**
 * Vector or scalar result (instant query) to rows `[{ label, labels, value }]`.
 * @param {{ resultType?: string, result?: any }} data the `data` member of the API answer
 * @param {{ legend?: PromLegend, name?: string }} [o]
 * @returns {PromSample[]}
 */
export function promVector(data, { legend, name = '' } = {}) {
  const { resultType, result } = data || {};
  if (resultType === 'scalar' || resultType === 'string') return [{ label: name, labels: {}, value: num(result?.[1]) }];
  if (resultType === 'matrix') return (result || []).map((/** @type {any} */ r) => {
    const labels = { ...(r.metric || {}) };
    const last = r.values?.[r.values.length - 1];
    return { label: promLegend(labels, legend, name), labels, value: num(last?.[1]) };
  });
  return (result || []).map((/** @type {any} */ r) => {
    const labels = { ...(r.metric || {}) };
    return { label: promLegend(labels, legend, name), labels, value: num(r.value?.[1]) };
  });
}

/**
 * "The one number" of an instant query: the value of the first row, or of the first row whose labels contain all of `match`;
 * `null` when there is none.
 * @param {PromSample[] | null | undefined} rows
 * @param {PromLabels} [match]
 * @returns {number | null}
 */
export function promValue(rows, match) {
  if (!Array.isArray(rows)) return null;
  const row = match ? rows.find((r) => Object.entries(match).every(([k, v]) => r.labels?.[k] === v)) : rows[0];
  return row?.value ?? null;
}

/**
 * Range for a range id (`'6h'`) among `presets`; unknown ids fall back to `fallback` (default: the first preset).
 * @param {string | null | undefined} id
 * @param {TimeRange[]} [presets]
 * @param {string} [fallback]
 * @returns {TimeRange}
 */
export function findRange(id, presets = RANGE_PRESETS, fallback) {
  return presets.find((r) => r.id === id) || presets.find((r) => r.id === fallback) || presets[0];
}

/**
 * Refresh interval (ms) that follows a range: the step, but at least 15 s and at most 5 min.
 * @param {number} stepSec
 * @returns {number}
 */
export function promInterval(stepSec) {
  return Math.min(300_000, Math.max(15_000, stepSec * 1000));
}
