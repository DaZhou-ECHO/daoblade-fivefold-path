"""正式八宫征程，独立版本/槽；可信本地客户端，事务账本防重复奖励。"""
import json
import uuid
from copy import deepcopy
from database import get_db

PALACES = [
    ("xun", "巽", "wood", "东南", "☴", "贯风", "身法：速度+12"),
    ("li", "离", "fire", "南", "☲", "离火", "炽心：技能伤害+2"),
    ("kun", "坤", "earth", "西南", "☷", "承岳", "厚土：生命+15"),
    ("zhen", "震", "wood", "东", "☳", "震荡", "震势：基础劈砍击退10，首领2"),
    ("dui", "兑", "metal", "西", "☱", "回锋", "调息：回气+1/秒"),
    ("gen", "艮", "earth", "东北", "☶", "止戈", "稳固：防御+2"),
    ("kan", "坎", "water", "北", "☵", "寒流", "回流：技能冷却×0.9"),
    ("qian", "乾", "metal", "西北", "☰", "贯剑", "剑锋：基础攻击+2"),
]
ROLES = {"core": "核心", "trace": "纹路", "edge": "锐式", "flow": "流式", "mind": "心法"}
CONFIG = {"ruleset_id": "journey-v1", "schema_version": 1,
          "palaces": [dict(zip(("id", "name", "element", "direction", "symbol", "skill", "mind"), p)) for p in PALACES],
          "realms": ["fire", "wood", "earth", "metal", "water"],
          "ranks": [{"name": "练气", "capacity": 6}, {"name": "筑基", "capacity": 10}],
          "maps": [{"id": "ridge", "name": "高径"}, {"id": "hollow", "name": "回廊"}]}
NODES = [{"id": p[0]+"."+role, "palace": p[0], "element": p[2], "role": role,
          "label": p[1]+"·"+name, "parent": None if role == "core" else p[0]+(".trace" if role in ("edge", "flow") else ".core")}
         for p in PALACES for role, name in ROLES.items()]
CATALOG = {n["id"]: {"id": n["id"], "name": n["label"]+"珠", "element": n["element"], "role": n["role"], "palace": n["palace"]} for n in NODES}
CONFIG["nodes"] = NODES
CONFIG["catalog"] = list(CATALOG.values())


def new_bead(key):
    return {**CATALOG[key], "level": 1, "xp": 0}


def default_journey():
    starter = ["li.core", "li.trace", "li.edge", "gen.core", "gen.mind"]
    return {"ruleset_id": "journey-v1", "schema_version": 1, "rank": 0,
            "beads": [new_bead(k) for k in starter], "nodes": {n["id"]: n["id"] if n["id"] in starter else None for n in NODES},
            "loadout": {"active": ["li", None], "passive": ["gen", None]},
            "progress": {"runs": 0, "victories": 0, "spirit": 0, "clears": {r: 0 for r in CONFIG["realms"]}}, "active_trial": None}


def validate_build(state):
    if type(state.get("rank")) is not int or state["rank"] not in (0, 1):
        raise ValueError("境界无效")
    owned = {b["id"]: b for b in state["beads"]}
    if len(owned) != len(state["beads"]):
        raise ValueError("珠子实例重复")
    for key, bead in owned.items():
        if key not in CATALOG or set(bead) != set(new_bead(key)) or any(bead[k] != v for k, v in CATALOG[key].items()):
            raise ValueError("珠子身份无效")
        if type(bead["level"]) is not int or not 1 <= bead["level"] <= 3 or type(bead["xp"]) is not int or not 0 <= bead["xp"] < 20 or (bead["level"] == 3 and bead["xp"]):
            raise ValueError("珠子经验无效")
    nodes = state["nodes"]
    if not isinstance(nodes, dict) or set(nodes) != set(CATALOG):
        raise ValueError("八宫节点不完整")
    used = []
    for node in NODES:
        key = nodes[node["id"]]
        if key is None:
            continue
        # 宫位专属实例，本位与功能不允许由客户端改写。
        if type(key) is not str or key not in owned or key != node["id"]:
            raise ValueError("珠子须匹配本宫本位五行与功能；同实例不能跨宫复制")
        used.append(key)
    if len(used) != len(set(used)) or len(used) > CONFIG["ranks"][state["rank"]]["capacity"]:
        raise ValueError("超过境界容量或重复装配")
    for p in PALACES:
        if nodes[p[0]+".edge"] and nodes[p[0]+".flow"]:
            raise ValueError("锐式与流式互斥")
    loadout = state["loadout"]
    if not isinstance(loadout, dict) or set(loadout) != {"active", "passive"}:
        raise ValueError("出战栏无效")
    for slots in loadout.values():
        if not isinstance(slots, list) or len(slots) != 2 or any(p is not None and (type(p) is not str or p not in {x[0] for x in PALACES}) for p in slots):
            raise ValueError("保持2主动+2心法")
        selected = [p for p in slots if p is not None]
        if len(set(selected)) != len(selected):
            raise ValueError("同宫不能在同类栏重复出战")
    return state


def compile_journey(state):
    validate_build(state)
    connected, inactive = [], {}
    for n in NODES:
        if state["nodes"][n["id"]] is None:
            continue
        if n["parent"] and n["parent"] not in connected:
            inactive[n["id"]] = "未连接本宫核心"
        else:
            connected.append(n["id"])
    levels = {b["id"]: b["level"] for b in state["beads"]}
    selected, skills, minds = set(), [], []
    mind_levels = {}
    for p in state["loadout"]["active"]:
        if p is None or p+".core" not in connected:
            skills.append(None)
            continue
        keys = [p+".core"] + [p+"."+r for r in ("trace", "edge", "flow") if p+"."+r in connected]
        selected.update(keys)
        edge, flow = p+".edge" in keys, p+".flow" in keys
        palace = next(x for x in CONFIG["palaces"] if x["id"] == p)
        skills.append({"id": p, "name": palace["skill"], "element": palace["element"],
                       "damage": 18 + (levels[p+".core"]-1)*2 + (3 + levels[p+".trace"] if p+".trace" in keys else 0) + (4 + 2*levels[p+".edge"] if edge else levels[p+".flow"]-4 if flow else 0),
                       "cost": 16 if edge else 9-levels[p+".flow"] if flow else 12, "cooldown": 1.5,
                       "range": 300 if p == "qian" else 220 if p == "kan" else 170,
                       "variant": "锐式" if edge else "流式" if flow else "基础"})
    for p in state["loadout"]["passive"]:
        if p and p+".mind" in connected:
            selected.update([p+".core", p+".mind"])
            minds.append(p)
            mind_levels[p] = levels[p+".mind"]
    return {"campaign": True, "ruleset_id": "journey-v1", "used": sum(x is not None for x in state["nodes"].values()),
            "capacity": CONFIG["ranks"][state["rank"]]["capacity"], "rank": state["rank"], "connected": connected,
            "inactive": inactive, "skills": skills, "minds": minds, "mind_levels": mind_levels, "effective_bead_ids": sorted(selected),
            "skill": {"enabled": any(skills), "burn_damage": 4}}


def xp(bead, amount):
    applied = amount if bead["level"] < 3 else 0
    bead["xp"] += applied
    while bead["level"] < 3 and bead["xp"] >= 20:
        bead["xp"] -= 20
        bead["level"] += 1
    if bead["level"] == 3:
        bead["xp"] = 0
    return {"id": bead["id"], "amount": applied, "level": bead["level"], "xp": bead["xp"]}


def response(state, revision, receipt=None, replayed=False):
    return {"state": state, "revision": revision, "compiled": compile_journey(state), "receipt": receipt, "replayed": replayed,
            "trial_compiled": state["active_trial"]["compiled"] if state["active_trial"] else None}


def read_journey(slot):
    row = get_db().execute("SELECT * FROM journey_saves WHERE slot=?", (slot,)).fetchone()
    return (json.loads(row["state_json"]), row["revision"]) if row else (default_journey(), 0)


def transition(slot, revision, payload):
    db = get_db()
    db.execute("BEGIN IMMEDIATE")
    try:
        state, current = read_journey(slot)
        action = payload.get("action")
        if action not in {"build", "start", "checkpoint", "altar", "settle", "abandon"}:
            raise ValueError("征程操作无效")
        if action in {"settle", "abandon", "checkpoint", "altar"}:
            trial_id = payload.get("trial_id")
            if type(trial_id) is not str:
                raise ValueError("缺少试炼编号")
            prior = db.execute("SELECT receipt_json FROM journey_results WHERE slot=? AND trial_id=?", (slot, trial_id)).fetchone()
            if prior:
                receipt = json.loads(prior[0])
                outcome = "abandoned" if action == "abandon" else "victory" if payload.get("win") is True else "defeat"
                if action not in {"settle", "abandon"} or receipt["outcome"] != outcome or (action == "settle" and type(payload.get("win")) is not bool):
                    raise ValueError("试炼已结束，不能改写结果")
                db.commit()
                return response(state, current, receipt, True)
        if revision != current:
            raise ValueError("其他窗口已更新，请重新读取征程")
        receipt = None
        trial = state["active_trial"]
        if action == "build":
            if trial:
                raise ValueError("挑战中构筑冻结，请先结束或放弃")
            state["nodes"] = deepcopy(payload.get("nodes"))
            state["loadout"] = deepcopy(payload.get("loadout"))
            validate_build(state)
        elif action == "start":
            if trial:
                raise ValueError("已有挑战，请恢复或放弃")
            realm, map_id = payload.get("realm_id"), payload.get("map_id", "ridge")
            breakthrough = payload.get("breakthrough", False)
            if type(breakthrough) is not bool or type(realm) is not str or realm not in CONFIG["realms"] or type(map_id) is not str or map_id not in {"ridge", "hollow"}:
                raise ValueError("地图/挑战无效")
            if breakthrough and (state["rank"] != 0 or state["progress"]["spirit"] < 24 or realm != "fire"):
                raise ValueError("突破需要练气境与24修为，进入离火心劫")
            compiled = compile_journey(state)
            if not any(compiled["skills"]):
                raise ValueError("请先连接并选入至少一个主动宫")
            state["active_trial"] = {"id": "journey-"+uuid.uuid4().hex, "realm_id": realm, "map_id": map_id,
                                     "breakthrough": breakthrough, "rules_version": 1, "checkpoint": None, "claimed_altars": [],
                                     "compiled": compiled, "effective_bead_ids": compiled["effective_bead_ids"]}
            state["progress"]["runs"] += 1
        else:
            if not trial or trial["id"] != trial_id:
                raise ValueError("试炼编号与当前档不匹配")
            if action in {"checkpoint", "settle"}:
                defeated = payload.get("defeated_ids")
                if not isinstance(defeated, list) or any(type(i) is not str or i not in {f"enemy-{n}" for n in range(1, 7)} for i in defeated) or len(set(defeated)) != len(defeated):
                    raise ValueError("战斗进度无效")
            if action == "checkpoint":
                if trial["breakthrough"] or not {"enemy-1", "enemy-2", "enemy-3"}.issubset(defeated):
                    raise ValueError("检查点条件未满足")
                trial["checkpoint"] = "swordstone"
            elif action == "altar":
                altar = payload.get("altar_id")
                if trial["breakthrough"] or type(altar) is not str or altar not in {"altar-1", "altar-2"}:
                    raise ValueError("支路奖励无效")
                if altar not in trial["claimed_altars"]:
                    trial["claimed_altars"].append(altar)
            else:
                win = payload.get("win")
                if action == "settle":
                    if type(win) is not bool:
                        raise ValueError("胜负必须为布尔值")
                    required = {"enemy-6"} if trial["breakthrough"] else {f"enemy-{i}" for i in range(1, 7)}
                    if win and set(defeated) != required:
                        raise ValueError("尚未清场")
                    if not win and trial["checkpoint"]:
                        db.commit()
                        return response(state, current)
                win = action == "settle" and win
                receipt = {"trial_id": trial_id, "realm_id": trial["realm_id"], "map_id": trial["map_id"], "breakthrough": trial["breakthrough"],
                           "outcome": "victory" if win else "abandoned" if action == "abandon" else "defeat", "spirit": 0, "base_spirit": 0, "branch_spirit": 0, "duplicate_spirit": 0, "xp_awards": [], "drops": []}
                if win and trial["breakthrough"]:
                    state["rank"] = 1
                    state["progress"]["spirit"] -= 24
                    receipt["spirit"] = -24
                elif win:
                    for bead in state["beads"]:
                        if bead["id"] in trial["effective_bead_ids"]:
                            receipt["xp_awards"].append(xp(bead, 20))
                    realm = trial["realm_id"]
                    keys = [k for k, v in CATALOG.items() if v["element"] == realm]
                    owned = {b["id"]: b for b in state["beads"]}
                    clears = state["progress"]["clears"][realm]
                    drops = [k for k in keys if CATALOG[k]["role"] in {"core", "trace", "mind"}] if clears == 0 else [next((k for k in keys if k not in owned), keys[(clears-1) % len(keys)])]
                    bonus = 0
                    for key in drops:
                        if key in owned:
                            award = xp(owned[key], 5)
                            if award["amount"] == 0:
                                bonus += 2
                            receipt["drops"].append({"id": key, "name": CATALOG[key]["name"], "duplicate": True, "xp": award["amount"], "spirit": 2 if award["amount"] == 0 else 0})
                        else:
                            state["beads"].append(new_bead(key))
                            receipt["drops"].append({"id": key, "name": CATALOG[key]["name"], "duplicate": False})
                    receipt.update(base_spirit=12, branch_spirit=4*len(trial["claimed_altars"]), duplicate_spirit=bonus)
                    receipt["spirit"] = receipt["base_spirit"] + receipt["branch_spirit"] + bonus
                    state["progress"]["spirit"] += receipt["spirit"]
                    state["progress"]["victories"] += 1
                    state["progress"]["clears"][realm] += 1
                state["active_trial"] = None
                db.execute("INSERT INTO journey_results VALUES(?,?,?)", (slot, trial_id, json.dumps(receipt, ensure_ascii=False)))
        validate_build(state)
        db.execute("INSERT INTO journey_saves VALUES(?,?,?) ON CONFLICT(slot) DO UPDATE SET state_json=excluded.state_json,revision=excluded.revision", (slot, json.dumps(state, ensure_ascii=False), current+1))
        db.commit()
        return response(state, current+1, receipt)
    except Exception:
        db.rollback()
        raise
