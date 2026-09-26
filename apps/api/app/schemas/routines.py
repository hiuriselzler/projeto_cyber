"""Request and response bodies for /api/v1/routines (task 004 stage 8).

One shape for both directions: what a `PUT` sends is what a `GET` returns, so a document read from
the server can be edited and sent back as it is.
"""

import uuid
from typing import Annotated, Self

from pydantic import BaseModel, Field, StringConstraints, model_validator

from app.schemas.common import INTEGER_MAX, SMALLINT_MAX, Notes, Reps, Rir, SmallCount, SyncStamps

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
OrderIndex = Annotated[int, Field(ge=0, le=INTEGER_MAX)]


class RoutineExerciseDocument(SyncStamps):
    id: uuid.UUID
    exercise_id: uuid.UUID
    order_index: OrderIndex
    superset_group: SmallCount | None = None  # same value = supersetted together (FR-2.6)
    target_sets: Annotated[int, Field(ge=1, le=SMALLINT_MAX)] | None = None
    target_min_reps: Reps | None = None
    target_max_reps: Reps | None = None
    target_rir: Rir | None = None
    rest_seconds: SmallCount | None = None  # null is no rest timer, never an invented default
    notes: Notes | None = None

    @model_validator(mode="after")
    def _rep_range(self) -> Self:
        if (
            self.target_min_reps is not None
            and self.target_max_reps is not None
            and self.target_max_reps < self.target_min_reps
        ):
            raise ValueError("target_max_reps must not be below target_min_reps")
        return self


class RoutineDocument(SyncStamps):
    """A routine and its exercises. An exercise left out is kept, not removed: archiving travels
    as its `deleted_at` (02 §7, INV-11)."""

    name: Name
    notes: Notes | None = None
    folder: Annotated[str, Field(max_length=200)] | None = None
    order_index: OrderIndex = 0
    exercises: Annotated[list[RoutineExerciseDocument], Field(max_length=100, default_factory=list)]

    @model_validator(mode="after")
    def _distinct_ids(self) -> Self:
        ids = [entry.id for entry in self.exercises]
        if len(set(ids)) != len(ids):
            raise ValueError("an exercise entry may appear once")
        return self


class RoutineResponse(RoutineDocument):
    id: uuid.UUID


class RoutineSummary(SyncStamps):
    """A routine in a list, without its exercises."""

    id: uuid.UUID
    name: str
    notes: str | None
    folder: str | None
    order_index: int


class RoutinePage(BaseModel):
    items: list[RoutineSummary]
    next: str | None
