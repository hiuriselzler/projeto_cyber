"""Keyset cursors for the lists (task 004 stage 8, decision 6). Opaque to the client: it hands back
what it was given, and a cursor it made up is a 400, never a guess."""

import base64
import binascii
import uuid
from datetime import datetime
from typing import Annotated

from fastapi import Query

from app.services.errors import InvalidRequestError

Limit = Annotated[int, Query(ge=1, le=500)]


def _encode(raw: str) -> str:
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def _decode(cursor: str) -> str:
    try:
        return base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)).decode()
    except (binascii.Error, UnicodeDecodeError, ValueError):
        raise InvalidRequestError("invalid_cursor") from None


def after_cursor(last: uuid.UUID | None) -> str | None:
    """The cursor after `last`, for lists ordered by id."""
    return None if last is None else _encode(str(last))


def read_after(cursor: str | None) -> uuid.UUID | None:
    if cursor is None:
        return None
    try:
        return uuid.UUID(_decode(cursor))
    except ValueError:
        raise InvalidRequestError("invalid_cursor") from None


def before_cursor(last: tuple[datetime, uuid.UUID] | None) -> str | None:
    """The cursor before `last`, for lists ordered newest first by `(started_at, id)`."""
    if last is None:
        return None
    started_at, row_id = last
    return _encode(f"{started_at.isoformat()}|{row_id}")


def read_before(cursor: str | None) -> tuple[datetime, uuid.UUID] | None:
    if cursor is None:
        return None
    try:
        started_at, row_id = _decode(cursor).split("|")
        moment = datetime.fromisoformat(started_at)
        if moment.tzinfo is None:
            raise ValueError("a cursor's moment carries its offset")
        return moment, uuid.UUID(row_id)
    except ValueError:
        raise InvalidRequestError("invalid_cursor") from None
