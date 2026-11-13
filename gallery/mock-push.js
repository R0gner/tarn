// Gallery: mocked browser APIs and an in-memory backend for the notifications demo (js/notifications.js). No network, no real service worker.
// mockPush(state) → { env, server }: `env` is what createNotifications({ env }) takes instead of the real browser; `server` is the fake backend
// (the five calls of the server interface) with the list of calls it saw. The tests (tests/notifications.test.mjs) use the same mock.
// state: 'off' (not asked yet) | 'on' | 'blocked' | 'unsupported' | 'insecure' | 'ios-install' | 'disabled' | 'unreachable' | 'error'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
export const MOCK_KEY = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';

/** @param {string} [state] @param {{ delay?: number }} [o] delay: ms a mocked server call takes (default 0) */
export function mockPush(state = 'off', { delay = 0 } = {}) {
  const wait = () => (delay ? new Promise((r) => setTimeout(r, delay)) : Promise.resolve());
  /** @type {{ method: string, path: string, body: any }[]} */
  const calls = [];
  const known = new Set();
  const dead = { value: false };
  const asked = { count: 0 };
  let permission = state === 'blocked' ? 'denied' : state === 'on' ? 'granted' : 'default';
  const makeSub = () => {
    const sub = { endpoint: 'https://push.example/send/mock-device-1', toJSON: () => ({ endpoint: sub.endpoint, keys: { p256dh: 'mock', auth: 'mock' } }), unsubscribe: async () => { current.sub = null; return true; } };
    return sub;
  };
  const current = { sub: /** @type {any} */ (state === 'on' ? makeSub() : null) };
  if (current.sub) known.add(current.sub.endpoint);
  const registration = {
    pushManager: {
      getSubscription: async () => current.sub,
      subscribe: async () => { current.sub = makeSub(); return current.sub; },
    },
  };
  const server = {
    calls, known, dead, asked,
    /** @param {string} url @param {any} [init] */
    async fetch(url, init) {
      await wait();
      const path = String(url).replace(/\?.*$/, '').split('/').pop() || '';
      const body = init?.body ? JSON.parse(init.body) : null;
      calls.push({ method: init?.method || 'GET', path, body });
      if (state === 'unreachable' || dead.value) throw new TypeError('Failed to fetch');
      const reply = (/** @type {any} */ data, status = 200) => ({ ok: status < 300, status, json: async () => data });
      if (path === 'key') return reply({ enabled: state !== 'disabled', publicKey: MOCK_KEY });
      if (path === 'status') return reply({ known: known.has(body.endpoint) });
      if (path === 'subscribe') { known.add(body.subscription.endpoint); return reply({ ok: true }); }
      if (path === 'unsubscribe') { known.delete(body.endpoint); return reply({ ok: true }); }
      if (path === 'test') return known.has(body.endpoint) ? reply({ ok: true }) : reply({ ok: false, error: 'unknown subscription', gone: true });
      return reply({ error: 'not found' }, 404);
    },
  };
  const ios = state === 'ios-install';
  const supported = state !== 'unsupported';
  const env = {
    userAgent: ios ? IPHONE : ANDROID, maxTouchPoints: 5, platform: ios ? 'iPhone' : 'Linux armv8l', standalone: false,
    secure: state !== 'insecure',
    hasServiceWorker: supported, hasPush: supported, hasNotification: supported,
    permission: () => /** @type {'default' | 'granted' | 'denied'} */ (permission),
    requestPermission: async () => { asked.count++; await wait(); permission = 'granted'; return /** @type {'granted'} */ ('granted'); },
    register: async () => { if (state === 'error') throw new Error('script /sw.js could not be loaded (404)'); return registration; },
    fetch: (/** @type {string} */ url, /** @type {any} */ init) => server.fetch(url, init),
  };
  return { env, server, setPermission: (/** @type {string} */ p) => { permission = p; } };
}
