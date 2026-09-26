"""How one row of an aggregate write is applied — task 004 stage 8, decision 1.

Every `PUT` in `exercises/`, `routines/` and `workouts/` sends a document holding a root and its
children, and each row in it is **its own sync root** (03 §11): it resolves by itself, by 02 §7's
rule, whatever its parent does.

- **Absent → created**, with the client's timestamps. The client minted the id (INV-16) and the
  moment the row was written is the device's fact, not the server's.
- **Present, and the document's copy is newer by `updated_at` → updated.** `sync_version` moves on.
- **Present, and the document's copy is the same age or older → left exactly as it is.** A retry is
  a no-op and a stale copy loses, which is what makes every `PUT` safe to repeat.
- **Stored, and missing from the document → left as it is.** 02 §7: a set present on either side is
  never dropped. Removal travels as `deleted_at` on the row (INV-11); nothing here deletes.

`updated_at` is compared as sent. Stage 6 made it the real moment of the write on the device — a
workout logged afterwards backdates `completed_at`, never `updated_at` — so a server clock would be
the one thing here that is not a fact about the row.
"""

import enum
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.exc import IntegrityError

from app.models.base import SyncColumns
from app.services.errors import (
    ConflictError,
    ServiceError,
    UnauthenticatedError,
    UnprocessableError,
)

# Postgres's SQLSTATEs for the refusals a write can meet.
UNIQUE_VIOLATION = "23505"
FOREIGN_KEY_VIOLATION = "23503"
CHECK_VIOLATION = "23514"

# A row's reference to its owner. Violated only when the account itself is gone — deleted while the
# access token still had minutes to run (task 019) — so the device is signed out, not told of a
# conflict. Every other reference names a row the user may or may not see.
_OWNER_REFERENCES = frozenset(
    {
        "exercises_owner_user_id_fkey",
        "routines_user_id_fkey",
        "routine_exercises_user_id_fkey",
        "workouts_user_id_fkey",
        "workout_exercises_user_id_fkey",
        "set_logs_user_id_fkey",
    }
)
_POSITIONS = frozenset({"set_logs_position", "routine_exercises_order"})


@dataclass(frozen=True)
class Stamps:
    """A row's sync timestamps as the client wrote them (02 §7)."""

    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class Resolution(enum.Enum):
    CREATE = "create"
    UPDATE = "update"
    KEEP = "keep"


def resolve(stored: SyncColumns | None, stamps: Stamps) -> Resolution:
    """02 §7's last-write-wins, for one row."""
    if stored is None:
        return Resolution.CREATE
    if stamps.updated_at > stored.updated_at:
        return Resolution.UPDATE
    return Resolution.KEEP


def stamp_created(row: SyncColumns, stamps: Stamps) -> None:
    row.created_at = stamps.created_at
    row.updated_at = stamps.updated_at
    row.deleted_at = stamps.deleted_at
    row.sync_version = 1


def stamp_updated(row: SyncColumns, stamps: Stamps) -> None:
    """`created_at` stays the stored one: when a row was first written does not change."""
    row.updated_at = stamps.updated_at
    row.deleted_at = stamps.deleted_at
    row.sync_version = row.sync_version + 1


def refusal(error: IntegrityError) -> ServiceError:
    """What a constraint that refused a write means to the client, said without naming whose row
    was in the way (04 §4)."""
    sqlstate = getattr(error.orig, "sqlstate", None)
    diagnostics = getattr(error.orig, "diag", None)
    constraint = getattr(diagnostics, "constraint_name", None)
    if sqlstate == UNIQUE_VIOLATION:
        if constraint is not None and constraint.endswith("_pkey"):
            # The id is a row this user cannot see. Said as a conflict, never as whose it is.
            return ConflictError("id_unavailable")
        if constraint == "exercises_owner_name_key":
            # Stage 4: a clash with one of the user's own live names is an error on the name field,
            # never an auto-suffix.
            return UnprocessableError("name_taken")
        if constraint in _POSITIONS:
            return ConflictError("position_taken")
    if sqlstate == FOREIGN_KEY_VIOLATION:
        if constraint in _OWNER_REFERENCES:
            return UnauthenticatedError()
        # A parent, a routine or a plan row that is absent or someone else's — the composite
        # references carry the owner (ADR-013) — or an exercise the visibility trigger refused.
        return UnprocessableError("reference_unknown")
    if sqlstate == CHECK_VIOLATION:
        return UnprocessableError("invalid_row")
    raise error
