"""Serve the built application. No upload or document-processing endpoints."""
import argparse
import functools
import http.server
import errno
import threading
import webbrowser
from pathlib import Path

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript', '.wasm': 'application/wasm'}

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'same-origin')
        self.send_header('Cache-Control', 'no-cache' if self.path in ('/', '/index.html') else 'public, max-age=3600')
        super().end_headers()

def main():
    parser = argparse.ArgumentParser(description='题页 · 试卷转 PPT 网页服务')
    parser.add_argument('--bind', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=5187)
    parser.add_argument('--open', action='store_true', help='启动后自动打开浏览器')
    args = parser.parse_args()
    directory = Path(__file__).resolve().parents[1] / 'dist'
    if not (directory / 'index.html').exists():
        raise SystemExit('未找到 dist/index.html。这可能是源码包，请先按 README 构建，或使用带 dist 文件夹的完整交付包。')
    handler = functools.partial(Handler, directory=str(directory))
    try:
        server = http.server.ThreadingHTTPServer((args.bind, args.port), handler)
    except OSError as error:
        # Double-clicking a second time should still open a usable local page.
        if args.open and (error.errno == errno.EADDRINUSE or getattr(error, 'winerror', None) == 10048):
            server = http.server.ThreadingHTTPServer((args.bind, 0), handler)
        else:
            raise SystemExit(f'网页服务启动失败：{error}。可以用 --port 5189 指定其他端口。')
    with server:
        host = '127.0.0.1' if args.bind == '0.0.0.0' else args.bind
        url = f'http://{host}:{server.server_port}/'
        print(f'题页已启动：{url}', flush=True)
        print('请保持此窗口开启；关闭窗口或按 Ctrl+C 可停止服务。', flush=True)
        if args.open:
            opener = threading.Timer(0.3, webbrowser.open_new_tab, args=(url,))
            opener.daemon = True
            opener.start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
