"""Workouts, their exercise entries and their sets (03 §4). Every query is the user's own
(INV-15)."""

import uuid
from collections.abc import Collection
from datetime import datetime

from sqlalchemy import and_, or_

from app.core.scope import UserId
from app.models.strength import SetLog, Workout, WorkoutExercise
from app.repositories.base import ScopedRepository


class WorkoutRepository(ScopedRepository[Workout]):
    model = Workout

    async def list_newest_first(
        self,
        user_id: UserId,
        *,
        before: tuple[datetime, uuid.UUID] | None,
        limit: int,
        include_archived: bool,
    ) -> list[Workout]:
        """The user's workouts, newest start first, a page at a time. `before` is the last row of
        the previous page — a keyset on `(started_at, id)`, so two workouts started in the same
        instant are neither repeated nor skipped."""
        statement = self._owned(user_id)
        if before is not None:
            started_at, workout_id = before
            statement = statement.where(
                or_(
                    Workout.started_at < started_at,
                    and_(Workout.started_at == started_at, Workout.id < workout_id),
                )
            )
        if not include_archived:
            statement = statement.where(Workout.deleted_at.is_(None))
        statement = statement.order_by(Workout.started_at.desc(), Workout.id.desc()).limit(limit)
        return list((await self._session.execute(statement)).scalars())


class WorkoutExerciseRepository(ScopedRepository[WorkoutExercise]):
    model = WorkoutExercise

    async def of_workout(self, user_id: UserId, workout_id: uuid.UUID) -> list[WorkoutExercise]:
        """Every entry of a workout, archived ones included, in order."""
        statement = (
            self._owned(user_id)
            .where(WorkoutExercise.workout_id == workout_id)
            .order_by(WorkoutExercise.order_index, WorkoutExercise.id)
        )
        return list((await self._session.execute(statement)).scalars())


class SetLogRepository(ScopedRepository[SetLog]):
    model = SetLog

    async def of_entries(self, user_id: UserId, entry_ids: Collection[uuid.UUID]) -> list[SetLog]:
        """Every set of these exercise entries, archived ones included, in order."""
        if not entry_ids:
            return []
        statement = (
            self._owned(user_id)
            .where(SetLog.workout_exercise_id.in_(entry_ids))
            .order_by(SetLog.workout_exercise_id, SetLog.set_index, SetLog.id)
        )
        return list((await self._session.execute(statement)).scalars())
