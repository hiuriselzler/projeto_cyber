"""Rebuilding a user's `personal_records` — task 004 stage 7, 03 §4, 06 §5.

The cache is a fold of the user's finished sets through the core's `standing_records()`: per
exercise, one session per workout, oldest first. **No record is decided here.** What counts
(INV-04), what a deload may not set (INV-08), what an e1RM is (INV-07) and which of two equal values
stands (the earliest; a tie is not a record) are all the core's — the same function the phone's
bests are a projection of, so the phone's celebrations and this table cannot disagree.

What this module does is the part the core cannot: map a record's session and set positions back to
the rows that set it, and date it. A set's record is dated by its `completed_at` — the chosen end
for a workout logged afterwards (stage 6) — and a session volume, which belongs to no one set, by
the workout's `ended_at`.

One user at a time, inside that user's own scope (ADR-011). Rebuilding everyone would need an
unscoped function on the allowlist, and nothing needs it until the server holds sets (task 006).
"""

import uuid
from collections.abc import Callable, Sequence
from datetime import datetime
from decimal import Decimal
from itertools import groupby

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.clock import Clock
from app.core.db import user_transaction
from app.core.scope import UserId
from app.domain.strength import LoggedSet, SetType, standing_records
from app.models.strength import PersonalRecord
from app.repositories.personal_records import PersonalRecordRepository
from app.repositories.strength_history import FinishedSet, StrengthHistoryRepository

# `value` is numeric(12,4) and `weight_kg` numeric(9,4) (03 §4). An e1RM is not a finite decimal;
# four places is what the column keeps, and rounding here, once, is what makes a second rebuild
# write the same number.
_PLACES = Decimal("0.0001")


def _stored(value: float | None) -> Decimal | None:
    return None if value is None else Decimal(repr(value)).quantize(_PLACES)


def _logged(row: FinishedSet) -> LoggedSet:
    return LoggedSet(
        set_type=SetType.from_name(row.set_type),
        is_completed=row.is_completed,
        weight_kg=row.weight_kg,
        reps=row.reps,
        rir=row.rir,
        uses_bodyweight=row.uses_bodyweight,
        body_weight_kg=row.body_weight_kg,
        is_deload=row.is_deload,
    )


def _dated(session: Sequence[FinishedSet], source: FinishedSet | None) -> datetime:
    """When a record was set: its set's `completed_at`, or the workout's end for a session total."""
    if source is None:
        return session[0].ended_at
    return source.completed_at or source.ended_at


def records_of(
    sets: Sequence[FinishedSet],
    *,
    user_id: UserId,
    computed_at: datetime,
    new_id: Callable[[], uuid.UUID] = uuid.uuid4,
) -> list[PersonalRecord]:
    """The cache rows for `sets`, which arrive grouped by exercise and, within one, oldest workout
    first — the order `StrengthHistoryRepository.finished_sets` reads them in."""
    rows: list[PersonalRecord] = []
    for exercise_id, of_exercise in groupby(sets, key=lambda row: row.exercise_id):
        sessions = [list(one) for _, one in groupby(of_exercise, key=lambda row: row.workout_id)]
        logged = [[_logged(row) for row in session] for session in sessions]
        for held in standing_records(logged):
            session = sessions[held.session_index]
            record = held.record
            source = None if record.set_index is None else session[record.set_index]
            rows.append(
                PersonalRecord(
                    id=new_id(),
                    user_id=user_id,
                    exercise_id=exercise_id,
                    kind=record.kind.name,
                    value=_stored(record.value),
                    weight_kg=_stored(record.weight_kg),
                    reps=record.reps,
                    rir=record.rir,
                    set_log_id=None if source is None else source.set_log_id,
                    workout_id=session[0].workout_id,
                    achieved_at=_dated(session, source),
                    computed_at=computed_at,
                )
            )
    return rows


class PersonalRecordsRebuild:
    def __init__(self, sessions: async_sessionmaker[AsyncSession], *, clock: Clock) -> None:
        self._sessions = sessions
        self._clock = clock

    async def rebuild(self, user_id: UserId) -> int:
        """Replaces `user_id`'s cache with what their sets say now, in one transaction, and returns
        how many records stand. Safe to repeat: a second run writes the same rows (INV-10)."""
        now = self._clock()
        async with user_transaction(self._sessions, user_id) as session:
            sets = await StrengthHistoryRepository(session).finished_sets(user_id)
            rows = records_of(sets, user_id=user_id, computed_at=now)
            await PersonalRecordRepository(session).replace_all(user_id, rows)
        return len(rows)
