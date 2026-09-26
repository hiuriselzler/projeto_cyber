"""Shapes shared by every request and response body."""

from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AfterValidator, AwareDatetime, BaseModel, ConfigDict, Field


class StrictModel(BaseModel):
    """Every request body forbids fields it does not name: no mass assignment (04 §5)."""

    model_config = ConfigDict(extra="forbid")


class ErrorResponse(BaseModel):
    error: str


def _iana_time_zone(value: str) -> str:
    try:
        ZoneInfo(value)
    except (ZoneInfoNotFoundError, ValueError):
        raise ValueError("not an IANA time zone") from None
    return value


TimeZone = Annotated[str, Field(min_length=1, max_length=64), AfterValidator(_iana_time_zone)]


class SyncStamps(StrictModel):
    """A row's sync timestamps, as the client wrote them (02 §7, task 004 stage 8). The server
    compares `updated_at` as sent — a newer copy wins, an equal or older one changes nothing — and
    archives by `deleted_at`, never by deleting (INV-11)."""

    created_at: AwareDatetime
    updated_at: AwareDatetime
    deleted_at: AwareDatetime | None = None


# The column types' own limits, so a value Postgres would refuse is a 422 here and never a 500.
SMALLINT_MAX = 32_767
INTEGER_MAX = 2_147_483_647
SmallCount = Annotated[int, Field(ge=0, le=SMALLINT_MAX)]
Rir = Annotated[int, Field(ge=0, le=10)]  # INV-03: 0..10, or absent — never coerced to 0
Reps = Annotated[int, Field(ge=0, le=1000)]
Notes = Annotated[str, Field(max_length=10_000)]
