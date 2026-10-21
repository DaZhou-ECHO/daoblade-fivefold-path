"""《本命剑：八荒五行》的共享规则与存档校验。"""

from __future__ import annotations

from copy import deepcopy
from typing import Any


# 导入名称保留旧调用方兼容，数据及基础计算来自共用契约。
from shared_rules import (
    AFFIX_KEYS, ELEMENTS, LIMITS, TRIGRAMS, default_state,
    element_totals, primary_secondary, validate_loadout, validate_rule_header,
)


REALMS = ELEMENTS
MAX_INVENTORY = LIMITS["inventory"]
LOADOUT_SIZE = LIMITS["loadout"]


def _validate_trial(trial: Any, state: dict[str, Any], previous: dict[str, Any] | None) -> None:
    if trial is None:
        return
    fields = {"version", "id", "ruleset_id", "rules_version", "realm_id", "checkpoint_id", "build", "claimed_altars"}
    if not isinstance(trial, dict) or set(trial) != fields:
        raise ValueError("试炼记录字段无效")
    if (type(trial["version"]) is not int or trial["version"] != 1
            or type(trial["rules_version"]) is not int or trial["rules_version"] != 1
            or trial["ruleset_id"] != "legacy-v1" or trial["realm_id"] != "fire"
            or trial["checkpoint_id"] != "swordstone"):
        raise ValueError("试炼记录版本或检查点不受支持")
    if not isinstance(trial["id"], str) or not 1 <= len(trial["id"]) <= 80:
        raise ValueError("试炼编号无效")
    claimed = trial["claimed_altars"]
    if (not isinstance(claimed, list) or len(claimed) > 2
            or any(type(item) is not str or item not in ("altar-1", "altar-2") for item in claimed)
            or len(set(claimed)) != len(claimed)):
        raise ValueError("试炼祭坛记录无效")
    build = trial["build"]
    if not isinstance(build, dict) or set(build) != {"player", "cultivation", "loadout"}:
        raise ValueError("试炼构筑字段无效")
    # 重建标准状态再复用原校验，禁止把递归试炼或任意stats藏进构筑。
    source = default_state()
    source.update(deepcopy(build))
    validate_state(source, source)
    for key in TRIGRAMS:
        for index, bead in enumerate(build["cultivation"][key]):
            if bead is None:
                continue
            current = state["cultivation"][key][index]
            if (current is None or any(bead[field] != current[field] for field in ("id", "element", "quality"))
                    or bead["level"] > current["level"]):
                raise ValueError("试炼构筑与角色灵珠不一致")
    old = previous.get("active_trial") if previous else None
    if isinstance(old, dict) and set(old) == fields and old.get("id") == trial["id"]:
        if old["build"] != build or not set(old["claimed_altars"]).issubset(claimed):
            raise ValueError("进行中试炼的构筑与奖励记录不能倒退或改写")


def _validate_bead(bead: Any) -> None:
    if not isinstance(bead, dict):
        raise ValueError("灵珠数据格式错误")
    required = {"id", "name", "element", "quality", "level", "xp", "affixes"}
    if not required.issubset(bead):
        raise ValueError("灵珠字段不完整")
    if not isinstance(bead["id"], str) or not 1 <= len(bead["id"]) <= 80:
        raise ValueError("灵珠编号无效")
    if not isinstance(bead["name"], str) or not 1 <= len(bead["name"]) <= 40:
        raise ValueError("灵珠名称无效")
    if bead["element"] not in ELEMENTS:
        raise ValueError("灵珠五行无效")
    if type(bead["quality"]) is not int or bead["quality"] not in (1, 2, 3):
        raise ValueError("灵珠品阶无效")
    if type(bead["level"]) is not int or not 1 <= bead["level"] <= LIMITS["bead_level"]:
        raise ValueError("灵珠等级无效")
    if type(bead["xp"]) is not int or not 0 <= bead["xp"] <= LIMITS["bead_xp"]:
        raise ValueError("灵珠经验无效")
    if not isinstance(bead["affixes"], list) or len(bead["affixes"]) > LIMITS["affixes"]:
        raise ValueError("灵珠词条无效")
    for affix in bead["affixes"]:
        if not isinstance(affix, dict) or not {"key", "label", "value"}.issubset(affix):
            raise ValueError("灵珠词条字段不完整")
        if not isinstance(affix["label"], str) or len(affix["label"]) > 40:
            raise ValueError("灵珠词条名称无效")
        if not isinstance(affix["key"], str) or affix["key"] not in AFFIX_KEYS:
            raise ValueError("灵珠词条类型无效")
        if type(affix["value"]) not in (int, float) or not 0 <= affix["value"] <= 100:
            raise ValueError("灵珠词条数值无效")


def validate_state(raw: Any, previous: dict[str, Any] | None = None) -> dict[str, Any]:
    """校验并返回可保存的存档，同时阻止移动或替换既有镶嵌珠。"""
    if not isinstance(raw, dict):
        raise ValueError("存档必须是 JSON 对象")
    state = deepcopy(raw)
    validate_rule_header(state)

    player = state.get("player")
    if not isinstance(player, dict):
        raise ValueError("玩家数据无效")
    name = player.get("name", "")
    if not isinstance(name, str) or not 1 <= len(name.strip()) <= 16:
        raise ValueError("角色名长度应为 1 至 16 个字符")
    for key in ("level", "spirit"):
        if type(player.get(key)) is not int or player[key] < 0:
            raise ValueError("玩家数值无效")

    inventory = state.get("inventory")
    if not isinstance(inventory, list) or len(inventory) > MAX_INVENTORY:
        raise ValueError("珠匣容量无效")
    for bead in inventory:
        _validate_bead(bead)

    cultivation = state.get("cultivation")
    if not isinstance(cultivation, dict) or set(cultivation) != set(TRIGRAMS):
        raise ValueError("八卦修行图无效")
    old_slots = previous.get("cultivation", {}) if previous else {}
    for trigram in TRIGRAMS:
        slots = cultivation[trigram]
        if not isinstance(slots, list) or len(slots) != LIMITS["layers"]:
            raise ValueError("每条八卦路线必须包含三层")
        found_empty = False
        for index, bead in enumerate(slots):
            if bead is None:
                found_empty = True
                continue
            if found_empty:
                raise ValueError("八卦路线必须从中心向外依次修行")
            _validate_bead(bead)
            # 已存在的旧镶嵌保留；新镶嵌必须满足前一层的修行等级。
            old = old_slots.get(trigram, [None] * LIMITS["layers"])
            was_socketed = isinstance(old, list) and len(old) > index and old[index] is not None
            if index > 0 and not was_socketed and slots[index - 1]["level"] < index + 1:
                raise ValueError("前一层灵珠尚需继续修炼")

    all_beads = inventory + [
        bead
        for slots in cultivation.values()
        for bead in slots
        if bead is not None
    ]
    ids = [bead["id"] for bead in all_beads]
    if len(ids) != len(set(ids)):
        raise ValueError("同一颗灵珠不能出现两次")

    # 旧档缺省栏位的兼容与浏览器共用同一出战约定。
    state["loadout"] = validate_loadout(state)

    progress = state.get("progress")
    if not isinstance(progress, dict):
        raise ValueError("进度数据无效")
    if type(progress.get("runs")) is not int or progress["runs"] < 0:
        raise ValueError("闯关次数无效")
    if type(progress.get("victories")) is not int or progress["victories"] < 0:
        raise ValueError("通关次数无效")
    clears = progress.get("clears")
    if not isinstance(clears, dict) or set(clears) != set(REALMS):
        raise ValueError("秘境进度无效")
    if any(type(value) is not int or value < 0 for value in clears.values()):
        raise ValueError("秘境通关次数无效")
    progress["seen_help"] = bool(progress.get("seen_help", False))

    if previous:
        old_slots = previous.get("cultivation", {})
        for trigram in TRIGRAMS:
            for index, old_bead in enumerate(old_slots.get(trigram, [])):
                if old_bead is None:
                    continue
                new_bead = cultivation[trigram][index]
                if new_bead is None or new_bead.get("id") != old_bead.get("id"):
                    raise ValueError("已经镶嵌的灵珠不能取下或移动")
                immutable = ("element", "quality")
                if any(new_bead[key] != old_bead[key] for key in immutable):
                    raise ValueError("已经镶嵌的灵珠属性不能修改")
                if new_bead["level"] < old_bead["level"] or new_bead["xp"] < 0:
                    raise ValueError("灵珠修为不能倒退")

    _validate_trial(state.get("active_trial"), state, previous)
    return state

