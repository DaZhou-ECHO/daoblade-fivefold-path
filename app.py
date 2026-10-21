"""《本命剑：八荒五行》第一版 Web 原型入口。"""

from __future__ import annotations

import os
import re
import secrets
import sqlite3
from pathlib import Path

from flask import Flask, jsonify, render_template, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from database import init_app as init_database
from database import get_db, load_state_record, save_state
from game_rules import default_state, validate_state
from shared_rules import get_ruleset, rules_metadata
from array_lab import CONFIG as LAB_CONFIG, default_lab_state, validate_lab_state, compile_lab
from database import load_lab_record, save_lab_state


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_mapping(
        SECRET_KEY=os.getenv("SECRET_KEY", "local-daoblade-development"),
        DATABASE=os.getenv("DAOBLADE_DATABASE") or str(Path(app.instance_path) / "daoblade.sqlite3"),
        MAX_CONTENT_LENGTH=1024 * 1024,
        JSON_AS_ASCII=False,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
    )
    if test_config:
        app.config.update(test_config)
    Path(app.instance_path).mkdir(parents=True, exist_ok=True)
    init_database(app)

    def current_user():
        user_id = session.get("user_id")
        if type(user_id) is not int:
            return None
        return get_db().execute("SELECT id, username FROM users WHERE id=?", (user_id,)).fetchone()

    def save_slot(user):
        return f"user:{user['id']}" if user else "local"

    def csrf_ok(user):
        return not user or secrets.compare_digest(
            request.headers.get("X-CSRF-Token", ""), session.get("csrf_token", "missing")
        )

    @app.get("/api/auth/me")
    def auth_me():
        user = current_user()
        session.setdefault("csrf_token", secrets.token_urlsafe(24))
        return jsonify(user={"id": user["id"], "username": user["username"]} if user else None,
                       csrf_token=session["csrf_token"])

    @app.post("/api/auth/register")
    def auth_register():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify(error="请求必须是 JSON 对象"), 400
        username, password = payload.get("username"), payload.get("password")
        if not isinstance(username, str) or not re.fullmatch(r"[A-Za-z0-9_]{3,24}", username):
            return jsonify(error="账号须为 3 至 24 位字母、数字或下划线"), 400
        if not isinstance(password, str) or not 8 <= len(password) <= 128:
            return jsonify(error="密码长度须为 8 至 128 位"), 400
        try:
            cursor = get_db().execute(
                "INSERT INTO users(username, password_hash) VALUES (?, ?)",
                (username, generate_password_hash(password)),
            )
            get_db().commit()
        except sqlite3.IntegrityError:
            return jsonify(error="账号名称已存在"), 409
        session.clear()
        session["user_id"] = cursor.lastrowid
        session["csrf_token"] = secrets.token_urlsafe(24)
        return jsonify(user={"id": cursor.lastrowid, "username": username},
                       csrf_token=session["csrf_token"]), 201

    @app.post("/api/auth/login")
    def auth_login():
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict):
            return jsonify(error="请求必须是 JSON 对象"), 400
        username, password = payload.get("username"), payload.get("password")
        if not isinstance(username, str) or not isinstance(password, str):
            return jsonify(error="请输入账号和密码"), 400
        user = get_db().execute(
            "SELECT id, username, password_hash FROM users WHERE username=? COLLATE NOCASE", (username,)
        ).fetchone()
        if user is None or not check_password_hash(user["password_hash"], password):
            return jsonify(error="账号或密码错误"), 401
        session.clear()
        session["user_id"] = user["id"]
        session["csrf_token"] = secrets.token_urlsafe(24)
        return jsonify(user={"id": user["id"], "username": user["username"]},
                       csrf_token=session["csrf_token"])

    @app.post("/api/auth/logout")
    def auth_logout():
        if not csrf_ok(current_user()):
            return jsonify(error="会话校验失败"), 403
        session.clear()
        return jsonify(ok=True)

    @app.post("/api/auth/import-guest")
    def import_guest():
        user = current_user()
        if not user:
            return jsonify(error="请先登录"), 401
        if not csrf_ok(user):
            return jsonify(error="会话校验失败"), 403
        if load_state_record(save_slot(user)):
            return jsonify(error="账号已有存档，不能覆盖"), 409
        guest = load_state_record("local")
        if not guest:
            return jsonify(error="没有可导入的游客存档"), 404
        state = validate_state(guest["state"], guest["state"])
        revision = save_state(state, save_slot(user), 0, user["id"])
        return jsonify(ok=True, state=state, revision=revision, contract=rules_metadata())

    @app.get("/")
    def index():
        return render_template("index.html", ruleset=get_ruleset())

    @app.get("/api/rules")
    def get_rules():
        return jsonify(contract=rules_metadata(), ruleset=get_ruleset())

    @app.get("/api/state")
    def get_state():
        record = load_state_record(save_slot(current_user()))
        return jsonify(state=record["state"] if record else default_state(),
                       revision=record["revision"] if record else 0,
                       contract=rules_metadata())

    @app.post("/api/state")
    def put_state():
        user = current_user()
        if not csrf_ok(user):
            return jsonify(error="会话校验失败"), 403
        payload = request.get_json(silent=True)
        if payload is None:
            return jsonify(error="请求必须包含 JSON 存档"), 400
        if user:
            if not isinstance(payload, dict) or type(payload.get("revision")) is not int:
                return jsonify(error="缺少有效的存档版本号"), 400
            revision = payload["revision"]
            payload = payload.get("state")
        else:
            revision = None
        try:
            slot = save_slot(user)
            previous = load_state_record(slot)
            state = validate_state(payload, previous["state"] if previous else None)
            new_revision = save_state(state, slot, revision, user["id"] if user else None)
        except ValueError as exc:
            status = 409 if "其他窗口" in str(exc) else 400
            return jsonify(error=str(exc)), status
        return jsonify(ok=True, state=state, revision=new_revision, contract=rules_metadata())

    @app.post("/api/reset")
    def reset_state():
        user = current_user()
        if not csrf_ok(user):
            return jsonify(error="会话校验失败"), 403
        expected_revision = None
        if user:
            payload = request.get_json(silent=True)
            if not isinstance(payload, dict) or type(payload.get("revision")) is not int:
                return jsonify(error="缺少有效的存档版本号"), 400
            expected_revision = payload["revision"]
        state = default_state()
        try:
            revision = save_state(state, save_slot(user), expected_revision,
                                  user["id"] if user else None)
        except ValueError as exc:
            return jsonify(error=str(exc)), 409
        return jsonify(ok=True, state=state, revision=revision, contract=rules_metadata())

    @app.get("/api/lab/state")
    def get_lab_state():
        user = current_user()
        record = load_lab_record(save_slot(user))
        state = record["state"] if record else default_lab_state()
        return jsonify(state=state, revision=record["revision"] if record else 0,
                       config=LAB_CONFIG, compiled=compile_lab(state), owner_id=user["id"] if user else None)

    @app.post("/api/lab/state")
    def put_lab_state():
        user = current_user()
        if not csrf_ok(user):
            return jsonify(error="会话校验失败"), 403
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict) or type(payload.get("revision")) is not int or payload["revision"] < 0:
            return jsonify(error="缺少有效的试验档版本号"), 400
        if "owner_id" not in payload or type(payload["owner_id"]) is not type(user["id"] if user else None) or payload["owner_id"] != (user["id"] if user else None):
            return jsonify(error="账号已变化，请重新读取试验档"), 409
        try:
            state = validate_lab_state(payload.get("state"))
            revision = save_lab_state(state, save_slot(user), payload["revision"])
        except ValueError as exc:
            return jsonify(error=str(exc)), 409 if "其他窗口" in str(exc) else 400
        return jsonify(state=state, revision=revision, compiled=compile_lab(state))

    @app.get("/api/health")
    def health():
        return jsonify(status="ok", game="本命剑：八荒五行")

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True)

