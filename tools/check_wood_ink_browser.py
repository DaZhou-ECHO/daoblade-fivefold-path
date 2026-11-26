"""052 木境浏览器检查：真实 Chrome 渲染世界美术预览页，验证木境资源加载并截图。

覆盖：50 张世界 PNG 全部加载（含 10 个木境资源）、木境高径/回廊场景合成、Boss 起手帧。
不覆盖：登录、正式关卡内实玩——那需要完整 UI 流程，留给人工验收。

用法：python tools/check_wood_ink_browser.py
产物：work/wood-browser/browser-preview-ridge.png / -hollow.png / -boss.png
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from pathlib import Path

from werkzeug.serving import WSGIRequestHandler, make_server

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / "work/wood-browser"
WORK.mkdir(parents=True, exist_ok=True)
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

os.environ.setdefault("DAOBLADE_DATABASE", str(WORK / "browser-check.sqlite3"))
from app import create_app  # noqa: E402

app = create_app({"TESTING": True, "SECRET_KEY": "wood-browser-check"})


class Quiet(WSGIRequestHandler):
    def log_request(self, *args, **kwargs):
        pass


def main() -> int:
    server = make_server("127.0.0.1", 0, app, request_handler=Quiet)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    profile = WORK / f"chrome-{int(time.time())}"
    profile.mkdir(parents=True, exist_ok=True)
    chrome = Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe")
    if not chrome.is_file():
        print("Chrome 未找到")
        return 2
    process = None
    try:
        process = subprocess.Popen(
            [str(chrome), "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
             "--remote-debugging-port=0", f"--user-data-dir={profile}", "about:blank"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        port = None
        for _ in range(120):
            port_file = profile / "DevToolsActivePort"
            if port_file.exists():
                port = port_file.read_text(encoding="utf-8").splitlines()[0]
                break
            time.sleep(0.1)
        if not port:
            print("Chrome 调试端口未就绪")
            return 3
        result = subprocess.run(
            ["node", str(ROOT / "tools/wood-ink-cdp.cjs"), port,
             f"http://127.0.0.1:{server.server_port}", str(WORK)],
            capture_output=True, timeout=120)
        output = result.stdout.decode("utf-8", errors="replace").strip()
        error = result.stderr.decode("utf-8", errors="replace").strip()
        if output:
            try:
                print(json.dumps(json.loads(output.splitlines()[-1]), ensure_ascii=False, indent=2))
            except json.JSONDecodeError:
                print(output)
        if error:
            print(error)
        print("screenshots:", sorted(p.name for p in WORK.glob("browser-preview-*.png")))
        return result.returncode
    finally:
        if process:
            process.terminate()
            process.wait(timeout=10)
        server.shutdown()


if __name__ == "__main__":
    raise SystemExit(main())
