"""The device schema (03 §8) on an in-memory SQLite: every table exists and the triggers hold.

The migrations are the exact SQL the app runs at startup. On a phone this is task 017's check; the
SQL is the same, so the rules can be proven here first, in every CI run.
"""

import sqlite3
from collections.abc import Iterator
from typing import Any

import pytest

from scripts.check_schema import CLASSIFICATION, DEVICE_MIGRATIONS, Placement

BREAKPOINT = "--> statement-breakpoint"
NOW = 1_757_635_200_000  # epoch milliseconds


@pytest.fixture
def device() -> Iterator[sqlite3.Connection]:
    connection = sqlite3.connect(":memory:", isolation_level=None)
    connection.execute("PRAGMA foreign_keys = ON")
    for path in sorted(DEVICE_MIGRATIONS.glob("*.sql")):
        for statement in path.read_text(encoding="utf-8").split(BREAKPOINT):
            if statement.strip():
                connection.execute(statement)
    yield connection
    connection.close()


def insert(connection: sqlite3.Connection, table: str, **values: Any) -> None:
    columns = ", ".join(values)
    marks = ", ".join("?" for _ in values)
    connection.execute(f"INSERT INTO {table} ({columns}) VALUES ({marks})", tuple(values.values()))


def sync() -> dict[str, int]:
    return {"created_at": NOW, "updated_at": NOW}


@pytest.fixture
def plan(device: sqlite3.Connection) -> sqlite3.Connection:
    """One user with a 9-day strength cycle and a 9-day cardio cycle, each holding one session."""
    insert(device, "users", id="u", email="a@example.com", display_name="A", **sync())
    insert(device, "muscle_groups", id=1, name_key="muscle.chest", region="upper_push")
    insert(device, "muscle_groups", id=2, name_key="muscle.triceps", region="arms")
    insert(
        device,
        "exercises",
        id="bench",
        name_key="exercise.bench",
        modality="barbell",
        primary_muscle_id=1,
        **sync(),
    )
    insert(
        device,
        "mesocycles",
        id="meso",
        user_id="u",
        name="Block",
        goal="strength",
        start_date="2026-09-14",
        num_microcycles=24,
        **sync(),
    )
    insert(
        device,
        "microcycles",
        id="cycle",
        user_id="u",
        mesocycle_id="meso",
        cycle_number=1,
        length_days=9,
        starts_on="2026-09-14",
        engine_version=3,
        **sync(),
    )
    insert(
        device,
        "planned_sessions",
        id="session",
        user_id="u",
        microcycle_id="cycle",
        day_index=9,
        name="Lower A",
        **sync(),
    )
    insert(
        device,
        "planned_exercises",
        id="pe",
        user_id="u",
        planned_session_id="session",
        exercise_id="bench",
        order_index=0,
        **sync(),
    )
    insert(
        device,
        "planned_sets",
        id="set",
        user_id="u",
        planned_exercise_id="pe",
        set_index=1,
        target_weight_kg=40.0,
        target_reps=6,
        **sync(),
    )
    insert(device, "gamification_tracks", track="run", kind="discipline", hue_token="run")
    insert(
        device,
        "sport_profiles",
        sport="run",
        name_key="sport.run",
        recording_mode="gps",
        primary_metric="distance",
        pace_unit_metric="min_per_km",
        pace_unit_imperial="min_per_mi",
        has_route=1,
        has_elevation=1,
        live_fields="[]",
        detail_sections="[]",
        session_types='["easy"]',
        metrics_schema="{}",
        xp_track="run",
    )
    insert(
        device,
        "cardio_plans",
        id="cplan",
        user_id="u",
        name="Base",
        goal="base",
        start_date="2026-09-14",
        num_microcycles=12,
        volume_step_bp=1303,
        **sync(),
    )
    insert(
        device,
        "cardio_plan_microcycles",
        id="ccycle",
        user_id="u",
        cardio_plan_id="cplan",
        cycle_number=1,
        length_days=9,
        starts_on="2026-09-14",
        engine_version=3,
        **sync(),
    )
    insert(
        device,
        "planned_cardio_sessions",
        id="csession",
        user_id="u",
        cardio_plan_microcycle_id="ccycle",
        day_index=9,
        sport="run",
        session_type="easy",
        target_distance_m=6000,
        **sync(),
    )
    return device


def set_cycle_status(connection: sqlite3.Connection, status: str) -> None:
    connection.execute("UPDATE microcycles SET status = ?, last_write_kind = 'user'", (status,))
    connection.execute(
        "UPDATE cardio_plan_microcycles SET status = ?, last_write_kind = 'user'", (status,)
    )


def test_every_table_in_03_section_8_exists(device):
    tables = {
        name
        for (name,) in device.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        )
    }
    expected = {
        name
        for name, entry in CLASSIFICATION.items()
        if entry.placement in (Placement.BOTH, Placement.DEVICE)
    }
    assert tables == expected


def test_rir_outside_0_to_10_is_rejected(plan):
    insert(
        plan,
        "workouts",
        id="w",
        user_id="u",
        title="W",
        started_at=NOW,
        local_date="2026-09-14",
        tz="America/Sao_Paulo",
        source="manual",
        **sync(),
    )
    insert(
        plan,
        "workout_exercises",
        id="we",
        user_id="u",
        workout_id="w",
        exercise_id="bench",
        order_index=0,
        **sync(),
    )

    with pytest.raises(sqlite3.IntegrityError, match="set_logs_rir_check"):
        insert(
            plan,
            "set_logs",
            id="s",
            user_id="u",
            workout_exercise_id="we",
            set_index=1,
            rir=11,
            **sync(),
        )


def test_a_session_fits_its_cycle_length(plan):
    plan.execute("UPDATE planned_sessions SET day_index = 1")
    plan.execute("UPDATE planned_sessions SET day_index = 9")

    with pytest.raises(sqlite3.IntegrityError, match="INV-25"):
        plan.execute("UPDATE planned_sessions SET day_index = 10")
    with pytest.raises(sqlite3.IntegrityError, match="INV-25"):
        insert(
            plan,
            "planned_sessions",
            id="late",
            user_id="u",
            microcycle_id="cycle",
            day_index=10,
            name="Too late",
            **sync(),
        )
    with pytest.raises(sqlite3.IntegrityError, match="INV-25"):
        plan.execute("UPDATE planned_cardio_sessions SET day_index = 10")


def test_a_cycle_cannot_shrink_below_a_session_it_holds(plan):
    with pytest.raises(sqlite3.IntegrityError, match="INV-25"):
        plan.execute("UPDATE microcycles SET length_days = 8, last_write_kind = 'user'")
    with pytest.raises(sqlite3.IntegrityError, match="INV-25"):
        plan.execute("UPDATE cardio_plan_microcycles SET length_days = 8, last_write_kind = 'user'")


def test_the_engine_may_rewrite_a_projected_cycle(plan):
    plan.execute("UPDATE planned_sets SET target_weight_kg = 42.5")
    plan.execute("UPDATE planned_cardio_sessions SET target_distance_m = 6600")
    plan.execute("UPDATE microcycles SET length_days = 10, engine_version = 4")


@pytest.mark.parametrize("status", ["locked", "in_progress", "completed", "skipped"])
def test_the_engine_may_not_rewrite_a_cycle_that_is_not_projected(plan, status):
    set_cycle_status(plan, status)

    with pytest.raises(sqlite3.IntegrityError, match="INV-06"):
        plan.execute("UPDATE planned_sets SET target_weight_kg = 42.5")
    with pytest.raises(sqlite3.IntegrityError, match="INV-06"):
        plan.execute("UPDATE planned_cardio_sessions SET target_distance_m = 6600")
    with pytest.raises(sqlite3.IntegrityError, match="INV-06"):
        plan.execute("UPDATE microcycles SET is_deload = 1, last_write_kind = 'engine'")


def test_a_user_edit_and_an_unchanged_rewrite_pass_in_a_started_cycle(plan):
    set_cycle_status(plan, "in_progress")

    plan.execute("UPDATE planned_sets SET updated_at = updated_at + 1, sync_version = 2")
    plan.execute("UPDATE planned_sets SET target_weight_kg = 42.5, origin = 'user_edited'")
    plan.execute(
        "UPDATE planned_cardio_sessions SET target_distance_m = 6600, origin = 'user_edited'"
    )


def test_an_older_engine_may_not_overwrite_a_newer_projection(plan):
    with pytest.raises(sqlite3.IntegrityError, match="INV-06"):
        plan.execute("UPDATE microcycles SET engine_version = 2, last_write_kind = 'engine'")
    with pytest.raises(sqlite3.IntegrityError, match="INV-06"):
        plan.execute(
            "UPDATE cardio_plan_microcycles SET engine_version = 2, last_write_kind = 'engine'"
        )

    plan.execute("UPDATE microcycles SET engine_version = 2, last_write_kind = 'user'")


def test_a_primary_muscle_cannot_also_be_secondary(plan):
    insert(plan, "exercise_secondary_muscles", exercise_id="bench", muscle_group_id=2)

    with pytest.raises(sqlite3.IntegrityError, match=r"FR-2\.16"):
        insert(plan, "exercise_secondary_muscles", exercise_id="bench", muscle_group_id=1)
    with pytest.raises(sqlite3.IntegrityError, match=r"FR-2\.16"):
        plan.execute("UPDATE exercises SET primary_muscle_id = 2")


def test_an_award_with_no_source_is_still_awarded_once(plan):
    award = {
        "user_id": "u",
        "track": "run",
        "amount": 25,
        "reason": "manual_bonus",
        "source_kind": "manual",
        "awarded_at": NOW,
        **sync(),
    }
    insert(plan, "xp_awards", id="a1", **award)

    with pytest.raises(sqlite3.IntegrityError, match="UNIQUE"):
        insert(plan, "xp_awards", id="a2", **award)
