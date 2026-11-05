"""Story facts and accepted-before-start bounties; all mutation is inside journey transactions."""
import json
import uuid
from pathlib import Path

WORLD = json.loads((Path(__file__).parent / "static/data/shanhe-world.json").read_text(encoding="utf-8"))


def initial():
    return {"version": 1, "intro_read": False, "read_clues": [], "completed": False,
            "commissions": [], "bounty": None, "claimed": []}


def normalize(state):
    state.setdefault("story", initial())
    s = state["story"]
    if s.get("version") != 1:
        raise ValueError("剧情版本不受支持")
    return state


def act(state, action, payload):
    if state["active_trial"]:
        raise ValueError("请先结束或放弃当前挑战，再处理村落事务")
    s = state["story"]
    if action == "story_read":
        key = payload.get("key")
        if key == "intro":
            s["intro_read"] = True
        elif key in WORLD["regions"] and state["progress"]["clears"][key] > 0:
            if key not in s["read_clues"]:
                s["read_clues"].append(key)
        elif key == "ending" and s["intro_read"] and len(s["read_clues"]) == 5:
            s["completed"] = True
        else:
            raise ValueError("这条调查记述尚未发现")
    elif action == "commission":
        key = payload.get("key")
        if key not in {q["id"] for q in WORLD["commissions"]}:
            raise ValueError("村民委托无效")
        if key not in s["commissions"]:
            s["commissions"].append(key)
    elif action == "bounty_accept":
        realm, kind = payload.get("realm"), payload.get("kind")
        if s["bounty"]:
            raise ValueError("请先领取或取消当前悬赏")
        if realm not in WORLD["regions"] or kind not in ("clear", "branch"):
            raise ValueError("悬赏无效")
        s["bounty"] = {"id": uuid.uuid4().hex, "realm": realm, "kind": kind, "ready": False}
    elif action == "bounty_cancel":
        if not s["bounty"] or s["bounty"]["ready"]:
            raise ValueError("没有可取消的悬赏；完成后请领取奖励")
        s["bounty"] = None
    elif action == "bounty_claim":
        bounty = s["bounty"]
        key = payload.get("bounty_id")
        if key in s["claimed"]:
            return {"action": action, "spirit": 0, "replayed": True}
        if not bounty or bounty["id"] != key or not bounty["ready"]:
            raise ValueError("悬赏尚未完成")
        s["claimed"].append(key)
        s["bounty"] = None
        state["progress"]["spirit"] += 2
        return {"action": action, "spirit": 2}
    return {"action": action, "spirit": 0}


def victory(state, trial):
    bounty = state["story"]["bounty"]
    if (bounty and not bounty["ready"] and trial.get("bounty_id") == bounty["id"]
            and trial["realm_id"] == bounty["realm"]
            and (bounty["kind"] == "clear" or trial["claimed_altars"])):
        bounty["ready"] = True
