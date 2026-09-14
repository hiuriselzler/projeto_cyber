"""The API's one clock. Services take `now` from it, so a test moves time instead of waiting for
it."""

from collections.abc import Callable
from datetime import UTC, datetime

Clock = Callable[[], datetime]


def system_clock() -> datetime:
    return datetime.now(UTC)
