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
    return g.db


def close_db(_error: BaseException | None = None) -> None:
    database = g.pop("db", None)
    if database is not None:
        database.close()


def init_db() -> None:
    database = get_db()
    database.execute(
        """
        CREATE TABLE IF NOT EXISTS game_saves (
            slot TEXT PRIMARY KEY,
            state_json TEXT NOT NULL,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    database.commit()


def load_state(slot: str = "local") -> dict[str, Any] | None:
    row = get_db().execute(
        "SELECT state_json FROM game_saves WHERE slot = ?", (slot,)
    ).fetchone()
    return json.loads(row["state_json"]) if row else None


def save_state(state: dict[str, Any], slot: str = "local") -> None:
    payload = json.dumps(state, ensure_ascii=False, separators=(",", ":"))
    database = get_db()
    database.execute(
        """
        INSERT INTO game_saves (slot, state_json, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(slot) DO UPDATE SET
            state_json = excluded.state_json,
            updated_at = CURRENT_TIMESTAMP
        """,
        (slot, payload),
    )
    database.commit()


def init_app(app) -> None:
    app.teardown_appcontext(close_db)
    with app.app_context():
        init_db()

