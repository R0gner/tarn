// tarn · worker pool for verify: n pages, each a worker; tasks are pulled in order, results come back in task order
// (so reports and snapshots do not depend on the number of workers).
//
// createPool({ attach, base, proxy, chrome, noSandbox, jobs, root, tmp, log }) → pool
//   Default (no --attach, no --base): ONE own headless Chrome with `jobs` pages (a browser context each); the kit files come from the
//     repo via CDP (Fetch.fulfillRequest), no HTTP server, no network. Works on hosts where the own Chrome cannot open HTTP.
//   --attach URL: one own tab in the running Chrome, files from a local test server (serial: frame timing and focus belong to that browser).
//   --base URL:   own headless Chrome, files from the given server (serial).
//   base + proxy: own headless Chrome with `jobs` pages like the default, but every request is fetched by Node from the server at `base` and
//                 handed to the page over CDP (mode 'upstream'): for a board outside the kit; Chrome needs no network access of its own.
// pool.size, pool.mode ('fetch' | 'upstream' | 'attach' | 'http'), pool.workers[{ id, page, base, con, withRewrite(fn, cb) }]
// pool.run(tasks, fn(task, worker, index)) → results[]   (tasks run in parallel, one per worker)
// pool.runAll(fn(worker)) → results[]                    (the same function on every worker)
// pool.timings: [{ label, worker, ms }] of all tasks with a label
import os from 'node:os';
import { openBrowser, openHeadlessPages, FETCH_ORIGIN } from './cdp.mjs';
import { startServer } from './static-server.mjs';
import { consoleCollector } from '../verify/geometry.mjs';

/** Default number of parallel workers: min(4, cores / 2), at least 1. */
export const defaultJobs = () => Math.max(1, Math.min(4, Math.floor((os.availableParallelism?.() ?? os.cpus().length) / 2)));

export async function createPool({ attach, base, proxy, chrome, noSandbox, jobs, root, tmp, log } = {}) {
  const closers = [];
  const workers = [];
  let mode;
  try {
    if (!attach && (!base || proxy)) {
      mode = base ? 'upstream' : 'fetch';
      const n = Math.max(1, jobs || defaultJobs());
      const h = await openHeadlessPages({ chrome, noSandbox, tmp, n, root, upstream: base || undefined, log });
      closers.push(() => h.close());
      for (const page of h.pages) {
        workers.push({
          id: page.id, page, base: h.origin,
          // mutants: the patched file is served straight from the page's request handler
          async withRewrite(rewrite, cb) {
            if (!rewrite && base) return cb(h.origin);
            page.rewrite(rewrite);
            try { const r = await cb(h.origin); const err = page.takeServeErrors(); if (err.length) throw new Error(err[0]); return r; } finally { page.rewrite(null); }
          },
        });
      }
    } else {
      mode = attach ? 'attach' : 'http';
      let server = null;
      if (!base) { server = await startServer({ root }); closers.push(() => server.close()); }
      const page = await openBrowser({ attach, chrome, noSandbox, tmp, scrollbars: true });
      closers.push(() => page.close());
      workers.push({
        id: 0, page, base: base || server.url,
        async withRewrite(rewrite, cb) {
          if (!rewrite) return cb(base || server.url);
          const msrv = await startServer({ root, rewrite });
          try { return await cb(msrv.url); } finally { await msrv.close(); }
        },
      });
    }
    for (const w of workers) {
      w.con = consoleCollector(w.page);
      await w.page.send('Page.enable'); await w.page.send('Runtime.enable'); await w.page.send('Log.enable');
      await w.page.send('Emulation.setTimezoneOverride', { timezoneId: 'Europe/Berlin' }).catch(() => {});
      await w.page.send('Emulation.setLocaleOverride', { locale: 'en-US' }).catch(() => {});
      w.page.enabled = true;
    }
  } catch (e) {
    for (const c of closers.reverse()) await c().catch(() => {});
    throw e;
  }

  const timings = [];
  const pool = {
    mode, workers, size: workers.length, timings, origin: mode === 'fetch' || mode === 'upstream' ? FETCH_ORIGIN : null,
    async run(tasks, fn) {
      const results = new Array(tasks.length);
      let next = 0, error = null;
      await Promise.all(workers.map(async (w) => {
        for (;;) {
          if (error) return;
          const i = next++;
          if (i >= tasks.length) return;
          const t0 = Date.now();
          try { results[i] = await fn(tasks[i], w, i); } catch (e) { error ||= e; return; }
          if (tasks[i].label) timings.push({ label: tasks[i].label, worker: w.id, ms: Date.now() - t0 });
        }
      }));
      if (error) throw error;
      return results;
    },
    runAll: (fn) => Promise.all(workers.map((w) => fn(w))),
    async close() { for (const c of closers.reverse()) await c().catch(() => {}); },
  };
  return pool;
}
