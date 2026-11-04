"""正式八宫征程，独立版本/槽；可信本地客户端，事务账本防重复奖励。"""
import json
import uuid
from copy import deepcopy
from pathlib import Path

from database import get_db, load_state_record
from game_rules import validate_state as validate_legacy_state
from array_lab import validate_lab_state
from skill_guide import GUIDE, NODE_GUIDE, describe_build, mind_text

MAPS_V2 = json.loads((Path(__file__).parent / "static/data/journey-maps-v2.json").read_text(encoding="utf-8"))

def trial_layout(trial):
    """缺字段按v1，拒绝未知版本，保留旧局。"""
    version, combat = trial.get("map_version", 1), trial.get("combat_version", 1)
    if (
        type(version) is not int
        or type(combat) is not int
        or (version, combat) not in {(1, 1), (2, 2)}
    ):
        raise ValueError("未知试炼版本，请保留存档并联系维护者")
    return MAPS_V2[trial["realm_id"]+":"+trial["map_id"]] if version == 2 else None


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
CONFIG = {"ruleset_id": "journey-v1", "schema_version": 2,
          "palaces": [dict(zip(("id", "name", "element", "direction", "symbol", "skill", "mind"), p)) for p in PALACES],
          "realms": ["fire", "wood", "earth", "metal", "water"],
          "ranks": [{"name": "练气", "capacity": 6}, {"name": "筑基", "capacity": 10}],
          "maps": [{"id": "ridge", "name": "高径"}, {"id": "hollow", "name": "回廊"}]}
TRAINING = {"sword": "剑术", "step": "身法", "guard": "护体"}
TRAINING_COSTS = (8, 12, 16)
COSMETICS = {"plain": {"name": "本命素剑", "price": 0, "color": "#b6dbe6"},
             "azure": {"name": "青岚剑", "price": 2, "color": "#6ee6bd"},
             "sunset": {"name": "赤霞剑", "price": 4, "color": "#ff9b75"},
             "frost": {"name": "霜魄剑", "price": 6, "color": "#91d9ff"}}
CONFIG["training"] = {"branches": TRAINING, "costs": list(TRAINING_COSTS)}
CONFIG["cosmetics"] = COSMETICS
NODES = [{"id": p[0]+"."+role, "palace": p[0], "element": p[2], "role": role,
          "label": p[1]+"·"+name, "parent": None if role == "core" else p[0]+(".trace" if role in ("edge", "flow") else ".core")}
         for p in PALACES for role, name in ROLES.items()]
CATALOG = {n["id"]: {"id": n["id"], "name": n["label"]+"珠", "element": n["element"], "role": n["role"], "palace": n["palace"]} for n in NODES}
CONFIG["nodes"] = NODES
CONFIG["catalog"] = list(CATALOG.values())
CONFIG["skill_guide"] = GUIDE
CONFIG["node_guide"] = NODE_GUIDE


def new_bead(key):
    return {**CATALOG[key], "level": 1, "xp": 0}


def default_journey():
    starter = ["li.core", "li.trace", "li.edge", "gen.core", "gen.mind"]
    return {"ruleset_id": "journey-v1", "schema_version": 2, "rank": 0,
            "beads": [new_bead(k) for k in starter], "nodes": {n["id"]: n["id"] if n["id"] in starter else None for n in NODES},
            "loadout": {"active": ["li", None], "passive": ["gen", None]},
            "progress": {"runs": 0, "victories": 0, "spirit": 0, "clears": {r: 0 for r in CONFIG["realms"]},
                         "route_clears": {r+":"+m["id"]: 0 for r in CONFIG["realms"] for m in CONFIG["maps"]}},
            "training": {key: 0 for key in TRAINING},
            "cosmetics": {"tickets": 0, "owned": ["plain"], "equipped": "plain"}, "active_trial": None}


def normalize_journey(raw):
    state = deepcopy(raw)
    if state.get("ruleset_id") != "journey-v1" or state.get("schema_version") not in (1, 2):
        raise ValueError("正式存档版本不受支持")
    defaults = default_journey()
    state["schema_version"] = 2
    for key in ("training", "cosmetics"):
        state.setdefault(key, deepcopy(defaults[key]))
    state["progress"].setdefault("route_clears", deepcopy(defaults["progress"]["route_clears"]))
    return state


def validate_village(state):
    if state.get("schema_version") != 2 or set(state.get("training", {})) != set(TRAINING):
        raise ValueError("师门存档无效")
    if any(type(level) is not int or level not in (0, 1, 2, 3) for level in state["training"].values()):
        raise ValueError("师门等级无效")
    cosmetics = state.get("cosmetics")
    if not isinstance(cosmetics, dict) or set(cosmetics) != {"tickets", "owned", "equipped"}:
        raise ValueError("外观存档无效")
    if type(cosmetics["tickets"]) is not int or cosmetics["tickets"] < 0:
        raise ValueError("外观券无效")
    owned = cosmetics["owned"]
    if not isinstance(owned, list) or not owned or len(owned) != len(set(owned)) or "plain" not in owned or any(key not in COSMETICS for key in owned) or cosmetics["equipped"] not in owned:
        raise ValueError("外观目录无效")
    route_clears = state.get("progress", {}).get("route_clears")
    if not isinstance(route_clears, dict) or set(route_clears) != set(default_journey()["progress"]["route_clears"]) or any(type(n) is not int or n < 0 for n in route_clears.values()):
        raise ValueError("路线通关记录无效")
    return state


def validate_build(state):
    validate_village(state)
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
            "training": deepcopy(state["training"]), "cosmetic": state["cosmetics"]["equipped"],
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
    if state["active_trial"]:
        trial_layout(state["active_trial"])
    return {"state": state, "revision": revision, "compiled": compile_journey(state), "receipt": receipt, "replayed": replayed,
            "trial_compiled": state["active_trial"]["compiled"] if state["active_trial"] else None,
            "guide": guide_view(state)}


def guide_view(state):
    compiled = state["active_trial"]["compiled"] if state["active_trial"] else compile_journey(state)
    catalog = {}
    for p in GUIDE:
        sample = deepcopy(state)
        sample["active_trial"] = None
        sample["loadout"] = {"active": [p, None], "passive": state["loadout"]["passive"]}
        potential = describe_build(compile_journey(sample))["skills"][0]
        base = default_journey()
        base["beads"] = [new_bead(p+".core")]
        base["nodes"] = {k: k if k == p+".core" else None for k in CATALOG}
        base["loadout"] = {"active": [p, None], "passive": [None, None]}
        base_skill = describe_build(compile_journey(base))["skills"][0]
        level = next((b["level"] for b in state["beads"] if b["id"] == p+".mind"), 1)
        catalog[p] = {"skill": potential, "base_skill": base_skill, "mind": mind_text(p, level), "mind_level": level}
    return {"saved": describe_build(compiled), "catalog": catalog}


def preview_build(slot, revision, nodes, loadout):
    state, current = read_journey(slot)
    if revision != current:
        raise ValueError("其他窗口已更新，请保留草稿并重新核对")
    if state["active_trial"]:
        raise ValueError("挑战中构筑冻结")
    if unification_required(slot):
        raise ValueError("请先完成合档")
    state = deepcopy(state)
    state["nodes"], state["loadout"] = deepcopy(nodes), deepcopy(loadout)
    compiled = compile_journey(state)
    return {"revision": current, "compiled": compiled, "guide": guide_view(state)}


def read_journey(slot):
    row = get_db().execute("SELECT * FROM journey_saves WHERE slot=?", (slot,)).fetchone()
    return (normalize_journey(json.loads(row["state_json"])), row["revision"]) if row else (default_journey(), 0)


def _legacy_level(level):
    return 3 if level >= 15 else 2 if level >= 5 else 1


def _import_projection(legacy, current):
    """Pure, deterministic projection; neither source nor destination is mutated."""
    state = deepcopy(current)
    owned = {bead["id"]: bead for bead in state["beads"]}
    entries, unused = [], []

    def grant(key, level=1, source=None, reason="旧档换算"):
        before = owned[key]["level"] if key in owned else None
        if key not in owned:
            bead = new_bead(key)
            bead["level"] = level
            state["beads"].append(bead)
            owned[key] = bead
        elif level > before:
            owned[key]["level"] = level
            owned[key]["xp"] = 0
        if source is not None:
            entries.append({"source_id": source["id"], "source_name": source["name"],
                            "source_element": source["element"], "source_quality": source["quality"],
                            "source_level": source["level"], "source_affixes": deepcopy(source["affixes"]),
                            "target_id": key, "target_level": owned[key]["level"],
                            "changed": before != owned[key]["level"], "reason": reason})

    for palace in [p[0] for p in PALACES]:
        for index, role in enumerate(("mind", "core", "trace")):
            bead = legacy["cultivation"][palace][index]
            if bead is None:
                continue
            grant(palace + "." + role, _legacy_level(bead["level"]), bead, "已镶卦位")
            if role == "mind":
                grant(palace + ".core", 1)

    imported_clears = []
    for realm in CONFIG["realms"]:
        if legacy["progress"]["clears"][realm] <= 0 or state["progress"]["clears"][realm] > 0:
            continue
        state["progress"]["clears"][realm] = 1
        state["progress"]["spirit"] += 12
        imported_clears.append(realm)
        for key, item in CATALOG.items():
            if item["element"] == realm and item["role"] in {"core", "trace", "mind"}:
                grant(key)

    roles = ("core", "mind", "trace", "edge", "flow")
    palace_order = {p[0]: index for index, p in enumerate(PALACES)}
    for bead in legacy["inventory"]:
        options = sorted((key for key, item in CATALOG.items()
                          if item["element"] == bead["element"] and key not in owned),
                         key=lambda key: (roles.index(CATALOG[key]["role"]), palace_order[CATALOG[key]["palace"]]))
        if options:
            grant(options[0], _legacy_level(bead["level"]), bead, "珠匣同元素")
        else:
            unused.append({"id": bead["id"], "name": bead["name"], "element": bead["element"]})

    validate_build(state)
    receipt = {"converted": entries, "unused": unused, "imported_clears": imported_clears,
               "spirit_awarded": 12 * len(imported_clears),
               "legacy_clears": deepcopy(legacy["progress"]["clears"]),
               "legacy_runs": legacy["progress"]["runs"]}
    state["migration"] = {"source": "legacy-v1", "imported_clears": imported_clears}
    return state, receipt


def import_preview(slot):
    prior = get_db().execute("SELECT receipt_json FROM journey_migrations WHERE slot=?", (slot,)).fetchone()
    if prior:
        return {"available": False, "migrated": True, "receipt": json.loads(prior["receipt_json"])}
    old = load_state_record(slot)
    if not old:
        return {"available": False, "migrated": False, "reason": "没有旧版存档"}
    legacy = validate_legacy_state(old["state"], old["state"])
    state, revision = read_journey(slot)
    if legacy.get("active_trial") or state.get("active_trial"):
        return {"available": False, "migrated": False, "reason": "请先完成或放弃进行中的试炼"}
    projected, receipt = _import_projection(legacy, state)
    if not receipt["converted"] and not receipt["imported_clears"] and not receipt["unused"]:
        return {"available": False, "migrated": False, "reason": "旧档尚无可迁入成果"}
    return {"available": True, "migrated": False, "legacy_revision": old["revision"],
            "journey_revision": revision, "receipt": receipt,
            "before": {"beads": len(state["beads"]), "spirit": state["progress"]["spirit"]},
            "after": {"beads": len(projected["beads"]), "spirit": projected["progress"]["spirit"]}}


def confirm_import(slot, legacy_revision, journey_revision):
    db = get_db()
    db.execute("BEGIN IMMEDIATE")
    try:
        prior = db.execute("SELECT receipt_json FROM journey_migrations WHERE slot=?", (slot,)).fetchone()
        if prior:
            state, revision = read_journey(slot)
            db.commit()
            return {**response(state, revision), "migration_receipt": json.loads(prior["receipt_json"]), "replayed": True}
        old = load_state_record(slot)
        if not old:
            raise ValueError("没有旧版存档")
        state, revision = read_journey(slot)
        if old["revision"] != legacy_revision or revision != journey_revision:
            raise ValueError("存档已被其他窗口更新，请重新预览")
        legacy = validate_legacy_state(old["state"], old["state"])
        if legacy.get("active_trial") or state.get("active_trial"):
            raise ValueError("请先完成或放弃进行中的试炼")
        projected, receipt = _import_projection(legacy, state)
        if not receipt["converted"] and not receipt["imported_clears"] and not receipt["unused"]:
            raise ValueError("旧档尚无可迁入成果")
        payload = json.dumps(projected, ensure_ascii=False)
        if revision == 0:
            cursor = db.execute("INSERT OR IGNORE INTO journey_saves VALUES(?,?,1)", (slot, payload))
        else:
            cursor = db.execute("UPDATE journey_saves SET state_json=?, revision=revision+1 WHERE slot=? AND revision=?",
                                (payload, slot, revision))
        if cursor.rowcount != 1:
            raise ValueError("正式档已被其他窗口更新，请重新预览")
        db.execute("INSERT INTO journey_migrations VALUES(?,?,?,?)",
                   (slot, legacy_revision, revision + 1, json.dumps(receipt, ensure_ascii=False)))
        db.commit()
        return {**response(projected, revision + 1), "migration_receipt": receipt}
    except Exception:
        db.rollback()
        raise


def _source_row(db, table, slot):
    exists = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()
    return db.execute(f"SELECT state_json, revision FROM {table} WHERE slot=?", (slot,)).fetchone() if exists else None


def _unify_projection(db, slot, old_row, lab_row, journey_row):
    current = normalize_journey(json.loads(journey_row["state_json"])) if journey_row else default_journey()
    before = {"beads": len(current["beads"]), "spirit": current["progress"]["spirit"]}
    old_receipt = {"converted": [], "unused": [], "imported_clears": [], "spirit_awarded": 0}
    if old_row:
        legacy = validate_legacy_state(json.loads(old_row["state_json"]), json.loads(old_row["state_json"]))
        current, old_receipt = _import_projection(legacy, current)
    lab_entries = []
    discarded_lab = None
    if lab_row:
        lab = validate_lab_state(json.loads(lab_row["state_json"]))
        sample = next(bead for bead in lab["beads"] if bead["id"] == "lab-water")
        discarded_lab = {"runs": lab["progress"]["runs"], "victories": lab["progress"]["victories"],
                         "spirit": lab["progress"]["spirit"], "water_sample": {"name": sample["name"], "level": sample["level"]}}
        owned = {bead["id"]: bead for bead in current["beads"]}
        by_id = {bead["id"]: bead for bead in lab["beads"]}
        mapping = {"li.core": ["lab-core"], "li.trace": ["lab-mark"],
                   "li.edge": ["lab-focus", "lab-burst"], "li.flow": ["lab-cycle"]}
        for target, source_ids in mapping.items():
            level = max(by_id[key]["level"] for key in source_ids)
            previous = owned[target]["level"] if target in owned else None
            if target not in owned:
                bead = new_bead(target)
                current["beads"].append(bead)
                owned[target] = bead
            if level > owned[target]["level"]:
                owned[target].update(level=level, xp=0)
            lab_entries.append({"source": source_ids, "target_id": target,
                                "source_level": level, "target_level": owned[target]["level"],
                                "changed": previous != owned[target]["level"]})
    if journey_row and json.loads(journey_row["state_json"]).get("schema_version") == 1:
        rows = db.execute("SELECT receipt_json FROM journey_results WHERE slot=?", (slot,)).fetchall()
        for row in rows:
            result = json.loads(row["receipt_json"])
            if result.get("outcome") == "victory" and not result.get("breakthrough"):
                key = result.get("realm_id", "") + ":" + result.get("map_id", "ridge")
                if key in current["progress"]["route_clears"]:
                    current["progress"]["route_clears"][key] += 1
    cleared = []
    for name, row in (("旧五行", old_row), ("阵盘试验", lab_row), ("正式征程", journey_row)):
        if row and json.loads(row["state_json"]).get("active_trial"):
            cleared.append(name)
    current["active_trial"] = None
    validate_build(current)
    receipt = {"legacy": old_receipt, "lab": lab_entries,
               "discarded": {"lab": discarded_lab, "legacy_unused_beads": len(old_receipt["unused"])},
               "cleared_trials": cleared, "before": before,
               "after": {"beads": len(current["beads"]), "spirit": current["progress"]["spirit"]}}
    return current, receipt


def unify_preview(slot):
    db = get_db()
    prior = db.execute("SELECT receipt_json FROM journey_unifications WHERE slot=?", (slot,)).fetchone()
    if prior:
        return {"available": False, "migrated": True, "receipt": json.loads(prior[0])}
    old = _source_row(db, "game_saves", slot)
    lab = _source_row(db, "array_lab_saves", slot)
    formal = _source_row(db, "journey_saves", slot)
    if not old and not lab and (not formal or json.loads(formal["state_json"]).get("schema_version") == 2):
        return {"available": False, "migrated": False, "reason": "当前无需合档"}
    _projected, receipt = _unify_projection(db, slot, old, lab, formal)
    return {"available": True, "migrated": False,
            "revisions": {"legacy": old["revision"] if old else None,
                          "lab": lab["revision"] if lab else None,
                          "journey": formal["revision"] if formal else None}, "receipt": receipt}


def unification_required(slot):
    db = get_db()
    if db.execute("SELECT 1 FROM journey_unifications WHERE slot=?", (slot,)).fetchone():
        return False
    if _source_row(db, "game_saves", slot) or _source_row(db, "array_lab_saves", slot):
        return True
    formal = _source_row(db, "journey_saves", slot)
    return bool(formal and json.loads(formal["state_json"]).get("schema_version") != 2)


def unify_confirm(slot, revisions):
    db = get_db()
    db.execute("BEGIN IMMEDIATE")
    try:
        prior = db.execute("SELECT receipt_json FROM journey_unifications WHERE slot=?", (slot,)).fetchone()
        if prior:
            state, revision = read_journey(slot)
            db.commit()
            return {**response(state, revision), "unification_receipt": json.loads(prior[0]), "replayed": True}
        old = _source_row(db, "game_saves", slot)
        lab = _source_row(db, "array_lab_saves", slot)
        formal = _source_row(db, "journey_saves", slot)
        actual = {"legacy": old["revision"] if old else None, "lab": lab["revision"] if lab else None,
                  "journey": formal["revision"] if formal else None}
        if type(revisions) is not dict or revisions != actual:
            raise ValueError("存档已被其他窗口更新，请重新预览")
        if not old and not lab and (not formal or json.loads(formal["state_json"]).get("schema_version") == 2):
            raise ValueError("当前无需合档")
        state, receipt = _unify_projection(db, slot, old, lab, formal)
        revision = (formal["revision"] if formal else 0) + 1
        db.execute("INSERT INTO journey_saves VALUES(?,?,?) ON CONFLICT(slot) DO UPDATE SET state_json=excluded.state_json,revision=excluded.revision",
                   (slot, json.dumps(state, ensure_ascii=False), revision))
        db.execute("INSERT INTO journey_unifications VALUES(?,?,?)", (slot, json.dumps(actual), json.dumps(receipt, ensure_ascii=False)))
        for table in ("game_saves", "array_lab_saves", "array_lab_results", "journey_migrations"):
            if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone():
                db.execute(f"DELETE FROM {table} WHERE slot=?", (slot,))
        remaining = any(db.execute(f"SELECT 1 FROM {table} LIMIT 1").fetchone()
                        for table in ("game_saves", "array_lab_saves")
                        if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone())
        if not remaining:
            for table in ("game_saves", "array_lab_saves", "array_lab_results", "journey_migrations"):
                if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone():
                    db.execute(f"DROP TABLE {table}")
            db.execute("INSERT OR REPLACE INTO app_meta VALUES('legacy_retired','1')")
        db.commit()
        return {**response(state, revision), "unification_receipt": receipt}
    except Exception:
        db.rollback()
        raise


def transition(slot, revision, payload):
    db = get_db()
    db.execute("BEGIN IMMEDIATE")
    try:
        if unification_required(slot):
            raise ValueError("请先预览并确认单档合并")
        state, current = read_journey(slot)
        action = payload.get("action")
        if action not in {"build", "start", "checkpoint", "altar", "shortcut", "settle", "abandon", "train", "reset_training", "purchase", "equip_cosmetic"}:
            raise ValueError("征程操作无效")
        if action in {"settle", "abandon", "checkpoint", "altar", "shortcut"}:
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
        if action in {"train", "reset_training", "purchase", "equip_cosmetic"}:
            if trial:
                raise ValueError("挑战中不能调整师门或外观")
            if action == "train":
                branch = payload.get("branch")
                if type(branch) is not str or branch not in TRAINING or state["training"][branch] >= 3:
                    raise ValueError("师门分支或等级无效")
                cost = TRAINING_COSTS[state["training"][branch]]
                if state["progress"]["spirit"] < cost:
                    raise ValueError("修为不足")
                state["progress"]["spirit"] -= cost
                state["training"][branch] += 1
                receipt = {"action": "train", "branch": branch, "level": state["training"][branch], "spirit": -cost}
            elif action == "reset_training":
                refund = sum(sum(TRAINING_COSTS[:level]) for level in state["training"].values())
                state["progress"]["spirit"] += refund
                state["training"] = {key: 0 for key in TRAINING}
                receipt = {"action": "reset_training", "spirit": refund}
            elif action == "purchase":
                key = payload.get("cosmetic")
                if type(key) is not str or key not in COSMETICS or key == "plain" or key in state["cosmetics"]["owned"]:
                    raise ValueError("外观商品无效或已拥有")
                price = COSMETICS[key]["price"]
                if state["cosmetics"]["tickets"] < price:
                    raise ValueError("外观券不足")
                state["cosmetics"]["tickets"] -= price
                state["cosmetics"]["owned"].append(key)
                receipt = {"action": "purchase", "cosmetic": key, "tickets": -price}
            else:
                key = payload.get("cosmetic")
                if type(key) is not str or key not in state["cosmetics"]["owned"]:
                    raise ValueError("尚未拥有该外观")
                state["cosmetics"]["equipped"] = key
                receipt = {"action": "equip_cosmetic", "cosmetic": key}
        elif action == "build":
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
                                     "breakthrough": breakthrough, "rules_version": 1, "combat_version": 2, "map_version": 2, "checkpoint": None, "claimed_altars": [], "opened_shortcuts": [],
                                     "compiled": compiled, "effective_bead_ids": compiled["effective_bead_ids"]}
            state["progress"]["runs"] += 1
        else:
            if not trial or trial["id"] != trial_id:
                raise ValueError("试炼编号与当前档不匹配")
            layout = None if action == "abandon" else trial_layout(trial)
            if action in {"checkpoint", "settle"}:
                defeated = payload.get("defeated_ids")
                if not isinstance(defeated, list) or any(type(i) is not str or i not in {f"enemy-{n}" for n in range(1, 7)} for i in defeated) or len(set(defeated)) != len(defeated):
                    raise ValueError("战斗进度无效")
            if action == "checkpoint":
                if trial["breakthrough"] or not set(layout["checkpoint"]["cleared_ids"] if layout else ["enemy-1", "enemy-2", "enemy-3"]).issubset(defeated):
                    raise ValueError("检查点条件未满足")
                trial["checkpoint"] = "swordstone"
            elif action == "shortcut":
                shortcut = payload.get("shortcut_id")
                if trial["breakthrough"] or not layout or type(shortcut) is not str or shortcut not in {s["id"] for s in layout["shortcuts"]}:
                    raise ValueError("捷径标识无效")
                if shortcut not in trial["opened_shortcuts"]:
                    trial["opened_shortcuts"].append(shortcut)
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
                    required = {"enemy-6"} if trial["breakthrough"] else set(layout["required_ids"]) if layout else {f"enemy-{i}" for i in range(1, 7)}
                    if win and not required.issubset(defeated):
                        raise ValueError("关键遭遇尚未完成")
                    if win and layout and not trial["breakthrough"] and payload.get("exit_id") != layout["exit"]["id"]:
                        raise ValueError("请在出口确认离境")
                    if not win and trial["checkpoint"]:
                        db.commit()
                        return response(state, current)
                win = action == "settle" and win
                receipt = {"trial_id": trial_id, "realm_id": trial["realm_id"], "map_id": trial["map_id"], "breakthrough": trial["breakthrough"],
                           "outcome": "victory" if win else "abandoned" if action == "abandon" else "defeat", "spirit": 0, "tickets": 0, "base_spirit": 0, "branch_spirit": 0, "duplicate_spirit": 0, "xp_awards": [], "drops": []}
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
                    state["progress"]["route_clears"][realm+":"+trial["map_id"]] += 1
                    state["cosmetics"]["tickets"] += 1
                    receipt["tickets"] = 1
                state["active_trial"] = None
                db.execute("INSERT INTO journey_results VALUES(?,?,?)", (slot, trial_id, json.dumps(receipt, ensure_ascii=False)))
        validate_build(state)
        db.execute("INSERT INTO journey_saves VALUES(?,?,?) ON CONFLICT(slot) DO UPDATE SET state_json=excluded.state_json,revision=excluded.revision", (slot, json.dumps(state, ensure_ascii=False), current+1))
        db.commit()
        return response(state, current+1, receipt)
    except Exception:
        db.rollback()
        raise
