"""Local reader shell. Resolve and pin a public address for every upstream hop."""
import http.client
import ipaddress
import json
import os
from pathlib import Path
import socket
import ssl
import threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urljoin, urlsplit
from urllib.request import Request

ROOT = Path(__file__).resolve().parent.parent
LEDGER = ROOT / "data" / "da_doc.jsonl"
LOCK = threading.Lock()
LIMIT = 10 * 1024 * 1024
ALLOWED = {"accept", "accept-language", "content-type", "user-agent", "api-user-agent", "referer", "authorization"}


def upstream(url, method, headers, body):
    for _ in range(10):
        u = urlsplit(url)
        if u.scheme not in ("http", "https") or not u.hostname or u.username or u.password:
            raise ValueError("Invalid upstream URL")
        port = u.port or (443 if u.scheme == "https" else 80)
        addresses = socket.getaddrinfo(u.hostname, port, type=socket.SOCK_STREAM)
        for address in addresses:
            ip = ipaddress.ip_address(address[4][0])
            if not ip.is_global or ip.is_multicast or getattr(ip, "is_site_local", False):
                raise ValueError("Public upstream addresses required")
        conn = (http.client.HTTPSConnection if u.scheme == "https" else http.client.HTTPConnection)(u.hostname, port, timeout=20)
        # Preserve TLS hostname verification while connecting to the validated IP.
        conn._create_connection = lambda addr, timeout, *args: socket.create_connection((addresses[0][4][0], port), timeout)
        try:
            conn.request(method, Request(url).selector.split("#", 1)[0] or "/", body=body, headers=headers)
            res = conn.getresponse()
            if res.status in (301, 302, 303, 307, 308) and res.getheader("Location"):
                next_url = urljoin(url, res.getheader("Location"))
                if urlsplit(next_url)[:2] != u[:2]:
                    headers = {k: v for k, v in headers.items() if k.lower() != "authorization"}
                if res.status == 303 or (method == "POST" and res.status in (301, 302)):
                    method, body = "GET", None
                url = next_url
                continue
            payload = res.read(LIMIT + 1)
            if len(payload) > LIMIT:
                raise ValueError("Response exceeds 10 MB")
            return res.status, url, res.getheader("Content-Type", "application/octet-stream"), payload
        finally:
            conn.close()
    raise ValueError("Too many redirects")


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".mjs": "text/javascript",
                      ".wasm": "application/wasm", ".json": "application/json", ".svg": "image/svg+xml", ".gz": "application/octet-stream"}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "web"), **kwargs)

    def log_message(self, *args):
        pass

    def parse_request(self):
        if not super().parse_request():
            return False
        port = self.server.server_port
        if self.headers.get("Host") not in (f"localhost:{port}", f"127.0.0.1:{port}"):
            self.send_error(403)
            return False
        return True

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def reply(self, obj, status=200):
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def body(self):
        n = int(self.headers.get("Content-Length", 0))
        if not 0 <= n <= LIMIT:
            raise ValueError("Invalid request length")
        return self.rfile.read(n)

    def proxy(self):
        if self.headers.get("X-DSN") != "1":
            return self.send_error(403)
        try:
            url = parse_qs(urlsplit(self.path).query)["url"][0]
            supplied = json.loads(self.headers.get("X-Proxy-Headers", "{}"))
            headers = {"user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) DocSongNgu/0.1"}
            headers.update({k.lower(): v for k, v in supplied.items() if k.lower() in ALLOWED})
            status, final, mime, payload = upstream(url, self.command, headers, self.body() if self.command == "POST" else None)
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("X-Proxy-Status", str(status))
            self.send_header("X-Proxy-Final-Url", final)
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except Exception as exc:
            self.reply({"error": str(exc)}, 502)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/api/ping":
            return self.reply({"ok": True, "app": "docsongngu"})
        if path == "/proxy":
            return self.proxy()
        if path == "/api/history":
            with LOCK:
                rows = {}
                if LEDGER.exists():
                    for line in LEDGER.read_text(encoding="utf-8").splitlines():
                        if line.strip():
                            item = json.loads(line)
                            rows[item["canon"]] = item
            return self.reply(list(rows.values()))
        super().do_GET()

    def do_POST(self):
        path = urlsplit(self.path).path
        if path == "/proxy":
            return self.proxy()
        if path != "/api/history":
            return self.send_error(404)
        if self.headers.get_content_type() != "application/json":
            return self.send_error(415)
        try:
            item = json.loads(self.body())
            keys = ("url", "canon", "title", "title_tr", "lang", "source_id", "finished_at")
            item = {k: item[k] for k in keys}
            if any(urlsplit(item[k]).scheme not in ("http", "https") for k in ("url", "canon")):
                raise ValueError("Invalid URL")
            with LOCK:
                LEDGER.parent.mkdir(exist_ok=True)
                with LEDGER.open("a", encoding="utf-8", newline="\n") as out:
                    out.write(json.dumps(item, ensure_ascii=False) + "\n")
                    out.flush()
                    os.fsync(out.fileno())
            self.reply({"ok": True})
        except (KeyError, TypeError, ValueError, OSError) as exc:
            self.reply({"error": str(exc)}, 400)


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(os.environ.get("DSN_PORT", 8765))), Handler).serve_forever()
