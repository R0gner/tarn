// @ts-check
// tarn · notifications, the sheet: "Notifications" settings for web push (the browser half; the board's backend sends).
//   createApp({ notifications: { api: '/api/push' } })   adds the entry "Notifications" to the sidebar and opens this sheet
//   openNotifications({ api })                           the same sheet without the shell (any page with the barrel or the shell files)
//   notifications({ api })                               controller only (state, enable(), disable(), test()), draw it yourself
//   notificationsPanel(model, actions)                   the content for one model (gallery, tests)
// Logic and the server interface: js/notifications-data.js · service worker: js/push-sw.js (served by the board from its own root) · README "Notifications".
import './locales/shell.js';
import { h, mount } from './dom.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import { button, statusDot } from './primitives.js';
import { banner, toolbarRow } from './components.js';
import { openSheet } from './sheet.js';
import { createNotifications } from './notifications-data.js';

/** @typedef {import('./notifications-data.js').NotificationsOptions} NotificationsOptions */
/** @typedef {import('./notifications-data.js').NotificationModel} NotificationModel */
/** @typedef {import('./notifications-data.js').Notifications} Notifications */
/** @typedef {import('./notifications-data.js').Platform} Platform */
/** @typedef {import('./dom.js').Child} Child */
/** @typedef {{ onEnable?: () => void, onDisable?: () => void, onTest?: () => void, onRetry?: () => void }} NotificationActions */

/** @param {Child[]} steps @returns {HTMLElement} */
const steps = (steps) => h('ol', { class: 'tn-steps' }, steps.map((s) => h('li', null, s)));
const withIcon = (/** @type {string} */ name, /** @type {string} */ text) => [icon(name, { size: 16 }), h('span', null, text)];

/** The steps to put the page on the home screen / dock. @param {'ios' | 'mac'} how @returns {HTMLElement} */
export function installSteps(how) {
  return how === 'ios'
    ? steps([withIcon('share', t('notif.ios.step1')), withIcon('square-plus', t('notif.ios.step2')), t('notif.ios.step3')])
    : steps([t('notif.mac.step1'), withIcon('square-plus', t('notif.mac.step2'))]);
}

/** Sheet for the install entry where the browser has no install prompt (iPhone, iPad, Safari on the Mac). @param {'ios' | 'mac'} how */
export function openInstallHint(how) {
  return openSheet({
    title: t(`notif.install.title.${how}`),
    body: [h('p', null, t(`notif.install.intro.${how}`)), installSteps(how)],
  });
}

/**
 * The content for one model. Every state has its own text; the buttons only call the given actions.
 * @param {NotificationModel} m @param {NotificationActions} [a]
 * @returns {HTMLElement}
 */
export function notificationsPanel(m, a = {}) {
  const busy = m.busy;
  const tone = m.kind === 'on' ? 'ok' : m.kind === 'off' ? 'off' : m.kind === 'loading' ? 'pending' : m.kind === 'ios-install' || m.kind === 'disabled' || m.kind === 'unsupported' ? 'info' : m.kind === 'blocked' ? 'warn' : 'bad';
  /** @param {string} title @param {Child} [text] @param {Child[]} [more] */
  const block = (title, text, more = []) => h('div', { class: 'tn-notif', 'data-kind': m.kind }, h('p', { class: 'tn-notif-title' }, statusDot(tone, { label: title })), text ? h('p', { class: 'tn-muted' }, text) : null, ...more);
  /** @param {string} label @param {string} act @param {(() => void) | undefined} fn @param {import('./primitives.js').ButtonOptions} [o] */
  const btn = (label, act, fn, o = {}) => { const b = button(label, { ...o, disabled: busy || !fn, onClick: () => fn?.() }); b.dataset.act = act; return b; };
  const detail = m.detail || t('common.unknownError');
  const retry = () => toolbarRow(btn(t('notif.retry'), 'retry', a.onRetry, { icon: 'refresh' }));
  /** @type {HTMLElement} */
  let body;
  switch (m.kind) {
    case 'loading': body = block(t('notif.loading')); break;
    case 'unsupported': body = block(t('notif.unsupported.title'), t('notif.unsupported.text')); break;
    case 'insecure': body = block(t('notif.insecure.title'), t('notif.insecure.text')); break;
    case 'ios-install': body = block(t('notif.iosInstall.title'), t('notif.iosInstall.text'), [installSteps('ios')]); break;
    case 'disabled': body = block(t('notif.disabled.title'), t('notif.disabled.text')); break;
    case 'unreachable': body = block(t('notif.unreachable.title'), t('notif.unreachable.text', { detail }), [retry()]); break;
    case 'error': body = block(t('notif.error.title'), t('notif.error.text', { detail }), [retry()]); break;
    case 'blocked': body = block(t('notif.blocked.title'), t('notif.blocked.text'), [retry()]); break;
    case 'off': body = block(t('notif.off.title'), t('notif.off.text'), [toolbarRow(btn(t('notif.enable'), 'enable', a.onEnable, { variant: 'primary', icon: 'bell' }))]); break;
    default: body = block(t('notif.on.title'), t('notif.on.text', { device: m.device || t('notif.thisDevice') }), [
      toolbarRow(btn(t('notif.test'), 'test', a.onTest, { icon: 'bell' }), btn(t('notif.disable'), 'disable', a.onDisable, { variant: 'ghost', icon: 'bell-off' }))]);
  }
  const note = m.message ? banner(t(`notif.msg.${m.message.code}`, { detail: m.message.detail || t('common.unknownError') }), { tone: m.message.kind }) : null;
  return h('div', { class: 'tn-notif-panel' }, body, note);
}

/**
 * Controller plus the sheet. notifications({ api }) → { model, refresh, enable, disable, test, subscribe, open() }.
 * @param {NotificationsOptions} o
 */
export function notifications(o) {
  const n = createNotifications(o);
  /** The sheet; the state is determined while it is open. → the sheet (close() ends it). */
  const open = () => {
    const holder = h('div', { class: 'tn-notif-host' });
    /** @type {ReturnType<typeof openSheet> | null} */
    let sheet = null;
    const draw = () => {
      const focus = /** @type {HTMLElement | null} */ (holder.contains(document.activeElement) ? document.activeElement : null)?.dataset.act;
      mount(holder, notificationsPanel(n.model, { onEnable: n.enable, onDisable: n.disable, onTest: n.test, onRetry: n.refresh }));
      const again = focus && holder.querySelector(`[data-act="${focus}"]:not(:disabled)`);
      if (again instanceof HTMLElement && again !== document.activeElement) again.focus({ preventScroll: true });
    };
    const off = n.subscribe(draw);
    draw();
    sheet = openSheet({ title: t('notif.title'), body: holder, onClose: () => off() });
    n.refresh();
    return sheet;
  };
  return { ...n, open };
}

/** Open the sheet without the shell. @param {NotificationsOptions} o */
export function openNotifications(o) { return notifications(o).open(); }
