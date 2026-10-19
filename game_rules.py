"""《本命剑：八荒五行》的共享规则与存档校验。"""

from __future__ import annotations

from copy import deepcopy
from typing import Any


ELEMENTS = ("metal", "wood", "water", "fire", "earth")
TRIGRAMS = ("qian", "xun", "kan", "gen", "kun", "zhen", "li", "dui")
REALMS = ELEMENTS
MAX_INVENTORY = 80
AFFIX_KEYS = {
    "attack", "armorBreak", "qiPower", "hp", "heal", "seed", "qiMax",
    "qiRegen", "cooldown", "crit", "burn", "burst", "defense", "block",
    "stagger",
}


def default_state() -> dict[str, Any]:
    """返回新的本地存档，五行基础值均为 1。"""
    return {
        "version": 1,
        "player": {
            "name": "无名剑客",
            "level": 1,
            "spirit": 0,
        },
        "inventory": [],
        "cultivation": {name: [None, None, None] for name in TRIGRAMS},
        "progress": {
            "runs": 0,
            "victories": 0,
            "clears": {name: 0 for name in REALMS},
            "seen_help": False,
        },
    }


def element_totals(state: dict[str, Any]) -> dict[str, int]:
    """以基础值 1 加上已镶嵌灵珠的修为，计算五行总值。"""
    totals = {element: 1 for element in ELEMENTS}
    for slots in state.get("cultivation", {}).values():
        for bead in slots:
            if bead:
                totals[bead["element"]] += bead["level"] + bead["quality"]
    return totals


def primary_secondary(state: dict[str, Any]) -> tuple[str | None, str | None]:
    """返回明确领先的主、副属性；并列时暂不指定。"""
    totals = element_totals(state)
    ordered = sorted(ELEMENTS, key=lambda key: (-totals[key], ELEMENTS.index(key)))
    primary = ordered[0] if totals[ordered[0]] > totals[ordered[1]] else None
    secondary = ordered[1] if primary and totals[ordered[1]] > totals[ordered[2]] else None
    return primary, secondary


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
    if type(bead["level"]) is not int or not 1 <= bead["level"] <= 99:
        raise ValueError("灵珠等级无效")
    if type(bead["xp"]) is not int or not 0 <= bead["xp"] <= 999999:
        raise ValueError("灵珠经验无效")
    if not isinstance(bead["affixes"], list) or len(bead["affixes"]) > 3:
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
    if state.get("version") != 1:
        raise ValueError("存档版本不受支持")

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
    for trigram in TRIGRAMS:
        slots = cultivation[trigram]
        if not isinstance(slots, list) or len(slots) != 3:
            raise ValueError("每条八卦路线必须包含三层")
        found_empty = False
        for bead in slots:
            if bead is None:
                found_empty = True
                continue
            if found_empty:
                raise ValueError("八卦路线必须从中心向外依次修行")
            _validate_bead(bead)

    all_beads = inventory + [
        bead
        for slots in cultivation.values()
        for bead in slots
        if bead is not None
    ]
    ids = [bead["id"] for bead in all_beads]
    if len(ids) != len(set(ids)):
        raise ValueError("同一颗灵珠不能出现两次")

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

    return state

