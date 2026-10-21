import sqlite3
from copy import deepcopy

import pytest

from array_lab import default_lab_state
from array_lab_trials import transition_trial
from database import get_db, load_lab_record, save_lab_state

ALL = [f"enemy-{index}" for index in range(1, 7)]


def ready(client, roles=("core", "mark", "burst")):
    record = client.get("/api/lab/state").get_json()
    for role in roles:
        record["state"]["nodes"]["li." + role] = "lab-" + role
    response = client.post("/api/lab/state", json={"state": record["state"], "revision": record["revision"], "owner_id": None})
    assert response.status_code == 200
    return response.get_json()


def action(client, record, name, **extra):
    trial = record["state"].get("active_trial")
    payload = {"revision": record["revision"], "owner_id": None, "action": name, **extra}
    if trial:
        payload.setdefault("trial_id", trial["id"])
    return client.post("/api/lab/trial", json=payload)


def test_victory_only_effective_beads_and_replayed_receipt(client):
    record = ready(client)
    started = action(client, record, "start").get_json()
    trial = started["state"]["active_trial"]
    assert trial["effective_bead_ids"] == ["lab-core", "lab-mark", "lab-burst"]
    assert started["state"]["progress"]["runs"] == 1
    assert trial["build"]["beads"][0]["level"] == 1
    won = action(client, started, "settle", win=True, defeated_ids=ALL)
    assert won.status_code == 200
    result = won.get_json()
    assert result["state"]["active_trial"] is None
    assert result["state"]["progress"] == {"runs": 1, "victories": 1, "spirit": 12}
    assert {bead["id"] for bead in result["state"]["beads"] if bead["level"] == 2} == set(trial["effective_bead_ids"])
    assert result["compiled"]["skill"]["damage"] == 14
    assert result["compiled"]["skill"]["burst_per_mark"] == 16
    replay = action(client, started, "settle", win=True, defeated_ids=ALL).get_json()
    assert replay["replayed"] is True
    assert replay["state"] == result["state"]
    assert replay["revision"] == result["revision"]
    assert action(client, started, "settle", win=False, defeated_ids=[]).status_code == 409


def test_old_receipt_cannot_clear_new_trial(client):
    started = action(client, ready(client), "start").get_json()
    first = action(client, started, "settle", win=True, defeated_ids=ALL).get_json()
    second = action(client, first, "start").get_json()
    replay = action(client, started, "settle", win=True, defeated_ids=ALL).get_json()
    assert replay["state"]["active_trial"]["id"] == second["state"]["active_trial"]["id"]
    assert replay["state"]["progress"]["victories"] == 1


def test_checkpoint_failure_and_altar_flags_persist_without_experience(client):
    started = action(client, ready(client), "start").get_json()
    assert action(client, started, "checkpoint", defeated_ids=["enemy-1"]).status_code == 400
    checkpoint = action(client, started, "checkpoint", defeated_ids=ALL[:3]).get_json()
    claimed = action(client, checkpoint, "altar", altar_id="altar-1").get_json()
    claimed = action(client, claimed, "altar", altar_id="altar-1").get_json()
    assert claimed["state"]["active_trial"]["claimed_altars"] == ["altar-1"]
    failed = action(client, claimed, "settle", win=False, defeated_ids=ALL[:3]).get_json()
    assert failed["receipt"] is None
    restored = client.get("/api/lab/state").get_json()
    assert restored["state"]["active_trial"]["checkpoint"] == "swordstone"
    assert restored["state"]["progress"]["runs"] == 1
    assert all(bead["level"] == 1 and bead["xp"] == 0 for bead in restored["state"]["beads"])
    abandoned = action(client, restored, "abandon").get_json()
    assert abandoned["state"]["active_trial"] is None
    assert abandoned["receipt"]["xp_awards"] == []


def test_generic_edits_cannot_write_rewards_or_swap_build_mid_trial(client):
    saved = ready(client)
    changed = deepcopy(saved["state"])
    changed["beads"][0]["level"] = 2
    assert client.post("/api/lab/state", json={"state": changed, "revision": saved["revision"], "owner_id": None}).status_code == 400
    started = action(client, saved, "start").get_json()
    changed = deepcopy(started["state"])
    changed["nodes"]["li.core"] = None
    assert client.post("/api/lab/state", json={"state": changed, "revision": started["revision"], "owner_id": None}).status_code == 400
    assert action(client, saved, "start").status_code == 409
    assert action(client, started, "settle", win=True, defeated_ids=ALL[:3]).status_code == 400
    assert client.get("/api/state").get_json()["state"]["progress"]["victories"] == 0


def test_v1_trial_save_migration_preserves_nodes_and_does_not_rewrite_on_read(app, client):
    old = default_lab_state()
    old.pop("progress")
    old.pop("active_trial")
    old.update(schema_version=1, rules_version=1)
    old["nodes"]["li.core"] = "lab-core"
    with app.app_context():
        save_lab_state(old, "local", 0)
    loaded = client.get("/api/lab/state").get_json()
    assert loaded["state"]["schema_version"] == 2
    assert loaded["state"]["nodes"] == old["nodes"]
    assert loaded["state"]["beads"] == old["beads"]
    with app.app_context():
        assert load_lab_record("local")["state"]["schema_version"] == 1
    assert client.post("/api/lab/state", json={"state": loaded["state"], "revision": 1, "owner_id": None}).status_code == 200


def test_full_level_cap_does_not_keep_accumulating_hidden_xp(client):
    record = ready(client)
    for _ in range(4):
        started = action(client, record, "start").get_json()
        record = action(client, started, "settle", win=True, defeated_ids=ALL).get_json()
    grown = {bead["id"]: bead for bead in record["state"]["beads"]}
    assert grown["lab-core"]["level"] == 3 and grown["lab-core"]["xp"] == 0
    assert all(item["amount"] == 0 for item in record["receipt"]["xp_awards"])
    assert grown["lab-focus"]["level"] == 1


def test_reward_ledger_and_state_rollback_together(app, client):
    started = action(client, ready(client), "start").get_json()
    with app.app_context():
        get_db().execute("CREATE TRIGGER reject_test_receipt BEFORE INSERT ON array_lab_results BEGIN SELECT RAISE(ABORT, 'test rollback'); END")
        get_db().commit()
        with pytest.raises(sqlite3.IntegrityError, match="test rollback"):
            transition_trial("local", started["revision"], {"action": "settle", "trial_id": started["state"]["active_trial"]["id"], "win": True, "defeated_ids": ALL})
        assert load_lab_record("local")["state"] == started["state"]
        assert get_db().execute("SELECT COUNT(*) FROM array_lab_results").fetchone()[0] == 0


def test_empty_core_start_and_wrong_account_are_rejected(client):
    assert action(client, client.get("/api/lab/state").get_json(), "start").status_code == 400
    assert client.post("/api/lab/trial", json={"action": "start", "revision": 0, "owner_id": 100}).status_code == 409

def test_equipped_but_disconnected_branch_gets_no_experience(client):
    started = action(client, ready(client, roles=("core", "burst")), "start").get_json()
    assert started["state"]["active_trial"]["effective_bead_ids"] == ["lab-core"]
    won = action(client, started, "settle", win=True, defeated_ids=ALL).get_json()
    assert [item["id"] for item in won["receipt"]["xp_awards"]] == ["lab-core"]
    assert next(bead for bead in won["state"]["beads"] if bead["id"] == "lab-burst")["level"] == 1


def test_defeat_without_checkpoint_closes_trial_and_cannot_turn_into_victory(client):
    started = action(client, ready(client), "start").get_json()
    lost = action(client, started, "settle", win=False, defeated_ids=[]).get_json()
    assert lost["state"]["active_trial"] is None
    assert lost["receipt"]["xp_awards"] == []
    assert action(client, started, "settle", win=True, defeated_ids=ALL).status_code == 409


def test_trial_account_csrf_and_cross_account_id(app):
    first, second = app.test_client(), app.test_client()
    auth = first.post("/api/auth/register", json={"username": "trial_growth_a", "password": "local-test-017"}).get_json()
    other = second.post("/api/auth/register", json={"username": "trial_growth_b", "password": "local-test-017"}).get_json()
    state = default_lab_state()
    state["nodes"]["li.core"] = "lab-core"
    headers = {"X-CSRF-Token": auth["csrf_token"]}
    saved = first.post("/api/lab/state", json={"state": state, "revision": 0, "owner_id": auth["user"]["id"]}, headers=headers).get_json()
    payload = {"action": "start", "owner_id": auth["user"]["id"], "revision": saved["revision"]}
    assert first.post("/api/lab/trial", json=payload).status_code == 403
    started = first.post("/api/lab/trial", json=payload, headers=headers).get_json()
    attempt = {"action": "settle", "win": True, "defeated_ids": ALL, "trial_id": started["state"]["active_trial"]["id"], "revision": 0, "owner_id": other["user"]["id"]}
    assert second.post("/api/lab/trial", json=attempt, headers={"X-CSRF-Token": other["csrf_token"]}).status_code == 409
    assert second.get("/api/lab/state").get_json()["state"]["progress"]["victories"] == 0


def test_research_unlock_once_and_protect_stage(client):
    record = ready(client)
    assert action(client, record, "research").status_code == 400
    forged = deepcopy(record["state"])
    forged["stage"] = 2
    assert client.post("/api/lab/state", json={"state": forged, "revision": record["revision"], "owner_id": None}).status_code == 400
    started = action(client, record, "start").get_json()
    assert action(client, started, "research").status_code == 400
    won = action(client, started, "settle", win=True, defeated_ids=ALL).get_json()
    learned = action(client, won, "research")
    assert learned.status_code == 200
    learned = learned.get_json()
    assert learned["state"]["stage"] == 2
    assert learned["state"]["progress"]["spirit"] == 0
    assert action(client, won, "research").status_code == 409
    assert action(client, learned, "research").status_code == 400
    current = client.get("/api/lab/state").get_json()
    assert current["revision"] == learned["revision"]
    current["state"]["nodes"]["li.burst"] = None
    current["state"]["nodes"]["li.cycle"] = "lab-cycle"
    saved = client.post("/api/lab/state", json={"state": current["state"], "revision": current["revision"], "owner_id": None}).get_json()
    assert saved["compiled"]["skill"]["cycle"] is True
    frozen = action(client, saved, "start").get_json()
    assert frozen["state"]["active_trial"]["build"]["stage"] == 2
    assert frozen["trial_compiled"]["skill"]["cycle_damage"] == 10


def test_wood_trial_resume_and_once_only_rewards(client):
    saved=ready(client)
    started=action(client,saved,"start",realm_id="wood").get_json()
    assert started["state"]["active_trial"]["realm_id"]=="wood"
    checkpoint=action(client,started,"checkpoint",defeated_ids=ALL[:3]).get_json()
    claimed=action(client,checkpoint,"altar",altar_id="altar-1").get_json()
    failed=action(client,claimed,"settle",win=False,defeated_ids=ALL[:4],realm_id="fire").get_json()
    restored=client.get("/api/lab/state").get_json()
    assert restored["state"]["active_trial"]["realm_id"]=="wood"
    assert restored["state"]["active_trial"]["checkpoint"]=="swordstone"
    assert restored["state"]["active_trial"]["claimed_altars"]==["altar-1"]
    won=action(client,restored,"settle",win=True,defeated_ids=ALL).get_json()
    assert won["state"]["progress"]=={"runs":1,"victories":1,"spirit":12}
    assert action(client,restored,"settle",win=True,defeated_ids=ALL).get_json()["revision"]==won["revision"]


@pytest.mark.parametrize("realm",["water","earth","metal","",None,[],True])
def test_unopened_or_invalid_realm_rejected_without_state_change(client,realm):
    saved=ready(client)
    assert action(client,saved,"start",realm_id=realm).status_code==400
    assert client.get("/api/lab/state").get_json()["revision"]==saved["revision"]
