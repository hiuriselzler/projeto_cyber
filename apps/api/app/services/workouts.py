"""Workouts, as far as task 003 needs them: one logged, one read — ownership proven on a real route.

Task 004 builds the rest. Logging is idempotent by the client's id (INV-16): sending the same
workout twice returns the one already stored.
"""

import uuid
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.clock import Clock
from app.core.db import user_transaction
from app.core.scope import Principal
from app.models.strength import Workout
from app.repositories.workouts import WorkoutRepository
from app.services.errors import ConflictError, NotFoundError, UnauthenticatedError

# Postgres's SQLSTATE for a reference to a row that does not exist.
FOREIGN_KEY_VIOLATION = "23503"


@dataclass(frozen=True)
class NewWorkout:
    id: uuid.UUID
    title: str
    started_at: datetime
    local_date: date
    tz: str
    source: str
    notes: str | None


@dataclass(frozen=True)
class LoggedWorkout:
    id: uuid.UUID
    title: str
    started_at: datetime
    ended_at: datetime | None
    local_date: date
    tz: str
    source: str
    notes: str | None
    created: bool = False


class WorkoutService:
    def __init__(self, sessions: async_sessionmaker[AsyncSession], *, clock: Clock) -> None:
        self._sessions = sessions
        self._clock = clock

    async def log(self, principal: Principal, workout: NewWorkout) -> LoggedWorkout:
        now = self._clock()
        async with user_transaction(self._sessions, principal.user_id) as session:
            workouts = WorkoutRepository(session)
            existing = await workouts.get(principal.user_id, workout.id)
            if existing is not None:
                return _logged(existing, created=False)
            row = Workout(
                id=workout.id,
                user_id=principal.user_id,
                title=workout.title,
                started_at=workout.started_at,
                local_date=workout.local_date,
                tz=workout.tz,
                notes=workout.notes,
                source=workout.source,
                created_at=now,
                updated_at=now,
                sync_version=1,
            )
            try:
                await workouts.add(principal.user_id, row)
            except IntegrityError as error:
                if getattr(error.orig, "sqlstate", None) == FOREIGN_KEY_VIOLATION:
                    # The account itself is gone — deleted while this access token still had
                    # minutes to run (task 019). The device is signed out, not told of a conflict.
                    raise UnauthenticatedError from None
                # The id belongs to a row this user cannot see. Said as a conflict, never as whose
                # it is.
                raise ConflictError("id_unavailable") from None
            return _logged(row, created=True)

    async def get(self, principal: Principal, workout_id: uuid.UUID) -> LoggedWorkout:
        async with user_transaction(self._sessions, principal.user_id) as session:
            row = await WorkoutRepository(session).get(principal.user_id, workout_id)
            if row is None:
                raise NotFoundError
            return _logged(row, created=False)


def _logged(row: Workout, *, created: bool) -> LoggedWorkout:
    return LoggedWorkout(
        id=row.id,
        title=row.title,
        started_at=row.started_at,
        ended_at=row.ended_at,
        local_date=row.local_date,
        tz=row.tz,
        source=row.source,
        notes=row.notes,
        created=created,
    )
