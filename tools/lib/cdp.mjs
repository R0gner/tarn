// tarn · minimal CDP client and Chrome launcher for the tools (Node ≥ 22, no npm packages).
//
// openBrowser({ attach, chrome, port, tmp, noSandbox }) → { send(method, params), on(fn), waitFor(pred, ms), close() }
//   attach: URL of a running Chrome (e.g. http://127.0.0.1:<port>): own tab via /json/new, at the end only
//           this tab is closed. The browser, profile and other tabs are never touched.
//           scrollbars: true leaves them visible (verify: same boxes as in the headed browser); the tools that take screenshots hide them.
//   else:   own headless Chrome with a throw-away profile, own port and own PID; at the end exactly this process.
//           noSandbox (or TN_NO_SANDBOX=1) adds --no-sandbox for CI containers whose kernel forbids the sandbox.
//
// openHeadlessPages({ chrome, noSandbox, tmp, n, root, origin }) → { pages, close() }: one own headless Chrome with n pages, each in its
//   own browser context. The pages get the kit files straight from the repo via CDP (Fetch.fulfillRequest) for every request to
//   `origin` (FETCH_ORIGIN); no HTTP server and no network connection are involved. page.rewrite(fn|null) patches served files (mutants).
import { spawn } from 'node:child_process';
import { respond } from './static-server.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function findChrome(explicit) {
  const c = [explicit, process.env.CHROME, '/opt/google/chrome/chrome', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  for (const p of c) if (fs.existsSync(p)) return p;
  return null;
}

export class CDP {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.handlers = []; }
  open() {
    return new Promise((res, rej) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => res();
      this.ws.onerror = (e) => rej(new Error(`WebSocket: ${e.message || 'error'}`));
      this.ws.onclose = () => { for (const p of this.pending.values()) p.rej(new Error(`${p.method}: connection closed`)); this.pending.clear(); };
      this.ws.onmessage = (ev) => {
        const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString());
        if (msg.id != null && this.pending.has(msg.id)) {
          const { res: r, rej: j, method } = this.pending.get(msg.id); this.pending.delete(msg.id);
          msg.error ? j(new Error(`${method}: ${msg.error.message}`)) : r(msg.result);
        } else if (msg.method) for (const h of [...this.handlers]) h(msg);
      };
    });
  }
  send(method, params = {}, sessionId, timeout = 30000) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    return new Promise((res, rej) => {
      const t = setTimeout(() => { this.pending.delete(id); rej(new Error(`${method}: no response after ${timeout / 1000} s`)); }, timeout);
      this.pending.set(id, { res: (v) => { clearTimeout(t); res(v); }, rej: (e) => { clearTimeout(t); rej(e); }, method });
    });
  }
  on(fn) { this.handlers.push(fn); return () => { this.handlers = this.handlers.filter((x) => x !== fn); }; }
  waitFor(pred, ms) {
    return new Promise((res, rej) => {
      const t = setTimeout(() => { off(); rej(new Error('timeout')); }, ms);
      const off = this.on((m) => { if (pred(m)) { clearTimeout(t); off(); res(m); } });
    });
  }
  close() { try { this.ws.close(); } catch {} }
}

async function waitForDebugger(port, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(`http://127.0.0.1:${port}/json/version`); if (r.ok) return (await r.json()).webSocketDebuggerUrl; } catch {}
    await sleep(150);
  }
  throw new Error(`Chrome debugger on port ${port} not reachable`);
}

/** Find a free port on 127.0.0.1 (bind briefly, release again). */
export async function freePort() {
  const net = await import('node:net');
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
  });
}

/**
 * Open a browser. Returns a page (one tab) with send/on/waitFor and close().
 * log(text) optional for a status line (PID, port or tab).
 */
async function openTab(base, log, onClose) {
  const r = await fetch(`${base}/json/new?about:blank`, { method: 'PUT' });
  if (!r.ok) throw new Error(`/json/new: HTTP ${r.status}`);
  const tab = await r.json();
  const cdp = new CDP(tab.webSocketDebuggerUrl);
  await cdp.open();
  log?.(`own tab ${tab.id} in ${base}`);
  const page = {
    kind: onClose ? 'own' : 'attach', cdp,
    send: (m, p, timeout) => cdp.send(m, p, undefined, timeout),
    on: (fn) => cdp.on(fn), waitFor: (p, ms) => cdp.waitFor(p, ms),
    async close() { process.off('SIGTERM', onSignal); process.off('SIGINT', onSignal); cdp.close(); try { await fetch(`${base}/json/close/${tab.id}`, { method: 'PUT' }); } catch {} await onClose?.(); },
  };
  // abort (SIGTERM/SIGINT): still close our own tab or our own Chrome
  const onSignal = async () => { await page.close().catch(() => {}); process.exit(130); };
  process.once('SIGTERM', onSignal); process.once('SIGINT', onSignal);
  await page.send('Page.bringToFront');
  return page;
}

/** Start an own headless Chrome (throw-away profile, own port, own PID). → { port, proc, cleanup() } */
async function launchHeadless({ chrome, port, tmp, log, noSandbox, scrollbars }) {
  const exe = findChrome(chrome);
  if (!exe) throw Object.assign(new Error('no Chrome found (--chrome PATH or CHROME=…)'), { env: true });
  const dport = port || await freePort();
  const profile = fs.mkdtempSync(path.join(tmp || os.tmpdir(), 'tn-chrome-profile-'));
  const proc = spawn(exe, [
    '--headless=new', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${dport}`, `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-sync',
    '--disable-component-update', ...(scrollbars ? [] : ['--hide-scrollbars']), '--mute-audio', '--lang=de-DE', '--no-proxy-server', '--font-render-hinting=none',
    ...(noSandbox || process.env.TN_NO_SANDBOX === '1' ? ['--no-sandbox', '--disable-dev-shm-usage'] : []), 'about:blank',
  ], { stdio: 'ignore', env: { ...process.env, TZ: 'Europe/Berlin' } });
  log?.(`Chrome pid ${proc.pid}, port ${dport}`);
  const cleanup = async () => {
    if (proc.exitCode == null && proc.signalCode == null) {
      try { process.kill(proc.pid, 'SIGTERM'); } catch {}
      await Promise.race([new Promise((r) => proc.once('exit', r)), sleep(3000)]);
      if (proc.exitCode == null && proc.signalCode == null) { try { process.kill(proc.pid, 'SIGKILL'); } catch {} }
    }
    fs.rmSync(profile, { recursive: true, force: true });
  };
  return { port: dport, proc, cleanup };
}

export async function openBrowser({ attach, chrome, port, tmp, log, noSandbox, scrollbars } = {}) {
  if (attach) return openTab(attach.replace(/\/+$/, ''), log);
  const { port: dport, proc, cleanup } = await launchHeadless({ chrome, port, tmp, log, noSandbox, scrollbars });
  // Own tab via /json/new and a direct tab connection. (Flattened browser sessions via
  // Target.attachToTarget do not answer Page.navigate in Chrome 157 headless.)
  try {
    await waitForDebugger(dport);
    const page = await openTab(`http://127.0.0.1:${dport}`, null, cleanup);
    page.pid = proc.pid;
    return page;
  } catch (e) { await cleanup(); throw e; }
}

/** Origin under which the kit is served to the own headless pages. Never connected to: every request is answered via CDP. */
export const FETCH_ORIGIN = 'http://127.0.0.1:47381';

/**
 * Answer all requests to `origin` from the repo (Fetch.fulfillRequest). Same bytes and headers (CSP!) as the static server.
 * Adds page.rewrite(fn|null) and page.takeServeErrors() (errors of a rewrite, e.g. a mutant patch that does not apply).
 */
async function serveFromDisk(page, { root, origin }) {
  const st = { rewrite: null, errors: [] };
  page.on((m) => {
    if (m.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = m.params;
    let r;
    try { r = respond(root, new URL(request.url).pathname, st.rewrite); } catch (e) { st.errors.push(e.message); r = { status: 500, headers: { 'Cache-Control': 'no-store' }, body: Buffer.from(String(e.message)) }; }
    page.send('Fetch.fulfillRequest', {
      requestId, responseCode: r.status, responseHeaders: Object.entries(r.headers).map(([name, value]) => ({ name, value: String(value) })),
      body: Buffer.from(r.body).toString('base64'),
    }).catch(() => {});
  });
  await page.send('Fetch.enable', { patterns: [{ urlPattern: `${origin}/*`, requestStage: 'Request' }] });
  page.rewrite = (fn) => { st.rewrite = fn || null; };
  page.takeServeErrors = () => st.errors.splice(0);
}

/** Own headless Chrome with n pages (own browser context each), files from the repo via CDP. → { pages, pid, close() } */
export async function openHeadlessPages({ chrome, noSandbox, tmp, n = 1, root, origin = FETCH_ORIGIN, log } = {}) {
  // scrollbars stay visible (like in the headed browser that the snapshots were taken in): inner scroll areas lose 15–16 px of width
  const { port, proc, cleanup } = await launchHeadless({ chrome, tmp, log, noSandbox, scrollbars: true });
  const pages = [];
  let bcdp = null;
  const close = async () => {
    process.off('SIGTERM', onSignal); process.off('SIGINT', onSignal);
    for (const p of pages) p.cdp.close();
    try { bcdp?.close(); } catch {}
    await cleanup();
  };
  const onSignal = async () => { await close().catch(() => {}); process.exit(130); };
  process.once('SIGTERM', onSignal); process.once('SIGINT', onSignal);
  try {
    const browserWs = await waitForDebugger(port);
    bcdp = new CDP(browserWs); await bcdp.open();
    for (let i = 0; i < n; i++) {
      const { browserContextId } = await bcdp.send('Target.createBrowserContext', {});
      const { targetId } = await bcdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
      const cdp = new CDP(`ws://127.0.0.1:${port}/devtools/page/${targetId}`);
      await cdp.open();
      const page = {
        kind: 'own', cdp, id: i,
        send: (m, p, timeout) => cdp.send(m, p, undefined, timeout),
        on: (fn) => cdp.on(fn), waitFor: (p, ms) => cdp.waitFor(p, ms),
        close: async () => { cdp.close(); },
      };
      pages.push(page);
      await serveFromDisk(page, { root, origin });
    }
    return { pages, pid: proc.pid, origin, close };
  } catch (e) { await close(); throw e; }
}

/** Set viewport, touch and colour scheme. size: { w, h, dpr, mobile } */
export async function emulate(page, size, theme) {
  await page.send('Emulation.setDeviceMetricsOverride', { width: size.w, height: size.h, deviceScaleFactor: size.dpr, mobile: size.mobile });
  await page.send('Emulation.setTouchEmulationEnabled', size.mobile ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
  await page.send('Emulation.setEmitTouchEventsForMouse', { enabled: size.mobile, configuration: size.mobile ? 'mobile' : 'desktop' });
  if (theme) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
}

/** Evaluate an expression in the page context (value via JSON). Throws on an exception. */
export async function evaluate(page, expression, { timeout } = {}) {
  const r = await page.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeout);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split('\n')[0] || r.exceptionDetails.text);
  return r.result.value;
}
