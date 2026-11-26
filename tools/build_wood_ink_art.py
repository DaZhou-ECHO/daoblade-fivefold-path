"""木境专属水墨美术重建：只读写 wood-* 资源，不触碰其他五行。

用法：
    python tools/build_wood_ink_art.py --all
    python tools/build_wood_ink_art.py --scenes --preview
    python tools/build_wood_ink_art.py --monsters

设计约束（见 docs/implementation/052-木境水墨.md）：
- 输出尺寸与文件名不变，manifest、world-art-assets 校验与帧时序都不受影响；
- 只写 static/sprites/world-v1/wood-*.png，脚本内对文件名做前缀断言；
- 调色板回到原上限（Boss 47、普通怪 31、场景 64），透明通道保持原样；
- 所有随机元素使用固定种子，重复运行结果一致。
- 背景在游戏里会被放大到 3200 宽绘制（约 4 倍），因此水墨层必须是大尺度形体，
  不能依赖 1px 细节。
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "static/sprites/world-v1"
# 原始木境资源快照：既是回滚备份，也是每次重建的输入，保证重复运行结果一致。
SOURCE = ROOT / "docs/art/wood-v1-legacy"
PREVIEW = ROOT / "work/wood-ink-preview"

PAPER = (233, 227, 209)
MIST = (201, 208, 190)
INK_MID = (54, 76, 64)
INK_DEEP = (16, 24, 22)
MOSS = (92, 118, 84)
SAGE = (148, 168, 130)
BARK = (96, 74, 46)
SEAL = (164, 58, 45)

FAMILIES = [("wood-guard", 64, 96, 31), ("wood-special", 96, 96, 31),
            ("wood-ranged", 64, 96, 31), ("wood-boss", 128, 144, 47)]


def lerp(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def luminance(pixel) -> float:
    r, g, b = pixel[:3]
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255.0


def noise(x: int, y: int, seed: int = 20520) -> float:
    """确定性噪声，不依赖 random 状态。"""
    h = (x * 374761393 + y * 668265263 + seed * 2654435761) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


def quantize(image: Image.Image, colors: int) -> Image.Image:
    alpha = image.getchannel("A")
    result = image.convert("RGB").quantize(colors=colors).convert("RGBA")
    result.putalpha(alpha)
    return result


def load(name: str) -> Image.Image:
    """默认从原始快照读取，避免在已处理结果上反复叠加。"""
    for base in (SOURCE, ASSETS):
        path = base / f"{name}.png"
        if path.is_file():
            return Image.open(path).convert("RGBA")
    raise FileNotFoundError(name)


def load_built(name: str) -> Image.Image:
    return Image.open(ASSETS / f"{name}.png").convert("RGBA")


def save(image: Image.Image, name: str) -> None:
    assert name.startswith("wood-"), f"木境工具不得写出非木境资源: {name}"
    image.save(ASSETS / f"{name}.png", optimize=True)


# ---------------------------------------------------------------- 大气层

def scaled_alpha(layer: Image.Image, factor: float) -> Image.Image:
    layer.putalpha(layer.getchannel("A").point(lambda p: round(p * factor)))
    return layer


def paper_sky(size: tuple[int, int], height: int, strength: int, hollow: bool) -> Image.Image:
    """顶部留白：天空压向宣纸色，越靠近顶端越淡。"""
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    warm = (196, 201, 186) if hollow else PAPER
    for row in range(height):
        t = 1 - row / max(1, height - 1)
        draw.line((0, row, size[0], row), fill=warm + (round(strength * t ** 1.3),))
    return layer.filter(ImageFilter.GaussianBlur(1.0))


def ink_peaks(size: tuple[int, int], hollow: bool) -> Image.Image:
    """远景墨山：大形体、边缘碎笔，低对比叠在远山之上。"""
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    width = size[0]
    configs = [(30, 16, 3.2, 0.7, INK_MID, 46), (52, 12, 4.6, 2.1, (72, 92, 78), 34)]
    for base, amplitude, frequency, phase, color, alpha in configs:
        points = [(0, size[1])]
        for x in range(-4, width + 8, 6):
            swell = math.sin((x / width) * math.pi * frequency + phase) * amplitude
            grit = (noise(x, base, 31) - 0.5) * amplitude * 0.8
            points.append((x, round(base + swell + grit)))
        points.append((width, size[1]))
        draw.polygon(points, fill=color + (alpha,))
    return layer.filter(ImageFilter.GaussianBlur(1.4))


def mist_banks(size: tuple[int, int], hollow: bool) -> Image.Image:
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    bands = ((58, 30, 74), (86, 22, 58), (112, 16, 44)) if not hollow else \
            ((50, 26, 66), (78, 20, 52), (106, 14, 38))
    for y, height, strength in bands:
        band = wet_band(size, y, height, MIST, strength)
        layer.alpha_composite(band)
    return layer


def wet_band(size: tuple[int, int], y: int, height: int, color, strength: int) -> Image.Image:
    """湿边雾带：上下浓、中间淡，边缘略干。"""
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for row in range(height):
        t = row / max(1, height - 1)
        alpha = round(strength * math.sin(math.pi * t) ** 0.6)
        draw.line((0, y + row, size[0], y + row), fill=color + (alpha,))
    return layer.filter(ImageFilter.GaussianBlur(1.6))


def paper_grain(image: Image.Image, strength: int = 4) -> Image.Image:
    width, height = image.size
    source = image.load()
    out = image.copy()
    target = out.load()
    for y in range(height):
        for x in range(width):
            r, g, b, a = source[x, y]
            if a and luminance((r, g, b)) > 0.5:
                shift = round((noise(x, y, 5) - 0.5) * 2 * strength)
                target[x, y] = (max(0, min(255, r + shift)), max(0, min(255, g + shift)),
                                max(0, min(255, b + shift)), a)
    return out


def vignette(image: Image.Image, strength: int = 22) -> Image.Image:
    width, height = image.size
    mask = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(mask)
    for row in range(height):
        t = abs(row / max(1, height - 1) - 0.5) * 2
        draw.line((0, row, width, row), fill=round(strength * t ** 2))
    darkness = Image.new("RGBA", image.size, INK_DEEP + (255,))
    out = image.copy()
    out.paste(darkness, (0, 0), mask)
    return out


def brush_sweeps(size: tuple[int, int], hollow: bool) -> Image.Image:
    """几条大笔触：从右上向左下的干笔，给远景“写”出来的感觉。"""
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    strokes = ((120, 30, 300, 74, 24), (420, 22, 250, 62, 18), (600, 46, 210, 78, 16)) \
        if not hollow else ((90, 26, 280, 56, 28), (470, 40, 240, 64, 22))
    for x0, y0, dx, drop, alpha in strokes:
        for step in range(dx):
            t = step / max(1, dx - 1)
            width = max(1, round(6 * (1 - t)))
            x = x0 + step
            y = y0 + round(drop * t ** 1.4 + math.sin(t * 9) * 2)
            draw.line((x, y, x, y + width), fill=(26, 38, 34, round(alpha * (1 - t * 0.6))))
    return layer.filter(ImageFilter.GaussianBlur(0.8))


def atmosphere(base: Image.Image, hollow: bool) -> Image.Image:
    """轻水墨：只在原画上压一层纸色天光、一道淡墨山脊和两缕薄雾。

    木境远/中景在游戏里被放大到 3200 宽绘制，重处理会糊掉原有层次，
    因此这里坚持“少即是多”，把细节留给原画。
    """
    out = base.copy()
    peaks = ink_peaks(base.size, hollow)
    peaks.putalpha(peaks.getchannel("A").point(lambda p: round(p * 0.4)))
    out.alpha_composite(peaks)
    out.alpha_composite(scaled_alpha(paper_sky(base.size, 40, 52 if not hollow else 44, hollow), 1.0))
    light = Image.new("RGBA", base.size, (0, 0, 0, 0))
    light.alpha_composite(wet_band(base.size, 62, 18, MIST, 26 if not hollow else 22))
    light.alpha_composite(wet_band(base.size, 96, 12, MIST, 18 if not hollow else 16))
    out.alpha_composite(light)
    return paper_grain(out, 3)


def build_scene(name: str, hollow: bool) -> None:
    base = load(name)
    save(quantize(atmosphere(base, hollow), 64), name)


def build_mid(name: str, hollow: bool) -> None:
    """中景：整体压暗并把大枝干/藤帘压进画面，与远景拉开层次。"""
    base = load(name)
    width, height = base.size
    out = base.copy()
    # 压暗到墨色一侧，保证远/中景可分辨；不改变远处山形本身。
    shade = Image.new("RGBA", base.size, INK_DEEP + (46,))
    out.alpha_composite(shade)
    draw = ImageDraw.Draw(out)
    for index, x in enumerate((44, 132, 214, 300, 392, 486, 574, 664, 742)):
        thickness = 12 + (index * 7) % 12
        top = 0
        bottom = 26 + (index * 17) % 46
        draw.rectangle((x, top, x + thickness, bottom), fill=(22, 32, 30, 132))
        draw.rectangle((x + 1, top, x + max(2, thickness // 3), bottom), fill=(44, 60, 50, 96))
        # 藤帘：从枝干垂下的粗线，长短不一
        for k in range(2):
            vx = x + 3 + k * (thickness // 2)
            fall = 30 + (index * 11 + k * 23) % 48
            draw.line((vx, bottom - 4, vx + (k * 2 - 1) * 3, bottom + fall),
                      fill=(26, 36, 32, 120), width=2)
    # 底部根系拱：交代中景与地面的关系，不覆盖玩家活动区。
    for x in range(-30, width + 30, 128):
        draw.arc((x, height - 26, x + 104, height + 18), 205, 335,
                 fill=(20, 28, 24, 140), width=3)
    if hollow:
        for x in range(20, width, 64):
            draw.line((x, 0, x + 2, 14 + (x % 19)), fill=(14, 20, 20, 150), width=3)
        out.alpha_composite(wet_band((width, height), 54, 20, (156, 168, 162), 52))
    save(quantize(out, 64), name)


# ---------------------------------------------------------------- 地形

def build_tiles() -> None:
    """128x32 四格图集，按 1:1 绘制：0 地面顶、1 单向栈道、2 填充、3 装饰根柱。"""
    image = Image.new("RGBA", (128, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(image)

    # 0 地面顶：苔冠清晰可读 + 树皮纹理 + 根系收边
    d.rectangle((0, 0, 31, 31), fill=(52, 64, 48))
    for x in range(32):
        dip = 5 + (1 if x % 7 in (2, 3) else 0)
        d.line((x, 0, x, dip), fill=(122, 148, 96))
        d.point((x, 0), fill=(186, 206, 146) if x % 3 else (146, 172, 108))
        d.point((x, dip), fill=(62, 78, 54))
    for y in (13, 21, 28):
        d.line((0, y, 31, y), fill=(44, 56, 42))
    for x in range(2, 32, 6):
        d.line((x, 7, x + 1, 31), fill=(34, 44, 34))
    for x, y in ((5, 16), (14, 25), (23, 13), (28, 29)):
        d.point((x, y), fill=(150, 172, 116))
    for x in range(0, 32, 4):
        d.line((x, 31, x + 1, 29), fill=(28, 36, 28))

    # 1 单向栈道：明亮苔面 + 垂根
    d.rectangle((32, 0, 63, 9), fill=(56, 70, 50))
    for x in range(32, 64):
        d.point((x, 0), fill=(190, 210, 150) if x % 4 else (140, 166, 104))
        d.line((x, 1, x, 5), fill=(116, 142, 90))
    d.line((32, 6, 63, 6), fill=(66, 82, 56))
    d.line((32, 9, 63, 9), fill=(30, 40, 32))
    for x in range(33, 63, 5):
        length = 3 + (x * 7) % 6
        d.line((x, 10, x, 9 + length), fill=(74, 94, 64, 200))
        d.point((x, 10 + length), fill=(104, 126, 86, 170))

    # 2 填充：暗土与碎石
    d.rectangle((64, 0, 95, 31), fill=(28, 36, 30))
    for y in range(3, 32, 6):
        d.line((64, y, 95, y), fill=(36, 46, 38))
    for x, y, r in ((71, 9, 3), (86, 18, 4), (75, 26, 2), (90, 6, 2)):
        d.ellipse((x - r, y - r, x + r, y + r), fill=(46, 58, 46), outline=(20, 28, 24))
    d.line((67, 2, 72, 12, 68, 21), fill=(58, 72, 52))

    # 3 装饰根柱：左亮右暗 + 苔斑（不参与碰撞）
    d.rectangle((100, 0, 119, 31), fill=(48, 60, 46))
    d.rectangle((100, 0, 103, 31), fill=(88, 108, 72))
    d.rectangle((117, 0, 119, 31), fill=(24, 32, 28))
    for y in (6, 16, 25):
        d.line((104, y, 114, y), fill=(34, 44, 36))
    d.rectangle((107, 8, 112, 11), fill=(96, 120, 82))
    for x in range(96, 128, 3):
        d.line((x, 31, x + 2, 25), fill=(30, 40, 32, 150))
    save(quantize(image, 40), "wood-tiles")


def build_props() -> None:
    """256x96 四格道具，按 1:1 绘制：剑碑、祭坛、捷径机关、山门。"""
    image = Image.new("RGBA", (256, 96), (0, 0, 0, 0))
    d = ImageDraw.Draw(image)
    for n in range(4):
        x = n * 64
        d.ellipse((x + 6, 84, x + 58, 92), fill=(24, 32, 28))
        d.rectangle((x + 8, 84, x + 56, 87), fill=(82, 104, 72))

    # 剑碑：纸白石面、墨裂、苔根、朱印
    x = 0
    d.polygon([(x + 21, 12), (x + 43, 12), (x + 47, 84), (x + 17, 84)], fill=(168, 174, 156))
    d.polygon([(x + 24, 15), (x + 40, 15), (x + 42, 82), (x + 22, 82)], fill=(208, 210, 190))
    d.line((x + 31, 22, x + 28, 44, x + 34, 58, x + 31, 78), fill=(58, 72, 62))
    d.line((x + 36, 28, x + 38, 50), fill=(58, 72, 62))
    d.line((x + 25, 62, x + 29, 74), fill=(72, 88, 74))
    d.rectangle((x + 35, 64, x + 40, 69), fill=SEAL)
    d.line((x + 17, 82, x + 47, 82), fill=(96, 120, 82), width=2)
    for px in (19, 25, 41, 45):
        d.line((px, 80, px, 84), fill=(72, 92, 64))

    # 祭坛：树瘤台座、苔顶、浅碗、墨点
    x = 64
    d.ellipse((x + 15, 64, x + 49, 84), fill=(62, 78, 56))
    d.ellipse((x + 17, 64, x + 47, 76), fill=(104, 130, 88))
    d.rectangle((x + 25, 46, x + 39, 68), fill=(86, 68, 44))
    for y in (50, 56, 62):
        d.line((x + 26, y, x + 38, y), fill=(64, 50, 34))
    d.rectangle((x + 26, 46, x + 29, 68), fill=(118, 94, 58))
    d.ellipse((x + 21, 34, x + 43, 50), fill=(150, 170, 124))
    d.ellipse((x + 24, 37, x + 40, 47), fill=(196, 202, 176))
    for k in range(3):
        d.point((x + 28 + k * 5, 41 + (k % 2) * 3), fill=(70, 86, 70))
    d.rectangle((x + 33, 52, x + 38, 57), fill=SEAL)

    # 捷径机关：木桩、绳柄、苔痕
    x = 128
    d.rectangle((x + 22, 54, x + 42, 84), fill=(64, 78, 56))
    d.rectangle((x + 24, 54, x + 28, 84), fill=(96, 116, 78))
    for y in (60, 68, 76):
        d.line((x + 29, y, x + 40, y), fill=(48, 60, 44))
    d.line((x + 33, 58, x + 46, 36), fill=(126, 100, 62), width=3)
    d.ellipse((x + 41, 27, x + 52, 38), fill=(150, 170, 124), outline=(52, 66, 50))
    d.rectangle((x + 45, 31, x + 48, 34), fill=(96, 120, 82))
    d.rectangle((x + 26, 78, x + 38, 82), fill=SEAL)

    # 山门：双干门框、横枝门楣、藤帘、雾隙、朱印
    x = 192
    d.rectangle((x + 8, 18, x + 16, 84), fill=(48, 62, 44))
    d.rectangle((x + 8, 18, x + 10, 84), fill=(112, 134, 90))
    d.rectangle((x + 14, 18, x + 16, 84), fill=(28, 38, 32))
    d.rectangle((x + 47, 18, x + 55, 84), fill=(48, 62, 44))
    d.rectangle((x + 47, 18, x + 49, 84), fill=(112, 134, 90))
    d.rectangle((x + 53, 18, x + 55, 84), fill=(28, 38, 32))
    # 门楣：横枝 + 树冠，压住两柱并向右上伸
    d.polygon([(x + 4, 20), (x + 60, 20), (x + 58, 26), (x + 6, 26)], fill=(66, 82, 56))
    d.line((x + 6, 21, x + 58, 21), fill=(124, 146, 98))
    for cx, cy, r in ((x + 14, 14, 7), (x + 30, 10, 9), (x + 48, 14, 8)):
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(88, 110, 72))
        d.ellipse((cx - r + 1, cy - r + 1, cx + r - 2, cy - 3), fill=(126, 150, 96))
    # 门内雾隙：留白，暗示通向更深处
    d.rectangle((x + 18, 27, x + 46, 83), fill=(206, 208, 190, 120))
    d.rectangle((x + 18, 64, x + 46, 83), fill=(176, 182, 162, 90))
    for vx in range(x + 20, x + 46, 6):
        d.line((vx, 26, vx + 2, 34 + (vx % 12)), fill=(96, 116, 80, 210))
    d.rectangle((x + 29, 56, x + 36, 65), fill=SEAL)
    save(quantize(image, 40), "wood-props")


# ---------------------------------------------------------------- 怪物

def outline_ink(image: Image.Image, width: int, height: int, strength: float = 0.55) -> None:
    """把最外层像素压成墨线，去掉原图的荧光描边感。"""
    source = image.copy().load()
    px = image.load()
    for y in range(height):
        for x in range(width):
            r, g, b, a = source[x, y]
            if a == 0:
                continue
            edge = False
            for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                if not (0 <= nx < width and 0 <= ny < height) or source[nx, ny][3] == 0:
                    edge = True
                    break
            if not edge:
                continue
            mixed = lerp((r, g, b), (18, 24, 22), strength + 0.2 * noise(x, y))
            px[x, y] = (mixed[0], mixed[1], mixed[2], a)


def rim_light(image: Image.Image, width: int, height: int, strength: float = 0.18) -> None:
    """顶部受光的冷纸边：只在朝上一侧提一点，避免整圈发光。"""
    source = image.copy().load()
    px = image.load()
    for y in range(height):
        for x in range(width):
            r, g, b, a = source[x, y]
            if a == 0:
                continue
            above = source[x, y - 1][3] if y > 0 else 0
            if above:
                continue
            if luminance((r, g, b)) > 0.62:
                continue
            lit = lerp((r, g, b), MIST, strength)
            px[x, y] = (lit[0], lit[1], lit[2], a)


def wood_material(image: Image.Image, width: int, height: int, boss: bool) -> None:
    """木质化：黄绿高光转青苔，深部收进墨色，亮面轻抬纸白，暗背景提对比。"""
    source = image.copy().load()
    px = image.load()
    for y in range(height):
        for x in range(width):
            r, g, b, a = source[x, y]
            if a == 0:
                continue
            level = luminance((r, g, b))
            warm_bark = r > g > b
            if warm_bark and level > 0.32:      # 树皮：压暖度，避免橙光
                px[x, y] = (round(r * 0.95), round(g * 0.92), round(b * 0.96), a)
            elif g >= r and level > 0.26:        # 叶簇/苔藓：黄绿 → 苔青（去黄）
                moss = lerp(MOSS, SAGE, min(1.0, level * 1.2))
                # 橄榄黄（绿远高于蓝）需要更重的混合，否则 3 倍检视下仍是荧光边。
                strength = 0.72 if g > b * 1.5 else 0.46
                mixed = lerp((r, g, b), moss, strength)
                px[x, y] = (mixed[0], mixed[1], mixed[2], a)
            if level < 0.2:                      # 深部收墨，轮廓更稳
                ink = lerp((r, g, b), INK_DEEP, 0.36)
                px[x, y] = (ink[0], ink[1], ink[2], a)
            elif warm_bark:                      # 树皮去饱和成墨褐，避免整只怪偏橙
                px[x, y] = (max(0, min(255, round(r * 0.9))),
                            max(0, min(255, round(g * 0.9))),
                            max(0, min(255, round(b * 0.94))), a)
            else:                                # 叶簇中间调提亮，避免融进绿色天幕
                lift = 1.12 if not boss else 1.16
                px[x, y] = (max(0, min(255, round(r * lift))),
                            max(0, min(255, round(g * lift))),
                            max(0, min(255, round(b * lift))), a)
            if level > 0.58 and not warm_bark:   # 叶面高光抬向纸白
                paper = lerp((r, g, b), PAPER, 0.22 if boss else 0.16)
                px[x, y] = (paper[0], paper[1], paper[2], a)


def warp_pose(frame: Image.Image, foot: tuple[int, int], fw: int, fh: int,
              lean: float, swing: float, raise_: float) -> Image.Image:
    """按高度加权：脚底不动，躯干前倾与枝冠摆动分开。"""
    out = Image.new("RGBA", (fw, fh))
    src = frame.load()
    dst = out.load()
    foot_x, foot_y = foot
    for y in range(fh):
        height = max(0.0, min(1.0, (foot_y - y) / max(1.0, foot_y * 0.9)))
        weight = height ** 1.7
        for x in range(fw):
            dx = lean * weight + swing * (height ** 3)
            side = max(0.0, min(1.0, (x - foot_x + 8) / 24.0))
            dy = -raise_ * side * height
            sx = max(0, min(fw - 1, round(x + dx)))
            sy = max(0, min(fh - 1, round(y + dy)))
            dst[x, y] = src[sx, sy]
    return out


def build_monster(name: str, fw: int, fh: int, colors: int) -> None:
    atlas = load(name)
    width, height = atlas.size
    out = Image.new("RGBA", atlas.size)
    rows = height // fh
    foot = (fw // 2, fh - 6)
    for row in range(rows):
        for col in range(width // fw):
            frame = atlas.crop((col * fw, row * fh, (col + 1) * fw, (row + 1) * fh))
            if frame.getbbox() is None:
                continue
            if name == "wood-boss":
                # 只加强 Boss 关键行的姿态：重击抬枝、下压与冲刺前倾。
                if row == 13:
                    frame = warp_pose(frame, foot, fw, fh, lean=-2, swing=-5, raise_=4)
                elif row == 14:
                    frame = warp_pose(frame, foot, fw, fh, lean=3, swing=6, raise_=-3)
                elif row == 7:
                    frame = warp_pose(frame, foot, fw, fh, lean=-3, swing=-3, raise_=2)
                elif row == 8:
                    frame = warp_pose(frame, foot, fw, fh, lean=4, swing=4, raise_=-1)
            out.alpha_composite(frame, (col * fw, row * fh))
    wood_material(out, width, height, name == "wood-boss")
    outline_ink(out, width, height, 0.5 if name == "wood-boss" else 0.46)
    rim_light(out, width, height, 0.16)
    save(quantize(out, colors), name)


# ---------------------------------------------------------------- 预览

def preview_frame(camera: int = 640, hollow: bool = False) -> Path:
    """按游戏真实绘制参数拼 960x540 对照图；仅用于人工验收。"""
    PREVIEW.mkdir(parents=True, exist_ok=True)
    width, height, world = 960, 540, 3200
    canvas = Image.new("RGBA", (width, height), (11, 16, 22, 255))
    # 游戏先用五行渐变铺底（wood: #071d1a → #2f7552），再画远/中景。
    gradient = Image.new("RGBA", (width, height))
    gd = ImageDraw.Draw(gradient)
    gradient_colors = ((7, 29, 26), (24, 52, 62)) if hollow else ((7, 29, 26), (47, 117, 82))
    for y in range(height):
        t = y / max(1, height - 1)
        gd.line((0, y, width, y), fill=lerp(gradient_colors[0], gradient_colors[1], t) + (255,))
    canvas.alpha_composite(gradient)
    canvas.alpha_composite(Image.new("RGBA", (width, height - 400), gradient_colors[0] + (255,)), (0, 400))

    far_name = "wood-hollow-far" if hollow else "wood-far"
    mid_name = "wood-hollow-mid" if hollow else "wood-mid"
    far = load_built(far_name).resize((world, 288), Image.Resampling.NEAREST)
    mid = load_built(mid_name).resize((world, 192), Image.Resampling.NEAREST)
    mid.putalpha(mid.getchannel("A").point(lambda p: round(p * 0.5)))
    far_crop = far.crop((round(camera * 0.78), 0, round(camera * 0.78) + width, 288))
    far_crop.putalpha(far_crop.getchannel("A").point(lambda p: round(p * 0.62)))
    canvas.alpha_composite(far_crop, (0, 140))
    mid_crop = mid.crop((camera, 0, camera + width, 192))
    mid_crop.putalpha(mid_crop.getchannel("A").point(lambda p: round(p * 0.27)))
    canvas.alpha_composite(mid_crop, (0, 298))
    shade = Image.new("RGBA", (width, height - 400), (16, 22, 34, 107))
    canvas.alpha_composite(shade, (0, 400))

    tiles = load_built("wood-tiles")
    for x in range(0, width, 32):
        canvas.alpha_composite(tiles.crop((0, 0, 32, 32)), (x, 396))
        for y in range(428, 528, 32):
            canvas.alpha_composite(tiles.crop((64, 0, 96, 32)), (x, y))
    props = load_built("wood-props")
    for index, x in enumerate((170, 400, 620, 800)):
        canvas.alpha_composite(props.crop((index * 64, 0, (index + 1) * 64, 96)), (x, 300))
    for name, x in (("wood-guard", 300), ("wood-ranged", 470)):
        frame = load_built(name).crop((0, 0, 64, 96))
        canvas.alpha_composite(frame, (x, 300))
    boss = load_built("wood-boss").crop((0, 2 * 144, 128, 3 * 144))
    canvas.alpha_composite(boss, (720, 252))
    path = PREVIEW / ("wood-ink-hollow.png" if hollow else "wood-ink-frame.png")
    canvas.convert("RGB").save(path)
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenes", action="store_true")
    parser.add_argument("--monsters", action="store_true")
    parser.add_argument("--tiles", action="store_true")
    parser.add_argument("--props", action="store_true")
    parser.add_argument("--preview", action="store_true")
    parser.add_argument("--all", action="store_true")
    args = parser.parse_args()
    if args.all or args.scenes:
        build_scene("wood-far", hollow=False)
        build_mid("wood-mid", hollow=False)
        build_scene("wood-hollow-far", hollow=True)
        build_mid("wood-hollow-mid", hollow=True)
        print("scenes: wood-far / wood-mid / wood-hollow-far / wood-hollow-mid")
    if args.all or args.tiles:
        build_tiles()
        print("tiles: wood-tiles")
    if args.all or args.props:
        build_props()
        print("props: wood-props")
    if args.all or args.monsters:
        for name, fw, fh, colors in FAMILIES:
            build_monster(name, fw, fh, colors)
            print(f"monster: {name} ({colors} colors)")
    if args.all or args.preview:
        print("preview:", preview_frame().relative_to(ROOT))
        print("preview:", preview_frame(1600, hollow=True).relative_to(ROOT))
    if not any((args.all, args.scenes, args.monsters, args.tiles, args.props, args.preview)):
        parser.error("至少选择一项输出，例如 --all")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
