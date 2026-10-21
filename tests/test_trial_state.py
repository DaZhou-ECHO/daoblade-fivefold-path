from copy import deepcopy

import pytest

from game_rules import default_state, validate_state


def trial_record():
    state = default_state()
    return {"version": 1, "id": "trial-test", "ruleset_id": "legacy-v1", "rules_version": 1,
            "realm_id": "fire", "checkpoint_id": "swordstone", "claimed_altars": ["altar-1"],
            "build": {key: deepcopy(state[key]) for key in ("player", "cultivation", "loadout")}}


def test_old_save_and_checkpoint_round_trip(client):
    state = default_state()
    assert "active_trial" not in validate_state(state)
    state["active_trial"] = trial_record()
    assert client.post("/api/state", json=state).status_code == 200
    assert client.get("/api/state").get_json()["state"]["active_trial"] == state["active_trial"]
    state["active_trial"] = None
    state["progress"]["victories"] = 1
    assert client.post("/api/state", json=state).status_code == 200
    saved = client.get("/api/state").get_json()["state"]
    assert saved["active_trial"] is None
    assert saved["progress"]["victories"] == 1


@pytest.mark.parametrize("key,value", [("version", True), ("rules_version", 2), ("realm_id", "wood"),
    ("checkpoint_id", "missing"), ("id", ""), ("claimed_altars", ["altar-1", "altar-1"]),
    ("claimed_altars", ["missing"]), ("claimed_altars", [["altar-1"]]), ("build", {"active_trial": {}})])
def test_invalid_checkpoint_rejected(key, value):
    state = default_state()
    state["active_trial"] = trial_record()
    state["active_trial"][key] = value
    with pytest.raises(ValueError):
        validate_state(state)


def test_same_trial_cannot_change_build_or_forget_claimed_altar():
    state = default_state()
    state["active_trial"] = trial_record()
    changed = deepcopy(state)
    changed["active_trial"]["build"]["player"]["name"] = "其他构筑"
    with pytest.raises(ValueError, match="不能倒退或改写"):
        validate_state(changed, state)
    changed = deepcopy(state)
    changed["active_trial"]["claimed_altars"] = []
    with pytest.raises(ValueError):
        validate_state(changed, state)
    changed["active_trial"] = None
    assert validate_state(changed, state)["active_trial"] is None


def test_checkpoint_uses_full_bead_validation():
    state = default_state()
    state["active_trial"] = trial_record()
    state["active_trial"]["build"]["cultivation"]["li"][0] = {"id": "broken"}
    with pytest.raises(ValueError, match="字段不完整"):
        validate_state(state)


def test_account_trial_isolation_and_stale_clear_conflict(app):
    first, second = app.test_client(), app.test_client()
    one = first.post("/api/auth/register", json={"username": "trial_one", "password": "correct-horse-123"}).get_json()
    second.post("/api/auth/register", json={"username": "trial_two", "password": "correct-horse-123"})
    state = default_state()
    state["active_trial"] = trial_record()
    headers = {"X-CSRF-Token": one["csrf_token"]}
    assert first.post("/api/state", json={"state": state, "revision": 0}, headers=headers).status_code == 200
    assert second.get("/api/state").get_json()["state"].get("active_trial") is None
    state["active_trial"] = None
    assert first.post("/api/state", json={"state": state, "revision": 0}, headers=headers).status_code == 409
    assert first.get("/api/state").get_json()["state"]["active_trial"]["id"] == "trial-test"
