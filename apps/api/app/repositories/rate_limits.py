"""Rate-limit windows (ADR-015).

They hold nobody's data — an HMAC of the subject, a window and a count — so, like the schema
version, they take no user scope: INV-15 governs user-owned rows. Each hit commits on its own, so a
request that fails still counts.
"""

from datetime import datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

_HIT = text(
    """
    INSERT INTO rate_limit_buckets (bucket_key, window_start, hits)
    VALUES (:bucket_key, :window_start, 1)
    ON CONFLICT (bucket_key, window_start) DO UPDATE SET hits = rate_limit_buckets.hits + 1
    RETURNING hits
    """
)
_PURGE = text("DELETE FROM rate_limit_buckets WHERE window_start < :before")


class RateLimitRepository:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def hit(self, bucket_key: str, window_start: datetime) -> int:
        """Counts one hit, atomically across every API instance, and returns the window's total."""
        async with self._session_factory() as session, session.begin():
            result = await session.execute(
                _HIT, {"bucket_key": bucket_key, "window_start": window_start}
            )
            return int(result.scalar_one())

    async def purge(self, before: datetime) -> int:
        async with self._session_factory() as session, session.begin():
            result = await session.execute(_PURGE, {"before": before})
            return int(getattr(result, "rowcount", 0))
