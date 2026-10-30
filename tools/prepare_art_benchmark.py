"""Generate a disposable same-scene browser benchmark using current Canvas fallbacks."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    game = (ROOT / "static/js/game.js").read_text(encoding="utf-8")
    background = game[game.index("  drawBackground("):game.index("  drawPlayer(")]
    monsters = game[game.index("  drawEnemy("):game.index("  drawProjectile(")]
    html = """<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<title>037 同场景美术性能对照</title><style>
body{background:#121e2d;color:#e5e5d7;font:16px sans-serif;margin:24px}
canvas{max-width:100%;height:auto;image-rendering:pixelated;border:1px solid #718093}
button,select{padding:10px;margin:8px}pre{white-space:pre-wrap}
</style><h1>同场景：旧 Canvas 后备 / 本地 PNG</h1>
<p>固定 960×540、六敌人、同坐标与同相机；各测 120 帧。这里比较绘制开销，不代表完整游戏或实体设备性能。</p>
<select id="realm"><option>fire</option><option>wood</option><option>earth</option><option>metal</option><option>water</option></select>
<button id="run" disabled>开始两组对照</button><span id="status">加载资源</span>
<canvas id="view" width="960" height="540"></canvas><pre id="results"></pre>
<script>const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));class LegacyWorldArt {""" + background + monsters + """}</script>
<script src="/static/js/world-art-assets.js"></script><script src="/static/js/enemy-art.js"></script>
<script src="/static/js/scene-art.js"></script><script src="/static/js/world-art-benchmark.js"></script>
</html>"""
    out = ROOT / "static/world-art-benchmark.generated.html"
    out.write_text(html, encoding="utf-8")
    print("Generated static/world-art-benchmark.generated.html (ignored fixture, no game state).")


if __name__ == "__main__":
    main()
