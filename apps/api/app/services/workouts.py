"""Workouts over the API — task 004 stage 8, decisions 1, 2 and 4.

A `PUT /workouts/{id}` carries the workout, its exercise entries and their sets as one document,
applied in one transaction. Each row resolves by itself (`app.services.upserts`): all three are sync
roots of their own (03 §11), so a row missing from the document is never dropped — 02 §7's rule that
a set present on either side survives — and removal travels as `deleted_at` (INV-11).

Two rules the document must meet before anything is written:

- **A completed set holds its tracking mode's measure** (03 §4): reps, a time or a distance. The
  rule is the core's `missing_for_completion`, the same function the phone's ✓ asks, so the device
  and the server cannot disagree about it (decision 2). The answer names the field:
  `set_missing_reps`, `set_missing_duration_s`, `set_missing_distance_m`.
- **Every exercise is one the user can see** — a global or their own. The visibility trigger would
  refuse the others anyway (ADR-013); asking first is how the mode above can be known at all.

**The records cache is rebuilt in the same transaction** (decision 4) when the write changed
anything of a workout that is finished, or was: only the exercises the workout held before and after
the write, because records are per exercise. The user's writes are serialised by an advisory lock
first, since the rebuild deletes and re-inserts and two at once would collide on its unique indexes.
"""

import uuid
from dataclasses import dataclass
from datetime import date, datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.clock import Clock
from app.core.db import user_transaction
from app.core.scope import Principal, UserId
from app.domain.strength import SetEntry, Tracking, missing_for_completion
from app.models.strength import SetLog, Workout, WorkoutExercise
from app.repositories.exercises import ExerciseRepository
from app.repositories.workouts import (
    SetLogRepository,
    WorkoutExerciseRepository,
    WorkoutRepository,
)
from app.repositories.writes import (
    check_positions_now,
    defer_position_checks,
    serialise_user_writes,
)
from app.services.errors import ConflictError, NotFoundError, UnprocessableError
from app.services.records import rebuild_records
from app.services.upserts import (
    Resolution,
    Stamps,
    refusal,
    resolve,
    stamp_created,
    stamp_updated,
)


@dataclass(frozen=True)
class SetDoc:
    id: uuid.UUID
    set_index: int
    set_type: str
    weight_kg: float | None
    reps: int | None
    rir: int | None
    distance_m: float | None
    duration_s: int | None
    is_completed: bool
    completed_at: datetime | None
    planned_set_id: uuid.UUID | None
    stamps: Stamps


@dataclass(frozen=True)
class WorkoutExerciseDoc:
    id: uuid.UUID
    exercise_id: uuid.UUID
    order_index: int
    superset_group: int | None
    notes: str | None
    planned_exercise_id: uuid.UUID | None
    rest_seconds: int | None
    target_min_reps: int | None
    target_max_reps: int | None
    target_rir: int | None
    stamps: Stamps
    sets: tuple[SetDoc, ...]


@dataclass(frozen=True)
class WorkoutDoc:
    id: uuid.UUID
    routine_id: uuid.UUID | None
    planned_session_id: uuid.UUID | None
    title: str
    started_at: datetime
    ended_at: datetime | None
    local_date: date
    tz: str
    notes: str | None
    perceived_fatigue: int | None
    source: str
    stamps: Stamps
    exercises: tuple[WorkoutExerciseDoc, ...]


@dataclass(frozen=True)
class WorkoutPage:
    """Workouts without their exercises, newest first."""

    items: tuple[WorkoutDoc, ...]
    next_before: tuple[datetime, uuid.UUID] | None


def _workout_values(doc: WorkoutDoc) -> dict[str, object]:
    return {
        "routine_id": doc.routine_id,
        "planned_session_id": doc.planned_session_id,
        "title": doc.title,
        "started_at": doc.started_at,
        "ended_at": doc.ended_at,
        "local_date": doc.local_date,
        "tz": doc.tz,
        "notes": doc.notes,
        "perceived_fatigue": doc.perceived_fatigue,
        "source": doc.source,
    }


def _entry_values(doc: WorkoutExerciseDoc) -> dict[str, object]:
    return {
        "exercise_id": doc.exercise_id,
        "order_index": doc.order_index,
        "superset_group": doc.superset_group,
        "notes": doc.notes,
        "planned_exercise_id": doc.planned_exercise_id,
        "rest_seconds": doc.rest_seconds,
        "target_min_reps": doc.target_min_reps,
        "target_max_reps": doc.target_max_reps,
        "target_rir": doc.target_rir,
    }


def _set_values(doc: SetDoc) -> dict[str, object]:
    return {
        "set_index": doc.set_index,
        "set_type": doc.set_type,
        "weight_kg": doc.weight_kg,
        "reps": doc.reps,
        "rir": doc.rir,
        "distance_m": doc.distance_m,
        "duration_s": doc.duration_s,
        "is_completed": doc.is_completed,
        "completed_at": doc.completed_at,
        "planned_set_id": doc.planned_set_id,
    }


def _stamps(row: Workout | WorkoutExercise | SetLog) -> Stamps:
    return Stamps(row.created_at, row.updated_at, row.deleted_at)


def _optional_float(value: object) -> float | None:
    return None if value is None else float(str(value))


def _workout_doc(row: Workout, entries: list[WorkoutExercise], sets: list[SetLog]) -> WorkoutDoc:
    by_entry: dict[uuid.UUID, list[SetLog]] = {}
    for one in sets:
        by_entry.setdefault(one.workout_exercise_id, []).append(one)
    return WorkoutDoc(
        id=row.id,
        routine_id=row.routine_id,
        planned_session_id=row.planned_session_id,
        title=row.title,
        started_at=row.started_at,
        ended_at=row.ended_at,
        local_date=row.local_date,
        tz=row.tz,
        notes=row.notes,
        perceived_fatigue=row.perceived_fatigue,
        source=row.source,
        stamps=_stamps(row),
        exercises=tuple(
            WorkoutExerciseDoc(
                id=entry.id,
                exercise_id=entry.exercise_id,
                order_index=entry.order_index,
                superset_group=entry.superset_group,
                notes=entry.notes,
                planned_exercise_id=entry.planned_exercise_id,
                rest_seconds=entry.rest_seconds,
                target_min_reps=entry.target_min_reps,
                target_max_reps=entry.target_max_reps,
                target_rir=entry.target_rir,
                stamps=_stamps(entry),
                sets=tuple(
                    SetDoc(
                        id=one.id,
                        set_index=one.set_index,
                        set_type=one.set_type,
                        weight_kg=_optional_float(one.weight_kg),
                        reps=one.reps,
                        rir=one.rir,
                        distance_m=_optional_float(one.distance_m),
                        duration_s=one.duration_s,
                        is_completed=one.is_completed,
                        completed_at=one.completed_at,
                        planned_set_id=one.planned_set_id,
                        stamps=_stamps(one),
                    )
                    for one in by_entry.get(entry.id, [])
                ),
            )
            for entry in entries
        ),
    )


def _check_completion(doc: WorkoutDoc, tracking: dict[uuid.UUID, str]) -> None:
    """03 §4 through the core: a live, completed set must hold what its exercise's mode needs."""
    for entry in doc.exercises:
        mode = Tracking.from_name(tracking[entry.exercise_id])
        for one in entry.sets:
            if not one.is_completed or one.stamps.deleted_at is not None:
                continue
            missing = missing_for_completion(
                mode,
                SetEntry(reps=one.reps, duration_s=one.duration_s, distance_m=one.distance_m),
            )
            if missing is not None:
                raise UnprocessableError(f"set_missing_{missing}")


class WorkoutService:
    def __init__(self, sessions: async_sessionmaker[AsyncSession], *, clock: Clock) -> None:
        self._sessions = sessions
        self._clock = clock

    async def list(
        self,
        principal: Principal,
        *,
        before: tuple[datetime, uuid.UUID] | None,
        limit: int,
        include_archived: bool,
    ) -> WorkoutPage:
        async with user_transaction(self._sessions, principal.user_id) as session:
            rows = await WorkoutRepository(session).list_newest_first(
                principal.user_id, before=before, limit=limit, include_archived=include_archived
            )
        items = tuple(_workout_doc(row, [], []) for row in rows)
        last = items[-1] if len(items) == limit else None
        return WorkoutPage(items, None if last is None else (last.started_at, last.id))

    async def get(self, principal: Principal, workout_id: uuid.UUID) -> WorkoutDoc:
        """404 for a workout that does not exist and for somebody else's alike (04 §4)."""
        async with user_transaction(self._sessions, principal.user_id) as session:
            found = await _read(session, principal.user_id, workout_id)
        if found is None:
            raise NotFoundError
        return found

    async def put(self, principal: Principal, doc: WorkoutDoc) -> tuple[WorkoutDoc, bool]:
        """Applies the document row by row; returns the workout as stored and whether it was
        created."""
        user_id = principal.user_id
        async with user_transaction(self._sessions, user_id) as session:
            await serialise_user_writes(session, user_id)
            await defer_position_checks(session)
            exercise_ids = {entry.exercise_id for entry in doc.exercises}
            tracking = await ExerciseRepository(session).tracking_of(user_id, exercise_ids)
            if tracking.keys() != exercise_ids:
                raise UnprocessableError("reference_unknown")
            _check_completion(doc, tracking)

            workouts = WorkoutRepository(session)
            entries = WorkoutExerciseRepository(session)
            stored = await workouts.get(user_id, doc.id)
            was_finished = stored is not None and stored.ended_at is not None
            # Ids, not rows: the rows are the session's own objects, and the write below changes
            # them in place — an entry moved to another exercise would read as already moved.
            exercises_before = (
                set()
                if stored is None
                else {entry.exercise_id for entry in await entries.of_workout(user_id, doc.id)}
            )
            try:
                resolution, changed = await self._apply(session, user_id, doc, stored)
                await check_positions_now(session)
            except IntegrityError as error:
                raise refusal(error) from None

            now_finished = (
                doc.ended_at is not None if stored is None else stored.ended_at is not None
            )
            if changed and (was_finished or now_finished):
                touched = exercises_before | {
                    entry.exercise_id for entry in await entries.of_workout(user_id, doc.id)
                }
                await rebuild_records(
                    session, user_id, computed_at=self._clock(), exercise_ids=touched
                )
            found = await _read(session, user_id, doc.id)
        if found is None:  # unreachable: written, or already the user's, in this very transaction
            raise NotFoundError
        return found, resolution is Resolution.CREATE

    @staticmethod
    async def _apply(
        session: AsyncSession, user_id: UserId, doc: WorkoutDoc, stored: Workout | None
    ) -> tuple[Resolution, bool]:
        """Writes every row the document wins; returns the workout row's own resolution and whether
        any row changed."""
        workouts = WorkoutRepository(session)
        entries = WorkoutExerciseRepository(session)
        sets = SetLogRepository(session)
        changed = False

        resolution = resolve(stored, doc.stamps)
        if resolution is Resolution.CREATE:
            row = Workout(id=doc.id, user_id=user_id, **_workout_values(doc))
            stamp_created(row, doc.stamps)
            await workouts.add(user_id, row)
            changed = True
        elif resolution is Resolution.UPDATE and stored is not None:
            for name, value in _workout_values(doc).items():
                setattr(stored, name, value)
            stamp_updated(stored, doc.stamps)
            changed = True

        held_entries = await entries.get_many(user_id, [entry.id for entry in doc.exercises])
        for entry in doc.exercises:
            held = held_entries.get(entry.id)
            if held is not None and held.workout_id != doc.id:
                # A child never moves between parents: two workouts claiming one entry is a client
                # bug, and answering it is better than choosing.
                raise ConflictError("parent_mismatch")
            child = resolve(held, entry.stamps)
            if child is Resolution.CREATE:
                new = WorkoutExercise(
                    id=entry.id, user_id=user_id, workout_id=doc.id, **_entry_values(entry)
                )
                stamp_created(new, entry.stamps)
                await entries.add(user_id, new)
                changed = True
            elif child is Resolution.UPDATE and held is not None:
                for name, value in _entry_values(entry).items():
                    setattr(held, name, value)
                stamp_updated(held, entry.stamps)
                changed = True

        await session.flush()
        held_sets = await sets.get_many(
            user_id, [one.id for entry in doc.exercises for one in entry.sets]
        )
        for entry in doc.exercises:
            for one in entry.sets:
                held_set = held_sets.get(one.id)
                if held_set is not None and held_set.workout_exercise_id != entry.id:
                    raise ConflictError("parent_mismatch")
                child = resolve(held_set, one.stamps)
                if child is Resolution.CREATE:
                    new_set = SetLog(
                        id=one.id, user_id=user_id, workout_exercise_id=entry.id, **_set_values(one)
                    )
                    stamp_created(new_set, one.stamps)
                    await sets.add(user_id, new_set)
                    changed = True
                elif child is Resolution.UPDATE and held_set is not None:
                    for name, value in _set_values(one).items():
                        setattr(held_set, name, value)
                    stamp_updated(held_set, one.stamps)
                    changed = True
        return resolution, changed


async def _read(session: AsyncSession, user_id: UserId, workout_id: uuid.UUID) -> WorkoutDoc | None:
    row = await WorkoutRepository(session).get(user_id, workout_id)
    if row is None:
        return None
    entries = await WorkoutExerciseRepository(session).of_workout(user_id, workout_id)
    sets = await SetLogRepository(session).of_entries(user_id, [entry.id for entry in entries])
    return _workout_doc(row, entries, sets)
