from game_rules import default_state


def test_home_and_health(client):
    assert client.get("/").status_code == 200
    health = client.get("/api/health")
    assert health.status_code == 200
    assert health.get_json()["status"] == "ok"


def test_state_can_be_saved_and_loaded(client):
    state = default_state()
    state["player"]["spirit"] = 18
    response = client.post("/api/state", json=state)
    assert response.status_code == 200
    loaded = client.get("/api/state").get_json()["state"]
    assert loaded["player"]["spirit"] == 18


def test_invalid_state_returns_json_error(client):
    state = default_state()
    state["inventory"] = [{"id": "broken"}]
    response = client.post("/api/state", json=state)
    assert response.status_code == 400
    assert "error" in response.get_json()


def test_api_prevents_removing_socketed_bead(client):
    state = default_state()
    item = {
        "id": "fixed-bead",
        "name": "赤心·一阶珠",
        "element": "fire",
        "quality": 1,
        "level": 1,
        "xp": 0,
        "affixes": [{"key": "crit", "label": "烈心：暴击率提高", "value": 6}],
    }
    state["cultivation"]["li"][0] = item
    assert client.post("/api/state", json=state).status_code == 200
    state["cultivation"]["li"][0] = None
    response = client.post("/api/state", json=state)
    assert response.status_code == 400
    assert "不能取下或移动" in response.get_json()["error"]

