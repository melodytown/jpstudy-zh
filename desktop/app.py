"""日本語 · 本地学习站（桌面版）

把 site/ 目录用本地 HTTP 服务器跑起来，再塞进一个 WebView2 窗口。

**端口是身份，不是随便挑的**：浏览器的 IndexedDB 按 origin(scheme://host:port) 隔离，
端口一变，学习进度就"消失"了。所以默认永远用 PRIMARY_PORT。

端口被占时分三种情况处理：
  1. 占着它的是我们自己（/__jpstudy 认出 app=jpstudy）——这是第二个实例，
     不重复起服务，直接把已有窗口叫到前面来；
  2. 占着它的是别人的程序——从 PRIMARY_PORT 往后找空闲端口，页面顶部会提示
     "本次端口与默认端口进度互不相通"（见 site/assets/lib.js 的横幅）；
  3. 全都占满——弹窗说明，不静默把用户丢进别人的页面。
"""
from __future__ import annotations

import json
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

APP_ID = "jpstudy"
VERSION = "0.4.1"
HOST = "127.0.0.1"
PRIMARY_PORT = 17321
PORT_SPAN = 10  # 17321 … 17330
TITLE = "日本語 · 学习站"
INFO_PATH = "/__jpstudy"


def log(msg: str) -> None:
    """--noconsole 打包后 sys.stdout 是 None，print 会直接抛异常；提示一律走这里。"""
    try:
        print(msg, flush=True)
    except Exception:
        pass


def app_info(port: int) -> dict:
    return {"app": APP_ID, "version": VERSION, "port": port, "primary": port == PRIMARY_PORT}


def site_dir() -> str:
    """打包后从 _MEIPASS 取，开发时从仓库根目录取。"""
    bundle = getattr(sys, "_MEIPASS", None)
    if bundle:
        p = os.path.join(bundle, "site")
        if os.path.isdir(p):
            return p
    here = os.path.dirname(os.path.abspath(sys.executable if getattr(sys, "frozen", False) else __file__))
    for cand in (
        os.path.join(here, "site"),
        os.path.join(here, "..", "site"),
        os.path.join(os.getcwd(), "site"),
    ):
        if os.path.isdir(cand):
            return os.path.abspath(cand)
    raise SystemExit("找不到 site 目录：请把 jpstudy.exe 和 site 文件夹放在一起。")


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".html": "text/html; charset=utf-8",
        ".mp3": "audio/mpeg",
    }

    def do_GET(self):  # noqa: N802 (标准库命名)
        if self.path.split("?")[0] == INFO_PATH:
            body = json.dumps(app_info(self.server.server_address[1]), ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def end_headers(self):
        # 课程数据不缓存（改完内容立刻生效），音频/字体允许缓存
        path = self.path.split("?")[0]
        if path.endswith(".json") or path.startswith("/data/"):
            self.send_header("Cache-Control", "no-store")
        else:
            self.send_header("Cache-Control", "public, max-age=86400")
        super().end_headers()

    def log_message(self, fmt, *args):  # 安静一点
        pass


class LocalServer(ThreadingHTTPServer):
    # Windows 上 SO_REUSEADDR 不等于“快速重启”，而是“允许抢占已在监听的端口”：
    # 两个进程能同时绑 17321，请求随机落到哪个都正常。所以这里必须关掉。
    allow_reuse_address = False
    daemon_threads = True


def port_free(port: int) -> bool:
    """端口能不能给我们用：先看有没有人在听，再试着绑一下。"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe_sock:
        probe_sock.settimeout(0.4)
        if probe_sock.connect_ex((HOST, port)) == 0:
            return False
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as bind_sock:
        try:
            bind_sock.bind((HOST, port))
            return True
        except OSError:
            return False


def probe(port: int, timeout: float = 0.8) -> dict | None:
    """端口上跑的是不是我们自己？是就返回它的 /__jpstudy 内容。"""
    try:
        with urllib.request.urlopen(f"http://{HOST}:{port}{INFO_PATH}", timeout=timeout) as r:
            data = json.loads(r.read().decode("utf-8"))
        return data if data.get("app") == APP_ID else None
    except Exception:
        return None


def pick_port(preferred: int) -> tuple[int | None, dict | None]:
    """返回 (可用端口, 已有实例)；全被别人的程序占着时两者都是 None。"""
    order = [preferred] + [p for p in range(PRIMARY_PORT, PRIMARY_PORT + PORT_SPAN) if p != preferred]
    for port in order:
        if port_free(port):
            return port, None
        info = probe(port)
        if info:
            return None, info
    return None, None


def serve(root: str, port: int) -> ThreadingHTTPServer:
    handler = partial(Handler, directory=root)
    httpd = None
    for attempt in range(5):
        try:
            httpd = LocalServer((HOST, port), handler)
            break
        except OSError:
            # 刚退出重开时可能撞上还没释放的监听，等一等再试
            if attempt == 4:
                raise
            time.sleep(0.2)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def message_box(text: str) -> None:
    """没有窗口可开时的兜底提示（Windows）。"""
    log(text)
    try:
        import ctypes

        ctypes.windll.user32.MessageBoxW(None, text, TITLE, 0x10)
    except Exception:
        pass


def open_window(url: str) -> None:
    try:
        import webview  # pywebview：Windows 上走 WebView2

        webview.create_window(TITLE, url, width=1180, height=880, min_size=(900, 600))
        webview.start()
    except Exception as exc:  # 没有 WebView2 / 缺依赖时退回浏览器
        log(f"WebView 启动失败（{exc}），改用默认浏览器。")
        webbrowser.open(url)
        threading.Event().wait()


def main() -> None:
    # 后台/重定向时 stdout 是块缓冲的：提示信息要立刻看见，不然看起来像“没反应”。
    try:
        sys.stdout.reconfigure(line_buffering=True)
        sys.stderr.reconfigure(line_buffering=True)
    except Exception:
        pass

    if "--version" in sys.argv:
        log(VERSION)
        return

    serve_only = "--serve-only" in sys.argv
    preferred = next((int(a.split("=", 1)[1]) for a in sys.argv if a.startswith("--port=")), PRIMARY_PORT)

    port, existing = pick_port(preferred)
    if existing:
        url = f"http://{HOST}:{existing['port']}/"
        log(f"已经有一个实例在跑（v{existing.get('version')}）：{url}")
        if not serve_only:
            open_window(url)
        return
    if port is None:
        message_box(
            f"端口 {PRIMARY_PORT}–{PRIMARY_PORT + PORT_SPAN - 1} 都被别的程序占用了。\n"
            "请先关掉占用端口的程序，再重新打开 jpstudy。"
        )
        return

    url = f"http://{HOST}:{port}/"
    if port != PRIMARY_PORT:
        log(
            f"默认端口 {PRIMARY_PORT} 被别的程序占用，改用 {port}。\n"
            f"注意：学习进度按端口隔离，这个端口的进度与 {PRIMARY_PORT} 上的互不相通。"
        )

    serve(site_dir(), port)

    if serve_only:
        log(f"serving {site_dir()} at {url}   (Ctrl+C 退出)")
        threading.Event().wait()
        return

    open_window(url)


if __name__ == "__main__":
    main()
