"""One-time legacy to journey import on real SQLite transactions."""
from copy import deepcopy

from database import load_state_record, save_state
from game_rules import default_state
from journey import CATALOG, default_journey, new_bead


def old_bead(key, element="fire", level=1):
    return {"id": key, "name": key, "element": element, "quality": 1,
            "level": level, "xp": 0, "affixes": []}


def save_legacy(app, state, slot="local"):
    with app.app_context():
        return save_state(state, slot, 0)


def test_import_preview_mapping_first_clear_and_replay(client, app):
    old = default_state()
    old["cultivation"]["li"][0] = old_bead("socket-mind", "water", 17)
    old["cultivation"]["li"][1] = old_bead("socket-core", "wood", 7)
    old["inventory"] = [old_bead("bag-wood", "wood", 5), old_bead("bag-fire", "fire", 2)]
    old["progress"]["clears"]["wood"] = 3
    save_legacy(app, old)
    preview = client.get("/api/journey/import-preview").get_json()
    assert preview["available"] and preview["legacy_revision"] == 1
    assert preview["receipt"]["imported_clears"] == ["wood"]
    mapped = {entry["source_id"]: entry for entry in preview["receipt"]["converted"]}
    assert mapped["socket-mind"]["target_id"] == "li.mind"
    assert mapped["socket-mind"]["source_element"] == "water"
    assert mapped["socket-mind"]["target_level"] == 3
    assert mapped["socket-core"]["target_id"] == "li.core"
    assert mapped["socket-core"]["target_level"] == 2
    result = client.post("/api/journey/import-confirm", json={
        "owner_id": None, "legacy_revision": 1, "journey_revision": 0}).get_json()
    state = result["state"]
    beads = {item["id"]: item for item in state["beads"]}
    assert state["progress"]["clears"]["wood"] == 1
    assert state["progress"]["spirit"] == 12
    assert beads["li.mind"]["level"] == 3
    assert beads["li.core"]["level"] == 2
    assert all(key in beads for key, item in CATALOG.items()
               if item["element"] == "wood" and item["role"] in {"core", "trace", "mind"})
    with app.app_context():
        assert load_state_record("local")["state"] == old
    replay = client.post("/api/journey/import-confirm", json={
        "owner_id": None, "legacy_revision": 1, "journey_revision": 0}).get_json()
    assert replay["replayed"] and replay["revision"] == result["revision"]
    assert replay["state"] == state


def test_import_merges_existing_beads_and_preserves_build(client, app):
    old = default_state()
    old["cultivation"]["li"][0] = old_bead("mind", level=16)
    old["inventory"] = [old_bead(f"fire-{i}", level=1) for i in range(20)]
    old["progress"]["clears"]["fire"] = 1
    save_legacy(app, old)
    existing = default_journey()
    existing["beads"].append(new_bead("li.mind"))
    existing["beads"][0]["level"] = 2
    existing["progress"]["clears"]["fire"] = 1
    existing["progress"]["spirit"] = 9
    with app.app_context():
        from database import get_db
        import json
        db = get_db()
        db.execute("INSERT INTO journey_saves VALUES(?,?,1)", ("local", json.dumps(existing)))
        db.commit()
    preview = client.get("/api/journey/import-preview").get_json()
    assert preview["receipt"]["imported_clears"] == []
    assert preview["receipt"]["spirit_awarded"] == 0
    assert preview["receipt"]["unused"]
    result = client.post("/api/journey/import-confirm", json={
        "owner_id": None, "legacy_revision": 1, "journey_revision": 1}).get_json()
    assert result["state"]["nodes"] == existing["nodes"]
    assert result["state"]["loadout"] == existing["loadout"]
    assert result["state"]["progress"]["spirit"] == 9
    assert {b["id"]: b["level"] for b in result["state"]["beads"]}["li.mind"] == 3


def test_import_conflict_active_trial_and_account_change(client, app):
    old = default_state()
    old["inventory"].append(old_bead("old-fire"))
    save_legacy(app, old)
    preview = client.get("/api/journey/import-preview").get_json()
    changed = deepcopy(old)
    changed["player"]["spirit"] = 1
    with app.app_context():
        save_state(changed, "local", 1)
    stale = client.post("/api/journey/import-confirm", json={
        "owner_id": None, "legacy_revision": preview["legacy_revision"],
        "journey_revision": preview["journey_revision"]})
    assert stale.status_code == 409
    data = client.get("/api/journey").get_json()
    started = client.post("/api/journey", json={"action": "start", "realm_id": "fire",
        "map_id": "ridge", "owner_id": None, "revision": data["revision"]})
    assert started.status_code == 400  # 单档合并完成前不能再开正式挑战。
    assert client.get("/api/journey/import-preview").get_json()["available"]
    blocked = client.post("/api/journey/import-confirm", json={
        "owner_id": None, "legacy_revision": 1, "journey_revision": data["revision"]})
    assert blocked.status_code == 409  # 旧档修订号已变化。
    registered = client.post("/api/auth/register", json={"username": "importuser", "password": "password123"})
    assert registered.status_code == 201
    assert client.post("/api/journey/import-confirm", json={
        "owner_id": None, "legacy_revision": 2, "journey_revision": 0},
        headers={"X-CSRF-Token": registered.get_json()["csrf_token"]}).status_code == 409


def test_guest_import_carries_migrated_journey_without_overwriting(client, app):
    old = default_state()
    old["inventory"].append(old_bead("guest-fire"))
    save_legacy(app, old)
    client.post("/api/journey/import-confirm", json={
        "owner_id": None, "legacy_revision": 1, "journey_revision": 0})
    preview = client.get("/api/journey/unify-preview").get_json()
    assert preview["available"]
    unified = client.post("/api/journey/unify-confirm", json={
        "owner_id": None, "revisions": preview["revisions"]})
    assert unified.status_code == 200
    registration = client.post("/api/auth/register", json={
        "username": "guestcopy", "password": "password123"}).get_json()
    token = registration["csrf_token"]
    result = client.post("/api/auth/import-guest", headers={"X-CSRF-Token": token})
    assert result.status_code == 200 and result.get_json()["journey_imported"]
    assert client.get("/api/journey").get_json()["migration_required"] is False
    assert client.get("/api/journey").get_json()["state"]["beads"] == unified.get_json()["state"]["beads"]
    again = client.post("/api/auth/import-guest", headers={"X-CSRF-Token": token})
    assert again.status_code == 200 and again.get_json()["replayed"] is True
    assert client.get("/api/journey").get_json()["state"]["beads"] == unified.get_json()["state"]["beads"]


def test_old_checkpoint_blocks_import_and_existing_account_journey_is_not_overwritten(client, app):
    old = default_state()
    old["active_trial"] = {"version": 1, "id": "old-swordstone", "ruleset_id": "legacy-v1",
        "rules_version": 1, "realm_id": "fire", "checkpoint_id": "swordstone",
        "build": {key: deepcopy(old[key]) for key in ("player", "cultivation", "loadout")},
        "claimed_altars": []}
    save_legacy(app, old)
    assert not client.get("/api/journey/import-preview").get_json()["available"]
    assert client.post("/api/journey/import-confirm", json={
        "owner_id": None, "legacy_revision": 1, "journey_revision": 0}).status_code == 409
    with app.app_context():
        from database import get_db
        import json
        db = get_db()
        db.execute("INSERT INTO journey_saves VALUES(?,?,1)", ("local", json.dumps(default_journey())))
        db.commit()
    registration = client.post("/api/auth/register", json={
        "username": "hasjourney", "password": "password123"}).get_json()
    token, owner = registration["csrf_token"], registration["user"]["id"]
    with app.app_context():
        from database import get_db
        import json
        db = get_db()
        db.execute("INSERT INTO journey_saves VALUES(?,?,1)", (f"user:{owner}", json.dumps(default_journey())))
        db.commit()
    result = client.post("/api/auth/import-guest", headers={"X-CSRF-Token": token})
    assert result.status_code == 409
    assert client.get("/api/journey").get_json()["revision"] == 1


def test_empty_old_save_does_not_consume_one_time_migration(client, app):
    save_legacy(app, default_state())
    preview = client.get("/api/journey/import-preview").get_json()
    assert not preview["available"] and not preview["migrated"]
    assert client.post("/api/journey/import-confirm", json={
        "owner_id": None, "legacy_revision": 1, "journey_revision": 0}).status_code == 409
    assert client.get("/api/journey").get_json()["revision"] == 0
