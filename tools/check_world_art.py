"""Validate checked-in local world PNG resources (optional Pillow tooling)."""
from pathlib import Path
import json
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


def check_art():
    manifest = json.loads((ROOT / "static/sprites/world-v1/manifest.json").read_text(encoding="utf-8"))
    assert manifest["schemaVersion"] == 1
    assert len(manifest["families"]) == 20
    assert len(manifest["realms"]) == 5
    expected_counts = {"idle": 2, "walk": 4, "windup": 2, "strike": 3,
                       "recover": 2, "hurt": 1, "death": 4}
    checked = []
    for key, family in manifest["families"].items():
        path = ROOT / family["src"].lstrip("/")
        with Image.open(path) as image:
            assert image.format == "PNG" and image.mode == "RGBA", key
            width, height = family["frameSize"]
            rows = 1 + max(a["row"] for a in family["animations"].values())
            assert image.size == (width*4, height*rows), key
            assert len(image.convert("RGB").getcolors(100000) or []) <= (48 if key.endswith("boss") else 32), key
            assert image.getchannel("A").getextrema()[0] == 0, key
            assert 0 <= family["foot"][0] < width
            assert 0 <= family["foot"][1] < height
            assert len(family["animations"]) == 16
            for action, count in expected_counts.items():
                assert family["animations"][action]["count"] >= count
            for action, spec in family["animations"].items():
                frames = []
                for frame in range(spec["count"]):
                    crop = image.crop((frame*width, spec["row"]*height,
                                       (frame+1)*width, (spec["row"]+1)*height))
                    assert crop.getchannel("A").getbbox(), (key, action, frame)
                    frames.append(crop.tobytes())
                if len(frames) > 1:
                    assert len(set(frames)) > 1, (key, action, "identical frames")
        checked.append(path)
    dimensions = {"far": (768, 144), "mid": (768, 96),
                  "tiles": (128, 32), "props": (256, 96)}
    for key, scene in manifest["realms"].items():
        for kind, size in dimensions.items():
            path = ROOT / scene[kind].lstrip("/")
            with Image.open(path) as image:
                assert image.format == "PNG" and image.mode == "RGBA", (key, kind)
                assert image.size == size, (key, kind)
                assert image.getbbox(), (key, kind)
            checked.append(path)
    return checked


if __name__ == "__main__":
    files = check_art()
    print(f"PASS: {len(files)} PNGs; 20 families, 16 animations per family; dimensions/alpha/palette/frames/paths/anchors.")
