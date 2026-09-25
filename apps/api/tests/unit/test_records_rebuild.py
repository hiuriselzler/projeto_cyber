"""The `personal_records` rebuild's mapping (task 004 stage 7): the core decides every record; this
checks that each lands on the row that set it, dated, keyed, and rounded to what the column keeps.
"""

import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from itertools import count

from app.core.scope import UserId
from app.jobs.rebuild_records import parse_user_id
from app.models.strength import PersonalRecord
from app.repositories.strength_history import FinishedSet
from app.services.records import records_of

USER = UserId(uuid.uuid4())
BENCH = uuid.uuid4()
PULL_UP = uuid.uuid4()
NOW = datetime(2026, 9, 25, 12, 0, tzinfo=UTC)


def _set(
    workout: uuid.UUID,
    *,
    exercise: uuid.UUID = BENCH,
    weight: float | None = 100.0,
    reps: int | None = 5,
    rir: int | None = 2,
    set_type: str = "working",
    completed_at: datetime | None = None,
    ended_at: datetime = NOW,
    **extra: object,
) -> FinishedSet:
    fields: dict[str, object] = {
        "exercise_id": exercise,
        "workout_id": workout,
        "set_log_id": uuid.uuid4(),
        "set_type": set_type,
        "is_completed": True,
        "weight_kg": weight,
        "reps": reps,
        "rir": rir,
        "uses_bodyweight": False,
        "body_weight_kg": None,
        "is_deload": False,
        "completed_at": completed_at,
        "ended_at": ended_at,
    }
    fields.update(extra)
    return FinishedSet(**fields)  # type: ignore[arg-type]


def _ids() -> Callable[[], uuid.UUID]:
    counter = count(1)
    return lambda: uuid.UUID(int=next(counter))


def _by_kind(rows: list[PersonalRecord]) -> dict[tuple[str, Decimal | None], PersonalRecord]:
    return {(row.kind, row.weight_kg): row for row in rows}


def test_each_record_points_at_the_set_that_set_it_and_is_dated_by_it():
    first, second = uuid.uuid4(), uuid.uuid4()
    earlier = NOW - timedelta(days=3)
    warmup = _set(first, weight=140.0, set_type="warmup", completed_at=earlier)
    working = _set(first, completed_at=earlier + timedelta(minutes=5), ended_at=earlier)
    heavier = _set(second, weight=110.0, reps=3, rir=None, completed_at=NOW)

    rows = records_of([warmup, working, heavier], user_id=USER, computed_at=NOW, new_id=_ids())
    found = _by_kind(rows)

    heaviest = found[("max_weight", Decimal("110.0000"))]
    assert heaviest.set_log_id == heavier.set_log_id
    assert heaviest.workout_id == second
    assert heaviest.achieved_at == NOW
    # The warm-up was the heaviest thing lifted and holds nothing (INV-04).
    assert all(row.set_log_id != warmup.set_log_id for row in rows)
    # 110 x 3 had no RIR, so the e1RM stays with the first workout (INV-07).
    e1rm = next(row for row in rows if row.kind == "best_e1rm")
    assert e1rm.set_log_id == working.set_log_id
    assert e1rm.achieved_at == earlier + timedelta(minutes=5)
    assert e1rm.value == Decimal("123.3333")  # 100 x (1 + 7/30), to the column's four places


def test_a_session_volume_belongs_to_the_workout_and_is_dated_by_its_end():
    workout = uuid.uuid4()
    rows = records_of([_set(workout, ended_at=NOW)], user_id=USER, computed_at=NOW)
    volume = next(row for row in rows if row.kind == "best_session_volume")
    assert volume.set_log_id is None
    assert volume.workout_id == workout
    assert volume.achieved_at == NOW
    assert volume.weight_kg is None
    assert volume.value == Decimal("500.0000")


def test_one_reps_record_per_load_each_with_its_load_as_the_key_needs():
    workout = uuid.uuid4()
    rows = records_of(
        [_set(workout, weight=100.0, reps=5), _set(workout, weight=80.0, reps=10)],
        user_id=USER,
        computed_at=NOW,
    )
    reps = [(row.weight_kg, row.reps) for row in rows if row.kind == "max_reps_at_weight"]
    assert reps == [(Decimal("80.0000"), 10), (Decimal("100.0000"), 5)]


def test_a_later_tie_leaves_the_record_where_it_was_first_set():
    first, second = uuid.uuid4(), uuid.uuid4()
    original = _set(first)
    tie = _set(second)
    rows = records_of([original, tie], user_id=USER, computed_at=NOW)
    assert {row.workout_id for row in rows} == {first}


def test_exercises_are_folded_separately_and_a_bodyweight_load_includes_the_lifter():
    workout = uuid.uuid4()
    rows = records_of(
        [
            _set(workout, exercise=BENCH),
            _set(workout, exercise=PULL_UP, weight=20.0, uses_bodyweight=True, body_weight_kg=80.0),
        ],
        user_id=USER,
        computed_at=NOW,
    )
    pull_up = [row for row in rows if row.exercise_id == PULL_UP and row.kind == "max_weight"]
    assert [row.value for row in pull_up] == [Decimal("100.0000")]
    assert all(row.user_id == USER and row.computed_at == NOW for row in rows)


def test_a_deload_sets_nothing():
    rows = records_of([_set(uuid.uuid4(), is_deload=True)], user_id=USER, computed_at=NOW)
    assert rows == []


def test_the_command_takes_exactly_one_user_id():
    user = uuid.uuid4()
    assert parse_user_id([str(user)]) == user
    assert parse_user_id([]) is None
    assert parse_user_id(["not-a-uuid"]) is None
    assert parse_user_id([str(user), str(user)]) is None
