"""Asset QA is optional for runtime installations; install requirements-art.txt to run."""
import json
from pathlib import Path

import pytest

pytest.importorskip("PIL")


def test_world_art_resources():
    from tools.check_world_art import check_art
    assert len(check_art()) == 50


def test_fire_boss_blade_stays_connected_through_melee_clips():
    # Casting includes an intentional separate effect, so only test melee poses.
    from PIL import Image
    from tools.build_world_art import alpha_components

    assets = Path(__file__).resolve().parents[1] / "static/sprites/world-v1"
    manifest = json.loads((assets / "manifest.json").read_text(encoding="utf-8"))
    family = manifest["families"]["fire-boss"]
    width, height = family["frameSize"]
    with Image.open(assets / "fire-boss.png") as sheet:
        for attack in ("", "dash_", "heavy_"):
            for phase in ("windup", "strike", "recover"):
                action = attack + phase
                spec = family["animations"][action]
                y = spec["row"] * height
                for frame in range(spec["count"]):
                    x = frame * width
                    crop = sheet.crop((x, y, x + width, y + height))
                    groups = list(alpha_components(crop.getchannel("A")))
                    assert len(groups) == 1, (action, frame, list(map(len, groups)))
