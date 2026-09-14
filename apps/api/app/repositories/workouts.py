"""Workouts. Task 003 needs only a read and a write; task 004 extends this."""

from app.models.strength import Workout
from app.repositories.base import ScopedRepository


class WorkoutRepository(ScopedRepository[Workout]):
    model = Workout
