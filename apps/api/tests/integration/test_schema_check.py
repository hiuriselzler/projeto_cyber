"""The schema check passes on the real schema, and fails when each rule is broken (task 002).

Every rule is broken twice: once in the introspected data, which is cheap and covers them all,
and — for the ones task 002 names — once for real, in the database, inside a transaction that is
rolled back. A rule that has never been seen to fail is not a gate.
"""

import dataclasses
import re
from collections.abc import Callable

import pytest
from sqlalchemy import Engine, text

from scripts.check_schema import (
    DEVICE_MIGRATIONS,
    Catalog,
    Column,
    DeviceSchema,
    Function,
    check,
    introspect,
    read_device_schema,
)

pytestmark = pytest.mark.integration

REPO_ROOT = DEVICE_MIGRATIONS.parents[4]


@pytest.fixture(scope="module")
def device() -> DeviceSchema:
    return read_device_schema()


@pytest.fixture(scope="module")
def catalog(migrated, migrator_engine: Engine) -> Catalog:
    with migrator_engine.connect() as connection:
        return introspect(connection)


def test_the_migrated_schema_passes(catalog, device):
    assert check(catalog, device) == []


def with_table(catalog: Catalog, name: str, **changes: object) -> Catalog:
    tables = dict(catalog.tables)
    tables[name] = dataclasses.replace(tables[name], **changes)  # type: ignore[arg-type]
    return dataclasses.replace(catalog, tables=tables)


def with_columns(
    catalog: Catalog, name: str, change: Callable[[dict[str, Column]], object]
) -> Catalog:
    columns = dict(catalog.tables[name].columns)
    change(columns)
    return with_table(catalog, name, columns=columns)


def add_sync(columns: dict[str, Column]) -> None:
    for column in ("created_at", "updated_at", "deleted_at", "sync_version"):
        columns[column] = Column(column, "timestamp with time zone")


BROKEN_CATALOGS: dict[str, tuple[Callable[[Catalog], Catalog], str]] = {
    "RLS not forced": (lambda c: with_table(c, "set_logs", rls_forced=False), "not FORCEd"),
    "RLS not enabled": (lambda c: with_table(c, "users", rls_enabled=False), "not enabled"),
    "no policy": (lambda c: with_table(c, "workouts", policies=()), "no policy"),
    "USING differs from WITH CHECK": (
        lambda c: with_table(
            c,
            "routines",
            policies=(dataclasses.replace(c.tables["routines"].policies[0], with_check="true"),),
        ),
        "different USING and WITH CHECK",
    ),
    "no user_id index": (
        lambda c: with_table(c, "planned_sets", index_leading_columns=frozenset({"id"})),
        "no index leads with user_id",
    ),
    "writable reference table": (
        lambda c: with_table(c, "sport_profiles", app_writable=True),
        "can write it",
    ),
    "sync columns on a dependent": (
        lambda c: with_columns(c, "cardio_plan_cycle_targets", add_sync),
        "so no sync columns",
    ),
    "sync column missing on a root": (
        lambda c: with_columns(c, "hr_zone_overrides", lambda cols: cols.pop("sync_version")),
        "without sync_version",
    ),
    "a _pct column": (
        lambda c: with_columns(
            c, "set_logs", lambda cols: cols.update(effort_pct=Column("effort_pct", "numeric"))
        ),
        "basis points",
    ),
    "a non-integer _bp column": (
        lambda c: with_columns(
            c,
            "mesocycles",
            lambda cols: cols.update(deload_set_bp=Column("deload_set_bp", "numeric")),
        ),
        "must be an integer",
    ),
    "a narrow load column": (
        lambda c: with_columns(
            c,
            "planned_sets",
            lambda cols: cols.update(target_weight_kg=Column("target_weight_kg", "numeric", 6, 2)),
        ),
        "INV-02",
    ),
    "a narrow increment column": (
        lambda c: with_columns(
            c,
            "modality_increments",
            lambda cols: cols.update(increment_kg=Column("increment_kg", "numeric", 5, 2)),
        ),
        "INV-02",
    ),
    "a day_of_week column": (
        lambda c: with_columns(
            c,
            "planned_sessions",
            lambda cols: cols.update(day_of_week=Column("day_of_week", "smallint")),
        ),
        "INV-25",
    ),
    "a SECURITY DEFINER function off the allowlist": (
        lambda c: dataclasses.replace(
            c,
            security_definer_functions={
                **c.security_definer_functions,
                "convenient_lookup": Function("convenient_lookup", True, False, True),
            },
        ),
        "not on ADR-011's allowlist",
    ),
    "an allowlisted function without search_path": (
        lambda c: dataclasses.replace(
            c,
            security_definer_functions={
                **c.security_definer_functions,
                "auth_find_user_by_email": Function("auth_find_user_by_email", False, False, True),
            },
        ),
        "pinned search_path",
    ),
    "an unclassified table": (
        lambda c: dataclasses.replace(
            c,
            tables={
                **c.tables,
                "scratch": dataclasses.replace(c.tables["routines"], name="scratch"),
            },
        ),
        "not classified",
    ),
}


@pytest.mark.parametrize("breakage", sorted(BROKEN_CATALOGS))
def test_each_rule_reports_its_breakage(catalog, device, breakage):
    breaks, expected = BROKEN_CATALOGS[breakage]

    problems = check(breaks(catalog), device)

    assert any(expected in problem for problem in problems), problems


def test_a_column_missing_from_the_device_schema_is_reported(catalog, device):
    tables = dict(device.tables)
    tables["set_logs"] = tables["set_logs"] - {"rir"}

    problems = check(catalog, DeviceSchema(tables=tables))

    assert "set_logs.rir: in Postgres but not in the device schema (03 §8)" in problems


def test_sync_columns_on_a_device_only_table_are_reported(catalog, device):
    tables = dict(device.tables)
    tables["sync_state"] = tables["sync_state"] | {"updated_at"}

    assert any("sync_state" in problem for problem in check(catalog, DeviceSchema(tables=tables)))


BREAKING_DDL = {
    "FORCE removed": ("ALTER TABLE workouts NO FORCE ROW LEVEL SECURITY", "workouts: user-owned"),
    "RLS disabled": ("ALTER TABLE set_logs DISABLE ROW LEVEL SECURITY", "set_logs: user-owned"),
    "sync added to cardio_plan_cycle_targets": (
        "ALTER TABLE cardio_plan_cycle_targets ADD COLUMN created_at timestamptz, "
        "ADD COLUMN updated_at timestamptz, ADD COLUMN deleted_at timestamptz, "
        "ADD COLUMN sync_version bigint",
        "cardio_plan_cycle_targets: dependent",
    ),
    "sync removed from hr_zone_overrides": (
        "ALTER TABLE hr_zone_overrides DROP COLUMN sync_version",
        "hr_zone_overrides: a sync root",
    ),
    "SECURITY DEFINER function added": (
        "CREATE FUNCTION convenient_lookup() RETURNS integer LANGUAGE sql SECURITY DEFINER "
        "AS 'SELECT 1'",
        "convenient_lookup: a SECURITY DEFINER function not on ADR-011's allowlist",
    ),
    "percentage column added": (
        "ALTER TABLE set_logs ADD COLUMN effort_pct numeric(5,2)",
        "set_logs.effort_pct",
    ),
}


@pytest.mark.parametrize("breakage", sorted(BREAKING_DDL))
def test_breaking_the_real_schema_fails_the_check(migrated, migrator_engine, device, breakage):
    ddl, expected = BREAKING_DDL[breakage]
    with migrator_engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.execute(text(ddl))
            problems = check(introspect(connection), device)
        finally:
            transaction.rollback()

    assert any(expected in problem for problem in problems), problems

    with migrator_engine.connect() as connection:
        assert check(introspect(connection), device) == []


def test_no_schema_source_names_a_day_of_week():
    sources = [
        *(REPO_ROOT / "apps" / "api" / "alembic" / "versions").glob("*.py"),
        *(REPO_ROOT / "apps" / "api" / "app" / "models").glob("*.py"),
        REPO_ROOT / "apps" / "mobile" / "src" / "db" / "schema.ts",
        *DEVICE_MIGRATIONS.glob("*.sql"),
    ]

    assert sources
    offenders = [
        str(path) for path in sources if re.search(r"day_of_week", path.read_text(encoding="utf-8"))
    ]
    assert offenders == []
