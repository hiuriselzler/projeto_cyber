"""Routines and their exercises (03 §3, task 004 stage 8). Every query is the user's own
(INV-15)."""

import uuid

from app.core.scope import UserId
from app.models.strength import Routine, RoutineExercise
from app.repositories.base import ScopedRepository


class RoutineRepository(ScopedRepository[Routine]):
    model = Routine

    async def list_owned(
        self,
        user_id: UserId,
        *,
        after: uuid.UUID | None,
        limit: int,
        include_archived: bool,
    ) -> list[Routine]:
        """The user's routines by id, a page at a time."""
        statement = self._owned(user_id)
        if after is not None:
            statement = statement.where(Routine.id > after)
        if not include_archived:
            statement = statement.where(Routine.deleted_at.is_(None))
        statement = statement.order_by(Routine.id).limit(limit)
        return list((await self._session.execute(statement)).scalars())


class RoutineExerciseRepository(ScopedRepository[RoutineExercise]):
    model = RoutineExercise

    async def of_routine(self, user_id: UserId, routine_id: uuid.UUID) -> list[RoutineExercise]:
        """Every entry of a routine, archived ones included, in order."""
        statement = (
            self._owned(user_id)
            .where(RoutineExercise.routine_id == routine_id)
            .order_by(RoutineExercise.order_index, RoutineExercise.id)
        )
        return list((await self._session.execute(statement)).scalars())
