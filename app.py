"""《本命剑：八荒五行》第一版 Web 原型入口。"""

from __future__ import annotations

import os
from pathlib import Path

from flask import Flask, jsonify, render_template, request

from database import init_app as init_database
from database import load_state, save_state
from game_rules import default_state, validate_state


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_mapping(
        SECRET_KEY=os.getenv("SECRET_KEY", "local-daoblade-development"),
        DATABASE=str(Path(app.instance_path) / "daoblade.sqlite3"),
        MAX_CONTENT_LENGTH=1024 * 1024,
        JSON_AS_ASCII=False,
    )
    if test_config:
        app.config.update(test_config)
    Path(app.instance_path).mkdir(parents=True, exist_ok=True)
    init_database(app)

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/state")
    def get_state():
        state = load_state() or default_state()
        return jsonify(state=state)

    @app.post("/api/state")
    def put_state():
        payload = request.get_json(silent=True)
        if payload is None:
            return jsonify(error="请求必须包含 JSON 存档"), 400
        try:
            previous = load_state()
            state = validate_state(payload, previous)
            save_state(state)
        except ValueError as exc:
            return jsonify(error=str(exc)), 400
        return jsonify(ok=True, state=state)

    @app.post("/api/reset")
    def reset_state():
        state = default_state()
        save_state(state)
        return jsonify(ok=True, state=state)

    @app.get("/api/health")
    def health():
        return jsonify(status="ok", game="本命剑：八荒五行")

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True)

