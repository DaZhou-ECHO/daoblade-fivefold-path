"""《本命剑：八荒五行》第一版 Web 原型入口。"""

from __future__ import annotations

import os
import json
import re
import secrets
import sqlite3
from pathlib import Path

from flask import Flask, jsonify, render_template, request, session, g
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

from database import init_app as init_database
from database import get_db, load_state_record, save_state
from game_rules import default_state, validate_state
from shared_rules import get_ruleset, rules_metadata
from array_lab import CONFIG as LAB_CONFIG, default_lab_state, validate_lab_state, validate_lab_edit, compile_lab
from database import load_lab_record, save_lab_state
from array_lab_trials import transition_trial
import journey
import save_slots


DEFAULT_SECRET_KEY_FILENAME = "session-secret.key"

API_ERROR_TEXT = {
    400: "请求格式无效",
    401: "请先登录账号",
    403: "会话校验失败，请刷新页面后重试",
    404: "接口或资源不存在",
    405: "接口不支持该请求方法",
    409: "存档状态已变化，请刷新后重试",
    413: "请求体超过 1MB 上限",
    415: "请求内容类型不受支持",
    429: "请求过于频繁，请稍后再试",
    500: "服务器内部错误，请稍后重试",
}


def resolve_secret_key(instance_path: str | Path) -> tuple[str, str]:
    """返回（会话密钥，来源）。来源为 env / file / generated。

    未显式设置 SECRET_KEY 时，把随机密钥写入 instance/session-secret.key 并复用，
    避免公开的默认密钥伪造会话，同时保证重启后登录状态不失效。
    """
    env_secret = os.getenv("SECRET_KEY", "").strip()
    if env_secret:
        return env_secret, "env"
    key_path = Path(instance_path) / DEFAULT_SECRET_KEY_FILENAME
    try:
        stored = key_path.read_text(encoding="utf-8").strip()
    except OSError:
        stored = ""
    if len(stored) >= 32:
        return stored, "file"
    secret = secrets.token_urlsafe(48)
    key_path.parent.mkdir(parents=True, exist_ok=True)
    key_path.write_text(secret + "\n", encoding="utf-8")
    try:
        key_path.chmod(0o600)
    except OSError:
        pass
    return secret, "generated"


def create_app(test_config: dict | None = None, instance_path: str | None = None) -> Flask:
    app = Flask(__name__, instance_relative_config=True, instance_path=instance_path)
    app.config.from_mapping(
        SECRET_KEY=None,
        DATABASE=os.getenv("DAOBLADE_DATABASE") or str(Path(app.instance_path) / "daoblade.sqlite3"),
        MAX_CONTENT_LENGTH=1024 * 1024,
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        LEGACY_DIAGNOSTICS=False,
    )
    # Flask 3 用 json provider 取代已废弃的 JSON_AS_ASCII；中文错误直接可读，便于前端与排障。
    app.json.ensure_ascii = False
    if test_config:
        app.config.update(test_config)
    Path(app.instance_path).mkdir(parents=True, exist_ok=True)
    if not app.config.get("SECRET_KEY"):
        secret, source = resolve_secret_key(app.instance_path)
        app.config["SECRET_KEY"] = secret
        if source == "generated":
            app.logger.warning(
                "未设置 SECRET_KEY，已生成本机会话密钥 %s；多人试用时请通过环境变量固定。",
                Path(app.instance_path) / DEFAULT_SECRET_KEY_FILENAME,
            )
    init_database(app)

    @app.before_request
    def retired_apis():
        if not app.config["LEGACY_DIAGNOSTICS"] and (request.path in {"/api/state", "/api/reset", "/api/journey/import-preview", "/api/journey/import-confirm"}
                or request.path.startswith("/api/lab/")):
            return jsonify(error="旧版接口已停用，请使用正式征程"), 410

    def current_user():
        user_id = session.get("user_id")
        if type(user_id) is not int:
            return None
        return get_db().execute("SELECT id, username FROM users WHERE id=?", (user_id,)).fetchone()

    def save_slot(user):
        if hasattr(g, "journey_slot"):
            return g.journey_slot
        return f"user:{user['id']}" if user else "local"

    @app.before_request
    def scope_journey():
        if not (request.path.startswith("/api/journey") or request.path == "/api/auth/import-guest"):
            return None
        user = current_user()
        payload = request.get_json(silent=True) or {}
        save_id = request.args.get("save_id") if request.method == "GET" else payload.get("save_id") if isinstance(payload, dict) else None
        # Historical diagnostics deliberately exercise the retired single-slot contract.
        if save_id is None and app.config["LEGACY_DIAGNOSTICS"]:
            return None
        try:
            g.journey_slot = save_slots.resolve(user["id"] if user else None, save_id)
        except ValueError as exc:
            return jsonify(error=str(exc)), 409

    @app.errorhandler(HTTPException)
    def http_error(exc: HTTPException):
        """API 请求一律返回 JSON，页面请求沿用 Flask 默认页面。"""
        if not (request.path.startswith("/api/") or request.is_json):
            return exc.get_response()
        message = API_ERROR_TEXT.get(exc.code or 500, exc.description or "请求失败")
        return jsonify(error=message, status=exc.code), exc.code

    @app.route("/api/saves", methods=["GET", "POST"])
    @app.route("/api/saves/<save_id>", methods=["PATCH", "DELETE"])
    def saves(save_id=None):
        user = current_user()
        owner = user["id"] if user else None
        try:
            if request.method == "GET":
                return jsonify(saves=save_slots.listing(owner), owner_id=owner)
            if not csrf_ok(user):
                return jsonify(error="会话校验失败"), 403
            payload = request.get_json(silent=True)
            if not isinstance(payload, dict):
                raise ValueError("请求必须是JSON对象")
            save_slots.register_old(owner) if owner is not None else None
            result = save_slots.edit(owner, save_id, request.method, payload)
            return jsonify(save_id=result, saves=save_slots.listing(owner)), 201 if request.method == "POST" else 200
        except ValueError as exc:
            return jsonify(error=str(exc)), 409

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
        db = get_db()
        db.execute("BEGIN IMMEDIATE")
        try:
            if journey.unification_required("local") or journey.unification_required(save_slot(user)):
                db.rollback()
                return jsonify(error="请先分别完成游客与账号的单档合并"), 409
            guest_journey = db.execute("SELECT state_json, revision FROM journey_saves WHERE slot='local'").fetchone()
            target = save_slot(user)
            if target.startswith("save:") and not db.execute("SELECT 1 FROM save_directory WHERE storage=?", (target,)).fetchone():
                db.rollback()
                return jsonify(error="征程已被删除，请重新选档"), 409
            imported = db.execute("SELECT target,receipt_json FROM guest_imports WHERE source='local'").fetchone()
            if imported:
                db.rollback()
                if imported["target"] == target:
                    return jsonify(ok=True, journey_imported=True, replayed=True)
                return jsonify(error="该游客征程已导入其他存档，不能重复复制"), 409
            if not guest_journey:
                db.rollback()
                return jsonify(error="没有可导入的游客存档"), 404
            if db.execute("SELECT 1 FROM journey_saves WHERE slot=?", (target,)).fetchone():
                db.rollback()
                return jsonify(error="账号已有征程存档，不能覆盖"), 409
            state = journey.normalize_journey(json.loads(guest_journey["state_json"]))
            db.execute("INSERT INTO journey_saves VALUES(?,?,1)", (target, json.dumps(state, ensure_ascii=False)))
            db.execute("INSERT INTO journey_results SELECT ?,trial_id,receipt_json FROM journey_results WHERE slot='local'", (target,))
            db.execute("INSERT INTO guest_imports VALUES('local',?,?)", (target, json.dumps({"journey_imported": True})))
            db.commit()
            return jsonify(ok=True, journey_imported=True)
        except Exception:
            db.rollback()
            raise

    @app.get("/")
    def index():
        return render_template("index.html", ruleset=get_ruleset(), journey_maps=journey.MAPS_V2)

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
        state = validate_lab_state(record["state"] if record else default_lab_state())
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
            previous = load_lab_record(save_slot(user))
            if payload["revision"] != (previous["revision"] if previous else 0):
                raise ValueError("试验档已被其他窗口更新，请重新读取")
            state = validate_lab_edit(payload.get("state"), previous["state"] if previous else default_lab_state())
            revision = save_lab_state(state, save_slot(user), payload["revision"])
        except ValueError as exc:
            return jsonify(error=str(exc)), 409 if "其他窗口" in str(exc) else 400
        return jsonify(state=state, revision=revision, compiled=compile_lab(state))

    @app.post("/api/lab/trial")
    def lab_trial_action():
        user = current_user()
        if not csrf_ok(user):
            return jsonify(error="会话校验失败"), 403
        payload = request.get_json(silent=True)
        if not isinstance(payload, dict) or type(payload.get("revision")) is not int or payload["revision"] < 0:
            return jsonify(error="缺少有效的试验档版本号"), 400
        owner = user["id"] if user else None
        if "owner_id" not in payload or type(payload["owner_id"]) is not type(owner) or payload["owner_id"] != owner:
            return jsonify(error="账号已变化，请重新读取试验档"), 409
        try:
            result = transition_trial(save_slot(user), payload["revision"], payload)
        except ValueError as exc:
            return jsonify(error=str(exc)), 409 if "其他窗口" in str(exc) or "已经结束" in str(exc) or "不匹配" in str(exc) else 400
        return jsonify(result)

    @app.get("/api/journey")
    def get_journey():
        user = current_user()
        try:
            state, revision = journey.read_journey(save_slot(user))
            return jsonify(**journey.response(state, revision), config=journey.CONFIG,
                           owner_id=user["id"] if user else None,
                           migration_required=journey.unification_required(save_slot(user)))
        except ValueError as exc:
            return jsonify(error=str(exc)), 400

    @app.post("/api/journey/practice-preview")
    @app.post("/api/journey/build-preview")
    def journey_build_preview():
        user = current_user()
        if not csrf_ok(user):
            return jsonify(error="会话校验失败"), 403
        payload = request.get_json(silent=True)
        owner = user["id"] if user else None
        if not isinstance(payload, dict) or type(payload.get("revision")) is not int or payload["revision"] < 0:
            return jsonify(error="缺少有效版本号"), 400
        if "owner_id" not in payload or type(payload["owner_id"]) is not type(owner) or payload["owner_id"] != owner:
            return jsonify(error="账号已变化，请重读征程"), 409
        try:
            if request.path.endswith("practice-preview"):
                return jsonify(journey.preview_sword_practice(save_slot(user), payload["revision"], payload))
            return jsonify(journey.preview_build(save_slot(user), payload["revision"], payload.get("nodes"), payload.get("loadout")))
        except (ValueError, TypeError, KeyError) as exc:
            return jsonify(error=str(exc) if isinstance(exc, ValueError) else "构筑字段无效"), 409 if "其他窗口" in str(exc) else 400

    @app.get("/api/journey/unify-preview")
    def journey_import_preview():
        try:
            return jsonify(**journey.unify_preview(save_slot(current_user())))
        except ValueError as exc:
            return jsonify(error=str(exc)), 400

    @app.post("/api/journey/unify-confirm")
    def journey_import_confirm():
        user = current_user()
        if not csrf_ok(user):
            return jsonify(error="会话校验失败"), 403
        payload = request.get_json(silent=True)
        owner = user["id"] if user else None
        if (not isinstance(payload, dict) or payload.get("owner_id") != owner
                or type(payload.get("revisions")) is not dict):
            return jsonify(error="账号或预览版本无效，请重新预览"), 409
        try:
            return jsonify(**journey.unify_confirm(save_slot(user), payload["revisions"]))
        except ValueError as exc:
            return jsonify(error=str(exc)), 409

    @app.get("/api/journey/import-preview")
    def legacy_import_preview():
        try:
            return jsonify(**journey.import_preview(save_slot(current_user())))
        except ValueError as exc:
            return jsonify(error=str(exc)), 400

    @app.post("/api/journey/import-confirm")
    def legacy_import_confirm():
        user = current_user()
        if not csrf_ok(user):
            return jsonify(error="会话校验失败"), 403
        payload = request.get_json(silent=True)
        owner = user["id"] if user else None
        if (not isinstance(payload, dict) or payload.get("owner_id") != owner
                or type(payload.get("legacy_revision")) is not int
                or type(payload.get("journey_revision")) is not int):
            return jsonify(error="账号或预览版本无效，请重新预览"), 409
        try:
            return jsonify(**journey.confirm_import(save_slot(user), payload["legacy_revision"], payload["journey_revision"]))
        except ValueError as exc:
            return jsonify(error=str(exc)), 409

    @app.post("/api/journey")
    def journey_action():
        user = current_user()
        if not csrf_ok(user):
            return jsonify(error="会话校验失败"), 403
        payload = request.get_json(silent=True)
        owner = user["id"] if user else None
        if not isinstance(payload, dict) or type(payload.get("revision")) is not int or payload["revision"] < 0:
            return jsonify(error="缺少有效版本号"), 400
        if "owner_id" not in payload or type(payload["owner_id"]) is not type(owner) or payload["owner_id"] != owner:
            return jsonify(error="账号已变化，请重读征程"), 409
        try:
            return jsonify(journey.transition(save_slot(user), payload["revision"], payload))
        except (ValueError, TypeError, KeyError) as exc:
            return jsonify(error=str(exc) if isinstance(exc, ValueError) else "征程字段无效"), 409 if "其他窗口" in str(exc) else 400

    @app.get("/api/health")
    def health():
        try:
            get_db().execute("SELECT 1").fetchone()
            database_ok = True
        except sqlite3.Error:
            database_ok = False
        payload = jsonify(
            status="ok" if database_ok else "degraded",
            game="本命剑：八荒五行",
            database=database_ok,
            rules=rules_metadata(),
        )
        return (payload, 200) if database_ok else (payload, 503)

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True)

