// @ts-check
// tarn · notifications, logic without a DOM: the browser half of web push (the sending half stays with each board's backend).
// createNotifications({ api }) → controller: model (what the sheet shows), refresh(), enable(), disable(), test(), subscribe(listener).
// Everything the browser offers goes through an `env` object (default: the real browser, browserEnv()), so every state can be run with
// mocked browser APIs (tests, gallery, verify). The texts are not here: the sheet (js/notifications.js) maps `kind` and `message` to t().
//
// Server interface (README "Notifications"), `<api>` is the base URL, e.g. '/api/push':
//   GET  <api>/key          → { enabled: boolean, publicKey: string }          VAPID public key (base64url); enabled: false = the server does not push
//   POST <api>/status       { endpoint }                    → { known: boolean }   does the server still know this subscription?
//   POST <api>/subscribe    { subscription, label }         → any 2xx             subscription = PushSubscription.toJSON(), label = "Android, Chrome"
//   POST <api>/unsubscribe  { endpoint }                    → any 2xx
//   POST <api>/test         { endpoint }                    → { ok: true } | { ok: false, error?: string, gone?: boolean }   (ok: false may come with any status, e.g. 404)
// An error answer is a non-2xx status, optionally with { error: string }. Requests are same-origin, JSON, with the page's cookies.

/**
 * What the sheet shows.
 *   loading      the state is being determined
 *   unsupported  this browser cannot do web push
 *   insecure     the page is not served over https (service workers need a secure context)
 *   ios-install  iPhone/iPad: notifications only reach an installed app (Share → Add to Home Screen)
 *   disabled     the server answered but does not offer notifications
 *   unreachable  the server does not answer (or answers an error)
 *   error        the service worker could not be started
 *   blocked      the user denied the permission in the browser or system settings
 *   off          not asked yet, or switched off: a button asks (only after a tap)
 *   on           subscribed: send a test, turn off
 * @typedef {'loading' | 'unsupported' | 'insecure' | 'ios-install' | 'disabled' | 'unreachable' | 'error' | 'blocked' | 'off' | 'on'} NotificationKind
 * @typedef {{ kind: 'ok' | 'warn' | 'bad', code: 'enabled' | 'disabled' | 'testSent' | 'testFailed' | 'enableFailed' | 'disableFailed' | 'dismissed' | 'serverDown', detail?: string }} NotificationMessage
 * @typedef {{ kind: NotificationKind, busy: boolean, message: NotificationMessage | null, device: string, platform: Platform, detail: string }} NotificationModel
 * @typedef {{ ios: boolean, safariMac: boolean, standalone: boolean }} Platform
 */

/**
 * The browser as the module sees it. All members are required; browserEnv() fills them from the globals.
 * @typedef {{
 *   userAgent: string, maxTouchPoints: number, platform: string, standalone: boolean, secure: boolean,
 *   hasServiceWorker: boolean, hasPush: boolean, hasNotification: boolean,
 *   permission: () => 'default' | 'granted' | 'denied',
 *   requestPermission: () => Promise<'default' | 'granted' | 'denied'>,
 *   register: (workerUrl: string, scope?: string) => Promise<Registration>,
 *   fetch: (url: string, init?: any) => Promise<{ ok: boolean, status: number, json: () => Promise<any> }>,
 * }} NotificationEnv
 * @typedef {{ pushManager: { getSubscription: () => Promise<Subscription | null>, subscribe: (o: { userVisibleOnly: boolean, applicationServerKey: Uint8Array }) => Promise<Subscription> } }} Registration
 * @typedef {{ endpoint: string, toJSON: () => any, unsubscribe: () => Promise<boolean> }} Subscription
 */

/** The real browser. Safe to call where there is no browser (then everything is unsupported). */
export function browserEnv() {
  const g = /** @type {any} */ (globalThis);
  const nav = g.navigator || {};
  /** @type {NotificationEnv} */
  const env = {
    userAgent: nav.userAgent || '', maxTouchPoints: nav.maxTouchPoints || 0, platform: nav.platform || '',
    standalone: !!(g.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true),
    secure: g.isSecureContext === true,
    hasServiceWorker: 'serviceWorker' in nav, hasPush: 'PushManager' in g, hasNotification: 'Notification' in g,
    permission: () => g.Notification?.permission || 'denied',
    requestPermission: () => g.Notification.requestPermission(),
    register: async (url, scope) => {
      await nav.serviceWorker.register(url, scope ? { scope } : undefined);
      return nav.serviceWorker.ready;
    },
    fetch: (url, init) => g.fetch(url, init),
  };
  return env;
}

/** @param {Pick<NotificationEnv, 'userAgent' | 'maxTouchPoints' | 'platform' | 'standalone'>} env @returns {Platform} */
export function detectPlatform(env) {
  const ua = env.userAgent || '';
  // iPadOS 13+ reports itself as a Mac with a touch screen
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Mac/.test(env.platform || ua) && env.maxTouchPoints > 1);
  const safariMac = !ios && /Macintosh|Mac OS X/.test(ua) && /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\/|Firefox\/|OPR\//.test(ua);
  return { ios, safariMac, standalone: env.standalone };
}

/**
 * Where the browser has no install prompt but the page can still be put on the home screen / dock: iPhone, iPad and Safari on the Mac.
 * @param {Platform} p
 * @returns {'ios' | 'mac' | null} which hint applies (null: the browser fires beforeinstallprompt or cannot install at all, or already standalone)
 */
export function manualInstall(p) {
  if (p.standalone) return null;
  return p.ios ? 'ios' : p.safariMac ? 'mac' : null;
}

/** "Android, Chrome": the label a server shows next to a subscription. @param {string} ua */
export function deviceLabel(ua) {
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [os, br].filter(Boolean).join(', ');
}

/** VAPID key (base64url) → bytes for pushManager.subscribe(). @param {string} text */
export function keyBytes(text) {
  const b64 = (text + '='.repeat((4 - (text.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/**
 * Server calls of the interface above. `query` is added to every URL (a board that passes a token or a data parameter).
 * @param {string} api @param {NotificationEnv['fetch']} fetchFn @param {Record<string, string>} [query]
 */
export function createBackend(api, fetchFn, query) {
  const base = api.replace(/\/+$/, '');
  const qs = query && Object.keys(query).length ? `?${new URLSearchParams(query)}` : '';
  /** @param {string} path @param {any} [body] */
  async function call(path, body) {
    const res = await fetchFn(`${base}/${path}${qs}`, body === undefined ? { credentials: 'same-origin' } : {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    /** @type {any} */
    let data = null;
    try { data = await res.json(); } catch { /* an empty or non-JSON answer */ }
    if (!res.ok) throw Object.assign(new Error((data && data.error) || `HTTP ${res.status}`), { status: res.status, data });   // data: the answer body (the test call reports `gone` with a 404)
    return data;
  }
  return {
    key: () => call('key'),
    status: (/** @type {string} */ endpoint) => call('status', { endpoint }),
    subscribe: (/** @type {any} */ subscription, /** @type {string} */ label) => call('subscribe', { subscription, label }),
    unsubscribe: (/** @type {string} */ endpoint) => call('unsubscribe', { endpoint }),
    test: (/** @type {string} */ endpoint) => call('test', { endpoint }),
  };
}

/**
 * @typedef {{ api: string, env?: NotificationEnv, worker?: string, scope?: string, query?: Record<string, string> }} NotificationsOptions
 *   api: base URL of the server interface · env: the browser (default browserEnv()) · worker: URL of the service worker file, default 'sw.js'
 *   (relative to the page: the board serves js/push-sw.js from its own root, README "Notifications") · scope: service worker scope (default: the worker's folder) ·
 *   query: parameters added to every server call
 * @typedef {ReturnType<typeof createNotifications>} Notifications
 */

/** @param {NotificationsOptions} o */
export function createNotifications(o) {
  if (!o || typeof o.api !== 'string' || !o.api) throw new Error('notifications: { api } is required (base URL of the server interface, e.g. "/api/push")');
  const env = o.env || browserEnv();
  const backend = createBackend(o.api, env.fetch, o.query);
  const workerUrl = o.worker || 'sw.js';
  /** @type {NotificationModel} */
  const model = { kind: 'loading', busy: false, message: null, device: deviceLabel(env.userAgent), platform: detectPlatform(env), detail: '' };
  /** @type {Set<(m: NotificationModel) => void>} */
  const listeners = new Set();
  /** @type {string | null} */
  let publicKey = null;
  /** @type {Registration | null} */
  let registration = null;
  const emit = () => listeners.forEach((f) => f(model));
  /** @param {Partial<NotificationModel>} p */
  const set = (p) => { Object.assign(model, p); emit(); };
  /** @param {NotificationMessage['kind']} kind @param {NotificationMessage['code']} code @param {string} [detail] @returns {NotificationMessage} */
  const msg = (kind, code, detail) => ({ kind, code, ...(detail ? { detail } : {}) });
  const errText = (/** @type {any} */ e) => String(e?.message || e || '');

  async function register() {
    if (!registration) registration = await env.register(workerUrl, o.scope);
    return registration;
  }
  const currentSub = async () => (await register()).pushManager.getSubscription();

  /** Determine the state: browser, server, permission, subscription (here and at the server). */
  async function refresh() {
    set({ detail: '' });
    const p = model.platform;
    if (p.ios && !p.standalone) return set({ kind: 'ios-install', message: null });
    if (!env.secure) return set({ kind: 'insecure', message: null });
    if (!env.hasServiceWorker || !env.hasPush || !env.hasNotification) return set({ kind: 'unsupported', message: null });
    /** @type {any} */
    let info;
    try { info = await backend.key(); } catch (e) { return set({ kind: 'unreachable', detail: errText(e), message: null }); }
    if (!info?.enabled || !info.publicKey) return set({ kind: 'disabled', message: null });
    publicKey = info.publicKey;
    /** @type {Subscription | null} */
    let sub;
    try { sub = await currentSub(); } catch (e) { return set({ kind: 'error', detail: errText(e), message: null }); }
    if (!sub) return set({ kind: env.permission() === 'denied' ? 'blocked' : 'off', message: null });
    try {   // subscribed here: does the server still know it? Otherwise renew quietly (after a 410, a new database)
      const s = await backend.status(sub.endpoint);
      if (!s?.known) await backend.subscribe(sub.toJSON(), model.device);
      set({ kind: 'on', message: null });
    } catch (e) { set({ kind: 'on', message: msg('warn', 'serverDown', errText(e)) }); }
  }

  /** @template T @param {() => Promise<T>} fn */
  async function busy(fn) {
    set({ busy: true, message: null });
    try { return await fn(); } finally { set({ busy: false }); }
  }

  /** Ask for the permission (browser prompt) and subscribe. Call it from a tap only. */
  const enable = () => busy(async () => {
    try {
      const perm = env.permission() === 'granted' ? 'granted' : await env.requestPermission();
      if (perm !== 'granted') return set(perm === 'denied' ? { kind: 'blocked' } : { kind: 'off', message: msg('warn', 'dismissed') });
      if (!publicKey) throw new Error('no key');
      const reg = await register();
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      await backend.subscribe(sub.toJSON(), model.device);
      set({ kind: 'on', message: msg('ok', 'enabled') });
    } catch (e) { set({ message: msg('bad', 'enableFailed', errText(e)) }); }
  });

  /** Unsubscribe here and at the server (a server error does not matter: it drops dead subscriptions itself). */
  const disable = () => busy(async () => {
    try {
      const sub = await currentSub();
      if (sub) { const endpoint = sub.endpoint; await sub.unsubscribe(); await backend.unsubscribe(endpoint).catch(() => {}); }
      set({ kind: 'off', message: msg('ok', 'disabled') });
    } catch (e) { set({ message: msg('bad', 'disableFailed', errText(e)) }); }
  });

  /** Ask the server to send a test notification to this device. */
  const test = () => busy(async () => {
    try {
      const sub = await currentSub();
      if (!sub) throw new Error('no subscription');
      /** @type {any} */
      let r;
      try { r = await backend.test(sub.endpoint); } catch (e) {
        const d = /** @type {any} */ (e)?.data;
        if (!d || typeof d !== 'object') throw e;
        r = { ok: false, error: d.error || errText(e), gone: d.gone };   // e.g. 404 { ok: false, gone: true }: the server does not know this device
      }
      if (r?.ok) return set({ message: msg('ok', 'testSent') });
      if (r?.gone) { await sub.unsubscribe().catch(() => {}); set({ kind: 'off' }); }
      set({ message: msg('bad', 'testFailed', r?.error || '') });
    } catch (e) { set({ message: msg('bad', 'testFailed', errText(e)) }); }
  });

  return {
    model, refresh, enable, disable, test,
    /** @param {(m: NotificationModel) => void} f @returns {() => void} */
    subscribe(f) { listeners.add(f); return () => listeners.delete(f); },
  };
}
