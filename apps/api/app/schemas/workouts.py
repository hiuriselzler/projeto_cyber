"""Request and response bodies for /api/v1/workouts — the minimum task 003 needs; task 004 extends
them."""

import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import AwareDatetime, BaseModel, Field, StringConstraints

from app.schemas.common import StrictModel, TimeZone

WorkoutSource = Literal["manual", "plan", "routine"]


class WorkoutCreate(StrictModel):
    id: uuid.UUID
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    started_at: AwareDatetime
    local_date: date
    tz: TimeZone
    source: WorkoutSource = "manual"
    notes: Annotated[str, Field(max_length=10_000)] | None = None


class WorkoutResponse(BaseModel):
    id: uuid.UUID
    title: str
    started_at: datetime
    ended_at: datetime | None
    local_date: date
    tz: str
    source: WorkoutSource
    notes: str | None
