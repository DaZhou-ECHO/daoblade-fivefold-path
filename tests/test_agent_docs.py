import importlib.util
from pathlib import Path
import subprocess
import sys


spec = importlib.util.spec_from_file_location(
    "check_agent_docs", Path(__file__).resolve().parents[1] / "tools" / "check_agent_docs.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def make_records(root):
    (root / "AGENTS.md").write_text("# Rules\n", encoding="utf-8")
    base = root / "docs" / "agents"
    agent = base / "001-example" / "agents" / "agent-test"
    agent.mkdir(parents=True)
    (base / "README.md").write_text("[task](001-example/TASK.md)\n", encoding="utf-8")
    (agent.parents[1] / "TASK.md").write_text("task\n", encoding="utf-8")
    (agent / "DEVLOG.md").write_text("log\n", encoding="utf-8")
    (agent / "HANDOFF.md").write_text("[task](../../TASK.md)\n", encoding="utf-8")
    return base, agent


def test_valid_unicode_and_encoded_links(tmp_path):
    base, agent = make_records(tmp_path)
    (agent / "资料 note.md").write_text("evidence\n", encoding="utf-8")
    (agent / "HANDOFF.md").write_text("[evidence](资料%20note.md)\n[web](https://example.com)\n", encoding="utf-8-sig")
    assert module.check_agent_docs(tmp_path) == []


def test_broken_link_and_missing_handoff_are_reported(tmp_path):
    base, agent = make_records(tmp_path)
    (agent / "HANDOFF.md").unlink()
    (base / "README.md").write_text("[missing](not-found.md)\n", encoding="utf-8")
    errors = module.check_agent_docs(tmp_path)
    assert any("HANDOFF.md" in error for error in errors)
    assert any("broken link" in error for error in errors)


def test_links_cannot_escape_repository(tmp_path):
    base, agent = make_records(tmp_path)
    (base / "README.md").write_text("[outside](../../../../outside.md)\n", encoding="utf-8")
    assert any("outside repository" in error for error in module.check_agent_docs(tmp_path))


def test_absolute_local_link_cannot_be_mistaken_for_url_scheme(tmp_path):
    base, agent = make_records(tmp_path)
    outside = (tmp_path.parent / "outside.md").as_posix()
    (base / "README.md").write_text(f"[outside]({outside})\n", encoding="utf-8")
    assert any("outside repository" in error for error in module.check_agent_docs(tmp_path))


def test_cli_returns_failure_for_missing_records(tmp_path):
    result = subprocess.run(
        [sys.executable, str(Path(module.__file__)), "--root", str(tmp_path)],
        capture_output=True, text=True,
    )
    assert result.returncode == 1
    assert "FAILED" in result.stdout
