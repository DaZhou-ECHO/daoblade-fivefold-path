"""检查交付 PNG 的真实透明度、帧边界、调色板及握剑点。"""

import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]


def check() -> None:
    manifest = json.loads((ROOT / "static/sprites/player/manifest.json").read_text("utf-8"))
    count = 0
    for name, action in manifest["animations"].items():
        image = Image.open(ROOT / action["src"].lstrip("/"))
        assert image.format == "PNG" and image.mode == "RGBA", name
        assert image.size == (action["frameCount"] * 64, 96), name
        assert len({pixel for pixel in image.getdata() if pixel[3]}) <= 32, name
        for index, metadata in enumerate(action["frames"]):
            frame = image.crop((index * 64, 0, (index + 1) * 64, 96))
            bounds = frame.getbbox()
            assert bounds and bounds[3] <= manifest["foot"][1], (name, index, bounds)
            assert set(frame.getchannel("A").getdata()) == {0, 255}, (name, index)
            assert frame.getpixel((0, 0))[3] == 0 and frame.getpixel((63, 95))[3] == 0
            x, y = metadata["hand"]
            assert frame.crop((x - 2, y - 2, x + 3, y + 3)).getbbox(), (name, index, "empty hand")
            count += 1
    weapon = Image.open(ROOT / manifest["weapon"]["src"].lstrip("/"))
    assert weapon.mode == "RGBA" and list(weapon.size) == manifest["weapon"]["size"]
    assert weapon.getchannel("A").getextrema() == (0, 255)
    assert weapon.getpixel(tuple(manifest["weapon"]["grip"]))[3] == 255
    print(f"PASS: {count} player frames + separate jian; RGBA, alpha, palette, bounds and grip.")


if __name__ == "__main__":
    check()
