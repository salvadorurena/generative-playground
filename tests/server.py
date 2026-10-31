"""Dev server for the playground.

Serves the project folder like `python3 -m http.server`, and additionally accepts
POST /tests/baseline.json so the test page can save a new baseline.
Binds to localhost only.

    python3 tests/server.py [port]
"""
import http.server
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
BASELINE = ROOT / 'tests' / 'baseline.json'
MAX_BYTES = 2_000_000


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self):
        if self.path != '/tests/baseline.json':
            self.send_error(404)
            return
        length = int(self.headers.get('Content-Length', 0))
        if not 0 < length <= MAX_BYTES:
            self.send_error(413)
            return
        body = self.rfile.read(length)
        try:
            json.loads(body)
        except ValueError:
            self.send_error(400, 'Invalid JSON')
            return
        BASELINE.write_bytes(body)
        self.send_response(204)
        self.end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    print(f'Serving {ROOT} at http://localhost:{port}')
    http.server.ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
