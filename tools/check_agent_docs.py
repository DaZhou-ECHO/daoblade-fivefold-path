"""检查固定Agent目录的文件存在性与仓库内Markdown链接；不代替内容审查。"""
from __future__ import annotations

import argparse
from pathlib import Path
import re
from urllib.parse import unquote, urlsplit


def check_agent_docs(root: Path) -> list[str]:
    root = root.resolve()
    base = root / "docs" / "agents"
    errors: list[str] = []
    for path in (root / "AGENTS.md", base / "README.md"):
        if not path.is_file():
            errors.append(f"missing: {path.relative_to(root)}")
    if not base.is_dir():
        return errors
    for task in sorted(base.iterdir()):
        if not task.is_dir() or not re.match(r"^\d{3,}-", task.name):
            continue
        if not (task / "TASK.md").is_file():
            errors.append(f"missing: {task.relative_to(root)}/TASK.md")
        agents = list((task / "agents").glob("*/")) if (task / "agents").is_dir() else []
        if not agents:
            errors.append(f"missing agent records: {task.relative_to(root)}")
        for agent in agents:
            for name in ("DEVLOG.md", "HANDOFF.md"):
                if not (agent / name).is_file():
                    errors.append(f"missing: {agent.relative_to(root)}/{name}")
    for doc in sorted(base.rglob("*.md")):
        for match in re.findall(r"\]\(([^)\n]+)\)", doc.read_text(encoding="utf-8-sig")):
            target = match.strip().strip("<>")
            if not target or target.startswith("#"):
                continue
            if urlsplit(target).scheme in {"http", "https", "mailto", "codex", "app", "plugin"}:
                continue
            target = unquote(target.split("#", 1)[0])
            resolved = (doc.parent / target).resolve()
            try:
                resolved.relative_to(root)
            except ValueError:
                errors.append(f"outside repository: {doc.relative_to(root)} -> {target}")
                continue
            if not resolved.exists():
                errors.append(f"broken link: {doc.relative_to(root)} -> {target}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    errors = check_agent_docs(args.root)
    if errors:
        print("Agent document file/link checks FAILED:")
        for error in errors:
            print(f"  {error}")
        return 1
    print("Agent document file/link checks PASSED (content review still required).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
