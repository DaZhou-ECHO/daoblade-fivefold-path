"""Build local pixel atlases from AI concepts; optional Pillow, never needed at runtime."""
from pathlib import Path
import argparse
import json
import math
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
REALMS = ["fire", "wood", "earth", "metal", "water"]
NAMES = [
    ["焦甲剑卒", "赤焰突进傀", "炉符妖侍", "离火剑魁"],
    ["木灵刀卫", "藤根伏行妖", "蘑灯木巫", "古木守灵"],
    ["岩甲卫", "持锤石傀", "投岩陶俑", "镇岳石魁"],
    ["断剑傀", "银甲刺卫", "御刃机关傀", "金甲剑傀"],
    ["水魇刀客", "寒鳞游卫", "冰灯引潮妖", "寒潭水魇"],
]
COLORS = ["#f39b60", "#91be83", "#d6b578", "#bccbd4", "#8dcddd"]
ANIMS = {"idle": 2, "walk": 4, "windup": 2, "strike": 3,
         "recover": 2, "hurt": 1, "death": 4,
         "dash_windup": 2, "dash_strike": 3, "dash_recover": 2,
         "cast_windup": 2, "cast_strike": 3, "cast_recover": 2,
         "heavy_windup": 2, "heavy_strike": 3, "heavy_recover": 2}


def clean_specks(image, minimum=4):
    """Remove isolated extraction/rotation specks with 8-connected alpha masks."""
    alpha = image.getchannel("A")
    occupied = {(x, y) for y in range(image.height) for x in range(image.width)
                if alpha.getpixel((x, y)) > 0}
    while occupied:
        first = occupied.pop()
        group, queue = [first], [first]
        while queue:
            x, y = queue.pop()
            for nx in range(x-1, x+2):
                for ny in range(y-1, y+2):
                    point = (nx, ny)
                    if point in occupied:
                        occupied.remove(point)
                        queue.append(point)
                        group.append(point)
        if len(group) < minimum:
            for point in group:
                image.putpixel(point, (0, 0, 0, 0))
    return image


def pixelize(image, colors):
    image = image.convert("RGBA")
    alpha = image.getchannel("A").point(lambda p: 255 if p >= 120 else 0)
    # Quantize RGB separately so a transparent background never turns opaque.
    result = image.convert("RGB").quantize(colors=colors).convert("RGBA")
    result.putalpha(alpha)
    return result


def enemy_frames(concept, row, col, output):
    cw, ch = concept.width / 4, concept.height / 5
    cell = concept.crop((round(col*cw), round(row*ch),
                         round((col+1)*cw), round((row+1)*ch))).convert("RGBA")
    box = cell.getchannel("A").getbbox()
    if box is None:
        raise ValueError("Empty concept cell")
    cell = cell.crop(box)
    boss = col == 3
    fw, fh = (128, 144) if boss else (96, 96) if col == 1 else (64, 96)
    foot = (fw//2, fh-6)
    cell.thumbnail((fw-14, fh-20), Image.Resampling.NEAREST)
    base = Image.new("RGBA", (fw, fh))
    base.alpha_composite(cell, ((fw-cell.width)//2, foot[1]-cell.height))
    # Find the actual stance center from the lowest opaque pixels. The image
    # bounding-box center includes long swords/capes and is not the foot center.
    bottom = base.getchannel("A")
    points = [x for y in range(foot[1]-3, foot[1])
              for x in range(fw) if bottom.getpixel((x, y)) >= 120]
    if points:
        points.sort()
        foot = (points[len(points)//2], foot[1])
    # Segment the weapon-bearing outer arm from the torso; animate independently.
    pivot = (min(fw-12, foot[0]+5), round(foot[1]-cell.height*.52))
    split = min(fw-4, pivot[0]+2)
    arm = Image.new("RGBA", (fw, fh))
    body = base.copy()
    for y in range(fh):
        for x in range(split, fw):
            # Keep the planted boots, but remove old weapon tips at ground
            # height as well; otherwise they remain as detached duplicate pixels.
            if y >= foot[1]-12 and x <= foot[0]+10:
                continue
            arm.putpixel((x, y), base.getpixel((x, y)))
            body.putpixel((x, y), (0, 0, 0, 0))
    atlas = Image.new("RGBA", (fw*4, fh*len(ANIMS)))
    animations = {}
    for line, (name, count) in enumerate(ANIMS.items()):
        animations[name] = {"row": line, "count": count, "fps": 7 if name == "idle" else 10}
        for i in range(count):
            t = i/max(1, count-1)
            frame = Image.new("RGBA", (fw, fh))
            angle, dx, dy = 0, 0, 0
            if name == "idle":
                dy = -i
                angle = i * 4
            elif name == "walk":
                dx, dy = [0, 1, 0, -1][i], [0, -1, 0, -1][i]
            elif "windup" in name:
                angle, dx = 24+18*t, -round(2*t)
            elif "strike" in name:
                angle = -15-45*t if "cast" not in name else -8-14*t
                dx = round((5 if "dash" in name else 2)*math.sin(t*math.pi))
            elif "recover" in name:
                angle = -25*(1-t)
            elif name == "hurt":
                dx, dy = -2, 1
            if name == "heavy_windup":
                angle = 55+35*t
            elif name == "heavy_strike":
                angle = 45-115*t
            elif name == "heavy_recover":
                angle = -35*(1-t)
            if name == "death":
                # Collapse around the feet; gameplay death already happened.
                collapsed = base.resize((fw, max(4, round(fh*(1-.78*t)))),
                                        Image.Resampling.NEAREST)
                frame.alpha_composite(collapsed, (0, foot[1]-collapsed.height))
                if i == 3:
                    frame.putalpha(frame.getchannel("A").point(lambda p: p//2))
            else:
                lean = -.035 if "windup" in name else (
                    .09 if "dash_strike" in name else .045 if "strike" in name else 0)
                posed = body.transform((fw, fh), Image.Transform.AFFINE,
                                       (1, lean, -lean*foot[1], 0, 1, 0),
                                       Image.Resampling.NEAREST)
                frame.alpha_composite(posed, (dx, dy))
                # Rotate weapon/arm around a fixed shoulder on a padded canvas.
                pad = Image.new("RGBA", (fw*3, fh*3))
                pad.alpha_composite(arm, (fw, fh))
                rotated = pad.rotate(angle, Image.Resampling.NEAREST,
                                     center=(fw+pivot[0], fh+pivot[1]))
                frame.alpha_composite(rotated.crop((fw, fh, fw*2, fh*2)), (dx, dy))
                if name == "idle":
                    # Breathing moves the torso, while boots remain planted.
                    lx, rx = max(0, foot[0]-10), min(fw, foot[0]+11)
                    frame.alpha_composite(base.crop((lx, foot[1]-10, rx, foot[1])),
                                          (lx, foot[1]-10))
                if name == "walk":
                    # Separate boots/robe ends sway, while the shared foot anchor stays fixed.
                    y = foot[1]-9
                    legs = frame.crop((0, y, fw, foot[1]))
                    frame.paste((0, 0, 0, 0), (0, y, fw, foot[1]))
                    frame.alpha_composite(legs, ([0, 1, 0, -1][i], y))
                if "cast" in name:
                    d = ImageDraw.Draw(frame)
                    x, y = min(fw-8, pivot[0]+11), pivot[1]-7
                    d.rectangle((x, y-i, x+3+i, y+4+i), fill=COLORS[row])
            frame = clean_specks(pixelize(frame, 47 if boss else 31), 8 if boss else 4)
            atlas.alpha_composite(frame, (i*fw, line*fh))
    # Palette limit applies to the full family, not just individual frames.
    atlas = pixelize(atlas, 47 if boss else 31)
    path = output / f"{REALMS[row]}-{['guard','special','ranged','boss'][col]}.png"
    atlas.save(path, optimize=True)
    return {"name": NAMES[row][col], "src": "/static/sprites/world-v1/"+path.name,
            "frameSize": [fw, fh], "foot": list(foot),
            "bodyHeight": cell.height, "animations": animations}


def scene_assets(source, row, output):
    strip = source.crop((0, round(source.height*row/5),
                         source.width, round(source.height*(row+1)/5))).convert("RGBA")
    # Far mountains and architectural middle layer use separate raster crops.
    far = strip.resize((768, 144), Image.Resampling.NEAREST)
    far = pixelize(far, 64)
    far.save(output / f"{REALMS[row]}-far.png", optimize=True)
    middle = strip.crop((0, int(strip.height*.30), strip.width, strip.height))
    middle = middle.resize((768, 96), Image.Resampling.NEAREST)
    # Lower silhouette fade is authored once here, never rebuilt each draw.
    middle.putalpha(Image.new("L", middle.size, 150))
    middle = pixelize(middle, 48)
    middle.save(output / f"{REALMS[row]}-mid.png", optimize=True)
    colors = [
        ("#211c25", "#6d3435", "#e29962"), ("#18362c", "#45674a", "#94b983"),
        ("#42372e", "#806b4b", "#cfb786"), ("#26333e", "#596b78", "#bfcec9"),
        ("#193647", "#3c7183", "#9bd5df"),
    ][row]
    tiles = Image.new("RGBA", (128, 32))
    d = ImageDraw.Draw(tiles)
    for n in range(4):
        x = n*32
        if n < 2:
            d.rectangle((x, 0, x+31, 31 if n == 0 else 11), fill=colors[0])
            d.rectangle((x, 0, x+31, 3), fill=colors[2])
            d.rectangle((x, 4, x+31, 6), fill=colors[1])
            for k in range(4):
                d.line((x+k*8, 8, x+k*8, 31 if n == 0 else 11), fill=colors[1])
            if n == 1:
                d.polygon([(x+5, 12), (x+9, 12), (x+16, 24),
                           (x+23, 12), (x+27, 12), (x+16, 30)], fill=colors[1])
        else:
            d.rectangle((x, 0, x+31, 31), fill=colors[0])
            d.line((x, 16, x+31, 16), fill=colors[1])
            d.line((x+16, 0, x+16, 15), fill=colors[1])
            d.line((x+8, 17, x+8, 31), fill=colors[1])
    # Material grammar differs by realm, not just its tint.
    for n in range(4):
        x = n*32
        bottom = 10 if n == 1 else 31
        if row == 0:
            for offset in (4, 20):
                d.line((x+offset, 7, x+offset+4, min(bottom, 18)), fill=colors[1])
                if bottom > 18:
                    d.line((x+offset+4, 18, x+offset-2, 27), fill=colors[1])
            d.rectangle((x+2, 5, x+3, 6), fill=COLORS[row])
            d.rectangle((x+28, 5, x+29, 6), fill=colors[2])
        elif row == 1:
            for y in (8, 13, 23, 28):
                if y <= bottom:
                    d.line((x+3, y, x+26, y), fill=colors[1])
                    d.line((x+7, y-1, x+16, y-1), fill=colors[2])
            if n < 2:
                d.rectangle((x+2, 2, x+9, 4), fill="#5a8d57")
                d.rectangle((x+20, 3, x+28, 5), fill="#385e3a")
        elif row == 2:
            for y in (10, 21):
                if y <= bottom:
                    d.line((x, y, x+31, y), fill=colors[1])
                    d.line((x+8+(y%2)*8, y, x+8+(y%2)*8, min(bottom, y+10)), fill=colors[1])
            for k in range(6):
                yy=6+(k*7)%max(1,bottom-4)
                d.point((x+3+(k*11)%26, yy), fill=colors[2])
        elif row == 3:
            d.rectangle((x+3, 7, x+28, bottom), outline=colors[1])
            for xx in (5, 25):
                d.rectangle((x+xx, 7, x+xx+1, 8), fill=colors[2])
                if bottom>20:
                    d.rectangle((x+xx, 27, x+xx+1, 28), fill=colors[2])
            if n<2:
                d.line((x+2, 2, x+29, 2), fill="#deeadc")
        else:
            d.line((x+2, 6, x+8, 9, x+13, 6, x+19, 10, x+29, 6), fill=colors[2])
            if bottom>20:
                d.line((x+11, 15, x+18, 18, x+14, 25), fill=colors[1])
                d.rectangle((x+4, 27, x+11, 28), fill="#4a8da1")
    tiles.save(output / f"{REALMS[row]}-tiles.png", optimize=True)
    props = Image.new("RGBA", (256, 96))
    d = ImageDraw.Draw(props)
    for n in range(4):
        x = n*64
        d.rectangle((x+8, 83, x+55, 89), fill=colors[1])
        if n == 0:  # swordstone
            d.polygon([(x+22, 14), (x+42, 14), (x+47, 80), (x+17, 80)], fill=colors[1])
            d.rectangle((x+29, 25, x+33, 65), fill=colors[2])
            d.line((x+24, 45, x+39, 45), fill=colors[2], width=2)
        elif n == 1:  # altar
            d.rectangle((x+15, 69, x+49, 81), fill=colors[1])
            d.rectangle((x+25, 46, x+39, 69), fill=colors[2])
            d.rectangle((x+28, 35, x+35, 44), fill=COLORS[row])
            d.line((x+17, 48, x+45, 48), fill=colors[2], width=3)
        elif n == 2:  # shortcut lever
            d.rectangle((x+20, 63, x+43, 81), fill=colors[1])
            d.line((x+32, 66, x+43, 40), fill=colors[2], width=4)
            d.rectangle((x+40, 35, x+48, 43), fill=COLORS[row])
        else:  # gate
            d.rectangle((x+8, 28, x+15, 83), fill=colors[1])
            d.rectangle((x+49, 28, x+56, 83), fill=colors[1])
            d.polygon([(x+1, 28), (x+15, 18), (x+48, 18),
                       (x+63, 28), (x+61, 33), (x+3, 33)], fill=colors[2])
            d.line((x+30, 36, x+34, 72), fill=COLORS[row], width=2)
    props.save(output / f"{REALMS[row]}-props.png", optimize=True)
    return {"far": f"/static/sprites/world-v1/{REALMS[row]}-far.png",
            "mid": f"/static/sprites/world-v1/{REALMS[row]}-mid.png",
            "tiles": f"/static/sprites/world-v1/{REALMS[row]}-tiles.png",
            "props": f"/static/sprites/world-v1/{REALMS[row]}-props.png",
            "accent": COLORS[row]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--enemy-source", required=True, type=Path)
    parser.add_argument("--scene-source", required=True, type=Path)
    args = parser.parse_args()
    out = ROOT / "static/sprites/world-v1"
    out.mkdir(parents=True, exist_ok=True)
    concept, scene = Image.open(args.enemy_source), Image.open(args.scene_source)
    manifest = {"schemaVersion": 1, "realms": {}, "families": {}}
    for row, realm in enumerate(REALMS):
        manifest["realms"][realm] = scene_assets(scene, row, out)
        for col, kind in enumerate(["guard", "special", "ranged", "boss"]):
            manifest["families"][realm+"-"+kind] = enemy_frames(concept, row, col, out)
    from build_route_scenes import build_routes
    manifest["maps"] = build_routes(out)
    (out / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
    print("Built 20 enemy atlases, 30 scene/terrain/prop PNGs and manifest.")


if __name__ == "__main__":
    main()
