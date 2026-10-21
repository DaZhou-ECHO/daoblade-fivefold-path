"""可信单机试验挑战：事务保存进度与一次性奖励，不证明客户端战斗真实发生。"""
import json
import uuid
from copy import deepcopy

from array_lab import CONFIG, compile_lab, default_lab_state, validate_lab_state
from database import get_db, load_lab_record

ENEMIES = {f"enemy-{index}" for index in range(1, 7)}


def build_state(build):
    state = default_lab_state()
    state.update(deepcopy(build))
    return state


def _defeated(payload):
    ids = payload.get("defeated_ids")
    if (not isinstance(ids, list) or any(type(item) is not str or item not in ENEMIES for item in ids)
            or len(set(ids)) != len(ids)):
        raise ValueError("敌人进度报告无效")
    return set(ids)


def transition_trial(slot, revision, payload):
    """奖励账本与状态同一事务；已关闭试炼可重试读取回执，不能再次发奖。"""
    database = get_db()
    database.execute("BEGIN IMMEDIATE")
    try:
        record = load_lab_record(slot)
        state = validate_lab_state(record["state"] if record else default_lab_state())
        current_revision = record["revision"] if record else 0
        action = payload.get("action")
        if action not in ("start", "checkpoint", "altar", "settle", "abandon"):
            raise ValueError("试炼操作无效")
        if action == "settle" and type(payload.get("win")) is not bool:
            raise ValueError("胜负报告无效")
        if action != "start":
            trial_id = payload.get("trial_id")
            if not isinstance(trial_id, str) or not 1 <= len(trial_id) <= 80:
                raise ValueError("试炼编号无效")
            prior = database.execute("SELECT receipt_json FROM array_lab_results WHERE trial_id=? AND slot=?", (trial_id, slot)).fetchone()
            if prior:
                receipt = json.loads(prior["receipt_json"])
                expected = "abandoned" if action == "abandon" else "victory" if payload.get("win") is True else "defeat"
                if action not in ("settle", "abandon") or receipt["outcome"] != expected:
                    raise ValueError("试炼已经结束，不能改写结算")
                database.commit()
                return _response(state, current_revision, receipt, True)
        if revision != current_revision:
            raise ValueError("试验档已被其他窗口更新，请重新读取")
        receipt = None
        if action == "start":
            if state["active_trial"]:
                raise ValueError("已有进行中试炼，请恢复或先放弃")
            compiled = compile_lab(state)
            if not compiled["skill"]["enabled"]:
                raise ValueError("请先装好离火核心并保存")
            state["active_trial"] = {"id": "array-" + uuid.uuid4().hex, "realm_id": "fire", "rules_version": 2,
                                     "build": {key: deepcopy(state[key]) for key in ("stage", "beads", "nodes")},
                                     "effective_bead_ids": [state["nodes"][node] for node in compiled["effective"]],
                                     "checkpoint": None, "claimed_altars": []}
            state["progress"]["runs"] += 1
        else:
            trial = state["active_trial"]
            if not trial or trial["id"] != trial_id:
                raise ValueError("当前试炼编号不匹配，请重新读取")
            if action == "checkpoint":
                if not {"enemy-1", "enemy-2", "enemy-3"}.issubset(_defeated(payload)):
                    raise ValueError("前段守卫尚未清除")
                trial["checkpoint"] = "swordstone"
            elif action == "altar":
                altar = payload.get("altar_id")
                if type(altar) is not str or altar not in ("altar-1", "altar-2"):
                    raise ValueError("祭坛编号无效")
                if altar not in trial["claimed_altars"]:
                    trial["claimed_altars"].append(altar)
            else:
                if action == "settle":
                    if type(payload.get("win")) is not bool:
                        raise ValueError("胜负报告无效")
                    defeated = _defeated(payload)
                    if payload["win"] and defeated != ENEMIES:
                        raise ValueError("守境者尚未全部清除")
                    # 检查点失败只结束本次尝试，不结束同一试炼，不发失败经验。
                    if not payload["win"] and trial["checkpoint"]:
                        return _save_response(database, slot, state, current_revision, None)
                win = action == "settle" and payload["win"]
                receipt = {"trial_id": trial_id, "outcome": "victory" if win else "abandoned" if action == "abandon" else "defeat",
                           "xp_awards": [], "spirit": 0}
                if win:
                    growth = CONFIG["growth"]
                    for bead in state["beads"]:
                        if bead["id"] not in trial["effective_bead_ids"]:
                            continue
                        amount = growth["victory_xp"] if bead["level"] < growth["max_level"] else 0
                        bead["xp"] += amount
                        while bead["level"] < growth["max_level"] and bead["xp"] >= growth["xp_per_level"]:
                            bead["xp"] -= growth["xp_per_level"]
                            bead["level"] += 1
                        if bead["level"] == growth["max_level"]:
                            bead["xp"] = 0
                        receipt["xp_awards"].append({"id": bead["id"], "amount": amount, "level": bead["level"], "xp": bead["xp"]})
                    state["progress"]["victories"] += 1
                    state["progress"]["spirit"] += growth["victory_spirit"]
                    receipt["spirit"] = growth["victory_spirit"]
                state["active_trial"] = None
        return _save_response(database, slot, state, current_revision, receipt)
    except Exception:
        database.rollback()
        raise


def _save_response(database, slot, state, revision, receipt):
    validate_lab_state(state)
    database.execute("INSERT INTO array_lab_saves(slot,state_json,revision) VALUES(?,?,?) ON CONFLICT(slot) DO UPDATE SET state_json=excluded.state_json,revision=excluded.revision",
                     (slot, json.dumps(state, ensure_ascii=False), revision + 1))
    if receipt:
        database.execute("INSERT INTO array_lab_results VALUES(?,?,?)", (receipt["trial_id"], slot, json.dumps(receipt, ensure_ascii=False)))
    database.commit()
    return _response(state, revision + 1, receipt, False)


def _response(state, revision, receipt, replayed):
    return {"state": state, "revision": revision, "receipt": receipt, "replayed": replayed,
            "compiled": compile_lab(state),
            "trial_compiled": compile_lab(build_state(state["active_trial"]["build"])) if state["active_trial"] else None}
