# Notifications (web push, browser half)

The kit brings the browser half of web push notifications as an optional shell module: a settings sheet that asks for permission, subscribes the device
and sends a test, plus the service worker that shows messages. **Sending stays with the board's backend.** For a board author who wants push: what to add
to `createApp`, which five calls the backend answers and how to serve the worker.

```js
createApp({ notifications: { api: '/api/push' } })        // sidebar entry "Notifications" → settings sheet
openNotifications({ api: '/api/push' })                   // the same sheet without the shell, on any page (needs the barrel)
const n = notifications({ api: '/api/push', worker: '/sw.js', scope: '/', query: { data: token } })   // controller + n.open()
```

| Option | Meaning |
|---|---|
| `api` | base URL of the server interface (required) |
| `worker` | URL of the service worker file, default `sw.js` relative to the page |
| `scope` | worker scope, default the folder of the worker |
| `query` | parameters added to every server call (a token, say) |
| `env` | replaces every browser API; for tests and demos only |

The sheet has one text for every state: *not supported by this browser* · *no https* · *iPhone/iPad, not installed yet* (Share → Add to Home Screen; iOS
only offers notifications to an installed app) · *server does not push* · *server not reachable* (with *Check again*) · *service worker did not start* ·
*blocked* (how to allow it again in the browser or system settings) · *off or not asked yet* (the button that asks; **the browser prompt only ever follows a
tap**) · *on* (send a test notification, turn off). All texts exist in en, de, es, fr.

## Server interface

JSON, same origin, with the page's cookies; `<api>` is the base URL.

| Call | Body | Answer |
|---|---|---|
| `GET <api>/key` | – | `{ "enabled": true, "publicKey": "<VAPID public key, base64url>" }`; `enabled: false` = the server does not push |
| `POST <api>/status` | `{ "endpoint": "…" }` | `{ "known": true \| false }`: does the server still know this subscription? If not, the page subscribes again quietly |
| `POST <api>/subscribe` | `{ "subscription": <PushSubscription.toJSON()>, "label": "Android, Chrome" }` | any 2xx |
| `POST <api>/unsubscribe` | `{ "endpoint": "…" }` | any 2xx (the page ignores a failure) |
| `POST <api>/test` | `{ "endpoint": "…" }` | `{ "ok": true }` or `{ "ok": false, "error": "…", "gone": true \| false }`, with any status; `gone: true` makes the page drop the subscription |

An error answer is a non-2xx status, optionally `{ "error": "text" }` (shown to the user). The status call is a **POST** on purpose: the endpoint URL is a
capability (whoever has it can push to the device) and does not belong in URLs and access logs.

## Service worker

`js/push-sw.js` handles push only: no offline cache, no `fetch` handler.

- `push` shows title, text, icon and tag from the message `{ "title", "body", "tag"?, "url"?, "icon"?, "renotify"?, "ts"? }`. A new message with the same
  `tag` replaces the old one and alerts again unless `renotify` is `false`; without a title the host name is used; a relative `url` or `icon` resolves
  against the scope; the default icon is `icon-192.png` in the scope.
- `notificationclick` focuses an open window of the board and navigates it to `url`, else opens `url`.
- **The board serves this file from its own root**, not from `/tarn/`: a worker only controls the folder it is served from. `GET /sw.js` answers with the
  bytes of `vendor/tarn/js/push-sw.js` (`Content-Type: text/javascript`, `Cache-Control: no-cache`); the scope is then `/`. A board under `/board/` serves it as
  `/board/sw.js` and passes `worker: '/board/sw.js'`; a board that must serve it from a deeper path adds the header `Service-Worker-Allowed: /` and passes
  `scope`. The browser compares the file byte for byte on every visit, so a kit update reaches the devices by itself.

## What a board has to do

1. Implement the five calls: VAPID keys, a table of subscriptions, a sender (`pywebpush`, `web-push` or similar).
2. Serve `push-sw.js` from the board's root.
3. `createApp({ notifications: { api } })`.
4. Send messages in the format above.

No own notification UI, no permission prompt outside the sheet, no service worker with an offline cache.

## Without the shell, and in tests

`openNotifications({ api })` needs only the barrel (or `notifications.js`, its data file and the core). `notificationsPanel(model, actions)` renders the sheet content for one state (the gallery uses it);
`createNotifications({ api, env })` is the logic without any DOM. `env` replaces `serviceWorker`, `PushManager`, `Notification`, the permission, `fetch`, the
user agent and the standalone flag, which is how the tests and the gallery run every state: `gallery/mock-push.js` is a mocked browser plus an in-memory
backend. `openInstallHint` and `manualInstall` serve the install hint (see [identity, icons, installing](identity.md#installing)).

Checks: the overlay scenarios `notifications` (every state through the gallery's mock, and the flow tap → prompt once → on → test → off, with nothing asked
before the tap), `install-hint` and `settings-phone`; `tests/notifications.test.mjs` (state machine, server calls, platform detection, the worker with a
mocked scope); mutants `notifications-ask-on-open`, `install-hint-absent`, `toolbar-crowded`.
