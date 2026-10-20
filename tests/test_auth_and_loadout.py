"""账号隔离、存档并发和出战配置的关键回归。"""

from game_rules import default_state, validate_state


def bead(bead_id):
    return {
        "id": bead_id, "name": "试炼珠", "element": "metal",
        "quality": 1, "level": 3, "xp": 0, "affixes": [],
    }


def register(client, username):
    response = client.post(
        "/api/auth/register", json={"username": username, "password": "correct-horse-123"}
    )
    assert response.status_code == 201
    return response.get_json()["csrf_token"]


def test_accounts_have_isolated_saves(app):
    alice, bob = app.test_client(), app.test_client()
    alice_csrf = register(alice, "alice")
    bob_csrf = register(bob, "bob")
    state = default_state()
    state["player"]["name"] = "甲"
    saved = alice.post(
        "/api/state", json={"state": state, "revision": 0},
        headers={"X-CSRF-Token": alice_csrf},
    )
    assert saved.status_code == 200
    assert saved.get_json()["revision"] == 1
    assert bob.get("/api/state").get_json()["state"]["player"]["name"] == "无名剑客"
    assert alice.get("/api/state").get_json()["state"]["player"]["name"] == "甲"
    assert bob.post("/api/state", json={"state": state, "revision": 0},
                    headers={"X-CSRF-Token": bob_csrf}).status_code == 200


def test_stale_tab_cannot_overwrite_newer_save(app):
    first, second = app.test_client(), app.test_client()
    csrf_one = register(first, "same_owner")
    logged_in = second.post(
        "/api/auth/login", json={"username": "same_owner", "password": "correct-horse-123"}
    )
    csrf_two = logged_in.get_json()["csrf_token"]
    state = default_state()
    assert first.post("/api/state", json={"state": state, "revision": 0},
                      headers={"X-CSRF-Token": csrf_one}).status_code == 200
    state["player"]["spirit"] = 10
    assert second.post("/api/state", json={"state": state, "revision": 1},
                       headers={"X-CSRF-Token": csrf_two}).status_code == 200
    stale = first.post("/api/state", json={"state": default_state(), "revision": 1},
                       headers={"X-CSRF-Token": csrf_one})
    assert stale.status_code == 409
    assert first.get("/api/state").get_json()["state"]["player"]["spirit"] == 10


def test_account_save_requires_session_token_and_owned_skill(app):
    client = app.test_client()
    csrf = register(client, "swordsman")
    state = default_state()
    state["loadout"]["active"][0] = "qian"
    assert client.post("/api/state", json={"state": state, "revision": 0},
                       headers={"X-CSRF-Token": csrf}).status_code == 400
    state["cultivation"]["qian"][0] = bead("one")
    state["cultivation"]["qian"][1] = bead("two")
    assert client.post("/api/state", json={"state": state, "revision": 0}).status_code == 403
    assert client.post("/api/state", json={"state": state, "revision": 0},
                       headers={"X-CSRF-Token": csrf}).status_code == 200


def test_legacy_save_gets_empty_loadout_and_lower_quality_can_catch_up():
    state = default_state()
    del state["loadout"]
    state["cultivation"]["qian"][0] = bead("old")
    normalized = validate_state(state)
    assert normalized["loadout"] == {"active": [None, None], "passive": [None, None]}
    low = bead("low")
    high = bead("high")
    high["quality"] = 3
    from game_rules import element_totals

    low_state = default_state()
    high_state = default_state()
    low_state["cultivation"]["qian"][0] = low
    high_state["cultivation"]["qian"][0] = high
    assert element_totals(low_state) == element_totals(high_state)


def test_new_outer_socket_requires_previous_bead_training():
    import pytest

    state = default_state()
    state["cultivation"]["qian"][0] = bead("inner")
    state["cultivation"]["qian"][0]["level"] = 1
    state["cultivation"]["qian"][1] = bead("middle")
    with pytest.raises(ValueError, match="继续修炼"):
        validate_state(state)
    state["cultivation"]["qian"][0]["level"] = 2
    assert validate_state(state)["cultivation"]["qian"][1]["id"] == "middle"


def test_account_reset_checks_revision(app):
    first, second = app.test_client(), app.test_client()
    csrf_one = register(first, "reset_owner")
    csrf_two = second.post(
        "/api/auth/login", json={"username": "reset_owner", "password": "correct-horse-123"}
    ).get_json()["csrf_token"]
    first.post("/api/state", json={"state": default_state(), "revision": 0},
               headers={"X-CSRF-Token": csrf_one})
    changed = default_state()
    changed["player"]["spirit"] = 7
    second.post("/api/state", json={"state": changed, "revision": 1},
                headers={"X-CSRF-Token": csrf_two})
    stale = first.post("/api/reset", json={"revision": 1},
                       headers={"X-CSRF-Token": csrf_one})
    assert stale.status_code == 409
    assert first.get("/api/state").get_json()["state"]["player"]["spirit"] == 7


def test_auth_rejects_json_arrays_without_server_error(app):
    client = app.test_client()
    assert client.post("/api/auth/register", json=["not", "an", "object"]).status_code == 400
    assert client.post("/api/auth/login", json=["not", "an", "object"]).status_code == 400
