"""新手村师门、外观与单档合并的真实 SQLite 回归。"""
import json
from copy import deepcopy

from app import create_app
from array_lab import default_lab_state
from database import get_db
from game_rules import default_state
from journey import MAPS_V2, default_journey


def post(client, state, action, **extra):
    return client.post("/api/journey", json={"owner_id": None, "revision": state["revision"],
                                             "action": action, **extra})


def seed_formal(app, state):
    with app.app_context():
        db = get_db()
        db.execute("INSERT INTO journey_saves VALUES(?,?,1)", ("local", json.dumps(state, ensure_ascii=False)))
        db.commit()


def test_training_costs_reset_and_conflict(app, client):
    state = default_journey()
    state["progress"]["spirit"] = 36
    seed_formal(app, state)
    current = client.get("/api/journey").get_json()
    for level, remaining in ((1, 28), (2, 16), (3, 0)):
        response = post(client, current, "train", branch="sword")
        assert response.status_code == 200
        current = response.get_json()
        assert current["state"]["training"]["sword"] == level
        assert current["state"]["progress"]["spirit"] == remaining
    assert post(client, current, "train", branch="sword").status_code == 400
    assert post(client, {**current, "revision": 1}, "reset_training").status_code == 409
    reset = post(client, current, "reset_training").get_json()
    assert reset["state"]["progress"]["spirit"] == 36
    assert reset["state"]["training"] == {"sword": 0, "step": 0, "guard": 0}


def test_cosmetic_purchase_equip_and_duplicate(app, client):
    state = default_journey()
    state["cosmetics"]["tickets"] = 6
    seed_formal(app, state)
    current = client.get("/api/journey").get_json()
    bought = post(client, current, "purchase", cosmetic="azure").get_json()
    assert bought["state"]["cosmetics"]["tickets"] == 4
    assert "azure" in bought["state"]["cosmetics"]["owned"]
    assert post(client, bought, "purchase", cosmetic="azure").status_code == 400
    equipped = post(client, bought, "equip_cosmetic", cosmetic="azure").get_json()
    assert equipped["state"]["cosmetics"]["equipped"] == "azure"
    assert post(client, equipped, "purchase", cosmetic="frost").status_code == 400


def test_route_victory_grants_one_ticket_once(client):
    current = client.get("/api/journey").get_json()
    started = post(client, current, "start", realm_id="fire", map_id="ridge").get_json()
    trial = started["state"]["active_trial"]
    layout = MAPS_V2["fire:ridge"]
    payload = {"trial_id": trial["id"], "win": True,
               "defeated_ids": layout["required_ids"], "exit_id": layout["exit"]["id"]}
    won = post(client, started, "settle", **payload)
    assert won.status_code == 200
    result = won.get_json()
    assert result["receipt"]["tickets"] == 1
    assert result["state"]["cosmetics"]["tickets"] == 1
    assert result["state"]["progress"]["route_clears"]["fire:ridge"] == 1
    replay = post(client, started, "settle", **payload).get_json()
    assert replay["replayed"] is True
    assert replay["state"]["cosmetics"]["tickets"] == 1


def test_three_save_unification_preview_conflict_and_cleanup(app, client):
    current = client.get("/api/journey").get_json()
    started = post(client, current, "start", realm_id="fire", map_id="hollow").get_json()
    old = default_state()
    old["progress"]["clears"]["wood"] = 1
    old["active_trial"] = {"version": 1, "id": "old-village-trial", "ruleset_id": "legacy-v1",
        "rules_version": 1, "realm_id": "fire", "checkpoint_id": "swordstone",
        "build": {key: deepcopy(old[key]) for key in ("player", "cultivation", "loadout")},
        "claimed_altars": []}
    lab = default_lab_state()
    lab["nodes"]["li.core"] = "lab-core"
    lab["nodes"]["li.mark"] = "lab-mark"
    for bead in lab["beads"]:
        if bead["id"] in {"lab-core", "lab-burst"}:
            bead["level"] = 3
        elif bead["id"] == "lab-cycle":
            bead["level"] = 2
    with app.app_context():
        db = get_db()
        db.execute("INSERT INTO game_saves(slot,state_json,revision) VALUES('local',?,1)", (json.dumps(old, ensure_ascii=False),))
        db.execute("INSERT INTO array_lab_saves VALUES('local',?,1)", (json.dumps(lab, ensure_ascii=False),))
        db.commit()
    lab_started = client.post("/api/lab/trial", json={"owner_id": None, "revision": 1,
        "action": "start", "realm_id": "fire"})
    assert lab_started.status_code == 200
    preview = client.get("/api/journey/unify-preview").get_json()
    assert preview["available"] is True
    assert preview["receipt"]["cleared_trials"] == ["旧五行", "阵盘试验", "正式征程"]
    assert preview["receipt"]["legacy"]["imported_clears"] == ["wood"]
    stale = deepcopy(preview["revisions"])
    stale["lab"] += 1
    assert client.post("/api/journey/unify-confirm", json={"owner_id": None, "revisions": stale}).status_code == 409
    confirmed = client.post("/api/journey/unify-confirm", json={"owner_id": None, "revisions": preview["revisions"]})
    assert confirmed.status_code == 200
    state = confirmed.get_json()["state"]
    assert state["active_trial"] is None
    assert state["progress"]["spirit"] == 12
    assert state["progress"]["clears"]["wood"] == 1
    levels = {bead["id"]: bead["level"] for bead in state["beads"]}
    assert levels["li.core"] == 3 and levels["li.edge"] == 3 and levels["li.flow"] == 2
    repeated = client.post("/api/journey/unify-confirm", json={"owner_id": None, "revisions": preview["revisions"]}).get_json()
    assert repeated["replayed"] is True
    with app.app_context():
        db = get_db()
        assert db.execute("SELECT value FROM app_meta WHERE key='legacy_retired'").fetchone()[0] == "1"
        assert db.execute("SELECT 1 FROM sqlite_master WHERE name='game_saves'").fetchone() is None


def test_unification_is_scoped_to_the_signed_in_account(app):
    first, second = app.test_client(), app.test_client()
    one = first.post("/api/auth/register", json={"username": "village_one", "password": "password123"}).get_json()
    two = second.post("/api/auth/register", json={"username": "village_two", "password": "password123"}).get_json()
    one_slot, two_slot = f"user:{one['user']['id']}", f"user:{two['user']['id']}"
    old_one, old_two = default_state(), default_state()
    old_one["progress"]["clears"]["wood"] = 1
    old_two["progress"]["clears"]["water"] = 1
    with app.app_context():
        db = get_db()
        for slot, old in ((one_slot, old_one), (two_slot, old_two)):
            db.execute("INSERT INTO game_saves(slot,state_json,revision) VALUES(?,?,1)",
                       (slot, json.dumps(old, ensure_ascii=False)))
        db.commit()
    preview = first.get("/api/journey/unify-preview").get_json()
    assert preview["receipt"]["legacy"]["imported_clears"] == ["wood"]
    wrong_owner = first.post("/api/journey/unify-confirm", json={"owner_id": two["user"]["id"],
        "revisions": preview["revisions"]}, headers={"X-CSRF-Token": one["csrf_token"]})
    assert wrong_owner.status_code == 409
    confirmed = first.post("/api/journey/unify-confirm", json={"owner_id": one["user"]["id"],
        "revisions": preview["revisions"]}, headers={"X-CSRF-Token": one["csrf_token"]})
    assert confirmed.status_code == 200
    assert confirmed.get_json()["state"]["progress"]["clears"]["water"] == 0
    assert second.get("/api/journey").get_json()["migration_required"] is True
    with app.app_context():
        db = get_db()
        assert db.execute("SELECT 1 FROM game_saves WHERE slot=?", (one_slot,)).fetchone() is None
        assert db.execute("SELECT 1 FROM game_saves WHERE slot=?", (two_slot,)).fetchone() is not None


def test_formal_v1_save_upgrades_without_regranting_old_victories(app, client):
    old_formal = default_journey()
    old_formal["schema_version"] = 1
    old_formal.pop("training")
    old_formal.pop("cosmetics")
    old_formal["progress"].pop("route_clears")
    old_formal["progress"]["clears"]["fire"] = 1
    old_formal["progress"]["victories"] = 1
    old_formal["progress"]["spirit"] = 12
    with app.app_context():
        db = get_db()
        db.execute("INSERT INTO journey_saves VALUES('local',?,1)", (json.dumps(old_formal),))
        db.execute("INSERT INTO journey_results VALUES('local','old-win',?)",
                   (json.dumps({"outcome": "victory", "breakthrough": False,
                                "realm_id": "fire", "map_id": "hollow"}),))
        db.commit()
    preview = client.get("/api/journey/unify-preview").get_json()
    assert preview["available"] is True
    assert preview["receipt"]["legacy"]["imported_clears"] == []
    upgraded = client.post("/api/journey/unify-confirm", json={
        "owner_id": None, "revisions": preview["revisions"]})
    assert upgraded.status_code == 200
    state = upgraded.get_json()["state"]
    assert state["schema_version"] == 2
    assert state["progress"]["spirit"] == 12
    assert state["progress"]["route_clears"]["fire:hollow"] == 1
    assert state["training"] == {"sword": 0, "step": 0, "guard": 0}
    assert state["cosmetics"]["tickets"] == 0


def test_default_application_exposes_only_journey_api(tmp_path):
    app = create_app({"TESTING": True, "DATABASE": str(tmp_path / "single.sqlite3"), "SECRET_KEY": "test"})
    client = app.test_client()
    assert client.get("/api/journey").status_code == 200
    assert client.get("/api/state").status_code == 410
    assert client.get("/api/lab/state").status_code == 410
    with app.app_context():
        assert get_db().execute("SELECT 1 FROM sqlite_master WHERE name='game_saves'").fetchone() is None
