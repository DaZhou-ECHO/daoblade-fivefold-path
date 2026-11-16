"""Account-owned directory; storage keys and reward ledgers never leave the server."""
import json
import uuid

import journey
from database import get_db


def init_directory(db):
    db.execute("""CREATE TABLE IF NOT EXISTS save_directory (
        id TEXT PRIMARY KEY, owner INTEGER NOT NULL REFERENCES users(id),
        position INTEGER NOT NULL CHECK(position BETWEEN 1 AND 3),
        name TEXT NOT NULL, storage TEXT NOT NULL UNIQUE,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, version INTEGER NOT NULL DEFAULT 0,
        UNIQUE(owner,position))""")
    if "version" not in {row["name"] for row in db.execute("PRAGMA table_info(save_directory)")}:
        db.execute("ALTER TABLE save_directory ADD COLUMN version INTEGER NOT NULL DEFAULT 0")
    db.execute("""CREATE TABLE IF NOT EXISTS guest_imports (
        source TEXT PRIMARY KEY, target TEXT NOT NULL, receipt_json TEXT NOT NULL)""")


def register_old(owner):
    db = get_db()
    storage = f"user:{owner}"
    exists = db.execute("SELECT 1 FROM journey_saves WHERE slot=?", (storage,)).fetchone()
    if exists or journey.unification_required(storage):
        db.execute("INSERT OR IGNORE INTO save_directory(id,owner,position,name,storage) VALUES(?,?,1,?,?)",
                   (uuid.uuid4().hex, owner, "初行征程", storage))
        db.commit()


def resolve(owner, save_id):
    if owner is None:
        if save_id not in (None, "guest"):
            raise ValueError("游客存档无效")
        return "local"
    if not isinstance(save_id, str):
        raise ValueError("请先选择征程存档")
    row = get_db().execute("SELECT storage FROM save_directory WHERE id=? AND owner=?", (save_id, owner)).fetchone()
    if row is None:
        raise ValueError("存档不存在或不属于当前账号，请重新选档")
    return row["storage"]


def listing(owner):
    if owner is None:
        rows = [dict(id="guest", position=1, name="本机游客征程", storage="local", updated_at="", version=0)]
    else:
        register_old(owner)
        rows = get_db().execute("SELECT * FROM save_directory WHERE owner=? ORDER BY position", (owner,)).fetchall()
    result = []
    for row in rows:
        state, revision = journey.read_journey(row["storage"])
        result.append({key: row[key] for key in ("id", "position", "name", "updated_at", "version")} | {
            "revision": revision, "rank": journey.CONFIG["ranks"][state["rank"]]["name"],
            "clears": sum(n > 0 for n in state["progress"]["clears"].values()),
            "chapter": "逆脉妖潮 · 已结案" if state.get("story", {}).get("completed") else "逆脉妖潮",
            "active_trial": bool(state["active_trial"]), "empty": revision == 0})
    return result


def edit(owner, save_id, method, payload):
    if owner is None:
        raise ValueError("请登录账号管理三个征程位")
    db = get_db()
    db.execute("BEGIN IMMEDIATE")
    try:
        if method == "POST":
            used = {r[0] for r in db.execute("SELECT position FROM save_directory WHERE owner=?", (owner,))}
            position = next((i for i in range(1, 4) if i not in used), None)
            if position is None:
                raise ValueError("三个存档位已满")
            name = payload.get("name", f"征程{position}")
            if not isinstance(name, str) or not 1 <= len(name.strip()) <= 20:
                raise ValueError("存档名须为1至20字")
            save_id = uuid.uuid4().hex
            # No journey row until first mutation: this also permits an empty-slot guest import.
            db.execute("INSERT INTO save_directory(id,owner,position,name,storage) VALUES(?,?,?,?,?)",
                       (save_id, owner, position, name.strip(), "save:"+save_id))
        else:
            storage = resolve(owner, save_id)
            row = db.execute("SELECT version,name FROM save_directory WHERE id=?", (save_id,)).fetchone()
            if type(payload.get("version")) is not int or payload["version"] != row["version"]:
                raise ValueError("其他窗口已修改档案名称，请重新选档")
            state, revision = journey.read_journey(storage)
            if type(payload.get("revision")) is not int or payload["revision"] != revision:
                raise ValueError("其他窗口已更新，请重新选档")
            if state["active_trial"]:
                raise ValueError("请先结束或放弃进行中的挑战")
            if method == "PATCH":
                name = payload.get("name")
                if not isinstance(name, str) or not 1 <= len(name.strip()) <= 20:
                    raise ValueError("存档名须为1至20字")
                db.execute("UPDATE save_directory SET name=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=?", (name.strip(), save_id))
            else:
                row = db.execute("SELECT name FROM save_directory WHERE id=?", (save_id,)).fetchone()
                if payload.get("confirm_name") != row["name"]:
                    raise ValueError("请准确输入待删除的存档名称")
                if journey.unification_required(storage):
                    raise ValueError("请先完成旧档合并再删除")
                for table in ("journey_saves", "journey_results", "journey_unifications"):
                    db.execute(f"DELETE FROM {table} WHERE slot=?", (storage,))
                db.execute("DELETE FROM save_directory WHERE id=?", (save_id,))
        db.commit()
        return save_id
    except Exception:
        db.rollback()
        raise
