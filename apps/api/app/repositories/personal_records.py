"""`personal_records` — a derived cache, rebuildable from `set_logs` (03 §4, §11; task 004 stage 7).

Written only by the rebuild, which replaces a user's rows whole: a cache is never patched row by
row, because a patch that misses a case is a cache that disagrees with its source and nothing
notices.
"""

from collections.abc import Sequence

from sqlalchemy import delete

from app.core.scope import UserId
from app.models.strength import PersonalRecord
from app.repositories.base import ScopedRepository


class PersonalRecordRepository(ScopedRepository[PersonalRecord]):
    model = PersonalRecord

    async def list_for(self, user_id: UserId) -> list[PersonalRecord]:
        statement = self._owned(user_id).order_by(
            PersonalRecord.exercise_id, PersonalRecord.kind, PersonalRecord.weight_kg
        )
        return list((await self._session.execute(statement)).scalars())

    async def replace_all(self, user_id: UserId, rows: Sequence[PersonalRecord]) -> None:
        """Every row of `user_id`'s cache, and only theirs, becomes `rows` (INV-15)."""
        for row in rows:
            if row.user_id != user_id:
                raise ValueError("a personal record may only be written for the user it belongs to")
        await self._session.execute(delete(PersonalRecord).where(PersonalRecord.user_id == user_id))
        self._session.add_all(rows)
        await self._session.flush()
