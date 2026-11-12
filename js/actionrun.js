// @ts-check
// tarn · actionRun(): “action running” – status, elapsed time, progress (if known), live log and an optional cancel button.
// The data comes from a board function or a URL (polling); no WebSocket required.
import { h, cls } from './dom.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import { fmtDuration } from './format.js';
import { statusDot, badge, button } from './components.js';
import { log as logList, progress } from './controls.js';
import { normalizeRun, isFinal, elapsedSec, runTone } from './actions-data.js';

/** @typedef {import('./dom.js').Child} Child */
/** @typedef {import('./actions-data.js').Run} Run */
/** @typedef {(signal: AbortSignal) => Promise<any> | any} RunSourceFn */
/** @typedef {{ source: string | RunSourceFn, title?: Child, intervalMs?: number, maxLog?: number, onCancel?: () => unknown, onDone?: (run: Run) => void, now?: () => number, className?: string }} ActionRunOptions source: a function (gets an AbortSignal) or a same-origin URL that returns the run as JSON. */
/** @typedef {HTMLElement & { stop: () => void, refresh: () => Promise<void>, readonly run: Run }} ActionRunElement */

const POLL_MS = 2000;          // default polling interval (behaviour, not animation)
const TICK_MS = 1000;          // elapsed time while running
const WAIT_MOUNT_MS = 50;      // the element is created before it is placed on the page
const GIVE_UP = 8;             // consecutive failed polls before it stops and offers “Try again”

/**
 * actionRun({
 *   source: (signal) → Promise<run> | url string (JSON, same origin),   run = { status: 'pending'|'running'|'ok'|'bad'|'cancelled', startedAt?, endedAt?, progress?: 0..1 | null, log?: [{ t, level, text }], message? }
 *   title?, intervalMs = 2000, maxLog = 300,
 *   onCancel?: () → Promise | any   (a cancel button is shown while the run is pending or running),
 *   onDone?(run)                    (once, when the status is final: ok, bad or cancelled)
 * }) → element with .stop(), .refresh(), .run (last state)
 *
 * Polls until the status is final or the element leaves the page; `source` is read in full each time (log = everything so far).
 * Progress: a bar with a percentage if progress is known, otherwise an indeterminate bar while running.
 * @param {ActionRunOptions} o
 * @returns {ActionRunElement}
 */
export function actionRun({ source, title, intervalMs = POLL_MS, maxLog = 300, onCancel, onDone, now = Date.now, className }) {
  let run = normalizeRun({ status: 'pending' });
  /** @type {AbortController | null} */
  let ctrl = null;
  let timer = 0, tick = 0, stopped = false, fails = 0, cancelling = false, doneFired = false, stickBottom = true, seen = false, waits = 0;
  const fetchRun = typeof source === 'string'
    ? async (/** @type {AbortSignal} */ signal) => { const r = await fetch(source, { signal, cache: 'no-store', credentials: 'same-origin' }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }
    : source;

  const dot = h('span', { class: 'tn-run-dot' });
  const state = h('span', { class: 'tn-run-state' });
  const elapsed = h('span', { class: 'tn-run-time tn-num' });
  const msg = h('div', { class: 'tn-run-msg', hidden: true });
  const bar = h('div', { class: 'tn-run-bar' });
  const logBox = h('div', { class: 'tn-run-log', tabindex: '0', 'aria-label': t('action.log'), onscroll: () => { stickBottom = logBox.scrollHeight - logBox.scrollTop - logBox.clientHeight < 24; } });
  const warn = h('div', { class: 'tn-run-warn', role: 'status', hidden: true });
  const cancelBtn = onCancel ? button(t('action.cancel'), { small: true, onClick: cancel }) : null;
  const head = h('div', { class: 'tn-run-head' },
    h('div', { class: 'tn-run-status', 'aria-live': 'polite' }, dot, state, elapsed),
    title && h('div', { class: 'tn-run-title tn-ellipsis' }, title), cancelBtn);
  const el = h('div', { class: cls('tn-run', className) }, head, bar, msg, warn, logBox);

  function paint() {
    const tone = runTone(run.status);
    dot.replaceChildren(statusDot(tone));
    state.replaceChildren(badge(t(`action.status.${run.status}`), { tone: tone === 'info' ? 'info' : tone }));
    const sec = elapsedSec(run, now());
    elapsed.textContent = sec == null ? '' : fmtDuration(sec);
    elapsed.hidden = sec == null;
    const active = run.status === 'running' || run.status === 'pending';
    bar.replaceChildren(...(active ? [progress({ value: run.status === 'pending' ? 0 : run.progress, showValue: run.progress != null, label: undefined })] : []));
    bar.hidden = !active;
    msg.textContent = run.message || ''; msg.hidden = !run.message;
    if (cancelBtn) {
      cancelBtn.hidden = !active;
      cancelBtn.disabled = cancelling;
      /** @type {HTMLElement} */ (cancelBtn.querySelector('span')).textContent = cancelling ? t('action.cancelling') : t('action.cancel');
    }
    logBox.replaceChildren(logList(run.log, { max: maxLog, newestFirst: false, time: 'time', empty: t('action.noLog'), wrap: true }));
    if (stickBottom) logBox.scrollTop = logBox.scrollHeight;
    el.dataset.status = run.status;
  }
  /** @param {number} ms */
  function schedule(ms) { clearTimeout(timer); if (!stopped && !isFinal(run.status)) timer = setTimeout(poll, ms); }
  async function poll() {
    if (stopped) return;
    if (el.isConnected) seen = true;
    else if (seen || ++waits > 100) { stopped = true; clearInterval(tick); return; }   // left the page (or was never mounted): stop for good
    else { timer = setTimeout(poll, WAIT_MOUNT_MS); return; }                         // not mounted yet: wait for it
    ctrl?.abort();
    const mine = ctrl = new AbortController();
    try {
      const raw = await fetchRun(mine.signal);
      if (stopped) return;
      fails = 0; warn.hidden = true;
      run = normalizeRun(raw);
      paint();
      if (isFinal(run.status)) { clearInterval(tick); cancelling = false; paint(); if (!doneFired) { doneFired = true; onDone?.(run); } }
    } catch (err) {
      if (stopped || /** @type {Error} */ (err)?.name === 'AbortError') return;
      fails++;
      warn.replaceChildren(icon('alert', { size: 12 }), h('span', null, fails >= GIVE_UP ? t('action.pollGaveUp') : t('action.pollFailed', { error: /** @type {Error} */ (err)?.message || t('common.unknownError') })),
        ...(fails >= GIVE_UP ? [button(t('common.retry'), { small: true, variant: 'ghost', onClick: () => { fails = 0; warn.hidden = true; poll(); } })] : []));
      warn.hidden = false;
      if (fails >= GIVE_UP) return;
    }
    schedule(intervalMs);
  }
  async function cancel() {
    if (cancelling || !onCancel) return;
    cancelling = true; paint();
    try { await onCancel(); } catch (err) { cancelling = false; warn.replaceChildren(icon('alert', { size: 12 }), h('span', null, t('action.cancelFailed', { error: /** @type {Error} */ (err)?.message || t('common.unknownError') }))); warn.hidden = false; paint(); return; }
    poll();   // read the new state at once
  }
  tick = setInterval(() => { if (el.isConnected) seen = true; if (seen && !el.isConnected) { stopped = true; clearInterval(tick); clearTimeout(timer); return; } if (!isFinal(run.status)) { const sec = elapsedSec(run, now()); if (sec != null) elapsed.textContent = fmtDuration(sec); } }, TICK_MS);
  paint();
  poll();
  const run_ = Object.assign(/** @type {HTMLElement} */ (el), {
    stop() { stopped = true; clearTimeout(timer); clearInterval(tick); ctrl?.abort(); },
    refresh() { clearTimeout(timer); return poll(); },
  });
  Object.defineProperty(run_, 'run', { get: () => run });
  return /** @type {ActionRunElement} */ (/** @type {unknown} */ (run_)); // 'run' is defined as a getter right above
}
