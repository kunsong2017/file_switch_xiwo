"""Serve the built application. No upload or document-processing endpoints."""
import argparse
import functools
import http.server
from pathlib import Path

parser = argparse.ArgumentParser(description='题页 · 试卷转 PPT 网页服务')
parser.add_argument('--bind', default='127.0.0.1')
parser.add_argument('--port', type=int, default=5187)
args = parser.parse_args()
directory = Path(__file__).resolve().parents[1] / 'dist'
if not (directory / 'index.html').exists():
    raise SystemExit('缺少 dist/index.html，请先运行 npm run build。')

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript', '.wasm': 'application/wasm'}

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('Cache-Control', 'no-cache' if self.path in ('/', '/index.html') else 'public, max-age=3600')
        super().end_headers()

handler = functools.partial(Handler, directory=str(directory))
with http.server.ThreadingHTTPServer((args.bind, args.port), handler) as server:
    print(f'题页已启动：http://{args.bind}:{args.port}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
