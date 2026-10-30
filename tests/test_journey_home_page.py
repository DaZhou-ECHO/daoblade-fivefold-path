from html.parser import HTMLParser
from pathlib import Path


class PageIds(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.scripts = []

    def handle_starttag(self, tag, attrs):
        data = dict(attrs)
        if "id" in data:
            self.ids.append(data["id"])
        if tag == "script" and "src" in data:
            self.scripts.append(data["src"])


def test_home_has_unique_live_targets_and_ten_scene_assets(client):
    page = client.get("/")
    assert page.status_code == 200
    text = page.get_data(as_text=True)
    parser = PageIds()
    parser.feed(text)
    assert len(parser.ids) == len(set(parser.ids))
    for name in ("panel-sanctuary", "panel-atlas", "panel-journey",
                 "atlas-realms", "atlas-routes", "atlas-start", "atlas-resume",
                 "journey-import-preview", "journey-import-dialog", "journey-import-confirm",
                 "save-status", "inventory-count", "restore-checkpoint"):
        assert name in parser.ids
    assert "/static/js/journey-home.js" in parser.scripts
    root = Path(__file__).resolve().parents[1] / "static/sprites/world-v1"
    for realm in ("fire", "wood", "earth", "metal", "water"):
        for route in ("", "-hollow"):
            assert (root / f"{realm}{route}-far.png").is_file()
