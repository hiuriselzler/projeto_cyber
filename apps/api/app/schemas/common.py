"""Shapes shared by every request and response body."""

from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AfterValidator, BaseModel, ConfigDict, Field


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
