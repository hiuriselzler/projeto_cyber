"""Privacy zones — ciphertext the server cannot open (ADR-007)."""

from datetime import datetime

from sqlalchemy import update

from app.core.scope import UserId
from app.models.identity import PrivacyZone
from app.repositories.base import ScopedRepository


class PrivacyZoneRepository(ScopedRepository[PrivacyZone]):
    model = PrivacyZone

    async def discard_all(self, user_id: UserId, now: datetime) -> int:
        """After a password reset nothing can decrypt them, so every device is told they are gone
        (04 §2a)."""
        statement = (
            update(PrivacyZone)
            .where(PrivacyZone.user_id == user_id, PrivacyZone.deleted_at.is_(None))
            .values(deleted_at=now, updated_at=now, sync_version=PrivacyZone.sync_version + 1)
            .returning(PrivacyZone.id)
            .execution_options(synchronize_session=False)
        )
        return len((await self._session.execute(statement)).all())
