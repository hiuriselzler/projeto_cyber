"""Request and response bodies for /api/v1/workouts (task 004 stage 8).

One shape for both directions: what a `PUT` sends is what a `GET` returns. Loads and distances are
JSON numbers, stored at the columns' precision — `numeric(9,4)` kilograms and `numeric(9,3)` metres
(INV-02, 03 §4) — so an imperial load typed on the phone arrives to four places, which is the grid
the column keeps.
"""

import uuid
from datetime import date
from typing import Annotated, Literal, Self

from pydantic import AwareDatetime, BaseModel, Field, StringConstraints, model_validator

from app.schemas.common import (
    INTEGER_MAX,
    SMALLINT_MAX,
    Notes,
    Reps,
    Rir,
    SmallCount,
    SyncStamps,
    TimeZone,
)

WorkoutSource = Literal["manual", "plan", "routine"]
SetType = Literal["warmup", "working", "drop", "backoff", "amrap"]
OrderIndex = Annotated[int, Field(ge=0, le=INTEGER_MAX)]


def _distinct(ids: list[uuid.UUID], what: str) -> None:
    if len(set(ids)) != len(ids):
        raise ValueError(f"{what} may appear once")


class SetDocument(SyncStamps):
    id: uuid.UUID
    set_index: Annotated[int, Field(ge=1, le=SMALLINT_MAX)]
    set_type: SetType = "working"
    weight_kg: Annotated[float, Field(ge=0, le=99_999.9999, allow_inf_nan=False)] | None = None
    reps: Reps | None = None
    rir: Rir | None = None  # INV-03: absent is "not recorded", never 0
    distance_m: Annotated[float, Field(ge=0, le=999_999.999, allow_inf_nan=False)] | None = None
    duration_s: Annotated[int, Field(ge=0, le=INTEGER_MAX)] | None = None
    is_completed: bool = False
    completed_at: AwareDatetime | None = None
    planned_set_id: uuid.UUID | None = None


class WorkoutExerciseDocument(SyncStamps):
    id: uuid.UUID
    exercise_id: uuid.UUID
    order_index: OrderIndex
    superset_group: SmallCount | None = None
    notes: Notes | None = None
    planned_exercise_id: uuid.UUID | None = None
    rest_seconds: SmallCount | None = None
    target_min_reps: Reps | None = None
    target_max_reps: Reps | None = None
    target_rir: Rir | None = None
    sets: Annotated[list[SetDocument], Field(max_length=100, default_factory=list)]

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        if (
            self.target_min_reps is not None
            and self.target_max_reps is not None
            and self.target_max_reps < self.target_min_reps
        ):
            raise ValueError("target_max_reps must not be below target_min_reps")
        _distinct([one.id for one in self.sets], "a set")
        return self


class WorkoutDocument(SyncStamps):
    """A workout, its exercise entries and their sets. A row left out is kept, not removed:
    archiving travels as its `deleted_at` (02 §7, INV-11). `local_date` and `tz` are the day and
    zone it was recorded in, stored as facts (INV-17)."""

    routine_id: uuid.UUID | None = None
    planned_session_id: uuid.UUID | None = None
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    started_at: AwareDatetime
    ended_at: AwareDatetime | None = None  # null while in progress (INV-09)
    local_date: date
    tz: TimeZone
    notes: Notes | None = None
    # A user annotation, never RPE and never an engine input (INV-03).
    perceived_fatigue: Annotated[int, Field(ge=1, le=10)] | None = None
    source: WorkoutSource = "manual"
    exercises: Annotated[list[WorkoutExerciseDocument], Field(max_length=100, default_factory=list)]

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        if self.ended_at is not None and self.ended_at < self.started_at:
            raise ValueError("ended_at must not be before started_at")
        _distinct([entry.id for entry in self.exercises], "an exercise entry")
        _distinct([one.id for entry in self.exercises for one in entry.sets], "a set")
        return self


class WorkoutResponse(WorkoutDocument):
    id: uuid.UUID


class WorkoutSummary(SyncStamps):
    """A workout in a list, without its exercises."""

    id: uuid.UUID
    routine_id: uuid.UUID | None
    planned_session_id: uuid.UUID | None
    title: str
    started_at: AwareDatetime
    ended_at: AwareDatetime | None
    local_date: date
    tz: str
    notes: str | None
    perceived_fatigue: int | None
    source: WorkoutSource


class WorkoutPage(BaseModel):
    items: list[WorkoutSummary]
    next: str | None
