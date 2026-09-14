"""What a presented refresh token means (04 §3, ADR-015 §2). Pure: the service reads the rows and
acts."""

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

GRACE_WINDOW = timedelta(seconds=60)

RotationDecision = Literal["rotate", "grace", "reuse", "reject"]


@dataclass(frozen=True)
class TokenState:
    issued_at: datetime
    expires_at: datetime
    revoked_at: datetime | None
    replaced_by: uuid.UUID | None

    @property
    def unused(self) -> bool:
        return self.replaced_by is None and self.revoked_at is None


def decide_rotation(
    presented: TokenState, successor: TokenState | None, now: datetime
) -> RotationDecision:
    """
    - rotate: the token is live — issue its successor.
    - grace:  it was replaced under a minute ago and the successor was never used — a response that
              never arrived. Issue a new successor and retire the unused one.
    - reuse:  it was replaced in any other case — revoke the device's chain.
    - reject: expired, or revoked without a successor (a logout).
    """
    if presented.expires_at <= now:
        return "reject"
    if presented.replaced_by is None:
        return "rotate" if presented.revoked_at is None else "reject"
    if successor is not None and successor.unused and now - successor.issued_at < GRACE_WINDOW:
        return "grace"
    return "reuse"
