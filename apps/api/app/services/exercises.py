"""The exercise catalog over the API — task 004 stage 8, decision 3.

Reads list the global catalog and the user's own exercises. Writes reach **only the user's own**: a
`PUT` to a global's id answers `409 id_unavailable`, exactly what a `PUT` to somebody else's id
gets, so a global and a stranger's row cannot be told apart by writing to them. Editing a global is
a fork (stage 4), and a fork arrives as an ordinary create naming `forked_from_id`. Hiding a global
is local to the device and has no form here.

The secondary muscles are a dependent of the exercise (03 §11): they travel inside its document and
change only when the exercise itself is accepted.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.db import user_transaction
from app.core.scope import Principal, UserId
from app.models.strength import Exercise
from app.repositories.exercises import ExerciseRepository
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
class ExerciseDoc:
    """One exercise as the API speaks it. On a write `name_key` is always `None` and `is_own` is
    ignored: a user's exercise has a name, exactly as typed, and never a key (INV-27)."""

    id: uuid.UUID
    forked_from_id: uuid.UUID | None
    name: str | None
    name_key: str | None
    modality: str
    primary_muscle_id: int
    secondary_muscle_ids: tuple[int, ...]
    is_unilateral: bool
    tracking: str
    load_increment_kg: float | None
    uses_bodyweight: bool
    default_min_reps: int | None
    default_max_reps: int | None
    notes: str | None
    stamps: Stamps
    is_own: bool = True


@dataclass(frozen=True)
class ExercisePage:
    items: tuple[ExerciseDoc, ...]
    next_after: uuid.UUID | None


def _values(doc: ExerciseDoc) -> dict[str, object]:
    return {
        "forked_from_id": doc.forked_from_id,
        "name": doc.name,
        "modality": doc.modality,
        "primary_muscle_id": doc.primary_muscle_id,
        "is_unilateral": doc.is_unilateral,
        "tracking": doc.tracking,
        "load_increment_kg": doc.load_increment_kg,
        "uses_bodyweight": doc.uses_bodyweight,
        "default_min_reps": doc.default_min_reps,
        "default_max_reps": doc.default_max_reps,
        "notes": doc.notes,
    }


def _doc(row: Exercise, muscles: list[int]) -> ExerciseDoc:
    return ExerciseDoc(
        id=row.id,
        forked_from_id=row.forked_from_id,
        name=row.name,
        name_key=row.name_key,
        modality=row.modality,
        primary_muscle_id=row.primary_muscle_id,
        secondary_muscle_ids=tuple(muscles),
        is_unilateral=row.is_unilateral,
        tracking=row.tracking,
        load_increment_kg=None if row.load_increment_kg is None else float(row.load_increment_kg),
        uses_bodyweight=row.uses_bodyweight,
        default_min_reps=row.default_min_reps,
        default_max_reps=row.default_max_reps,
        notes=row.notes,
        stamps=Stamps(row.created_at, row.updated_at, row.deleted_at),
        is_own=row.owner_user_id is not None,
    )


class ExerciseService:
    def __init__(self, sessions: async_sessionmaker[AsyncSession]) -> None:
        self._sessions = sessions

    async def list(
        self,
        principal: Principal,
        *,
        after: uuid.UUID | None,
        limit: int,
        include_archived: bool,
    ) -> ExercisePage:
        async with user_transaction(self._sessions, principal.user_id) as session:
            exercises = ExerciseRepository(session)
            rows = await exercises.list_visible(
                principal.user_id, after=after, limit=limit, include_archived=include_archived
            )
            muscles = await exercises.secondary_muscles(principal.user_id, [row.id for row in rows])
            items = tuple(_doc(row, muscles.get(row.id, [])) for row in rows)
        return ExercisePage(items, items[-1].id if len(items) == limit else None)

    async def get(self, principal: Principal, exercise_id: uuid.UUID) -> ExerciseDoc:
        """A global or one of the user's own; someone else's is 404, like an absent one (04 §4)."""
        async with user_transaction(self._sessions, principal.user_id) as session:
            found = await _read(session, principal.user_id, exercise_id)
        if found is None:
            raise NotFoundError
        return found

    async def put(self, principal: Principal, doc: ExerciseDoc) -> tuple[ExerciseDoc, bool]:
        """Creates or updates one of the user's own exercises; returns it as stored and whether it
        was created."""
        user_id = principal.user_id
        async with user_transaction(self._sessions, user_id) as session:
            exercises = ExerciseRepository(session)
            stored = await exercises.get_visible(user_id, doc.id)
            if stored is not None and stored.owner_user_id is None:
                raise ConflictError("id_unavailable")
            await _check_references(exercises, user_id, doc)
            resolution = resolve(stored, doc.stamps)
            try:
                if resolution is Resolution.CREATE:
                    row = Exercise(id=doc.id, owner_user_id=user_id, **_values(doc))
                    stamp_created(row, doc.stamps)
                    await exercises.add(user_id, row)
                    await exercises.add_secondary_muscles(user_id, doc.id, doc.secondary_muscle_ids)
                elif resolution is Resolution.UPDATE and stored is not None:
                    # Muscles first: the triggers refuse a primary still listed as secondary, and a
                    # secondary that is the primary, whichever is written second (FR-2.16).
                    await exercises.clear_secondary_muscles(user_id, doc.id)
                    for name, value in _values(doc).items():
                        setattr(stored, name, value)
                    stamp_updated(stored, doc.stamps)
                    await session.flush()
                    await exercises.add_secondary_muscles(user_id, doc.id, doc.secondary_muscle_ids)
                await session.flush()
            except IntegrityError as error:
                raise refusal(error) from None
            found = await _read(session, user_id, doc.id)
        if found is None:  # unreachable: written, or already the user's, in this very transaction
            raise NotFoundError
        return found, resolution is Resolution.CREATE


async def _check_references(
    exercises: ExerciseRepository, user_id: UserId, doc: ExerciseDoc
) -> None:
    """A fork must name an exercise the user can see: `forked_from_id`'s foreign key alone would
    accept somebody else's, because a reference check reads past row-level security."""
    if doc.forked_from_id is not None and (
        doc.forked_from_id == doc.id
        or await exercises.get_visible(user_id, doc.forked_from_id) is None
    ):
        raise UnprocessableError("reference_unknown")
    wanted = {doc.primary_muscle_id, *doc.secondary_muscle_ids}
    if await exercises.known_muscles(wanted) != wanted:
        raise UnprocessableError("reference_unknown")


async def _read(
    session: AsyncSession, user_id: UserId, exercise_id: uuid.UUID
) -> ExerciseDoc | None:
    exercises = ExerciseRepository(session)
    row = await exercises.get_visible(user_id, exercise_id)
    if row is None:
        return None
    muscles = await exercises.secondary_muscles(user_id, [row.id])
    return _doc(row, muscles.get(row.id, []))
