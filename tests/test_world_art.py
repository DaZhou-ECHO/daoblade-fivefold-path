"""Asset QA is optional for runtime installations; install requirements-art.txt to run."""
import pytest

pytest.importorskip("PIL")


def test_world_art_resources():
    from tools.check_world_art import check_art
    assert len(check_art()) == 50
