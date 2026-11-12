#!/usr/bin/env python3
"""tarn · tiny static server for local checks (stdlib only).

    python3 tools/serve.py [--root .] [--port 18810] [--bind 127.0.0.1]

Serves the repo root (gallery: http://127.0.0.1:18810/gallery/), without cache and with
the same strict CSP a board should have. CSP violations therefore show up as
console errors (shoot.mjs reports them).
"""
import argparse
import functools
import http.server
import os
import sys

CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
       "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Security-Policy', CSP)
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

    def log_message(self, fmt, *args):
        if os.environ.get('TN_SERVE_QUIET'):
            return
        super().log_message(fmt, *args)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--root', default=os.path.dirname(here), help="folder to serve (default: repo root)")
    ap.add_argument('--port', type=int, default=18810)
    ap.add_argument('--bind', default='127.0.0.1')
    a = ap.parse_args()
    handler = functools.partial(Handler, directory=os.path.abspath(a.root))
    srv = http.server.ThreadingHTTPServer((a.bind, a.port), handler)
    print(f'Tarn serve: http://{a.bind}:{a.port}/  (root {os.path.abspath(a.root)}, pid {os.getpid()})', flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        srv.server_close()
    return 0


if __name__ == '__main__':
    sys.exit(main())
