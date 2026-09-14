"""Applies the rate limits of 04 §5 per IP and per account, whichever trips first (ADR-015)."""

import math

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.clock import Clock
from app.core.rate_limit import RateLimitRule, SubjectKind, bucket_for
from app.repositories.rate_limits import RateLimitRepository
from app.services.errors import RateLimitedError


class RateLimiter:
    def __init__(
        self, session_factory: async_sessionmaker[AsyncSession], *, secret: str, clock: Clock
    ) -> None:
        self._repository = RateLimitRepository(session_factory)
        self._secret = secret
        self._clock = clock

    async def check(
        self, rule: RateLimitRule, *, ip: str | None = None, account: str | None = None
    ) -> None:
        """Counts one hit against each subject given; raises once any of them is over its limit."""
        now = self._clock()
        retry_after_s = 0
        subjects: tuple[tuple[SubjectKind, str | None], ...] = (("ip", ip), ("account", account))
        for kind, subject in subjects:
            if subject is None:
                continue
            bucket = bucket_for(rule, kind, subject, secret=self._secret, now=now)
            hits = await self._repository.hit(bucket.key, bucket.window_start)
            if hits > rule.limit:
                remaining = math.ceil((bucket.window_end - now).total_seconds())
                retry_after_s = max(retry_after_s, remaining, 1)
        if retry_after_s:
            raise RateLimitedError(retry_after_s)
