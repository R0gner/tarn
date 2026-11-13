// node --test tests/  ·  notifications, browser half: state machine over mocked browser APIs, server calls, platform detection, service worker.
// The DOM half (sheet, every state, flow) is the overlay scenario `notifications` of verify (gallery with the same mock).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNotifications, createBackend, detectPlatform, manualInstall, deviceLabel, keyBytes } from '../js/notifications-data.js';
import { mockPush, MOCK_KEY } from '../gallery/mock-push.js';

const run = async (state, o) => { const m = mockPush(state, o); const n = createNotifications({ api: '/api/push', env: m.env }); await n.refresh(); return { m, n }; };

test('state per situation: every state of the sheet is reached', async () => {
  const kinds = {};
  for (const s of ['off', 'on', 'blocked', 'unsupported', 'insecure', 'ios-install', 'disabled', 'unreachable', 'error']) kinds[s] = (await run(s)).n.model.kind;
  assert.deepEqual(kinds, { off: 'off', on: 'on', blocked: 'blocked', unsupported: 'unsupported', insecure: 'insecure', 'ios-install': 'ios-install', disabled: 'disabled', unreachable: 'unreachable', error: 'error' });
});

test('nothing is asked before a tap: refresh never prompts, enable() prompts exactly once', async () => {
  const { m, n } = await run('off');
  assert.equal(m.server.asked.count, 0);
  assert.deepEqual(m.server.calls.map((c) => c.path), ['key']);
  await n.enable();
  assert.equal(m.server.asked.count, 1);
  assert.equal(n.model.kind, 'on');
  assert.deepEqual(n.model.message, { kind: 'ok', code: 'enabled' });
  assert.equal(m.server.calls.filter((c) => c.path === 'subscribe').length, 1);
  assert.equal(m.server.calls.find((c) => c.path === 'subscribe').body.label, 'Android, Chrome');
  assert.equal(m.server.known.size, 1);
});

test('unsupported, insecure and iPhone-not-installed ask the server nothing', async () => {
  for (const s of ['unsupported', 'insecure', 'ios-install']) assert.deepEqual((await run(s)).m.server.calls, [], s);
});

test('server not reachable and server without push are different states', async () => {
  const down = (await run('unreachable')).n.model;
  assert.equal(down.kind, 'unreachable');
  assert.match(down.detail, /Failed to fetch/);
  assert.equal((await run('disabled')).n.model.kind, 'disabled');
});

test('on: status asked, a subscription the server forgot is renewed quietly; status failing keeps on with a warning', async () => {
  const { m, n } = await run('on');
  assert.deepEqual(m.server.calls.map((c) => c.path), ['key', 'status']);
  m.server.known.clear();
  await n.refresh();
  assert.equal(n.model.kind, 'on');
  assert.equal(m.server.known.size, 1);
  assert.ok(m.server.calls.some((c) => c.path === 'subscribe'));
  // the server goes away after the key call: subscribed here, status fails
  const x = mockPush('on');
  const real = x.server.fetch; x.env.fetch = async (u, i) => { if (/status/.test(u)) throw new TypeError('Failed to fetch'); return real(u, i); };
  const n2 = createNotifications({ api: '/api/push', env: x.env });
  await n2.refresh();
  assert.equal(n2.model.kind, 'on');
  assert.equal(n2.model.message?.code, 'serverDown');
});

test('test and disable: the server hears about them; a gone subscription turns it off', async () => {
  const { m, n } = await run('on');
  await n.test();
  assert.deepEqual(n.model.message, { kind: 'ok', code: 'testSent' });
  m.server.known.clear();                     // the push service dropped it
  await n.test();
  assert.equal(n.model.message?.code, 'testFailed');
  assert.equal(n.model.kind, 'off');
  const y = await run('on');
  await y.n.disable();
  assert.equal(y.n.model.kind, 'off');
  assert.ok(y.m.server.calls.some((c) => c.path === 'unsubscribe'));
  assert.equal(y.m.server.known.size, 0);
});

test('test: a 404 { ok: false, gone: true } (the parcel board answers so) turns the subscription off', async () => {
  const m = mockPush('on');
  const real = m.env.fetch;
  m.env.fetch = async (u, i) => /\/test/.test(u) ? { ok: false, status: 404, json: async () => ({ ok: false, error: 'Gerät nicht angemeldet', gone: true }) } : real(u, i);
  const n = createNotifications({ api: '/api/push', env: m.env }); await n.refresh();
  await n.test();
  assert.equal(n.model.kind, 'off');
  assert.deepEqual(n.model.message, { kind: 'bad', code: 'testFailed', detail: 'Gerät nicht angemeldet' });
});

test('busy: set during an action, listeners see every change, unsubscribe stops them', async () => {
  const { n } = await run('off', { delay: 5 });
  const seen = [];
  const off = n.subscribe((m) => seen.push(`${m.kind}${m.busy ? '…' : ''}`));
  await n.enable();
  assert.deepEqual([...new Set(seen)], ['off…', 'on…', 'on']);
  off(); const len = seen.length;
  await n.disable();
  assert.equal(seen.length, len);
});

test('denied in the prompt → blocked; dismissed → off with a hint', async () => {
  const a = mockPush('off'); a.env.requestPermission = async () => 'denied';
  const na = createNotifications({ api: '/api/push', env: a.env }); await na.refresh(); await na.enable();
  assert.equal(na.model.kind, 'blocked');
  const b = mockPush('off'); b.env.requestPermission = async () => 'default';
  const nb = createNotifications({ api: '/api/push', env: b.env }); await nb.refresh(); await nb.enable();
  assert.equal(nb.model.kind, 'off');
  assert.equal(nb.model.message?.code, 'dismissed');
  assert.equal(b.server.calls.some((c) => c.path === 'subscribe'), false);
});

test('server interface: paths, methods, bodies, query parameters, errors', async () => {
  const seen = [];
  const f = async (url, init) => { seen.push([url, init?.method || 'GET', init?.body]); return url.includes('bad') ? { ok: false, status: 500, json: async () => ({ error: 'boom' }) } : { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  const b = createBackend('/api/push/', f, { data: 'a b' });
  await b.key(); await b.status('E'); await b.subscribe({ endpoint: 'E' }, 'Pixel'); await b.unsubscribe('E'); await b.test('E');
  assert.deepEqual(seen.map(([u, m]) => `${m} ${u}`), ['GET /api/push/key?data=a+b', 'POST /api/push/status?data=a+b', 'POST /api/push/subscribe?data=a+b', 'POST /api/push/unsubscribe?data=a+b', 'POST /api/push/test?data=a+b']);
  assert.equal(seen[1][2], '{"endpoint":"E"}');
  assert.equal(seen[2][2], '{"subscription":{"endpoint":"E"},"label":"Pixel"}');
  await assert.rejects(createBackend('/api/bad', f).key(), /boom/);
  await assert.rejects(createBackend('/x', async () => ({ ok: false, status: 502, json: async () => { throw new Error('html'); } })).key(), /HTTP 502/);
  assert.throws(() => createNotifications({}), /api/);
});

test('platform: iPhone, iPad (reports itself as a Mac), Safari on the Mac; installed apps need no hint', () => {
  const P = (userAgent, extra = {}) => detectPlatform({ userAgent, maxTouchPoints: 0, platform: '', standalone: false, ...extra });
  const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
  const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
  const MAC_CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
  assert.equal(manualInstall(P(IPHONE)), 'ios');
  assert.equal(manualInstall(P(MAC_SAFARI, { maxTouchPoints: 5, platform: 'MacIntel' })), 'ios');   // iPadOS
  assert.equal(manualInstall(P(MAC_SAFARI, { platform: 'MacIntel' })), 'mac');
  assert.equal(manualInstall(P(MAC_CHROME, { platform: 'MacIntel' })), null);   // Chrome has its own install prompt
  assert.equal(manualInstall(P('Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0')), null);
  assert.equal(manualInstall(P(IPHONE, { standalone: true })), null);
  assert.equal(deviceLabel(IPHONE), 'iOS, Safari');
  assert.equal(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0'), 'Windows, Edge');
});

test('VAPID key: base64url to bytes (65 bytes, uncompressed point)', () => {
  const k = keyBytes(MOCK_KEY);
  assert.equal(k.length, 65);
  assert.equal(k[0], 4);
});

/* ---- service worker (js/push-sw.js) with a mocked worker scope ---- */
async function loadWorker(scope = 'https://board.example/app/') {
  const handlers = {}, shown = [], opened = [];
  const clients = [];
  globalThis.self = {
    addEventListener: (t, f) => { handlers[t] = f; },
    skipWaiting() {},
    registration: { scope, showNotification: async (title, opt) => { shown.push({ title, opt }); } },
    clients: { claim: async () => {}, matchAll: async () => clients, openWindow: async (u) => { opened.push(u); } },
  };
  await import(`../js/push-sw.js?${Math.random()}`);
  return { handlers, shown, opened, clients };
}
const pushEvent = (payload) => { const waits = []; return { data: { json: () => (typeof payload === 'string' ? JSON.parse(payload) : payload), text: () => String(payload) }, waitUntil: (p) => waits.push(p), waits }; };

test('service worker: push only, no fetch handler, no cache', async () => {
  const w = await loadWorker();
  assert.deepEqual(Object.keys(w.handlers).sort(), ['activate', 'install', 'notificationclick', 'push']);
});

test('service worker: push shows title, text, icon and tag; a new message with the same tag alerts again', async () => {
  const w = await loadWorker();
  const e = pushEvent({ title: 'Backup failed', body: 'Offsite sync, 02:30', tag: 'job-7', url: '#/jobs?open=7', icon: 'img/i.png', ts: 1700000000000 });
  w.handlers.push(e); await Promise.all(e.waits);
  assert.deepEqual(w.shown, [{ title: 'Backup failed', opt: { body: 'Offsite sync, 02:30', icon: 'https://board.example/app/img/i.png', data: { url: '#/jobs?open=7' }, tag: 'job-7', renotify: true, timestamp: 1700000000000 } }]);
  const e2 = pushEvent({ title: 'x', tag: 't', renotify: false });
  w.handlers.push(e2); await Promise.all(e2.waits);
  assert.equal(w.shown[1].opt.renotify, false);
  const e3 = pushEvent({});
  w.handlers.push(e3); await Promise.all(e3.waits);
  assert.equal(w.shown[2].title, 'board.example');                                    // no title: the host, never an empty notification
  assert.equal(w.shown[2].opt.icon, 'https://board.example/app/icon-192.png');
  assert.equal('tag' in w.shown[2].opt, false);
  const plain = { data: { json: () => { throw new Error('not json'); }, text: () => 'plain words' }, waitUntil: (p) => plain.w = p };
  w.handlers.push(plain); await plain.w;
  assert.equal(w.shown[3].opt.body, 'plain words');
});

test('service worker: a click focuses an open window and navigates it, else opens the url', async () => {
  const w = await loadWorker();
  const closed = [];
  const click = (url) => { const e = { notification: { close: () => closed.push(1), data: { url } }, waitUntil: (p) => { e.w = p; } }; w.handlers.notificationclick(e); return e.w; };
  await click('#/jobs?open=7');
  assert.deepEqual(w.opened, ['https://board.example/app/#/jobs?open=7']);
  const calls = [];
  w.clients.push({ url: 'https://other.example/', focus: async () => calls.push('other') }, { url: 'https://board.example/app/', focus: async () => calls.push('focus'), navigate: async (u) => calls.push(`navigate ${u}`) });
  await click('#/hosts');
  assert.deepEqual(calls, ['focus', 'navigate https://board.example/app/#/hosts']);
  assert.equal(w.opened.length, 1);
  w.clients[1].navigate = async () => { throw new Error('not allowed'); };
  w.clients[1].postMessage = (m) => calls.push(`message ${m.type} ${m.url}`);
  await click('');
  assert.equal(calls.at(-1), 'message open https://board.example/app/');
  assert.equal(closed.length, 3);
});
