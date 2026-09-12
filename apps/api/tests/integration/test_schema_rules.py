"""Task 002: the rules the database itself enforces — CHECKs, triggers, keys and RLS."""

import uuid

import pytest
from psycopg import errors as pg_errors
from sqlalchemy import Engine, text
from sqlalchemy.exc import DBAPIError

from scripts.check_schema import CLASSIFICATION, SYNC_COLUMNS
from tests.integration.builders import UserGraph, create_user_graph
from tests.integration.conftest import scoped

pytestmark = pytest.mark.integration


@pytest.fixture
def user(seeded, migrator_engine: Engine) -> UserGraph:
    with migrator_engine.begin() as connection:
        return create_user_graph(connection)


@pytest.fixture
def other_user(seeded, migrator_engine: Engine) -> UserGraph:
    with migrator_engine.begin() as connection:
        return create_user_graph(connection)


def raises(error: type[Exception]) -> pytest.RaisesExc[DBAPIError]:
    """A database error whose underlying psycopg error is `error`."""
    return pytest.raises(DBAPIError, check=lambda exc: isinstance(exc.orig, error))


OWNED_TABLES = sorted(
    name for name, entry in CLASSIFICATION.items() if entry.owner and entry.placement != "device"
)


# ── Row-level security (INV-15, ADR-011) ────────────────────────────────────────────────────────


@pytest.mark.parametrize("table", OWNED_TABLES)
def test_without_a_scope_the_app_reads_no_user_rows(user, app_engine, table):
    owner = CLASSIFICATION[table].owner
    with scoped(app_engine, None) as connection:
        visible = connection.execute(
            text(f"SELECT count(*) FROM {table} WHERE {owner} = :user_id"),
            {"user_id": str(user.user_id)},
        ).scalar_one()
        everything = connection.execute(
            text(f"SELECT count(*) FROM {table} WHERE {owner} IS NOT NULL")
        ).scalar_one()

    assert (visible, everything) == (0, 0)


def test_without_a_scope_only_the_global_catalog_is_visible(user, app_engine):
    with scoped(app_engine, None) as connection:
        custom = connection.execute(
            text("SELECT count(*) FROM exercises WHERE owner_user_id IS NOT NULL")
        ).scalar_one()
        muscles = connection.execute(
            text("SELECT count(*) FROM exercise_secondary_muscles WHERE exercise_id = :id"),
            {"id": str(user.exercise_id)},
        ).scalar_one()
        global_catalog = connection.execute(
            text("SELECT count(*) FROM exercises WHERE owner_user_id IS NULL")
        ).scalar_one()

    assert (custom, muscles) == (0, 0)
    assert global_catalog > 0


def test_another_users_workouts_stay_invisible_even_when_asked_for_by_id(
    user, other_user, app_engine
):
    with scoped(app_engine, user.user_id) as connection:
        theirs = connection.execute(
            text("SELECT count(*) FROM workouts WHERE user_id = :them OR id = :their_workout"),
            {"them": str(other_user.user_id), "their_workout": str(other_user.workout_id)},
        ).scalar_one()
        mine = connection.execute(text("SELECT count(*) FROM workouts")).scalar_one()

    assert theirs == 0
    assert mine == 1


def test_a_row_cannot_be_written_into_another_users_scope(user, other_user, app_engine):
    with raises(pg_errors.InsufficientPrivilege), scoped(app_engine, user.user_id) as connection:
        connection.execute(
            text(
                "INSERT INTO routines (id, user_id, name, created_at, updated_at) "
                "VALUES (:id, :them, 'Not mine', now(), now())"
            ),
            {"id": str(uuid.uuid4()), "them": str(other_user.user_id)},
        )


def test_the_app_cannot_read_users_unscoped_and_logs_in_through_the_lookup(user, app_engine):
    with scoped(app_engine, None) as connection:
        direct = connection.execute(
            text("SELECT count(*) FROM users WHERE email = :email"), {"email": user.email}
        ).scalar_one()
        lookup = connection.execute(
            text("SELECT * FROM auth_find_user_by_email(:email)"), {"email": user.email.upper()}
        )
        columns, rows = list(lookup.keys()), lookup.all()

    assert direct == 0
    assert columns == ["id", "password_hash"]
    assert [row.id for row in rows] == [user.user_id]


def test_a_graph_member_cannot_point_at_another_users_parent(user, other_user, app_engine):
    # The owner travels with the reference, so the foreign key itself refuses (ADR-013).
    with raises(pg_errors.ForeignKeyViolation), scoped(app_engine, user.user_id) as connection:
        connection.execute(
            text(
                "INSERT INTO workout_exercises (id, user_id, workout_id, exercise_id, order_index, "
                "created_at, updated_at) SELECT :id, :me, :their_workout, e.id, 0, now(), now() "
                "FROM exercises e WHERE e.owner_user_id IS NULL LIMIT 1"
            ),
            {
                "id": str(uuid.uuid4()),
                "me": str(user.user_id),
                "their_workout": str(other_user.workout_id),
            },
        )


def test_an_exercise_reference_must_be_global_or_the_users_own(user, other_user, app_engine):
    with raises(pg_errors.ForeignKeyViolation), scoped(app_engine, user.user_id) as connection:
        connection.execute(
            text(
                "INSERT INTO workout_exercises (id, user_id, workout_id, exercise_id, order_index, "
                "created_at, updated_at) VALUES (:id, :me, :my_workout, :their_exercise, 1, now(), "
                "now())"
            ),
            {
                "id": str(uuid.uuid4()),
                "me": str(user.user_id),
                "my_workout": str(user.workout_id),
                "their_exercise": str(other_user.exercise_id),
            },
        )


# ── Deletion semantics (INV-11, INV-18, ADR-013) ────────────────────────────────────────────────


def test_an_exercise_with_history_cannot_be_deleted(user, migrator_engine):
    with raises(pg_errors.ForeignKeyViolation), migrator_engine.begin() as connection:
        connection.execute(
            text("DELETE FROM exercises WHERE id = :id"), {"id": str(user.exercise_id)}
        )


def test_deleting_a_plan_leaves_the_logs(user, app_engine):
    with scoped(app_engine, user.user_id) as connection:
        connection.execute(
            text("DELETE FROM mesocycles WHERE id = :id"), {"id": str(user.mesocycle_id)}
        )
        links = connection.execute(
            text(
                "SELECT w.planned_session_id, we.planned_exercise_id, s.planned_set_id, s.user_id "
                "FROM set_logs s JOIN workout_exercises we ON we.id = s.workout_exercise_id "
                "JOIN workouts w ON w.id = we.workout_id WHERE s.id = :id"
            ),
            {"id": str(user.set_log_id)},
        ).one()

    assert tuple(links) == (None, None, None, user.user_id)


def test_deleting_an_account_removes_every_row_it_owns(user, app_engine, migrator_engine):
    with scoped(app_engine, user.user_id) as connection:
        connection.execute(text("DELETE FROM users WHERE id = :id"), {"id": str(user.user_id)})

    with migrator_engine.begin() as connection:
        remaining = {
            table: connection.execute(
                text(f"SELECT count(*) FROM {table} WHERE {entry.owner} = :id"),
                {"id": str(user.user_id)},
            ).scalar_one()
            for table, entry in CLASSIFICATION.items()
            if entry.owner and entry.placement != "device"
        }

    assert set(remaining.values()) == {0}, remaining


# ── CHECKs and triggers ─────────────────────────────────────────────────────────────────────────


def test_rir_11_is_rejected_by_the_database(user, app_engine):
    with raises(pg_errors.CheckViolation), scoped(app_engine, user.user_id) as connection:
        connection.execute(
            text("UPDATE set_logs SET rir = 11 WHERE id = :id"), {"id": str(user.set_log_id)}
        )


def test_a_24_cycle_block_with_no_deloads_is_valid(user, app_engine):
    mesocycle_id = uuid.uuid4()
    with scoped(app_engine, user.user_id) as connection:
        connection.execute(
            text(
                "INSERT INTO mesocycles (id, user_id, name, goal, start_date, num_microcycles, "
                "deload_mode, created_at, updated_at) VALUES (:id, :me, 'Long block', "
                "'hypertrophy', current_date, 24, 'none', now(), now())"
            ),
            {"id": str(mesocycle_id), "me": str(user.user_id)},
        )
        for number in range(1, 25):
            connection.execute(
                text(
                    "INSERT INTO microcycles (id, user_id, mesocycle_id, cycle_number, "
                    "length_days, "
                    "starts_on, engine_version, created_at, updated_at) VALUES (gen_random_uuid(), "
                    ":me, :meso, :number, 7, current_date + (:number - 1) * 7, 1, now(), now())"
                ),
                {"me": str(user.user_id), "meso": str(mesocycle_id), "number": number},
            )
        deloads = connection.execute(
            text(
                "SELECT count(*) FILTER (WHERE is_deload), count(*) FROM microcycles "
                "WHERE mesocycle_id = :meso"
            ),
            {"meso": str(mesocycle_id)},
        ).one()

    assert tuple(deloads) == (0, 24)


def test_every_n_deloads_needs_its_n(user, app_engine):
    with raises(pg_errors.CheckViolation), scoped(app_engine, user.user_id) as connection:
        connection.execute(
            text("UPDATE mesocycles SET deload_mode = 'every_n_microcycles' WHERE id = :id"),
            {"id": str(user.mesocycle_id)},
        )


@pytest.mark.parametrize(
    ("table", "parent"),
    [
        ("planned_sessions", "planned_session_id"),
        ("planned_cardio_sessions", "planned_cardio_session_id"),
    ],
)
def test_a_9_day_cycle_takes_day_9_and_refuses_day_10(user, app_engine, table, parent):
    session_id = str(getattr(user, parent))
    with scoped(app_engine, user.user_id) as connection:
        connection.execute(
            text(f"UPDATE {table} SET day_index = 9 WHERE id = :id"),
            {"id": session_id},
        )
    with raises(pg_errors.CheckViolation), scoped(app_engine, user.user_id) as connection:
        connection.execute(
            text(f"UPDATE {table} SET day_index = 10 WHERE id = :id"),
            {"id": session_id},
        )


def test_a_cycle_cannot_shrink_below_a_session_it_holds(user, app_engine):
    with raises(pg_errors.CheckViolation), scoped(app_engine, user.user_id) as connection:
        connection.execute(
            text("UPDATE microcycles SET length_days = 8, last_write_kind = 'user' WHERE id = :id"),
            {"id": str(user.microcycle_id)},
        )


def test_a_session_type_comes_from_its_sports_profile(user, app_engine):
    with raises(pg_errors.CheckViolation), scoped(app_engine, user.user_id) as connection:
        connection.execute(
            text(
                "UPDATE planned_cardio_sessions SET session_type = 'drill', origin = 'user_edited' "
                "WHERE id = :id"
            ),
            {"id": str(user.planned_cardio_session_id)},
        )


def test_an_exercise_cannot_list_its_primary_muscle_as_secondary(seeded, migrator_engine):
    with raises(pg_errors.CheckViolation), migrator_engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO exercise_secondary_muscles (exercise_id, muscle_group_id) "
                "SELECT id, primary_muscle_id FROM exercises "
                "WHERE name_key = 'exercise.barbell_bench_press'"
            )
        )


def test_an_award_with_no_source_is_awarded_once(user, app_engine):
    statement = text(
        "INSERT INTO xp_awards (id, user_id, track, amount, reason, source_kind, awarded_at, "
        "created_at, updated_at) VALUES (gen_random_uuid(), :me, 'consistency', 10, "
        "'welcome_back', 'manual', now(), now(), now())"
    )
    with raises(pg_errors.UniqueViolation), scoped(app_engine, user.user_id) as connection:
        connection.execute(statement, {"me": str(user.user_id)})
        connection.execute(statement, {"me": str(user.user_id)})


# ── INV-06: the engine rewrites projected cycles only, never with an older engine ───────────────


def set_cycle_status(engine: Engine, graph: UserGraph, status: str) -> None:
    with scoped(engine, graph.user_id) as connection:
        connection.execute(
            text(
                "UPDATE microcycles SET status = :status, last_write_kind = 'user' WHERE id = :id"
            ),
            {"status": status, "id": str(graph.microcycle_id)},
        )


def test_the_engine_may_rewrite_a_projected_cycle(user, app_engine):
    with scoped(app_engine, user.user_id) as connection:
        connection.execute(
            text("UPDATE planned_sets SET target_weight_kg = 42.5 WHERE id = :id"),
            {"id": str(user.planned_set_id)},
        )
        connection.execute(
            text("UPDATE microcycles SET is_deload = true, engine_version = 4 WHERE id = :id"),
            {"id": str(user.microcycle_id)},
        )


@pytest.mark.parametrize("status", ["locked", "in_progress", "completed", "skipped"])
def test_the_engine_may_not_rewrite_a_cycle_that_is_not_projected(user, app_engine, status):
    set_cycle_status(app_engine, user, status)

    with raises(pg_errors.CheckViolation), scoped(app_engine, user.user_id) as connection:
        connection.execute(
            text("UPDATE planned_sets SET target_weight_kg = 42.5 WHERE id = :id"),
            {"id": str(user.planned_set_id)},
        )
    with raises(pg_errors.CheckViolation), scoped(app_engine, user.user_id) as connection:
        connection.execute(
            text(
                "UPDATE microcycles SET is_deload = true, last_write_kind = 'engine' WHERE id = :id"
            ),
            {"id": str(user.microcycle_id)},
        )


def test_a_user_edit_and_an_unchanged_rewrite_pass_in_a_started_cycle(user, app_engine):
    set_cycle_status(app_engine, user, "in_progress")

    with scoped(app_engine, user.user_id) as connection:
        connection.execute(
            text("UPDATE planned_sets SET updated_at = now(), sync_version = 2 WHERE id = :id"),
            {"id": str(user.planned_set_id)},
        )
        connection.execute(
            text(
                "UPDATE planned_sets SET target_weight_kg = 42.5, origin = 'user_edited' "
                "WHERE id = :id"
            ),
            {"id": str(user.planned_set_id)},
        )


def test_an_older_engine_may_not_overwrite_a_newer_projection(user, app_engine):
    with raises(pg_errors.CheckViolation), scoped(app_engine, user.user_id) as connection:
        connection.execute(
            text("UPDATE cardio_plan_microcycles SET engine_version = 2 WHERE id = :id"),
            {"id": str(user.cardio_microcycle_id)},
        )
    with scoped(app_engine, user.user_id) as connection:
        connection.execute(
            text(
                "UPDATE microcycles SET engine_version = 2, last_write_kind = 'user' WHERE id = :id"
            ),
            {"id": str(user.microcycle_id)},
        )


# ── ADR-007: what the server holds of a privacy zone ───────────────────────────────────────────


def test_a_privacy_zone_row_holds_no_coordinate_radius_or_label(user, app_engine):
    with scoped(app_engine, user.user_id) as connection:
        result = connection.execute(text("SELECT * FROM privacy_zones"))
        columns = set(result.keys())

    assert columns - set(SYNC_COLUMNS) == {"id", "user_id", "ciphertext", "nonce"}
