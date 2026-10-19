from copy import deepcopy

import pytest

from game_rules import default_state, element_totals, primary_secondary, validate_state


def bead(bead_id="bead-1", element="fire", quality=1, level=1):
    return {
        "id": bead_id,
        "name": "赤心·一阶珠",
        "element": element,
        "quality": quality,
        "level": level,
        "xp": 0,
        "affixes": [{"key": "crit", "label": "烈心：暴击率提高", "value": 6}],
    }


def test_default_state_has_equal_five_elements():
    assert element_totals(default_state()) == {
        "metal": 1,
        "wood": 1,
        "water": 1,
        "fire": 1,
        "earth": 1,
    }


def test_socketed_beads_determine_primary_and_secondary():
    state = default_state()
    state["cultivation"]["li"][0] = bead("fire", "fire", 3, 5)
    state["cultivation"]["qian"][0] = bead("metal", "metal", 2, 3)
    assert primary_secondary(state)[:2] == ("fire", "metal")


def test_trigram_must_grow_from_center_outward():
    state = default_state()
    state["cultivation"]["qian"][1] = bead()
    with pytest.raises(ValueError, match="依次修行"):
        validate_state(state)


def test_same_bead_cannot_appear_twice():
    state = default_state()
    state["inventory"].append(bead())
    state["cultivation"]["li"][0] = bead()
    with pytest.raises(ValueError, match="不能出现两次"):
        validate_state(state)


def test_socketed_bead_cannot_be_removed_or_moved():
    previous = default_state()
    previous["cultivation"]["li"][0] = bead()
    current = deepcopy(previous)
    current["cultivation"]["li"][0] = None
    current["cultivation"]["qian"][0] = bead()
    with pytest.raises(ValueError, match="不能取下或移动"):
        validate_state(current, previous)


@pytest.mark.parametrize("field,value", [("quality", 4), ("level", 0), ("xp", -1)])
def test_invalid_bead_numbers_are_rejected(field, value):
    state = default_state()
    item = bead()
    item[field] = value
    state["inventory"].append(item)
    with pytest.raises(ValueError):
        validate_state(state)

