import json
from copy import deepcopy
from pathlib import Path

import pytest

from array_lab import CONFIG, default_lab_state, validate_lab_state, validate_lab_edit, compile_lab
from game_rules import default_state

CASES = json.loads((Path(__file__).parent / "fixtures/array-lab-cases.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["id"])
def test_compiler_shared_cases(case):
    state = default_lab_state()
    for role in case["roles"]:
        state["nodes"]["li." + role] = "lab-" + role
    for bead in state["beads"]:
        bead["level"] = case.get("levels", {}).get(bead["role"], 1)
    result = compile_lab(state)
    assert result["effective"] == case["effective"]
    assert result["inactive"] == case["inactive"]
    assert result["used"] == len(case["roles"])
    for key in ("enabled", "focus", "burst", "mark"):
        assert result["skill"][key] == case[key]
    assert result["skill"]["element"] == ("fire" if case["enabled"] else None)
    for key, value in case.get("numbers", {}).items():
        assert result["skill"][key] == value


@pytest.mark.parametrize("nodes", [
    {"li.core": "lab-water"}, {"li.core": "lab-mark"}, {"li.cycle": "lab-cycle"},
    {"li.core": "lab-core", "li.mark": "lab-core"},
    {"li.core": "lab-core", "li.mark": "lab-mark", "li.focus": "lab-focus", "li.burst": "lab-burst"},
    {"li.focus": "lab-focus", "li.burst": "lab-burst"},
])
def test_invalid_equipment_rejected(nodes):
    state = default_lab_state()
    state["nodes"].update(nodes)
    with pytest.raises(ValueError):
        validate_lab_state(state)


def test_catalog_identity_cannot_duplicate_or_change_experience():
    state = default_lab_state()
    state["beads"][0]["xp"] = 1
    with pytest.raises(ValueError):
        validate_lab_edit(state, default_lab_state())
    state = default_lab_state()
    state["beads"][0]["level"] = True
    with pytest.raises(ValueError):
        validate_lab_state(state)


def test_api_independent_save_and_revision(client):
    old = default_state()
    old["player"]["spirit"] = 23
    assert client.post("/api/state", json=old).status_code == 200
    record = client.get("/api/lab/state").get_json()
    assert record["revision"] == 0
    state = record["state"]
    state["nodes"]["li.core"] = "lab-core"
    saved = client.post("/api/lab/state", json={"state": state, "revision": 0, "owner_id": None})
    assert saved.status_code == 200
    assert saved.get_json()["compiled"]["skill"]["enabled"] is True
    assert client.get("/api/state").get_json()["state"] == old
    assert client.post("/api/state", json=state).status_code == 400
    assert client.post("/api/lab/state", json={"state": old, "revision": 1, "owner_id": None}).status_code == 400
    assert client.get("/api/state").get_json()["state"] == old
    assert client.post("/api/lab/state", json={"state": state, "revision": 0, "owner_id": None}).status_code == 409
    assert client.get("/api/lab/state").get_json()["revision"] == 1
    state["nodes"]["li.core"] = None
    assert client.post("/api/lab/state", json={"state": state, "revision": 1, "owner_id": None}).status_code == 200
    assert client.get("/api/lab/state").get_json()["state"]["beads"] == record["state"]["beads"]


def test_lab_account_isolation_and_owner_change(app):
    one, two = app.test_client(), app.test_client()
    auth = one.post("/api/auth/register", json={"username": "lab_one", "password": "test-secret-123"}).get_json()
    two.post("/api/auth/register", json={"username": "lab_two", "password": "test-secret-123"})
    record = one.get("/api/lab/state").get_json()
    record["state"]["nodes"]["li.core"] = "lab-core"
    payload = {"state": record["state"], "revision": 0, "owner_id": auth["user"]["id"]}
    assert one.post("/api/lab/state", json=payload).status_code == 403
    assert one.post("/api/lab/state", json=payload, headers={"X-CSRF-Token": auth["csrf_token"]}).status_code == 200
    assert two.get("/api/lab/state").get_json()["state"]["nodes"]["li.core"] is None
    one.post("/api/auth/logout", headers={"X-CSRF-Token": auth["csrf_token"]})
    assert one.post("/api/lab/state", json=payload).status_code == 409

def test_relogin_restores_own_lab_and_legacy_remains_untouched(client):
    auth = client.post("/api/auth/register", json={"username": "lab_login", "password": "test-secret-123"}).get_json()
    old = default_state()
    old["player"]["spirit"] = 91
    headers = {"X-CSRF-Token": auth["csrf_token"]}
    assert client.post("/api/state", json={"state": old, "revision": 0}, headers=headers).status_code == 200
    state = default_lab_state()
    for role in ("core", "mark", "burst"):
        state["nodes"]["li." + role] = "lab-" + role
    assert client.post("/api/lab/state", json={"state": state, "revision": 0, "owner_id": auth["user"]["id"]}, headers=headers).status_code == 200
    client.post("/api/auth/logout", headers=headers)
    assert client.get("/api/lab/state").get_json()["revision"] == 0
    client.post("/api/auth/login", json={"username": "lab_login", "password": "test-secret-123"})
    assert client.get("/api/lab/state").get_json()["state"] == state
    assert client.get("/api/state").get_json()["state"] == old
