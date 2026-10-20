import json
import re
from copy import deepcopy
from pathlib import Path

import pytest

from game_rules import default_state, element_totals, primary_secondary, validate_state
from shared_rules import get_ruleset, rules_metadata, validate_loadout


FIXTURE_PATH = Path(__file__).parent / "fixtures/legacy-rule-cases.json"
FIXTURES = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))


@pytest.mark.parametrize("case", FIXTURES["valid_cases"], ids=lambda case: case["id"])
def test_shared_legacy_cases(case):
    state = deepcopy(case["state"])
    before = deepcopy(state)
    validated = validate_state(state)
    assert element_totals(validated) == case["expected"]["totals"]
    assert list(primary_secondary(validated)) == case["expected"]["primary_secondary"]
    assert validate_loadout(validated) == case["expected"]["stats"]["loadout"]
    assert state == before


@pytest.mark.parametrize("case", FIXTURES["invalid_cases"], ids=lambda case: case["id"])
def test_shared_invalid_loadout(case):
    with pytest.raises(ValueError, match=case["error"]):
        validate_state(case["state"])


def test_config_and_defaults_do_not_share_mutable_references():
    config = get_ruleset()
    config["default_state"]["player"]["name"] = "changed"
    state = default_state()
    state["cultivation"]["qian"][0] = {"id": "changed"}
    assert get_ruleset()["default_state"]["player"]["name"] == "无名剑客"
    assert default_state()["cultivation"]["qian"][0] is None


@pytest.mark.parametrize("key,value", [
    ("version", True), ("version", 2), ("ruleset_id", "bagua-test-v1"),
    ("ruleset_id", None), ("schema_version", True), ("schema_version", 2),
    ("rules_version", 2), ("rules_version", True),
])
def test_unknown_contract_cannot_silently_use_old_rules(key, value):
    state = default_state()
    state[key] = value
    with pytest.raises(ValueError, match="版本|规则集"):
        validate_state(state)


def test_rules_api_template_and_state_envelope_share_contract(client):
    payload = client.get("/api/rules").get_json()
    assert payload["contract"] == rules_metadata()
    assert payload["ruleset"] == get_ruleset()
    page = client.get("/").get_data(as_text=True)
    embedded = re.search(r"globalThis.DaoBladeRuleset = (.+?);</script>", page)
    assert embedded
    assert json.loads(embedded[1]) == payload["ruleset"]
    assert page.index("js/rules.js") < page.index("js/game.js")
    loaded = client.get("/api/state").get_json()
    assert loaded["contract"] == payload["contract"]
    assert loaded["state"] == default_state()
    # 元数据只加在信封上；旧存档字段及SQLite内容不被自动改写。
    assert "ruleset_id" not in loaded["state"]


def test_unsupported_ruleset_is_rejected_without_overwriting_save(client):
    original = default_state()
    original["player"]["spirit"] = 12
    assert client.post("/api/state", json=original).status_code == 200
    unknown = deepcopy(original)
    unknown["ruleset_id"] = "bagua-test-v1"
    assert client.post("/api/state", json=unknown).status_code == 400
    loaded = client.get("/api/state").get_json()
    assert loaded["state"] == original
    assert loaded["revision"] == 1
