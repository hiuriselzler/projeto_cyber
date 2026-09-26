"""The scoped repository (INV-15, 04 §4).

Every method on user-owned data takes the `UserId` it acts for, as a required argument of a
distinct type: a call that leaves it out, or hands in some other UUID, fails mypy instead of
running — a known-bad fixture proves it. The query filters on the owner column, the first line of
defence, and runs in a transaction whose `app.user_id` is that same user, so row-level security is
the second (ADR-011).
"""

import uuid
from collections.abc import Collection
from datetime import datetime
from typing import Any

from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.scope import UserId
from app.models.base import Base, SyncColumns


class ScopedRepository[ModelT: Base]:
    model: type[ModelT]
    owner_column: str = "user_id"
    id_column: str = "id"

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def _column(self, name: str) -> Any:
        return getattr(self.model, name)

    def _owned(self, user_id: UserId) -> Select[tuple[ModelT]]:
        return select(self.model).where(self._column(self.owner_column) == user_id)

    async def get(self, user_id: UserId, row_id: uuid.UUID) -> ModelT | None:
        statement = self._owned(user_id).where(self._column("id") == row_id)
        return (await self._session.execute(statement)).scalar_one_or_none()

    async def get_many(
        self, user_id: UserId, row_ids: Collection[uuid.UUID]
    ) -> dict[uuid.UUID, ModelT]:
        """The user's rows among `row_ids`, by id. An id that is absent or someone else's is simply
        not in the result."""
        if not row_ids:
            return {}
        statement = self._owned(user_id).where(self._column(self.id_column).in_(row_ids))
        rows = (await self._session.execute(statement)).scalars()
        return {getattr(row, self.id_column): row for row in rows}

    async def add(self, user_id: UserId, row: ModelT) -> ModelT:
        """Inserts a row for `user_id`, and only for it: a client chooses an id, never an owner.

        INV-16.
        """
        if getattr(row, self.owner_column) != user_id:
            raise ValueError(
                f"a {self.model.__name__} may only be added for the user it belongs to"
            )
        self._session.add(row)
        await self._session.flush()
        return row

    @staticmethod
    def touch(row: SyncColumns, now: datetime) -> None:
        """Marks a sync root as changed (03 §11): a new `updated_at`, the next `sync_version`."""
        row.updated_at = now
        row.sync_version = row.sync_version + 1
