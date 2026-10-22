"""036 v2 integration: real SQLite transactions; not browser play evidence."""
import json
from database import get_db
from journey import MAPS_V2, trial_layout

def action(client, name, **fields):
    before = client.get("/api/journey").get_json()
    return client.post("/api/journey", json=dict(action=name, revision=before["revision"], owner_id=None, **fields))

def test_v2_freeze_optional_exit_shortcut_and_replay(client):
    data = action(client, "start", realm_id="fire").get_json()
    trial = data["state"]["active_trial"]
    assert trial["combat_version"] == trial["map_version"] == 2
    tid = trial["id"]
    assert action(client, "shortcut", trial_id=tid, shortcut_id="../bad").status_code == 400
    for _ in range(2):
        assert action(client, "shortcut", trial_id=tid, shortcut_id="return-path").status_code == 200
    assert client.get("/api/journey").get_json()["state"]["active_trial"]["opened_shortcuts"] == ["return-path"]
    required = MAPS_V2["fire:ridge"]["required_ids"]
    assert action(client, "settle", trial_id=tid, win=True, defeated_ids=required).status_code == 400
    assert action(client, "settle", trial_id=tid, win=True, defeated_ids=["enemy-6"], exit_id="exit").status_code == 400
    assert action(client, "checkpoint", trial_id=tid, defeated_ids=required[:3]).status_code == 200
    failed = action(client, "settle", trial_id=tid, win=False, defeated_ids=required[:3]).get_json()
    assert failed["state"]["active_trial"]["opened_shortcuts"] == ["return-path"]
    result = action(client, "settle", trial_id=tid, win=True, defeated_ids=required, exit_id="exit").get_json()
    assert result["receipt"]["outcome"] == "victory"
    replay = action(client, "settle", trial_id=tid, win=True, defeated_ids=required, exit_id="exit").get_json()
    assert replay["replayed"] and replay["state"] == result["state"]

def test_old_trial_without_versions_keeps_old_clear_and_save(client, app):
    data = action(client, "start", realm_id="water").get_json()
    state = data["state"]
    t = state["active_trial"]
    for key in ["map_version", "combat_version", "opened_shortcuts"]:
        t.pop(key)
    with app.app_context():
        db = get_db()
        db.execute("UPDATE journey_saves SET state_json=?", (json.dumps(state),))
        db.commit()
    assert trial_layout(t) is None
    tid = t["id"]
    partial = MAPS_V2["water:ridge"]["required_ids"]
    assert action(client, "settle", trial_id=tid, win=True, defeated_ids=partial, exit_id="exit").status_code == 400
    result = action(client, "settle", trial_id=tid, win=True, defeated_ids=[f"enemy-{i}" for i in range(1,7)])
    assert result.status_code == 200

def test_versions_and_all_maps_are_valid():
    import pytest
    for value in [0, 3, True, "2"]:
        with pytest.raises(ValueError):
            trial_layout(dict(realm_id="fire", map_id="ridge", map_version=value))
    assert len(MAPS_V2) == 10
    for spec in MAPS_V2.values():
        assert len(set(spec["required_ids"])) == 5
        assert "enemy-5" not in spec["required_ids"]
        assert spec["checkpoint"]["cleared_ids"] == ["enemy-1","enemy-2","enemy-3"]

def test_unknown_version_read_is_clear_error_without_overwriting_save(client, app):
    started = action(client, "start", realm_id="fire").get_json()
    state = started["state"]
    state["active_trial"]["map_version"] = 99
    with app.app_context():
        db = get_db()
        db.execute("UPDATE journey_saves SET state_json=?", (json.dumps(state),))
        db.commit()
    res = client.get("/api/journey")
    assert res.status_code == 400 and "error" in res.get_json()
    with app.app_context():
        assert json.loads(get_db().execute("SELECT state_json FROM journey_saves").fetchone()[0]) == state
    # Explicit abandon is still possible; merely reading never resets the trial.
    res = client.post("/api/journey", json=dict(action="abandon", revision=started["revision"], owner_id=None, trial_id=state["active_trial"]["id"]))
    assert res.status_code == 200
    assert res.get_json()["state"]["active_trial"] is None
    assert res.get_json()["state"]["progress"]["victories"] == 0
