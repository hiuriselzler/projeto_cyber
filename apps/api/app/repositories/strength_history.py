"""A user's finished sets, with the two facts the core needs resolved (task 004 stage 7).

What `personal_records` is folded from — the server's twin of the device's `src/db/history.ts`, and
the same rules:

- **finished** workouts only (`ended_at` set), and nothing archived: not the set, not its exercise
  entry, not its workout (INV-11 archives rather than deletes, so a tombstone is left out);
- **body weight** is the latest `body_weight_log` entry **on or before the workout's
  `local_date`**, never today's, or every past pull-up's e1RM would move each time the user weighed
  in (INV-07, INV-17);
- **`is_deload`** is the flag of the microcycle the workout's planned session belongs to (INV-08) —
  false until task 005 writes a plan, and a real join now rather than a constant.

Unticked rows and warm-ups come through: what counts is the core's question (INV-04), never a
`WHERE` here.
"""

import uuid
from collections.abc import Collection
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.scope import UserId
from app.models.identity import BodyWeightLog
from app.models.strength import (
    Exercise,
    Microcycle,
    PlannedSession,
    SetLog,
    Workout,
    WorkoutExercise,
)


@dataclass(frozen=True)
class FinishedSet:
    exercise_id: uuid.UUID
    workout_id: uuid.UUID
    set_log_id: uuid.UUID
    set_type: str
    is_completed: bool
    weight_kg: float | None
    reps: int | None
    rir: int | None
    uses_bodyweight: bool
    body_weight_kg: float | None
    is_deload: bool
    completed_at: datetime | None
    ended_at: datetime


class StrengthHistoryRepository:
    """Reads only. Every query filters on the owner, inside that user's RLS scope (INV-15)."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def finished_sets(
        self, user_id: UserId, exercise_ids: Collection[uuid.UUID] | None = None
    ) -> list[FinishedSet]:
        """Every live set of the user's finished workouts, grouped by exercise, each exercise's
        workouts oldest first, each workout's sets in the order they were logged — the order
        `standing_records` credits the earliest by. Only `exercise_ids`' sets, when given: records
        are per exercise, so a write that touched two exercises needs those two folded again and
        nothing else (task 004 stage 8)."""
        body_weight = (
            select(BodyWeightLog.weight_kg)
            .where(
                BodyWeightLog.user_id == Workout.user_id,
                BodyWeightLog.measured_on <= Workout.local_date,
                BodyWeightLog.deleted_at.is_(None),
            )
            .order_by(BodyWeightLog.measured_on.desc())
            .limit(1)
            .correlate(Workout)
            .scalar_subquery()
        )
        statement = (
            select(
                WorkoutExercise.exercise_id,
                Workout.id,
                SetLog.id,
                SetLog.set_type,
                SetLog.is_completed,
                SetLog.weight_kg,
                SetLog.reps,
                SetLog.rir,
                Exercise.uses_bodyweight,
                body_weight,
                Microcycle.is_deload,
                SetLog.completed_at,
                Workout.ended_at,
            )
            .select_from(SetLog)
            .join(WorkoutExercise, WorkoutExercise.id == SetLog.workout_exercise_id)
            .join(Workout, Workout.id == WorkoutExercise.workout_id)
            .join(Exercise, Exercise.id == WorkoutExercise.exercise_id)
            .outerjoin(PlannedSession, PlannedSession.id == Workout.planned_session_id)
            .outerjoin(Microcycle, Microcycle.id == PlannedSession.microcycle_id)
            .where(
                Workout.user_id == user_id,
                SetLog.user_id == user_id,
                Workout.ended_at.is_not(None),
                Workout.deleted_at.is_(None),
                WorkoutExercise.deleted_at.is_(None),
                SetLog.deleted_at.is_(None),
            )
            .order_by(
                WorkoutExercise.exercise_id,
                Workout.started_at,
                Workout.id,
                WorkoutExercise.order_index,
                SetLog.set_index,
            )
        )
        if exercise_ids is not None:
            statement = statement.where(WorkoutExercise.exercise_id.in_(exercise_ids))
        rows = (await self._session.execute(statement)).all()
        return [
            FinishedSet(
                exercise_id=row[0],
                workout_id=row[1],
                set_log_id=row[2],
                set_type=row[3],
                is_completed=row[4],
                weight_kg=None if row[5] is None else float(row[5]),
                reps=row[6],
                rir=row[7],
                uses_bodyweight=row[8],
                body_weight_kg=None if row[9] is None else float(row[9]),
                is_deload=bool(row[10]),
                completed_at=row[11],
                ended_at=row[12],
            )
            for row in rows
        ]
