"""整理已选定的 AI 辅助原画为像素精灵，不调用图像 API。"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import shutil

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
FRAME_SIZE = (64, 96)
FOOT = (32, 90)
# 原图并非精确网格，分区和锚点由首轮逐帧检查确定。
BANDS = ((0, 380), (380, 734), (734, 1086))
HIP_X = (214, 197, 181, 166, 210, 205, 199, 166, 210, 201, 188, 184)
HANDS = ((283, 195), (258, 195), (244, 195), (228, 195),
         (303, 185), (298, 173), (283, 166), (268, 181),
         (302, 168), (278, 160), (270, 160), (284, 165))
SCALE = 0.22


def clean_alpha(image: Image.Image) -> Image.Image:
    """清除半透明毛边和孤立小噪点，保留真实透明背景。"""
    image = image.convert("RGBA")
    alpha = image.getchannel("A").point(lambda value: 255 if value >= 128 else 0)
    pixels = alpha.load()
    visited = set()
    for y in range(image.height):
        for x in range(image.width):
            if not pixels[x, y] or (x, y) in visited:
                continue
            component, queue = [], [(x, y)]
            visited.add((x, y))
            while queue:
                point = queue.pop()
                component.append(point)
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = point[0] + dx, point[1] + dy
                    if (0 <= nx < image.width and 0 <= ny < image.height
                            and pixels[nx, ny] and (nx, ny) not in visited):
                        visited.add((nx, ny))
                        queue.append((nx, ny))
            if len(component) <= 8:
                for point in component:
                    pixels[point] = 0
    image.putalpha(alpha)
    return image


def limited_palette(image: Image.Image, colors: int) -> Image.Image:
    alpha = image.getchannel("A")
    result = image.convert("RGB").quantize(
        colors=colors, method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGBA")
    result.putalpha(alpha)
    return result


def build(sheet_path: Path, sword_path: Path) -> None:
    sheet = Image.open(sheet_path).convert("RGBA")
    if sheet.size != (1448, 1086):
        raise ValueError("角色参考必须使用首轮锁定的 1448×1086 原图")
    frames, metadata = [], []
    for index in range(12):
        column, row = index % 4, index // 4
        source = clean_alpha(sheet.crop((column * 362, BANDS[row][0],
                                        (column + 1) * 362, BANDS[row][1])))
        bounds = source.getbbox()
        if bounds is None:
            raise ValueError(f"第 {index} 帧为空")
        crop = source.crop(bounds)
        scaled = crop.resize((round(crop.width * SCALE), round(crop.height * SCALE)),
                             Image.Resampling.NEAREST)
        # 腾空跑步帧保留收腿形成的离地距离，避免把整个人逐帧拉低。
        top = FOOT[1] - scaled.height if row == 0 else min(20, FOOT[1] - scaled.height)
        offset = (FOOT[0] - round((HIP_X[index] - bounds[0]) * SCALE), top)
        if (offset[0] < 0 or offset[0] + scaled.width > FRAME_SIZE[0]
                or offset[1] < 0):
            raise ValueError(f"第 {index} 帧超出容器：{offset}, {scaled.size}")
        frame = Image.new("RGBA", FRAME_SIZE)
        frame.alpha_composite(scaled, offset)
        hand = [offset[0] + round((HANDS[index][0] - bounds[0]) * SCALE),
                offset[1] + round((HANDS[index][1] - bounds[1]) * SCALE)]
        frames.append(frame)
        metadata.append({"hand": hand, "weaponAngle": 1.15 if row == 0 else 1.38})

    atlas = Image.new("RGBA", (64 * 12, 96))
    for index, frame in enumerate(frames):
        atlas.alpha_composite(frame, (index * 64, 0))
    atlas = limited_palette(atlas, 32)
    player_dir = ROOT / "static/sprites/player"
    weapon_dir = ROOT / "static/sprites/weapons/base"
    for folder in (player_dir / "base", player_dir / "actions", weapon_dir):
        folder.mkdir(parents=True, exist_ok=True)
    atlas.crop((0, 0, 256, 96)).save(player_dir / "base/idle.png")
    atlas.crop((256, 0, 768, 96)).save(player_dir / "actions/run.png")

    sword = clean_alpha(Image.open(sword_path))
    bounds = sword.getbbox()
    crop = sword.crop(bounds)
    sword_scale = 62 / crop.height
    size = (max(1, round(crop.width * sword_scale)), 62)
    blade = crop.resize(size, Image.Resampling.NEAREST)
    weapon = Image.new("RGBA", (20, 64))
    offset_x = (20 - size[0]) // 2
    weapon.alpha_composite(blade, (offset_x, 1))
    limited_palette(weapon, 16).save(weapon_dir / "jian.png")
    grip = [offset_x + round((443 - bounds[0]) * sword_scale),
            1 + round((1435 - bounds[1]) * sword_scale)]

    manifest = {
        "schemaVersion": 1, "id": "swordsman-v1", "stage": 2,
        "frameSize": [64, 96], "foot": list(FOOT),
        "animations": {
            "idle": {"src": "/static/sprites/player/base/idle.png", "fps": 6,
                     "frameCount": 4, "frames": metadata[:4]},
            "run": {"src": "/static/sprites/player/actions/run.png", "fps": 12,
                    "frameCount": 8, "frames": metadata[4:]},
        },
        "weapon": {"src": "/static/sprites/weapons/base/jian.png",
                   "size": [20, 64], "grip": grip},
        "proceduralStates": ["jump", "fall", "slash", "block", "qi", "dash", "hurt", "death"],
        "fallbackStates": [],
        "futureLayers": ["primary", "secondary", "trigram", "depth"],
    }
    (player_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    art_dir = ROOT / "docs/art"
    (art_dir / "sources").mkdir(parents=True, exist_ok=True)
    for source, name in ((sheet_path, "character-v1.png"), (sword_path, "jian-v1.png")):
        target = art_dir / "sources" / name
        if source.resolve() != target.resolve():
            shutil.copy2(source, target)
    preview = Image.new("RGB", (768, 256), "#131f31")
    for index in range(12):
        frame = atlas.crop((64 * index, 0, 64 * (index + 1), 96))
        preview.paste(frame, (64 * index, 20), frame)
        mirrored = frame.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
        preview.paste(mirrored, (64 * index, 140), mirrored)
    draw = ImageDraw.Draw(preview)
    for y in (110, 230):
        draw.line((0, y, 767, y), fill="#b28a53")
    preview.resize((1536, 512), Image.Resampling.NEAREST).save(art_dir / "角色帧检查.png")
    report = {
        "tool": "built-in imagegen + Pillow crop/alpha/palette processing",
        "sheetSha256": hashlib.sha256(sheet_path.read_bytes()).hexdigest(),
        "swordSha256": hashlib.sha256(sword_path.read_bytes()).hexdigest(),
        "frameCount": 12, "bodyPalette": 32, "swordPalette": 16,
    }
    (art_dir / "asset-build.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("Prepared 4 idle frames, 8 run frames, separate jian and manifest.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sheet", type=Path, required=True)
    parser.add_argument("--sword", type=Path, required=True)
    args = parser.parse_args()
    build(args.sheet, args.sword)
