"""What a presented refresh token means (04 §3, ADR-015 §2)."""

import uuid
from datetime import UTC, datetime, timedelta

from app.services.auth.rotation import GRACE_WINDOW, TokenState, decide_rotation

NOW = datetime(2026, 9, 14, 12, 0, tzinfo=UTC)
LATER = NOW + timedelta(days=60)


def token(
    *,
    issued: datetime = NOW,
    revoked: datetime | None = None,
    replaced: bool = False,
    expires: datetime = LATER,
) -> TokenState:
    return TokenState(issued, expires, revoked, uuid.uuid4() if replaced else None)


def test_the_window_is_sixty_seconds():
    assert timedelta(seconds=60) == GRACE_WINDOW


def test_a_live_token_rotates():
    assert decide_rotation(token(), None, NOW) == "rotate"


def test_a_replaced_token_whose_successor_is_unused_and_young_is_forgiven():
    successor = token(issued=NOW)

    assert (
        decide_rotation(token(replaced=True, revoked=NOW), successor, NOW + timedelta(seconds=59))
        == "grace"
    )


def test_a_replaced_token_is_reuse_once_the_window_has_passed():
    successor = token(issued=NOW)

    assert (
        decide_rotation(token(replaced=True, revoked=NOW), successor, NOW + GRACE_WINDOW) == "reuse"
    )


def test_a_replaced_token_is_reuse_once_its_successor_has_been_used():
    used = token(issued=NOW, replaced=True, revoked=NOW)

    assert decide_rotation(token(replaced=True, revoked=NOW), used, NOW) == "reuse"


def test_a_replaced_token_is_reuse_when_its_successor_was_revoked():
    revoked = token(issued=NOW, revoked=NOW)

    assert decide_rotation(token(replaced=True, revoked=NOW), revoked, NOW) == "reuse"


def test_a_token_revoked_by_a_logout_is_simply_rejected():
    assert decide_rotation(token(revoked=NOW), None, NOW) == "reject"


def test_an_expired_token_is_rejected_whatever_else_is_true():
    assert decide_rotation(token(expires=NOW), None, NOW) == "reject"
    assert decide_rotation(token(expires=NOW, replaced=True), token(), NOW) == "reject"
