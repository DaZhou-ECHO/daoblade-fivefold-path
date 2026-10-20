"""读取前后端共用的旧规则契约；不启用尚未定稿的新阵盘规则。"""

from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any


RULESET_PATH = Path(__file__).resolve().parent / "static/data/rules/legacy-v1.json"
with RULESET_PATH.open(encoding="utf-8") as rules_file:
    _RULESET = json.load(rules_file)

# 配置错误应在启动时暴露，不带着另一套默认规则继续运行。
if (_RULESET.get("ruleset_id") != "legacy-v1"
        or any(type(_RULESET.get(key)) is not int or _RULESET[key] != 1
               for key in ("contract_version", "schema_version", "rules_version"))):
    raise ValueError("共享规则契约版本不受支持")

ELEMENTS = tuple(_RULESET["element_order"])
TRIGRAMS = tuple(_RULESET["trigram_order"])
LIMITS = _RULESET["limits"].copy()
AFFIX_KEYS = frozenset(
    item[0] for entries in _RULESET["affixes"].values() for item in entries
)


def get_ruleset() -> dict[str, Any]:
    """公开可复制的规则，调用方不能污染进程内的权威配置。"""
    return deepcopy(_RULESET)


def rules_metadata() -> dict[str, Any]:
    return {key: _RULESET[key] for key in (
        "contract_version", "ruleset_id", "schema_version", "rules_version"
    )}


def validate_rule_header(state: dict[str, Any]) -> None:
    """缺省字段按旧档解释；显式声明其他规则时拒绝静默套用。"""
    if (type(state.get("version")) is not int
            or state["version"] != _RULESET["schema_version"]):
        raise ValueError("存档版本不受支持")
    if state.get("ruleset_id", _RULESET["ruleset_id"]) != _RULESET["ruleset_id"]:
        raise ValueError("存档规则集不受支持")
    if "schema_version" in state and (
        type(state["schema_version"]) is not int
        or state["schema_version"] != _RULESET["schema_version"]
    ):
        raise ValueError("存档结构版本不受支持")
    if "rules_version" in state and (
        type(state["rules_version"]) is not int
        or state["rules_version"] != _RULESET["rules_version"]
    ):
        raise ValueError("存档规则版本不受支持")


def default_state() -> dict[str, Any]:
    return deepcopy(_RULESET["default_state"])


def element_totals(state: dict[str, Any]) -> dict[str, int]:
    totals = {element: _RULESET["element_base"] for element in ELEMENTS}
    for slots in state.get("cultivation", {}).values():
        for bead in slots:
            if bead:
                totals[bead["element"]] += bead["level"]
    return totals


def primary_secondary(state: dict[str, Any]) -> tuple[str | None, str | None]:
    totals = element_totals(state)
    ordered = sorted(ELEMENTS, key=lambda key: (-totals[key], ELEMENTS.index(key)))
    primary = ordered[0] if totals[ordered[0]] > totals[ordered[1]] else None
    secondary = (
        ordered[1] if primary and totals[ordered[1]] > totals[ordered[2]] else None
    )
    return primary, secondary


def validate_loadout(state: dict[str, Any]) -> dict[str, list]:
    """旧档可缺省出战栏；其余配装条件与浏览器适配器一致。"""
    loadout = state.get("loadout", _RULESET["default_state"]["loadout"])
    if not isinstance(loadout, dict) or set(loadout) != {"active", "passive"}:
        raise ValueError("出战配置无效")
    for kind, layer in (("active", 1), ("passive", 0)):
        equipped = loadout[kind]
        if not isinstance(equipped, list) or len(equipped) != LIMITS["loadout"]:
            raise ValueError("出战栏位数量无效")
        picked = [key for key in equipped if key is not None]
        if any(not isinstance(key, str) or key not in TRIGRAMS for key in picked):
            raise ValueError("出战卦路无效")
        if len(picked) != len(set(picked)):
            raise ValueError("同一卦路不能重复装备")
        if any(not state["cultivation"][key][layer] for key in picked):
            raise ValueError("尚未学会所装备的技能或心法")
    return deepcopy(loadout)
