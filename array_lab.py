"""隔离阵盘试验规则；不解释或修改legacy-v1存档。"""
import json
from copy import deepcopy
from pathlib import Path

CONFIG = json.loads((Path(__file__).parent / "static/data/rules/array-lab-v1.json").read_text(encoding="utf-8"))

if CONFIG.get("schema_version") != 2 or CONFIG.get("rules_version") != 2 or CONFIG.get("ruleset_id") != "array-lab-v1":
    raise ValueError("阵盘试验配置版本不受支持")


def default_lab_state():
    return {"ruleset_id": CONFIG["ruleset_id"], "schema_version": 2, "rules_version": 2,
            "stage": 1, "beads": deepcopy(CONFIG["beads"]), "nodes": {node["id"]: None for node in CONFIG["nodes"]},
            "progress": {"runs": 0, "victories": 0, "spirit": 0}, "active_trial": None}


def normalize_lab_state(raw):
    state = deepcopy(raw)
    if isinstance(state, dict) and type(state.get("schema_version")) is int and state.get("schema_version") == 1:
        old_keys = {"ruleset_id", "schema_version", "rules_version", "stage", "beads", "nodes"}
        if set(state) != old_keys or type(state.get("rules_version")) is not int or state["rules_version"] != 1:
            raise ValueError("旧试验档格式不受支持")
        state.update(schema_version=2, rules_version=2, progress={"runs": 0, "victories": 0, "spirit": 0}, active_trial=None)
    return state


def validate_lab_edit(raw, previous):
    state, old = validate_lab_state(raw), validate_lab_state(previous)
    if any(state[key] != old[key] for key in ("stage", "beads", "progress", "active_trial")):
        raise ValueError("珠子经验、试炼与成长记录只能通过结算改变")
    if old["active_trial"] and state["nodes"] != old["nodes"]:
        raise ValueError("试炼进行中，请先结束试炼再调整构筑")
    return state


def validate_lab_state(raw):
    raw = normalize_lab_state(raw)
    default = default_lab_state()
    if not isinstance(raw, dict) or set(raw) != set(default):
        raise ValueError("阵盘试验档字段无效")
    for key in ("ruleset_id", "schema_version", "rules_version"):
        if type(raw[key]) is not type(default[key]) or raw[key] != default[key]:
            raise ValueError("阵盘试验规则或阶段不受支持")
    if type(raw["stage"]) is not int or raw["stage"] not in (1, 2):
        raise ValueError("试验研习阶段无效")
    if not isinstance(raw["beads"], list) or len(raw["beads"]) != len(default["beads"]):
        raise ValueError("试验珠目录无效")
    for bead, seed in zip(raw["beads"], default["beads"]):
        if not isinstance(bead, dict) or set(bead) != set(seed) or any(bead[key] != seed[key] for key in ("id", "name", "element", "role")):
            raise ValueError("试验珠身份不能修改或复制")
        if type(bead["level"]) is not int or not 1 <= bead["level"] <= CONFIG["growth"]["max_level"]:
            raise ValueError("试验珠等级无效")
        if type(bead["xp"]) is not int or not 0 <= bead["xp"] < CONFIG["growth"]["xp_per_level"] or (bead["level"] == CONFIG["growth"]["max_level"] and bead["xp"] != 0):
            raise ValueError("试验珠经验无效")
    progress = raw["progress"]
    if not isinstance(progress, dict) or set(progress) != {"runs", "victories", "spirit"} or any(type(n) is not int or n < 0 for n in progress.values()):
        raise ValueError("试验成长记录无效")
    nodes = raw["nodes"]
    if not isinstance(nodes, dict) or set(nodes) != set(default["nodes"]):
        raise ValueError("阵盘节点无效")
    beads = {bead["id"]: bead for bead in raw["beads"]}
    assigned = []
    for node in CONFIG["nodes"]:
        bead_id = nodes[node["id"]]
        if bead_id is None:
            continue
        if not isinstance(bead_id, str) or bead_id not in beads:
            raise ValueError("试验珠不存在")
        bead = beads[bead_id]
        if node["min_stage"] > raw["stage"]:
            raise ValueError("当前阶段尚未开放该节点")
        if bead["element"] != "fire":
            raise ValueError("离宫只接受本位火行珠")
        if bead["role"] != node["role"]:
            raise ValueError("珠子功能与节点不匹配")
        assigned.append(bead_id)
    if len(assigned) != len(set(assigned)):
        raise ValueError("同一颗珠不能同时装在两个节点")
    if len(assigned) > CONFIG["capacity"]:
        raise ValueError("超过当前阶段容量")
    for group in CONFIG["exclusive"]:
        if sum(nodes[key] is not None for key in group) > 1:
            raise ValueError("聚焰、引爆和回火分支互斥")
    trial = raw["active_trial"]
    if trial is not None:
        keys = {"id", "realm_id", "rules_version", "build", "effective_bead_ids", "checkpoint", "claimed_altars"}
        if not isinstance(trial, dict) or set(trial) != keys or not isinstance(trial["id"], str) or not 1 <= len(trial["id"]) <= 80:
            raise ValueError("试验试炼记录无效")
        if type(trial["realm_id"]) is not str or trial["realm_id"] not in {realm["id"] for realm in CONFIG["realms"]} or type(trial["rules_version"]) is not int or trial["rules_version"] != 2 or trial["checkpoint"] not in (None, "swordstone"):
            raise ValueError("试验试炼规则不受支持")
        build = trial["build"]
        if not isinstance(build, dict) or set(build) != {"stage", "beads", "nodes"}:
            raise ValueError("试炼构筑快照无效")
        frozen_state = default_lab_state()
        frozen_state.update(deepcopy(build))
        compiled = compile_lab(frozen_state)
        effective_ids = [build["nodes"][node] for node in compiled["effective"]]
        if trial["effective_bead_ids"] != effective_ids:
            raise ValueError("试炼经验归属与构筑不一致")
        claimed = trial["claimed_altars"]
        if not isinstance(claimed, list) or len(claimed) > 2 or any(type(item) is not str or item not in ("altar-1", "altar-2") for item in claimed) or len(set(claimed)) != len(claimed):
            raise ValueError("试炼祭坛记录无效")
    return deepcopy(raw)


def compile_lab(raw):
    state = validate_lab_state(raw)
    effective, inactive = [], {}
    for node in CONFIG["nodes"]:
        node_id = node["id"]
        if state["nodes"][node_id] is None:
            continue
        if node["parent"] and node["parent"] not in effective:
            inactive[node_id] = "未连接离火核心"
        else:
            effective.append(node_id)
    beads = {bead["id"]: bead for bead in state["beads"]}
    enabled = "li.core" in effective
    levels = {node: beads[bead_id]["level"] for node, bead_id in state["nodes"].items() if node in effective}
    skill = deepcopy(CONFIG["skill"])
    growth = CONFIG["growth"]
    core_bonus = max(0, levels.get("li.core", 1) - 1) * growth["core_damage_per_level"]
    skill["damage"] += core_bonus
    skill["focus_damage"] += core_bonus
    skill["cycle_damage"] += core_bonus
    cycle_bonus = max(0, levels.get("li.cycle", 1) - 1) * growth["cycle_shield_per_level"]
    skill["cycle_max_shield"] += cycle_bonus
    skill["cycle_shield_per_mark"] += cycle_bonus
    skill["burn_damage"] += max(0, levels.get("li.focus", 1) - 1) * growth["focus_burn_per_level"]
    skill["burst_per_mark"] += max(0, levels.get("li.burst", 1) - 1) * growth["burst_per_level"]
    skill["qi"] -= max(0, levels.get("li.mark", 1) - 1) * growth["mark_qi_reduction_per_level"]
    return {"ruleset_id": CONFIG["ruleset_id"], "rules_version": 2, "schema_version": 2, "used": sum(value is not None for value in state["nodes"].values()),
            "capacity": CONFIG["capacity"], "effective": effective, "inactive": inactive,
            "skill": {"enabled": enabled, "element": "fire" if enabled else None,
                      "mark": "li.mark" in effective, "focus": "li.focus" in effective,
                      "burst": "li.burst" in effective, "cycle": "li.cycle" in effective, **skill}}
