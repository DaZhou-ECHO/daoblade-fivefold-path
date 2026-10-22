"""SQLite 单机存档。"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Any

from flask import current_app, g


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        database_path = Path(current_app.config["DATABASE"])
        database_path.parent.mkdir(parents=True, exist_ok=True)
        g.db = sqlite3.connect(database_path, timeout=10)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(_error: BaseException | None = None) -> None:
    database = g.pop("db", None)
    if database is not None:
        database.close()


def init_db() -> None:
    database = get_db()
    database.execute(
        """CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )"""
    )
    database.execute(
        """
        CREATE TABLE IF NOT EXISTS game_saves (
            slot TEXT PRIMARY KEY,
            state_json TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            revision INTEGER NOT NULL DEFAULT 0,
            user_id INTEGER REFERENCES users(id)
        )
        """
    )
    columns = {row["name"] for row in database.execute("PRAGMA table_info(game_saves)")}
    if "revision" not in columns:
        database.execute("ALTER TABLE game_saves ADD COLUMN revision INTEGER NOT NULL DEFAULT 0")
    if "user_id" not in columns:
        database.execute("ALTER TABLE game_saves ADD COLUMN user_id INTEGER REFERENCES users(id)")
    database.execute("CREATE UNIQUE INDEX IF NOT EXISTS saves_user_idx ON game_saves(user_id)")
    database.execute("""CREATE TABLE IF NOT EXISTS array_lab_saves (
        slot TEXT PRIMARY KEY, state_json TEXT NOT NULL, revision INTEGER NOT NULL
    )""")
    database.execute("""CREATE TABLE IF NOT EXISTS array_lab_results (
        trial_id TEXT NOT NULL, slot TEXT NOT NULL, receipt_json TEXT NOT NULL,
        PRIMARY KEY(trial_id, slot)
    )""")
    database.execute("CREATE TABLE IF NOT EXISTS journey_saves (slot TEXT PRIMARY KEY, state_json TEXT NOT NULL, revision INTEGER NOT NULL)")
    database.execute("CREATE TABLE IF NOT EXISTS journey_results (slot TEXT NOT NULL, trial_id TEXT NOT NULL, receipt_json TEXT NOT NULL, PRIMARY KEY(slot,trial_id))")
    database.commit()


def load_state(slot: str = "local") -> dict[str, Any] | None:
    record = load_state_record(slot)
    return record["state"] if record else None


def load_state_record(slot: str = "local") -> dict[str, Any] | None:
    row = get_db().execute(
        "SELECT state_json, revision FROM game_saves WHERE slot = ?", (slot,)
    ).fetchone()
    return {"state": json.loads(row["state_json"]), "revision": row["revision"]} if row else None


def save_state(state: dict[str, Any], slot: str = "local",
               expected_revision: int | None = None, user_id: int | None = None) -> int:
    payload = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
    database = get_db()
    if expected_revision is None:
        database.execute(
            """INSERT INTO game_saves (slot, state_json, user_id, revision)
               VALUES (?, ?, ?, 1)
               ON CONFLICT(slot) DO UPDATE SET state_json=excluded.state_json,
               revision=revision+1, updated_at=CURRENT_TIMESTAMP""",
            (slot, payload, user_id),
        )
    elif expected_revision == 0:
        cursor = database.execute(
            "INSERT OR IGNORE INTO game_saves (slot, state_json, user_id, revision) VALUES (?, ?, ?, 1)",
            (slot, payload, user_id),
        )
        if cursor.rowcount != 1:
            database.rollback()
            raise ValueError("存档已被其他窗口更新，请重新读取")
    else:
        cursor = database.execute(
            """UPDATE game_saves SET state_json=?, revision=revision+1,
               updated_at=CURRENT_TIMESTAMP WHERE slot=? AND revision=?""",
            (payload, slot, expected_revision),
        )
        if cursor.rowcount != 1:
            database.rollback()
            raise ValueError("存档已被其他窗口更新，请重新读取")
    database.commit()
    return database.execute("SELECT revision FROM game_saves WHERE slot=?", (slot,)).fetchone()[0]


def init_app(app) -> None:
    app.teardown_appcontext(close_db)
    with app.app_context():
        init_db()


def load_lab_record(slot: str):
    row = get_db().execute("SELECT state_json, revision FROM array_lab_saves WHERE slot=?", (slot,)).fetchone()
    return {"state": json.loads(row["state_json"]), "revision": row["revision"]} if row else None


def save_lab_state(state, slot: str, revision: int) -> int:
    database = get_db()
    payload = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
    if revision == 0:
        cursor = database.execute("INSERT OR IGNORE INTO array_lab_saves VALUES (?, ?, 1)", (slot, payload))
    else:
        cursor = database.execute("UPDATE array_lab_saves SET state_json=?, revision=revision+1 WHERE slot=? AND revision=?",
                                  (payload, slot, revision))
    if cursor.rowcount != 1:
        database.rollback()
        raise ValueError("试验档已被其他窗口更新，请重新读取")
    database.commit()
    return revision + 1

