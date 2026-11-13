// @ts-check
// tarn · service worker for web push, and nothing else: no offline cache, no fetch handler (the app loads from the server as always).
// The board serves this file from its OWN root, e.g. GET /sw.js (or /<board>/sw.js), not from /tarn/: a worker controls only the folder it is
// served from, so a copy under /tarn/js/ could not reach the board's pages (README "Notifications").
//
// Message = JSON { title, body, tag?, url?, icon?, renotify?, ts? }, sent by the board's backend (encrypted, RFC 8291):
//   push               shows title, body, icon and tag; a new message with the same tag replaces the old one and still alerts (renotify, unless false)
//   notificationclick  focuses an open window of the board and navigates it to `url`, else opens `url`
// A relative `url` or `icon` is resolved against the worker's scope. A plain-text payload is used as the body.
// any: this is a ServiceWorkerGlobalScope, and the kit's type check (jsconfig.json) has the DOM lib only, not the WebWorker lib
const sw = /** @type {any} */ (self);

sw.addEventListener('install', () => { sw.skipWaiting(); });
sw.addEventListener('activate', (/** @type {any} */ e) => e.waitUntil(sw.clients.claim()));

sw.addEventListener('push', (/** @type {any} */ e) => {
  /** @type {any} */
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  /** @type {Record<string, any>} */
  const opt = {
    body: d.body || '',
    icon: new URL(d.icon || 'icon-192.png', sw.registration.scope).href,
    data: { url: d.url || '' },
  };
  if (d.tag) { opt.tag = d.tag; opt.renotify = d.renotify !== false; }
  if (d.ts) opt.timestamp = d.ts;
  e.waitUntil(sw.registration.showNotification(d.title || new URL(sw.registration.scope).hostname, opt));
});

sw.addEventListener('notificationclick', (/** @type {any} */ e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '', sw.registration.scope).href;
  e.waitUntil((async () => {
    const list = await sw.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = list.find((/** @type {any} */ c) => c.url.startsWith(sw.registration.scope));
    if (app) {
      await app.focus().catch(() => {});
      try { await app.navigate(url); } catch { app.postMessage({ type: 'open', url }); }
      return;
    }
    await sw.clients.openWindow(url);
  })());
});
