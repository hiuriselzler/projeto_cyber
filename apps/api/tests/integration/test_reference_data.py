"""The seeded reference data: idempotent, translated in both languages, liftable in both units."""

import json
import math
from decimal import Decimal
from typing import Any

import pytest
from jsonschema import Draft202012Validator
from sqlalchemy import Engine, text

from seeds.reference import seed
from tests.fixtures.loader import FIXTURES_DIR, load_fixture
from tests.integration.builders import create_user_graph
from tests.integration.conftest import scoped

pytestmark = pytest.mark.integration

I18N_DIR = FIXTURES_DIR.parent / "i18n"
REFERENCE_TABLES = (
    "muscle_groups",
    "modality_increments",
    "gamification_tracks",
    "sport_profiles",
    "achievements",
    "exercises",
    "exercise_secondary_muscles",
)
KG_PER_LB = Decimal("0.45359237")


def counts(engine: Engine) -> dict[str, int]:
    with engine.begin() as connection:
        return {
            table: connection.execute(text(f"SELECT count(*) FROM {table}")).scalar_one()
            for table in REFERENCE_TABLES
        }


def test_seeding_twice_writes_nothing_the_second_time(seeded, migrator_engine):
    before = counts(migrator_engine)
    with migrator_engine.begin() as connection:
        again = seed(connection)

    assert again.rows_written == 0
    assert counts(migrator_engine) == before
    assert before["exercises"] >= 200


# ── INV-27: every key a seeded row carries resolves in both catalogs ───────────────────────────


def load_catalog(name: str) -> dict[str, Any]:
    catalog: dict[str, Any] = json.loads((I18N_DIR / f"{name}.json").read_text(encoding="utf-8"))
    return catalog


def leaf_keys(tree: dict[str, Any], prefix: str = "") -> set[str]:
    keys: set[str] = set()
    for key, value in tree.items():
        path = f"{prefix}{key}"
        keys |= leaf_keys(value, f"{path}.") if isinstance(value, dict) else {path}
    return keys


def resolve(catalog: dict[str, Any], key: str) -> object:
    node: object = catalog
    for part in key.split("."):
        node = node.get(part) if isinstance(node, dict) else None
    return node


def seeded_keys(engine: Engine) -> set[str]:
    with engine.begin() as connection:
        keys = set(connection.execute(text("SELECT name_key FROM muscle_groups")).scalars())
        keys |= set(
            connection.execute(
                text("SELECT name_key FROM exercises WHERE owner_user_id IS NULL")
            ).scalars()
        )
        for row in connection.execute(text("SELECT name_key, description_key FROM achievements")):
            keys |= {row.name_key, row.description_key}
        for row in connection.execute(
            text(
                "SELECT name_key, session_types, live_fields, detail_sections, metrics_schema "
                "FROM sport_profiles"
            )
        ):
            keys.add(row.name_key)
            keys |= {f"session_type.{value}" for value in row.session_types}
            keys |= {f"activity_field.{value}" for value in row.live_fields}
            keys |= {f"activity_section.{value}" for value in row.detail_sections}
            strokes = row.metrics_schema["properties"].get("stroke_mix", {})
            keys |= {
                f"stroke.{value}" for value in strokes.get("propertyNames", {}).get("enum", [])
            }
        keys |= {
            f"track.{track}"
            for track in connection.execute(text("SELECT track FROM gamification_tracks")).scalars()
        }
        keys |= {
            f"set_type.{value}"
            for value in connection.execute(
                text("SELECT unnest(enum_range(NULL::set_type_enum))::text")
            ).scalars()
        }
    return keys


@pytest.mark.parametrize("language", ["en", "pt-BR"])
def test_every_seeded_key_resolves_in_both_catalogs(seeded, migrator_engine, language):
    catalog = load_catalog(language)

    missing = sorted(
        key
        for key in seeded_keys(migrator_engine)
        if not isinstance(resolve(catalog, key), str) or not resolve(catalog, key)
    )

    assert missing == []


def test_both_catalogs_have_the_same_keys():
    assert leaf_keys(load_catalog("en")) == leaf_keys(load_catalog("pt-BR"))


def test_no_reference_row_holds_translated_text(seeded, migrator_engine):
    with migrator_engine.begin() as connection:
        named = connection.execute(
            text("SELECT count(*) FROM exercises WHERE owner_user_id IS NULL AND name IS NOT NULL")
        ).scalar_one()

    assert named == 0


# ── INV-02, ADR-008: liftable in the plates the user owns ──────────────────────────────────────


def test_metric_and_imperial_users_resolve_different_barbell_increments(seeded, migrator_engine):
    with migrator_engine.begin() as connection:
        rows = connection.execute(
            text(
                "SELECT mi.unit_system, coalesce(e.load_increment_kg, mi.increment_kg) "
                "FROM exercises e JOIN modality_increments mi ON mi.modality = e.modality "
                "WHERE e.name_key = 'exercise.back_squat' ORDER BY mi.unit_system"
            )
        ).all()

    assert {tuple(row) for row in rows} == {
        ("metric", Decimal("2.500000")),
        ("imperial", Decimal("2.267962")),
    }


def round_to_increment(weight_kg: float, increment_kg: float, mode: str = "nearest") -> float:
    """A test oracle for ADR-010's rounding, not domain code: the real one arrives in task 017."""
    quotient = weight_kg / increment_kg
    steps = math.floor(quotient)
    if (mode == "up" and quotient > steps) or (mode == "nearest" and quotient - steps > 0.5):
        steps += 1
    return steps * increment_kg


def test_the_rounding_oracle_matches_the_shared_fixture():
    for case in load_fixture("round_to_increment")["cases"]:
        load = round_to_increment(case["weight_kg"], case["increment_kg"], case["mode"])
        assert round(load / case["increment_kg"]) == case["expected_steps"], case["name"]


@pytest.mark.parametrize(
    ("unit_system", "start", "step", "grid"),
    [
        ("imperial", Decimal("135"), Decimal("5"), Decimal("5")),
        ("metric", Decimal("60"), Decimal("2.5"), Decimal("2.5")),
    ],
)
def test_a_52_cycle_linear_block_stays_on_the_plate_grid_after_storage_rounding(
    seeded, migrator_engine, app_engine, unit_system, start, step, grid
):
    """INV-02's precision property, against the real numeric(10,6) and numeric(9,4) columns."""
    with migrator_engine.begin() as connection:
        user = create_user_graph(connection)
        increment = connection.execute(
            text(
                "SELECT increment_kg FROM modality_increments "
                "WHERE modality = 'barbell' AND unit_system = :unit_system"
            ),
            {"unit_system": unit_system},
        ).scalar_one()

    to_display = KG_PER_LB if unit_system == "imperial" else Decimal(1)
    weight = round_to_increment(float(start * to_display), float(increment))
    off_grid = []
    with scoped(app_engine, user.user_id) as connection:
        for cycle in range(1, 53):
            stored = connection.execute(
                text(
                    "UPDATE planned_sets SET target_weight_kg = :weight WHERE id = :id "
                    "RETURNING target_weight_kg"
                ),
                {"weight": weight, "id": str(user.planned_set_id)},
            ).scalar_one()
            shown = (stored / to_display).quantize(Decimal("0.1"))
            if shown % grid != 0:
                off_grid.append((cycle, shown))
            weight = round_to_increment(float(stored) + float(increment), float(increment))

    assert off_grid == []
    assert shown == start + 51 * step


# ── INV-19: a sport's fields are its profile's ─────────────────────────────────────────────────


def metrics_validator(engine: Engine, sport: str) -> Draft202012Validator:
    with engine.begin() as connection:
        schema = connection.execute(
            text("SELECT metrics_schema FROM sport_profiles WHERE sport = :sport"), {"sport": sport}
        ).scalar_one()
    Draft202012Validator.check_schema(schema)
    return Draft202012Validator(schema)


def test_a_pool_swim_validates_against_its_profile(seeded, migrator_engine):
    swim = metrics_validator(migrator_engine, "swim_pool")

    assert swim.is_valid({"pool_length_m": 25, "pool_length_unit": "m", "lengths": 40, "swolf": 38})
    assert not swim.is_valid({"distance_km": 5, "avg_pace_s_per_km": 300, "elevation_gain_m": 40})
    assert not swim.is_valid({"pool_length_m": 25, "lengths": 40})


def test_every_sport_is_seeded_with_a_valid_metrics_schema(seeded, migrator_engine):
    with migrator_engine.begin() as connection:
        sports = set(connection.execute(text("SELECT sport::text FROM sport_profiles")).scalars())
        enum = set(
            connection.execute(text("SELECT unnest(enum_range(NULL::sport_enum))::text")).scalars()
        )

    assert sports == enum
    for sport in sports:
        metrics_validator(migrator_engine, sport)
