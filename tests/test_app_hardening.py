"""051：会话密钥持久化、API JSON 错误与健康检查回归。"""

import sqlite3

import app as app_module


def test_secret_key_is_generated_then_reused(tmp_path, monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    instance = tmp_path / "inst"

    first, first_source = app_module.resolve_secret_key(instance)
    assert first_source == "generated"
    assert len(first) >= 32
    key_file = instance / app_module.DEFAULT_SECRET_KEY_FILENAME
    assert key_file.read_text(encoding="utf-8").strip() == first

    second, second_source = app_module.resolve_secret_key(instance)
    assert (second, second_source) == (first, "file")


def test_env_secret_key_wins_and_writes_no_file(tmp_path, monkeypatch):
    monkeypatch.setenv("SECRET_KEY", "x" * 40)
    secret, source = app_module.resolve_secret_key(tmp_path)
    assert (secret, source) == ("x" * 40, "env")
    assert not (tmp_path / app_module.DEFAULT_SECRET_KEY_FILENAME).exists()


def test_app_survives_restart_with_same_secret(tmp_path, monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    config = {"TESTING": True, "DATABASE": str(tmp_path / "restart.sqlite3")}
    instance = str(tmp_path / "instance")

    first = app_module.create_app(config, instance_path=instance)
    second = app_module.create_app(config, instance_path=instance)

    assert first.config["SECRET_KEY"] == second.config["SECRET_KEY"]
    assert first.config["SECRET_KEY"] != "local-daoblade-development"


def test_explicit_secret_key_still_wins(tmp_path, monkeypatch):
    monkeypatch.delenv("SECRET_KEY", raising=False)
    application = app_module.create_app(
        {"TESTING": True, "DATABASE": str(tmp_path / "explicit.sqlite3"), "SECRET_KEY": "test"},
        instance_path=str(tmp_path / "instance"),
    )
    assert application.config["SECRET_KEY"] == "test"
    assert not (tmp_path / "instance" / app_module.DEFAULT_SECRET_KEY_FILENAME).exists()


def test_unknown_api_path_returns_json_error(client):
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.is_json
    assert response.get_json()["error"] == app_module.API_ERROR_TEXT[404]


def test_wrong_method_returns_json_error(client):
    response = client.post("/api/health")
    assert response.status_code == 405
    assert response.is_json
    assert "error" in response.get_json()


def test_oversized_body_returns_json_error(client):
    response = client.post("/api/state", json={"blob": "x" * (1024 * 1024 + 64)})
    assert response.status_code == 413
    assert response.is_json
    assert response.get_json()["error"] == app_module.API_ERROR_TEXT[413]


def test_page_errors_keep_html(client):
    response = client.get("/no-such-page")
    assert response.status_code == 404
    assert not response.is_json


def test_health_reports_database_and_rules(client):
    body = client.get("/api/health").get_json()
    assert body["status"] == "ok"
    assert body["database"] is True
    assert body["rules"]["ruleset_id"] == "legacy-v1"


def test_health_reports_degraded_database(client, monkeypatch):
    def broken_database():
        raise sqlite3.OperationalError("disk I/O error")

    monkeypatch.setattr(app_module, "get_db", broken_database)
    response = client.get("/api/health")
    assert response.status_code == 503
    body = response.get_json()
    assert body["status"] == "degraded"
    assert body["database"] is False
