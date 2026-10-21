"""隔离阵盘试验规则；不解释或修改legacy-v1存档。"""
import json
from copy import deepcopy
from pathlib import Path

CONFIG = json.loads((Path(__file__).parent / "static/data/rules/array-lab-v1.json").read_text(encoding="utf-8"))


def default_lab_state():
    return {"ruleset_id": CONFIG["ruleset_id"], "schema_version": 1, "rules_version": 1,
            "stage": 1, "beads": deepcopy(CONFIG["beads"]), "nodes": {node["id"]: None for node in CONFIG["nodes"]}}


def validate_lab_state(raw):
    default = default_lab_state()
    if not isinstance(raw, dict) or set(raw) != set(default):
        raise ValueError("阵盘试验档字段无效")
    for key in ("ruleset_id", "schema_version", "rules_version", "stage"):
        if type(raw[key]) is not type(default[key]) or raw[key] != default[key]:
            raise ValueError("阵盘试验规则或阶段不受支持")
    if json.dumps(raw["beads"], sort_keys=True) != json.dumps(default["beads"], sort_keys=True):
        raise ValueError("试验珠身份、等级和经验不能修改")
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
    enabled = "li.core" in effective
    return {"ruleset_id": CONFIG["ruleset_id"], "used": sum(value is not None for value in state["nodes"].values()),
            "capacity": CONFIG["capacity"], "effective": effective, "inactive": inactive,
            "skill": {"enabled": enabled, "element": "fire" if enabled else None,
                      "mark": "li.mark" in effective, "focus": "li.focus" in effective,
                      "burst": "li.burst" in effective, **CONFIG["skill"]}}
