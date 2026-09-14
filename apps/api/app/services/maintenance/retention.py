"""Retention sweeps (04 §7). Nothing schedules them yet; each is safe to run at any time, as often
as wanted."""

from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.clock import Clock
from app.core.db import transaction
from app.repositories import unscoped
from app.repositories.rate_limits import RateLimitRepository

REVOKED_REFRESH_TOKEN_RETENTION = timedelta(days=90)
RATE_LIMIT_WINDOW_RETENTION = timedelta(days=1)


class RetentionService:
    def __init__(self, sessions: async_sessionmaker[AsyncSession], *, clock: Clock) -> None:
        self._sessions = sessions
        self._clock = clock

    async def purge_revoked_refresh_tokens(self) -> int:
        async with transaction(self._sessions) as session:
            return await unscoped.purge_revoked_refresh_tokens(
                session, self._clock() - REVOKED_REFRESH_TOKEN_RETENTION
            )

    async def purge_rate_limit_windows(self) -> int:
        return await RateLimitRepository(self._sessions).purge(
            self._clock() - RATE_LIMIT_WINDOW_RETENTION
        )
