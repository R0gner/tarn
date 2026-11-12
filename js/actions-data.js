// @ts-check
// tarn · logic of confirm() and actionRun() without a DOM (testable in Node): type-to-confirm, run state. (Field validation: inputs-data.js.)

/**
 * Type-to-confirm: the typed text must equal the expected text (surrounding spaces ignored, case matters: a host name is exact).
 * @param {unknown} typed
 * @param {unknown} expected
 */
export const confirmMatches = (typed, expected) => String(typed ?? '').trim() === String(expected ?? '').trim();

export const RUN_STATUS = ['pending', 'running', 'ok', 'bad', 'cancelled'];
const FINAL = new Set(['ok', 'bad', 'cancelled']);
/** @typedef {'pending' | 'running' | 'ok' | 'bad' | 'cancelled'} RunStatus */
/** @typedef {{ status: RunStatus, startedAt: number | null, endedAt: number | null, progress: number | null, log: import('./widgets.js').LogEntry[], message: string | null }} Run A normalised run (times in epoch milliseconds, progress 0..1). */

/**
 * A run in a final state does not change any more (polling stops).
 * @param {string} status
 */
export const isFinal = (status) => FINAL.has(status);

/**
 * Normalise what a board function or URL delivers:
 * { status: 'pending'|'running'|'ok'|'bad'|'cancelled', startedAt?, endedAt?, progress?: 0..1 | null, log?: [{ t, level, text }], message? }.
 * Unknown status → 'running' (the safe reading: keep polling); progress is clamped, junk becomes null; log entries need a text.
 * @param {any} raw anything a board function or URL delivers
 * @returns {Run}
 */
export function normalizeRun(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  /** @type {RunStatus} */
  const status = RUN_STATUS.includes(r.status) ? r.status : 'running';
  const p = typeof r.progress === 'number' && Number.isFinite(r.progress) ? Math.max(0, Math.min(1, r.progress)) : null;
  const log = Array.isArray(r.log) ? r.log.filter((e) => e && e.text != null).map((e) => ({ t: e.t ?? null, level: e.level, text: String(e.text), src: e.src })) : [];
  const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  return { status, startedAt: num(r.startedAt), endedAt: num(r.endedAt), progress: p, log, message: r.message != null ? String(r.message) : null };
}

/**
 * Elapsed seconds of a run: until endedAt, otherwise until now; null without a start.
 * @param {Run} run
 * @param {number} [now]
 * @returns {number | null}
 */
export function elapsedSec(run, now = Date.now()) {
  if (run.startedAt == null) return null;
  return Math.max(0, ((isFinal(run.status) && run.endedAt != null ? run.endedAt : now) - run.startedAt) / 1000);
}

/**
 * Tone of a run status (status token).
 * @param {string} status
 * @returns {import('./primitives.js').Status}
 */
export const runTone = (status) => /** @type {Record<string, import('./primitives.js').Status>} */ ({ pending: 'pending', running: 'info', ok: 'ok', bad: 'bad', cancelled: 'warn' })[status] || 'unknown';
