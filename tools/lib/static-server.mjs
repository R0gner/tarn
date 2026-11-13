// tarn · static test server for the tools (node:http only), same strict CSP as tools/serve.py.
// startServer({ root, port = 0, rewrite?, mounts? }) → { url, port, close() }; binds to 127.0.0.1 only.
// mounts: { '/tarn/': dir } serves a URL prefix from another folder (a board outside the kit keeps its kit copy in vendor/tarn/ and serves it as /tarn/).
// rewrite(urlPath, buffer) → buffer: optional, changes a served file (used by the verify mutants that patch the kit source).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

export const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; " +
  "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};

/**
 * Answer for a request path: { status, headers, body }. Used by the HTTP server and by the CDP file delivery
 * (Fetch.fulfillRequest) of the own headless Chrome, so that both deliver exactly the same bytes and headers.
 */
export function respond(root, urlPath, rewrite) {
  const base = path.resolve(root);
  const head = { 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff' };
  let p;
  try { p = decodeURIComponent(urlPath); } catch { return { status: 400, headers: head, body: Buffer.alloc(0) }; }
  let file = path.resolve(base, `.${p}`);
  if (file !== base && !file.startsWith(base + path.sep)) return { status: 403, headers: head, body: Buffer.alloc(0) };
  let body;
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    body = fs.readFileSync(file);
  } catch { return { status: 404, headers: head, body: Buffer.from('not found') }; }
  if (rewrite) body = rewrite(p, body) ?? body; // a rewrite that throws (patch does not apply) is an error for the caller
  return { status: 200, headers: { ...head, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' }, body };
}

export function startServer({ root, port = 0, rewrite, mounts = {} } = {}) {
  const srv = http.createServer((req, res) => {
    let r;
    try {
      const p = new URL(req.url, 'http://x').pathname;
      const mount = Object.keys(mounts).find((m) => p.startsWith(m));
      r = mount ? respond(mounts[mount], `/${p.slice(mount.length)}`, rewrite) : respond(root, p, rewrite);
    } catch { r = { status: 404, headers: { 'Cache-Control': 'no-store' }, body: Buffer.from('not found') }; }
    res.writeHead(r.status, r.headers).end(r.body);
  });
  return new Promise((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(port, '127.0.0.1', () => {
      const a = srv.address();
      resolve({ port: a.port, url: `http://127.0.0.1:${a.port}`, close: () => new Promise((r) => { srv.closeAllConnections?.(); srv.close(() => r()); }) });
    });
  });
}
