"""The daily command: the account-deletion sweep, then the retention purges (task 019, 04 §7).

    uv run python -m app.jobs.daily        # in apps/api, once a day, from the host's scheduler

It connects as cyberathlete_app, like the API, and refuses to run on a role that could skip
row-level security (ADR-011). Every step is safe to repeat: a second run the same day finds nothing
to do. It logs counts, never an address.
"""

import asyncio
import sys
from dataclasses import asdict, dataclass

import structlog

from app.core.clock import Clock, system_clock
from app.core.config import get_settings
from app.core.db import dispose_database, get_session_factory, init_database, verify_database_role
from app.core.email import EmailSender, email_sender
from app.core.logging import configure_logging
from app.services.maintenance.deletion import AccountDeletionSweep
from app.services.maintenance.retention import RetentionService

_logger = structlog.get_logger("app.jobs.daily")


@dataclass(frozen=True)
class DailyReport:
    accounts_deleted: int
    revoked_refresh_tokens_purged: int
    rate_limit_windows_purged: int


async def run_daily(*, sender: EmailSender, clock: Clock) -> DailyReport:
    """Everything the daily command does, against a database already initialised."""
    sessions = get_session_factory()
    accounts_deleted = await AccountDeletionSweep(sessions, sender=sender, clock=clock).run()
    retention = RetentionService(sessions, clock=clock)
    return DailyReport(
        accounts_deleted=accounts_deleted,
        revoked_refresh_tokens_purged=await retention.purge_revoked_refresh_tokens(),
        rate_limit_windows_purged=await retention.purge_rate_limit_windows(),
    )


async def main() -> int:
    settings = get_settings()
    configure_logging(settings.log_level)
    engine = init_database(settings.database_url.get_secret_value())
    try:
        await verify_database_role(engine, attempts=settings.database_connect_attempts)
        report = await run_daily(sender=email_sender(settings), clock=system_clock)
    finally:
        await dispose_database()
    _logger.info("daily_job_done", **asdict(report))
    return 0


if __name__ == "__main__":
    # psycopg's async driver cannot use the event loop Windows gives a plain process (README).
    loop_factory = asyncio.SelectorEventLoop if sys.platform == "win32" else None
    sys.exit(asyncio.run(main(), loop_factory=loop_factory))
