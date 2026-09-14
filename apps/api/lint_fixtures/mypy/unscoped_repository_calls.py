"""Known-bad: repository calls that forget whose rows they read (INV-15).

mypy must reject each line marked `expect`, with that error code. tests/lint proves it does.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.repositories.workouts import WorkoutRepository


async def reads_a_workout_without_a_user(session: AsyncSession, workout_id: uuid.UUID) -> None:
    workouts = WorkoutRepository(session)
    await workouts.get(workout_id)  # expect: call-arg
    await workouts.get(workout_id, workout_id)  # expect: arg-type
