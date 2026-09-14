"""Refresh tokens, one rotation chain per device (04 §3, ADR-015)."""

import uuid
from datetime import datetime

from sqlalchemy import ColumnElement, exists, select, update

from app.core.scope import UserId
from app.models.identity import RefreshToken
from app.repositories.base import ScopedRepository


class RefreshTokenRepository(ScopedRepository[RefreshToken]):
    model = RefreshToken

    async def device_has_signed_in(self, user_id: UserId, device_id: str) -> bool:
        statement = select(
            exists().where(RefreshToken.user_id == user_id, RefreshToken.device_id == device_id)
        )
        return bool(await self._session.scalar(statement))

    async def active(self, user_id: UserId, now: datetime) -> list[RefreshToken]:
        """Unrevoked, unexpired tokens, newest first."""
        statement = (
            self._owned(user_id)
            .where(RefreshToken.revoked_at.is_(None), RefreshToken.expires_at > now)
            .order_by(RefreshToken.issued_at.desc())
        )
        return list((await self._session.scalars(statement)).all())

    async def retire(
        self, user_id: UserId, token_id: uuid.UUID, *, successor_id: uuid.UUID, now: datetime
    ) -> bool:
        """Replaces a token that is still unused. False if another request got there first."""
        statement = (
            update(RefreshToken)
            .where(
                RefreshToken.user_id == user_id,
                RefreshToken.id == token_id,
                RefreshToken.replaced_by.is_(None),
                RefreshToken.revoked_at.is_(None),
            )
            .values(replaced_by=successor_id, revoked_at=now)
            .returning(RefreshToken.id)
            .execution_options(synchronize_session=False)
        )
        return len((await self._session.execute(statement)).all()) == 1

    async def revoke_device(self, user_id: UserId, device_id: str, now: datetime) -> int:
        return await self._revoke(user_id, now, RefreshToken.device_id == device_id)

    async def revoke_all(self, user_id: UserId, now: datetime) -> int:
        return await self._revoke(user_id, now)

    async def _revoke(
        self, user_id: UserId, now: datetime, *conditions: ColumnElement[bool]
    ) -> int:
        statement = (
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None), *conditions)
            .values(revoked_at=now)
            .returning(RefreshToken.id)
            .execution_options(synchronize_session=False)
        )
        return len((await self._session.execute(statement)).all())
