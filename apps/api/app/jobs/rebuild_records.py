"""Rebuild one user's `personal_records` from their sets (task 004 stage 7, 06 §5).

    uv run python -m app.jobs.rebuild_records <user-id>        # in apps/api, by hand

The cache's repair: run it when the table is suspected of disagreeing with `set_logs`, or after a
change to what a record is. It connects as cyberathlete_app, like the API, refuses to run on a role
that could skip row-level security (ADR-011), and works inside that one user's scope. Safe to
repeat. It logs a count and an id, never an address.
"""

import asyncio
import sys
import uuid

import structlog

from app.core.clock import Clock, system_clock
from app.core.config import get_settings
from app.core.db import dispose_database, get_session_factory, init_database, verify_database_role
from app.core.logging import configure_logging
from app.core.scope import UserId
from app.services.records import PersonalRecordsRebuild

_logger = structlog.get_logger("app.jobs.rebuild_records")

USAGE = "usage: python -m app.jobs.rebuild_records <user-id>"


def parse_user_id(argv: list[str]) -> UserId | None:
    """The one argument, as a user id; None for anything else, so a typo is refused rather than
    rebuilding nobody."""
    if len(argv) != 1:
        return None
    try:
        return UserId(uuid.UUID(argv[0]))
    except ValueError:
        return None


async def rebuild_records(user_id: UserId, *, clock: Clock) -> int:
    """The rebuild, against a database already initialised. Returns how many records stand."""
    return await PersonalRecordsRebuild(get_session_factory(), clock=clock).rebuild(user_id)


async def main(argv: list[str]) -> int:
    user_id = parse_user_id(argv)
    if user_id is None:
        print(USAGE, file=sys.stderr)
        return 2
    settings = get_settings()
    configure_logging(settings.log_level)
    engine = init_database(settings.database_url.get_secret_value())
    try:
        await verify_database_role(engine, attempts=settings.database_connect_attempts)
        count = await rebuild_records(user_id, clock=system_clock)
    finally:
        await dispose_database()
    _logger.info("records_rebuilt", user_id=str(user_id), records=count)
    return 0


if __name__ == "__main__":
    # psycopg's async driver cannot use the event loop Windows gives a plain process (README).
    loop_factory = asyncio.SelectorEventLoop if sys.platform == "win32" else None
    sys.exit(asyncio.run(main(sys.argv[1:]), loop_factory=loop_factory))
