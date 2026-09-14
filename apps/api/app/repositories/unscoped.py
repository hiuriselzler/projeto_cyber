"""The only module that reads rows without a user scope (ADR-011).

It calls the allowlisted SECURITY DEFINER functions and nothing else, and hands back no more than a
flow needs to set its scope — after which the flow continues through the ordinary, scoped
repositories. Only app.services.auth and app.services.maintenance may import it; import-linter
enforces that.
"""

import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.scope import UserId


@dataclass(frozen=True)
class Credentials:
    user_id: UserId
    password_hash: str


@dataclass(frozen=True)
class FoundRefreshToken:
    id: uuid.UUID
    user_id: UserId


@dataclass(frozen=True)
class FoundEmailToken:
    user_id: UserId
    expires_at: datetime
    used: bool
    email: str | None = None


async def find_user_by_email(session: AsyncSession, email: str) -> Credentials | None:
    row = (
        await session.execute(
            text("SELECT id, password_hash FROM auth_find_user_by_email(CAST(:email AS citext))"),
            {"email": email},
        )
    ).one_or_none()
    return None if row is None else Credentials(UserId(row.id), row.password_hash)


async def find_refresh_token(session: AsyncSession, token_hash: str) -> FoundRefreshToken | None:
    row = (
        await session.execute(
            text("SELECT id, user_id FROM auth_find_refresh_token(:token_hash)"),
            {"token_hash": token_hash},
        )
    ).one_or_none()
    return None if row is None else FoundRefreshToken(row.id, UserId(row.user_id))


async def find_reset_token(session: AsyncSession, token_hash: str) -> FoundEmailToken | None:
    row = (
        await session.execute(
            text("SELECT user_id, expires_at, used FROM auth_redeem_reset_token(:token_hash)"),
            {"token_hash": token_hash},
        )
    ).one_or_none()
    return None if row is None else FoundEmailToken(UserId(row.user_id), row.expires_at, row.used)


async def find_verification_token(session: AsyncSession, token_hash: str) -> FoundEmailToken | None:
    row = (
        await session.execute(
            text(
                "SELECT user_id, email, expires_at, used "
                "FROM auth_redeem_verification_token(:token_hash)"
            ),
            {"token_hash": token_hash},
        )
    ).one_or_none()
    if row is None:
        return None
    return FoundEmailToken(UserId(row.user_id), row.expires_at, row.used, str(row.email))


async def purge_revoked_refresh_tokens(session: AsyncSession, before: datetime) -> int:
    result = await session.execute(
        text("SELECT maintenance_purge_revoked_tokens(:before)"), {"before": before}
    )
    return int(result.scalar_one())
