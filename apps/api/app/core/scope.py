"""Who a request acts for (INV-15).

`UserId` is a distinct type so that a repository cannot be handed any UUID that happens to be lying
around — a path parameter, a row id. Only authentication, and registration for the account it is
creating, mint one.
"""

import uuid
from dataclasses import dataclass
from typing import NewType

UserId = NewType("UserId", uuid.UUID)


@dataclass(frozen=True)
class Principal:
    """An authenticated request: the account, and the device its access token was issued to."""

    user_id: UserId
    device_id: str
