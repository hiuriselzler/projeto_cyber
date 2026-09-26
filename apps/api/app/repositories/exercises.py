"""The exercise catalog: the global rows everyone reads, and each user's own (03 §2, stage 8).

The one table with two kinds of row. A global has no owner (`owner_user_id IS NULL`) and is readable
by everyone; a user's own row — made or forked — is theirs alone. `ScopedRepository`'s methods see
only the user's own, so an update can never reach a global through them; the `visible` reads add the
globals for the reads and reference checks that want them. Both filter explicitly, and row-level
security's `exercises_read` policy says the same thing underneath (ADR-011).

`exercise_secondary_muscles` has no owner column of its own (ADR-013): it is scoped through its
exercise, and written only for an exercise the user owns.
"""

import uuid
from collections.abc import Collection, Sequence

from sqlalchemy import ColumnElement, delete, insert, or_, select

from app.core.scope import UserId
from app.models.strength import Exercise, ExerciseSecondaryMuscle, MuscleGroup
from app.repositories.base import ScopedRepository


class ExerciseRepository(ScopedRepository[Exercise]):
    model = Exercise
    owner_column = "owner_user_id"

    @staticmethod
    def _visible_to(user_id: UserId) -> ColumnElement[bool]:
        return or_(Exercise.owner_user_id.is_(None), Exercise.owner_user_id == user_id)

    async def get_visible(self, user_id: UserId, exercise_id: uuid.UUID) -> Exercise | None:
        """A global, or one of the user's own. Someone else's reads as absent."""
        statement = select(Exercise).where(Exercise.id == exercise_id, self._visible_to(user_id))
        return (await self._session.execute(statement)).scalar_one_or_none()

    async def list_visible(
        self,
        user_id: UserId,
        *,
        after: uuid.UUID | None,
        limit: int,
        include_archived: bool,
    ) -> list[Exercise]:
        """The globals and the user's own, by id, a page at a time."""
        statement = select(Exercise).where(self._visible_to(user_id))
        if after is not None:
            statement = statement.where(Exercise.id > after)
        if not include_archived:
            statement = statement.where(Exercise.deleted_at.is_(None))
        statement = statement.order_by(Exercise.id).limit(limit)
        return list((await self._session.execute(statement)).scalars())

    async def tracking_of(
        self, user_id: UserId, exercise_ids: Collection[uuid.UUID]
    ) -> dict[uuid.UUID, str]:
        """Each visible exercise's tracking mode, by id — archived ones included, because a set
        logged before the archive still has to be judged by its mode (INV-11)."""
        if not exercise_ids:
            return {}
        statement = select(Exercise.id, Exercise.tracking).where(
            Exercise.id.in_(exercise_ids), self._visible_to(user_id)
        )
        return {row[0]: row[1] for row in (await self._session.execute(statement)).all()}

    async def secondary_muscles(
        self, user_id: UserId, exercise_ids: Collection[uuid.UUID]
    ) -> dict[uuid.UUID, list[int]]:
        """Each visible exercise's secondary muscles, ascending."""
        if not exercise_ids:
            return {}
        statement = (
            select(ExerciseSecondaryMuscle.exercise_id, ExerciseSecondaryMuscle.muscle_group_id)
            .join(Exercise, Exercise.id == ExerciseSecondaryMuscle.exercise_id)
            .where(ExerciseSecondaryMuscle.exercise_id.in_(exercise_ids), self._visible_to(user_id))
            .order_by(ExerciseSecondaryMuscle.exercise_id, ExerciseSecondaryMuscle.muscle_group_id)
        )
        found: dict[uuid.UUID, list[int]] = {}
        for exercise_id, muscle in (await self._session.execute(statement)).all():
            found.setdefault(exercise_id, []).append(muscle)
        return found

    async def clear_secondary_muscles(self, user_id: UserId, exercise_id: uuid.UUID) -> None:
        """Removes the secondary muscles of an exercise the user owns, and of nothing else."""
        owned = select(Exercise.id).where(
            Exercise.id == exercise_id, Exercise.owner_user_id == user_id
        )
        await self._session.execute(
            delete(ExerciseSecondaryMuscle).where(ExerciseSecondaryMuscle.exercise_id.in_(owned))
        )

    async def add_secondary_muscles(
        self, user_id: UserId, exercise_id: uuid.UUID, muscle_ids: Sequence[int]
    ) -> None:
        """For an exercise the user owns; the row-level security insert policy refuses others."""
        if not muscle_ids:
            return
        owned = await self.get(user_id, exercise_id)
        if owned is None:
            raise ValueError("secondary muscles may only be written for the user's own exercise")
        await self._session.execute(
            insert(ExerciseSecondaryMuscle),
            [{"exercise_id": exercise_id, "muscle_group_id": muscle} for muscle in muscle_ids],
        )

    async def known_muscles(self, muscle_ids: Collection[int]) -> set[int]:
        """Which of `muscle_ids` exist — reference data, the same for everyone (03 §11)."""
        if not muscle_ids:
            return set()
        statement = select(MuscleGroup.id).where(MuscleGroup.id.in_(muscle_ids))
        return set((await self._session.execute(statement)).scalars())
