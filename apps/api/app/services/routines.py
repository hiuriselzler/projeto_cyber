"""Routines over the API — task 004 stage 8, decision 1.

A `PUT` carries the routine and its exercises as one document, applied in one transaction. Each row
resolves by itself (`app.services.upserts`): the routine and each of its exercises is a sync root of
its own (03 §11), so a stale routine name never holds back a newer target on one of its exercises,
and an exercise missing from the document is left as it is rather than removed.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.db import user_transaction
from app.core.scope import Principal, UserId
from app.models.strength import Routine, RoutineExercise
from app.repositories.exercises import ExerciseRepository
from app.repositories.routines import RoutineExerciseRepository, RoutineRepository
from app.repositories.writes import check_positions_now, defer_position_checks
from app.services.errors import ConflictError, NotFoundError, UnprocessableError
from app.services.upserts import (
    Resolution,
    Stamps,
    refusal,
    resolve,
    stamp_created,
    stamp_updated,
)


@dataclass(frozen=True)
class RoutineExerciseDoc:
    id: uuid.UUID
    exercise_id: uuid.UUID
    order_index: int
    superset_group: int | None
    target_sets: int | None
    target_min_reps: int | None
    target_max_reps: int | None
    target_rir: int | None
    rest_seconds: int | None
    notes: str | None
    stamps: Stamps


@dataclass(frozen=True)
class RoutineDoc:
    id: uuid.UUID
    name: str
    notes: str | None
    folder: str | None
    order_index: int
    stamps: Stamps
    exercises: tuple[RoutineExerciseDoc, ...]


@dataclass(frozen=True)
class RoutinePage:
    """Routines without their exercises: a list, not a set of documents."""

    items: tuple[RoutineDoc, ...]
    next_after: uuid.UUID | None


def _routine_values(doc: RoutineDoc) -> dict[str, object]:
    return {
        "name": doc.name,
        "notes": doc.notes,
        "folder": doc.folder,
        "order_index": doc.order_index,
    }


def _entry_values(doc: RoutineExerciseDoc) -> dict[str, object]:
    return {
        "exercise_id": doc.exercise_id,
        "order_index": doc.order_index,
        "superset_group": doc.superset_group,
        "target_sets": doc.target_sets,
        "target_min_reps": doc.target_min_reps,
        "target_max_reps": doc.target_max_reps,
        "target_rir": doc.target_rir,
        "rest_seconds": doc.rest_seconds,
        "notes": doc.notes,
    }


def _routine_doc(row: Routine, entries: list[RoutineExercise]) -> RoutineDoc:
    return RoutineDoc(
        id=row.id,
        name=row.name,
        notes=row.notes,
        folder=row.folder,
        order_index=row.order_index,
        stamps=Stamps(row.created_at, row.updated_at, row.deleted_at),
        exercises=tuple(
            RoutineExerciseDoc(
                id=entry.id,
                exercise_id=entry.exercise_id,
                order_index=entry.order_index,
                superset_group=entry.superset_group,
                target_sets=entry.target_sets,
                target_min_reps=entry.target_min_reps,
                target_max_reps=entry.target_max_reps,
                target_rir=entry.target_rir,
                rest_seconds=entry.rest_seconds,
                notes=entry.notes,
                stamps=Stamps(entry.created_at, entry.updated_at, entry.deleted_at),
            )
            for entry in entries
        ),
    )


class RoutineService:
    def __init__(self, sessions: async_sessionmaker[AsyncSession]) -> None:
        self._sessions = sessions

    async def list(
        self,
        principal: Principal,
        *,
        after: uuid.UUID | None,
        limit: int,
        include_archived: bool,
    ) -> RoutinePage:
        async with user_transaction(self._sessions, principal.user_id) as session:
            rows = await RoutineRepository(session).list_owned(
                principal.user_id, after=after, limit=limit, include_archived=include_archived
            )
        items = tuple(_routine_doc(row, []) for row in rows)
        return RoutinePage(items, items[-1].id if len(items) == limit else None)

    async def get(self, principal: Principal, routine_id: uuid.UUID) -> RoutineDoc:
        async with user_transaction(self._sessions, principal.user_id) as session:
            found = await _read(session, principal.user_id, routine_id)
        if found is None:
            raise NotFoundError
        return found

    async def put(self, principal: Principal, doc: RoutineDoc) -> tuple[RoutineDoc, bool]:
        """Applies the document row by row; returns the routine as stored and whether it was
        created."""
        user_id = principal.user_id
        async with user_transaction(self._sessions, user_id) as session:
            await defer_position_checks(session)
            exercise_ids = {entry.exercise_id for entry in doc.exercises}
            visible = await ExerciseRepository(session).tracking_of(user_id, exercise_ids)
            if visible.keys() != exercise_ids:
                raise UnprocessableError("reference_unknown")
            routines = RoutineRepository(session)
            entries = RoutineExerciseRepository(session)
            stored = await routines.get(user_id, doc.id)
            resolution = resolve(stored, doc.stamps)
            try:
                if resolution is Resolution.CREATE:
                    row = Routine(id=doc.id, user_id=user_id, **_routine_values(doc))
                    stamp_created(row, doc.stamps)
                    await routines.add(user_id, row)
                elif resolution is Resolution.UPDATE and stored is not None:
                    for name, value in _routine_values(doc).items():
                        setattr(stored, name, value)
                    stamp_updated(stored, doc.stamps)
                existing = await entries.get_many(user_id, [entry.id for entry in doc.exercises])
                for entry in doc.exercises:
                    held = existing.get(entry.id)
                    if held is not None and held.routine_id != doc.id:
                        # A child never moves between parents: two routines claiming one entry is
                        # a client bug, and answering it is better than choosing.
                        raise ConflictError("parent_mismatch")
                    child = resolve(held, entry.stamps)
                    if child is Resolution.CREATE:
                        new = RoutineExercise(
                            id=entry.id, user_id=user_id, routine_id=doc.id, **_entry_values(entry)
                        )
                        stamp_created(new, entry.stamps)
                        await entries.add(user_id, new)
                    elif child is Resolution.UPDATE and held is not None:
                        for name, value in _entry_values(entry).items():
                            setattr(held, name, value)
                        stamp_updated(held, entry.stamps)
                await check_positions_now(session)
            except IntegrityError as error:
                raise refusal(error) from None
            found = await _read(session, user_id, doc.id)
        if found is None:  # unreachable: written, or already the user's, in this very transaction
            raise NotFoundError
        return found, resolution is Resolution.CREATE


async def _read(session: AsyncSession, user_id: UserId, routine_id: uuid.UUID) -> RoutineDoc | None:
    row = await RoutineRepository(session).get(user_id, routine_id)
    if row is None:
        return None
    entries = await RoutineExerciseRepository(session).of_routine(user_id, routine_id)
    return _routine_doc(row, entries)
