"""Request and response bodies for /api/v1/exercises (task 004 stage 8)."""

import uuid
from typing import Annotated, Literal, Self

from pydantic import AwareDatetime, BaseModel, Field, StringConstraints, model_validator

from app.schemas.common import SMALLINT_MAX, Notes, Reps, SyncStamps

Modality = Literal["barbell", "dumbbell", "machine", "cable", "bodyweight", "band", "other"]
Tracking = Literal["weight_reps", "reps_only", "duration", "distance_duration"]
MuscleId = Annotated[int, Field(ge=1, le=SMALLINT_MAX)]


class ExerciseWrite(SyncStamps):
    """One of the user's own exercises. The name is stored exactly as typed and never translated
    (INV-27); a fork names the exercise it came from (stage 4)."""

    forked_from_id: uuid.UUID | None = None
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    modality: Modality
    primary_muscle_id: MuscleId
    secondary_muscle_ids: Annotated[list[MuscleId], Field(max_length=20, default_factory=list)]
    is_unilateral: bool = False
    tracking: Tracking = "weight_reps"
    # numeric(10,6): an imperial plate is an exact kg equivalent to six places (INV-02, 03 §2).
    load_increment_kg: Annotated[float, Field(ge=0, le=9999.999999, allow_inf_nan=False)] | None = (
        None
    )
    uses_bodyweight: bool = False
    default_min_reps: Reps | None = None
    default_max_reps: Reps | None = None
    notes: Notes | None = None

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        if (
            self.default_min_reps is not None
            and self.default_max_reps is not None
            and self.default_max_reps < self.default_min_reps
        ):
            raise ValueError("default_max_reps must not be below default_min_reps")
        if len(set(self.secondary_muscle_ids)) != len(self.secondary_muscle_ids):
            raise ValueError("secondary_muscle_ids must not repeat")
        if self.primary_muscle_id in self.secondary_muscle_ids:
            # FR-2.16: a muscle listed as both would be credited 1.2 sets per set.
            raise ValueError("the primary muscle cannot also be secondary")
        return self


class ExerciseResponse(BaseModel):
    """A global exercise carries a translation key and no name; the user's own carries a name and
    no key (INV-27). `is_own` says which."""

    id: uuid.UUID
    is_own: bool
    forked_from_id: uuid.UUID | None
    name: str | None
    name_key: str | None
    modality: Modality
    primary_muscle_id: int
    secondary_muscle_ids: list[int]
    is_unilateral: bool
    tracking: Tracking
    load_increment_kg: float | None
    uses_bodyweight: bool
    default_min_reps: int | None
    default_max_reps: int | None
    notes: str | None
    created_at: AwareDatetime
    updated_at: AwareDatetime
    deleted_at: AwareDatetime | None


class ExercisePage(BaseModel):
    items: list[ExerciseResponse]
    next: str | None
