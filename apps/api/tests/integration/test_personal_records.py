"""The `personal_records` rebuild against real Postgres (task 004 stage 7, 03 §4, 06 §5).

As `cyberathlete_app`, inside one user's scope: the read of finished sets — body weight on the
workout's own day, archived and unfinished rows left out — the fold through the core, and the
replacement of that user's rows and nobody else's. Plus the key migration 0007 declares.
"""

import uuid
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import pytest
from sqlalchemy import Connection, Engine, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.core.db import create_engine
from app.core.scope import UserId
from app.services.records import PersonalRecordsRebuild
from tests.integration.api_support import FakeClock
from tests.integration.builders import UserGraph, create_user_graph

pytestmark = pytest.mark.integration

TODAY = date.today()


def _workout(connection: Connection, graph: UserGraph, *, days_ago: int, ended: bool = True) -> str:
    workout_id = str(uuid.uuid4())
    connection.execute(
        text(
            """INSERT INTO workouts (id, user_id, title, started_at, ended_at, local_date, tz,
                                     source, created_at, updated_at)
               VALUES (:id, :user_id, 'Treino', now() - make_interval(days => :days),
                       CASE WHEN :ended
                            THEN now() - make_interval(days => :days) + interval '1 hour'
                       END,
                       :local_date, 'America/Sao_Paulo', 'manual', now(), now())"""
        ),
        {
            "id": workout_id,
            "user_id": str(graph.user_id),
            "days": days_ago,
            "ended": ended,
            "local_date": TODAY - timedelta(days=days_ago),
        },
    )
    return workout_id


def _sets(
    connection: Connection,
    graph: UserGraph,
    workout_id: str,
    exercise_id: uuid.UUID | str,
    sets: list[dict[str, object]],
    *,
    order: int = 0,
) -> list[str]:
    entry = str(uuid.uuid4())
    connection.execute(
        text(
            """INSERT INTO workout_exercises (id, user_id, workout_id, exercise_id, order_index,
                                              created_at, updated_at)
               VALUES (:id, :user_id, :workout_id, :exercise_id, :order, now(), now())"""
        ),
        {
            "id": entry,
            "user_id": str(graph.user_id),
            "workout_id": workout_id,
            "exercise_id": str(exercise_id),
            "order": order,
        },
    )
    ids = []
    for index, one in enumerate(sets, start=1):
        set_id = str(uuid.uuid4())
        connection.execute(
            text(
                """INSERT INTO set_logs (id, user_id, workout_exercise_id, set_index, set_type,
                                         weight_kg, reps, rir, is_completed, completed_at,
                                         created_at, updated_at)
                   VALUES (:id, :user_id, :entry, :index, :set_type, :weight, :reps, :rir, true,
                           now(), now(), now())"""
            ),
            {
                "id": set_id,
                "user_id": str(graph.user_id),
                "entry": entry,
                "index": index,
                "set_type": one.get("set_type", "working"),
                "weight": one.get("weight"),
                "reps": one.get("reps"),
                "rir": one.get("rir"),
            },
        )
        ids.append(set_id)
    return ids


def _records(connection: Connection, user_id: uuid.UUID) -> list[tuple[object, ...]]:
    """Read as the migrator, so what row-level security would hide still counts."""
    return [
        tuple(row)
        for row in connection.execute(
            text(
                """SELECT exercise_id, kind, weight_kg, value, reps, set_log_id, workout_id
                   FROM personal_records WHERE user_id = :user_id
                   ORDER BY exercise_id, kind, weight_kg"""
            ),
            {"user_id": str(user_id)},
        )
    ]


@pytest.fixture
def history(seeded, migrator_engine: Engine) -> dict[str, Any]:
    """Two users. The first has a press over two finished workouts, a pull-up weighed on the day,
    a workout still open, and a stale cache row; the second only a cache row of their own."""
    with migrator_engine.begin() as connection:
        user = create_user_graph(connection)
        other = create_user_graph(connection)
        pull_up = uuid.uuid4()
        connection.execute(
            text(
                """INSERT INTO exercises (id, owner_user_id, name, modality, primary_muscle_id,
                                          uses_bodyweight, created_at, updated_at)
                   VALUES (:id, :user_id, 'Barra fixa', 'bodyweight', 1, true, now(), now())"""
            ),
            {"id": str(pull_up), "user_id": str(user.user_id)},
        )
        # 70 kg a month ago; the graph already logged 80 kg today. A workout ten days ago weighs 70.
        connection.execute(
            text(
                """INSERT INTO body_weight_log (id, user_id, measured_on, weight_kg, created_at,
                                                updated_at)
                   VALUES (gen_random_uuid(), :user_id, :day, 70, now(), now())"""
            ),
            {"user_id": str(user.user_id), "day": TODAY - timedelta(days=30)},
        )
        first = _workout(connection, user, days_ago=20)
        warmup, working = _sets(
            connection,
            user,
            first,
            user.exercise_id,
            [
                {"set_type": "warmup", "weight": 140, "reps": 3, "rir": 0},
                {"weight": 100, "reps": 5, "rir": 2},
            ],
        )
        second = _workout(connection, user, days_ago=10)
        heavier, tie = _sets(
            connection,
            user,
            second,
            user.exercise_id,
            [{"weight": 110, "reps": 3}, {"weight": 100, "reps": 5, "rir": 2}],
        )
        (weighted,) = _sets(
            connection, user, second, pull_up, [{"weight": 20, "reps": 5, "rir": 2}], order=1
        )
        still_open = _workout(connection, user, days_ago=0, ended=False)
        _sets(connection, user, still_open, user.exercise_id, [{"weight": 300, "reps": 1}])
    return {
        "user": user,
        "other": other,
        "pull_up": pull_up,
        "first": first,
        "second": second,
        "warmup": warmup,
        "working": working,
        "heavier": heavier,
        "tie": tie,
        "weighted": weighted,
    }


async def _rebuild(database_urls, user_id: uuid.UUID) -> int:
    engine = create_engine(database_urls.app)
    try:
        rebuild = PersonalRecordsRebuild(async_sessionmaker(engine), clock=FakeClock())
        return await rebuild.rebuild(UserId(user_id))
    finally:
        await engine.dispose()


async def test_the_rebuild_stores_what_the_core_says_stands_and_where(
    history, seeded, migrator_engine
):
    user = history["user"]
    press, pull_up = str(user.exercise_id), str(history["pull_up"])

    assert await _rebuild(seeded, user.user_id) == 9

    with migrator_engine.connect() as connection:
        found = {
            (str(exercise), kind, weight): (value, reps, str(set_log), str(workout))
            for exercise, kind, weight, value, reps, set_log, workout in _records(
                connection, user.user_id
            )
        }
    # The press: the warm-up and the open workout's 300 kg hold nothing (INV-04; unfinished).
    assert found[(press, "max_weight", Decimal("110.0000"))][2] == history["heavier"]
    assert found[(press, "best_e1rm", Decimal("100.0000"))][0] == Decimal("123.3333")
    assert found[(press, "best_e1rm", Decimal("100.0000"))][2] == history["working"]
    # 100 x 5 was tied ten days later; the record stays with the first (a tie is not a record).
    assert found[(press, "max_reps_at_weight", Decimal("100.0000"))][2] == history["working"]
    assert found[(press, "max_reps_at_weight", Decimal("110.0000"))][1] == 3
    volume = found[(press, "best_session_volume", None)]
    assert volume[0] == Decimal("830.0000")
    assert volume[2] == "None"
    assert volume[3] == history["second"]
    # The pull-up: 20 kg on a lifter who weighed 70 on the workout's day, not today's 80 (INV-07).
    assert found[(pull_up, "max_weight", Decimal("90.0000"))][2] == history["weighted"]
    assert found[(pull_up, "best_e1rm", Decimal("90.0000"))][0] == Decimal("111.0000")
    # The stale 40 kg row the graph wrote is gone.
    assert (press, "max_weight", None) not in found


async def test_a_second_rebuild_writes_the_same_records(history, seeded, migrator_engine):
    user = history["user"]
    await _rebuild(seeded, user.user_id)
    with migrator_engine.connect() as connection:
        once = _records(connection, user.user_id)
    await _rebuild(seeded, user.user_id)
    with migrator_engine.connect() as connection:
        twice = _records(connection, user.user_id)
    assert once == twice


async def test_a_rebuild_touches_nobody_else_s_records(history, seeded, migrator_engine):
    other = history["other"]
    with migrator_engine.connect() as connection:
        before = _records(connection, other.user_id)
    await _rebuild(seeded, history["user"].user_id)
    with migrator_engine.connect() as connection:
        after = _records(connection, other.user_id)
    assert before == after
    assert len(after) == 1


def test_the_key_is_one_row_per_kind_and_one_reps_row_per_load(seeded, migrator_engine):
    insert = text(
        """INSERT INTO personal_records (id, user_id, exercise_id, kind, value, weight_kg, reps,
                                         achieved_at, computed_at)
           VALUES (gen_random_uuid(), :user_id, :exercise_id, :kind, 1, :weight, :reps, now(),
                   now())"""
    )
    with migrator_engine.begin() as connection:
        graph = create_user_graph(connection)
    ids = {"user_id": str(graph.user_id), "exercise_id": str(graph.exercise_id)}

    with migrator_engine.begin() as connection:
        for weight in (80, 100):
            connection.execute(
                insert, {**ids, "kind": "max_reps_at_weight", "weight": weight, "reps": 5}
            )

    refused: list[tuple[str, int | None, int | None]] = [
        ("max_weight", 50, None),  # the graph already holds a max_weight row
        ("max_reps_at_weight", 100, 6),  # a second row at the same load
        ("max_reps_at_weight", None, 6),  # a reps record must name its load
    ]
    for kind, load, reps in refused:
        with pytest.raises(IntegrityError), migrator_engine.begin() as connection:
            connection.execute(insert, {**ids, "kind": kind, "weight": load, "reps": reps})
