"""Build five hollow panoramas and index all ten journey scenes."""

from pathlib import Path
import json

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "static/sprites/world-v1"
SOURCE = ROOT / "docs/art/world-v1/sources/routes"
REALMS = ("fire", "wood", "earth", "metal", "water")


def scene_path(realm, route, layer):
    stem = f"{realm}-{route}-{layer}" if route == "hollow" else f"{realm}-{layer}"
    return f"/static/sprites/world-v1/{stem}.png"


def make_layer(source, size, centering, colors):
    # Crop to the actual game aspect before shrinking; stretching the source
    # would flatten roofs and mountains. The game draws these at 2x size.
    layer = ImageOps.fit(source, size, method=Image.Resampling.LANCZOS,
                         centering=centering).convert("RGB")
    return layer.quantize(colors=colors, method=Image.Quantize.MEDIANCUT,
                          dither=Image.Dither.NONE).convert("RGBA")


def build_routes(output=OUTPUT):
    output.mkdir(parents=True, exist_ok=True)
    maps = {}
    for realm in REALMS:
        source_path = SOURCE / f"{realm}-hollow-concept.png"
        with Image.open(source_path) as source:
            source = source.convert("RGB")
            make_layer(source, (768, 144), (0.5, 0.42), 64).save(
                output / f"{realm}-hollow-far.png", optimize=True)
            make_layer(source, (768, 96), (0.5, 0.62), 48).save(
                output / f"{realm}-hollow-mid.png", optimize=True)
        for route in ("ridge", "hollow"):
            maps[f"{realm}:{route}"] = {
                "far": scene_path(realm, route, "far"),
                "mid": scene_path(realm, route, "mid"),
            }
    return maps


def main():
    manifest_path = OUTPUT / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["maps"] = build_routes()
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                             encoding="utf-8")
    print("Built five hollow far/mid pairs and indexed ten journey maps.")


if __name__ == "__main__":
    main()
