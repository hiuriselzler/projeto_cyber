"""The user scope lasts one transaction (ADR-011).

A plain `SET app.user_id` outlives its transaction on a pooled connection and hands one user's scope
to the next request, so the API may set it only with `set_config(…, true)` — which is `SET LOCAL`.
The integration suite shows the scope ending on a reused connection; this scans the source for the
banned forms.
"""

import re
from pathlib import Path

import pytest

API_ROOT = Path(__file__).resolve().parents[2]

SESSION_WIDE_SCOPE = re.compile(
    r"\bSET\s+(?:SESSION\s+)?app\.user_id\b"
    r"|set_config\(\s*'app\.user_id'\s*,[^)]*,\s*false\s*\)",
    re.IGNORECASE,
)


def offenders(root: Path) -> list[str]:
    return [
        f"{path.relative_to(root)}:{number}"
        for path in sorted(root.rglob("*.py"))
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1)
        if SESSION_WIDE_SCOPE.search(line)
    ]


def test_the_api_never_sets_a_session_wide_user_scope():
    assert offenders(API_ROOT / "app") == []


def test_the_one_place_that_sets_the_scope_sets_it_for_the_transaction():
    db = (API_ROOT / "app" / "core" / "db.py").read_text(encoding="utf-8")

    assert "set_config('app.user_id', :user_id, true)" in db


@pytest.mark.parametrize(
    "statement",
    [
        "SET app.user_id = '0a0e…'",
        "set session app.user_id to :id",
        "SELECT set_config('app.user_id', :id, false)",
    ],
)
def test_the_scan_catches_a_session_wide_scope(statement):
    assert SESSION_WIDE_SCOPE.search(statement)


@pytest.mark.parametrize(
    "statement",
    ["SET LOCAL app.user_id = '0a0e…'", "SELECT set_config('app.user_id', :user_id, true)"],
)
def test_the_scan_allows_a_transaction_scope(statement):
    assert not SESSION_WIDE_SCOPE.search(statement)
