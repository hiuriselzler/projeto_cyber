"""The schema check: `uv run python -m scripts.check_schema`, after `alembic upgrade head`.

Turns the rules that no single CHECK can hold into a build failure (task 002):

- every table is classified in 03 §11, and exists where its class says — server, device, or both;
- every sync root carries all four sync columns, and nothing else carries the markers;
- every user-owned table has its owner column, an index led by it, and row-level security enabled
  and FORCEd, with policies that compare the owner to `app.user_id` in USING and WITH CHECK alike
  (ADR-011, ADR-013);
- reference tables are read-only to the API;
- the SECURITY DEFINER functions are exactly ADR-011's allowlist, each pinning search_path and
  executable by the app role alone;
- no `day_of_week` column (INV-25), no `_pct` column and no non-integer `_bp` column (ADR-010),
  and no load or increment narrower than INV-02's precision;
- Postgres (Alembic) and SQLite (Drizzle) share column names, except where 03 §8 says otherwise.

The rules are pure functions over a `Catalog` and a `DeviceSchema`, so the tests can break each one
deliberately and watch it report.
"""

import json
import sys
from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path

from sqlalchemy import Connection, create_engine, text

from app.core.config import MigrationSettings

DEVICE_MIGRATIONS = (
    Path(__file__).resolve().parents[3] / "apps" / "mobile" / "src" / "db" / "migrations"
)

APP_ROLE = "cyberathlete_app"
SCOPE_SETTING = "current_setting('app.user_id'"

SYNC_COLUMNS = ("created_at", "updated_at", "deleted_at", "sync_version")
# created_at alone is an ordinary timestamp on the token tables; these three mark a row as synced.
SYNC_MARKERS = ("updated_at", "deleted_at", "sync_version")

INCREMENT_COLUMNS = frozenset({"increment_kg", "load_increment_kg", "load_step_kg"})


class SyncClass(StrEnum):
    ROOT = "root"
    DEPENDENT = "dependent"
    REFERENCE = "reference"
    DERIVED = "derived"
    LOCAL_ONLY = "local-only"


class Placement(StrEnum):
    SERVER = "server"
    DEVICE = "device"
    BOTH = "both"


@dataclass(frozen=True)
class Classified:
    sync_class: SyncClass
    placement: Placement
    owner: str | None = None
    # The exercise catalog's policies differ from the ordinary owner rule (ADR-011).
    mixed_policy: bool = False


ROOT, DEPENDENT, REFERENCE, DERIVED, LOCAL_ONLY = SyncClass
SERVER, DEVICE, BOTH = Placement

# 03 §11, one row per table. Adding a table without a row here fails the check.
CLASSIFICATION: Mapping[str, Classified] = {
    "users": Classified(ROOT, BOTH, owner="id"),
    "subscriptions": Classified(ROOT, BOTH, owner="user_id"),
    "body_weight_log": Classified(ROOT, BOTH, owner="user_id"),
    "hr_zone_overrides": Classified(ROOT, BOTH, owner="user_id"),
    "privacy_zones": Classified(ROOT, BOTH, owner="user_id"),
    "exercises": Classified(ROOT, BOTH, owner="owner_user_id", mixed_policy=True),
    "routines": Classified(ROOT, BOTH, owner="user_id"),
    "routine_exercises": Classified(ROOT, BOTH, owner="user_id"),
    "workouts": Classified(ROOT, BOTH, owner="user_id"),
    "workout_exercises": Classified(ROOT, BOTH, owner="user_id"),
    "set_logs": Classified(ROOT, BOTH, owner="user_id"),
    "progression_rules": Classified(ROOT, BOTH, owner="user_id"),
    "mesocycles": Classified(ROOT, BOTH, owner="user_id"),
    "microcycles": Classified(ROOT, BOTH, owner="user_id"),
    "planned_sessions": Classified(ROOT, BOTH, owner="user_id"),
    "planned_exercises": Classified(ROOT, BOTH, owner="user_id"),
    "planned_sets": Classified(ROOT, BOTH, owner="user_id"),
    "cardio_activities": Classified(ROOT, BOTH, owner="user_id"),
    "activity_segments": Classified(ROOT, BOTH, owner="user_id"),
    "cardio_plans": Classified(ROOT, BOTH, owner="user_id"),
    "cardio_plan_microcycles": Classified(ROOT, BOTH, owner="user_id"),
    "planned_cardio_sessions": Classified(ROOT, BOTH, owner="user_id"),
    "xp_awards": Classified(ROOT, BOTH, owner="user_id"),
    "user_achievements": Classified(ROOT, BOTH, owner="user_id"),
    "adherence_streaks": Classified(ROOT, BOTH, owner="user_id"),
    "exercise_secondary_muscles": Classified(DEPENDENT, BOTH, mixed_policy=True),
    "activity_streams": Classified(DEPENDENT, BOTH, owner="user_id"),
    "cardio_plan_cycle_targets": Classified(DEPENDENT, BOTH, owner="user_id"),
    "muscle_groups": Classified(REFERENCE, BOTH),
    "modality_increments": Classified(REFERENCE, BOTH),
    "sport_profiles": Classified(REFERENCE, BOTH),
    "gamification_tracks": Classified(REFERENCE, BOTH),
    "achievements": Classified(REFERENCE, BOTH),
    "personal_records": Classified(DERIVED, SERVER, owner="user_id"),
    "user_track_progress": Classified(DERIVED, SERVER, owner="user_id"),
    "refresh_tokens": Classified(LOCAL_ONLY, SERVER, owner="user_id"),
    "password_reset_tokens": Classified(LOCAL_ONLY, SERVER, owner="user_id"),
    "email_verification_tokens": Classified(LOCAL_ONLY, SERVER, owner="user_id"),
    # Holds nobody's data, so no owner and no row-level security (ADR-015).
    "rate_limit_buckets": Classified(LOCAL_ONLY, SERVER),
    "raw_gps_points": Classified(LOCAL_ONLY, DEVICE),
    "outbox": Classified(LOCAL_ONLY, DEVICE),
    "sync_state": Classified(LOCAL_ONLY, DEVICE),
}

# 03 §8's column differences. Anything else that differs between the two schemas is a bug.
SERVER_ONLY_COLUMNS: Mapping[str, frozenset[str]] = {
    "users": frozenset({"password_hash"}),
    "privacy_zones": frozenset({"ciphertext", "nonce"}),
}
DEVICE_ONLY_COLUMNS: Mapping[str, frozenset[str]] = {
    "privacy_zones": frozenset({"label", "center_lat", "center_lng", "radius_m"}),
}

# ADR-011 § Unscoped queries are named functions. Adding to this list is a security review.
UNSCOPED_FUNCTION_ALLOWLIST = frozenset(
    {
        "auth_find_user_by_email",
        "auth_find_refresh_token",
        "auth_redeem_reset_token",
        "auth_redeem_verification_token",
        "maintenance_purge_revoked_tokens",
        "maintenance_accounts_due_for_deletion",
    }
)


@dataclass(frozen=True)
class Column:
    name: str
    data_type: str
    numeric_precision: int | None = None
    numeric_scale: int | None = None


@dataclass(frozen=True)
class Policy:
    name: str
    command: str
    using: str | None
    with_check: str | None


@dataclass(frozen=True)
class Table:
    name: str
    columns: Mapping[str, Column]
    rls_enabled: bool = False
    rls_forced: bool = False
    policies: tuple[Policy, ...] = ()
    index_leading_columns: frozenset[str] = frozenset()
    app_writable: bool = True


@dataclass(frozen=True)
class Function:
    name: str
    search_path_pinned: bool
    public_can_execute: bool
    app_can_execute: bool


@dataclass(frozen=True)
class Catalog:
    """What the migrated Postgres schema actually contains."""

    tables: Mapping[str, Table]
    security_definer_functions: Mapping[str, Function] = field(default_factory=dict)


@dataclass(frozen=True)
class DeviceSchema:
    """Table and column names in the latest Drizzle snapshot."""

    tables: Mapping[str, frozenset[str]]


def check(
    catalog: Catalog,
    device: DeviceSchema,
    classification: Mapping[str, Classified] = CLASSIFICATION,
) -> list[str]:
    problems: list[str] = []
    problems += _check_classification(catalog, device, classification)
    problems += _check_sync_columns(catalog, device, classification)
    problems += _check_ownership(catalog, device, classification)
    problems += _check_reference_tables(catalog, classification)
    problems += _check_functions(catalog)
    problems += _check_column_names_and_precision(catalog, device)
    problems += _check_device_parity(catalog, device, classification)
    return problems


def _check_classification(
    catalog: Catalog, device: DeviceSchema, classification: Mapping[str, Classified]
) -> Iterable[str]:
    for where, tables, placements in (
        ("Postgres", catalog.tables, (SERVER, BOTH)),
        ("the device schema", device.tables, (DEVICE, BOTH)),
    ):
        for name in sorted(tables):
            entry = classification.get(name)
            if entry is None:
                yield f"{name}: in {where} but not classified in 03 §11"
            elif entry.placement not in placements:
                yield f"{name}: in {where}, but classified as {entry.placement}-only"
        for name, entry in sorted(classification.items()):
            if entry.placement in placements and name not in tables:
                yield f"{name}: classified for {where}, but missing from it"


def _check_sync_columns(
    catalog: Catalog, device: DeviceSchema, classification: Mapping[str, Classified]
) -> Iterable[str]:
    schemas: tuple[tuple[str, Mapping[str, Iterable[str]]], ...] = (
        ("Postgres", {name: table.columns.keys() for name, table in catalog.tables.items()}),
        ("the device schema", device.tables),
    )
    for where, tables in schemas:
        for name, columns in sorted(tables.items()):
            entry = classification.get(name)
            if entry is None:
                continue
            present = set(columns)
            if entry.sync_class is ROOT:
                missing = [column for column in SYNC_COLUMNS if column not in present]
                if missing:
                    yield f"{name}: a sync root in {where} without {', '.join(missing)}"
            else:
                extra = [column for column in SYNC_MARKERS if column in present]
                if extra:
                    yield (
                        f"{name}: {entry.sync_class}, so no sync columns, but {where} has "
                        f"{', '.join(extra)} (03 §11)"
                    )


def _check_ownership(
    catalog: Catalog, device: DeviceSchema, classification: Mapping[str, Classified]
) -> Iterable[str]:
    for name, entry in sorted(classification.items()):
        if entry.owner is None and not entry.mixed_policy:
            continue
        if (
            entry.owner is not None
            and name in device.tables
            and entry.owner not in device.tables[name]
        ):
            yield f"{name}: the device schema has no owner column {entry.owner} (ADR-013)"
        table = catalog.tables.get(name)
        if table is None:
            continue
        if entry.owner is not None:
            if entry.owner not in table.columns:
                yield f"{name}: user-owned, but has no {entry.owner} column (INV-15, ADR-013)"
            elif entry.owner != "id" and entry.owner not in table.index_leading_columns:
                yield f"{name}: no index leads with {entry.owner} (INV-15)"
        if not table.rls_enabled:
            yield f"{name}: user-owned, but row-level security is not enabled (ADR-011)"
        if not table.rls_forced:
            yield f"{name}: user-owned, but row-level security is not FORCEd (ADR-011)"
        if not table.policies:
            yield f"{name}: row-level security with no policy (ADR-011)"
        for policy in table.policies:
            clauses = [clause for clause in (policy.using, policy.with_check) if clause]
            reads_scope = all(SCOPE_SETTING in clause for clause in clauses)
            if entry.mixed_policy:
                # The catalog reads global rows unscoped; only its writes must be scoped (ADR-011).
                if policy.command != "SELECT" and not reads_scope:
                    yield f"{name}: write policy {policy.name} does not read app.user_id (ADR-011)"
                continue
            if not reads_scope:
                yield f"{name}: policy {policy.name} does not read app.user_id (ADR-011)"
            if policy.using != policy.with_check:
                yield (
                    f"{name}: policy {policy.name} has different USING and WITH CHECK "
                    "expressions (ADR-011)"
                )
            if entry.owner is not None and not all(entry.owner in clause for clause in clauses):
                yield f"{name}: policy {policy.name} does not compare {entry.owner} (ADR-011)"


def _check_reference_tables(
    catalog: Catalog, classification: Mapping[str, Classified]
) -> Iterable[str]:
    for name, entry in sorted(classification.items()):
        table = catalog.tables.get(name)
        if entry.sync_class is REFERENCE and table is not None and table.app_writable:
            yield f"{name}: reference data, but {APP_ROLE} can write it (ADR-011)"


def _check_functions(catalog: Catalog) -> Iterable[str]:
    found = set(catalog.security_definer_functions)
    for name in sorted(found - UNSCOPED_FUNCTION_ALLOWLIST):
        yield f"{name}: a SECURITY DEFINER function not on ADR-011's allowlist"
    for name in sorted(UNSCOPED_FUNCTION_ALLOWLIST - found):
        yield f"{name}: on ADR-011's allowlist, but missing"
    for name, function in sorted(catalog.security_definer_functions.items()):
        if not function.search_path_pinned:
            yield f"{name}: SECURITY DEFINER without a pinned search_path (ADR-011)"
        if function.public_can_execute:
            yield f"{name}: SECURITY DEFINER and executable by PUBLIC (ADR-011)"
        if not function.app_can_execute:
            yield f"{name}: not executable by {APP_ROLE}"


def _check_column_names_and_precision(catalog: Catalog, device: DeviceSchema) -> Iterable[str]:
    names = [
        (table.name, column) for table in catalog.tables.values() for column in table.columns
    ] + [(table, column) for table, columns in device.tables.items() for column in columns]
    for table_name, column_name in sorted(set(names)):
        if column_name == "day_of_week":
            yield f"{table_name}.day_of_week: planning uses day_index, never a weekday (INV-25)"
        if column_name.endswith("_pct"):
            yield f"{table_name}.{column_name}: percentages are integer basis points, _bp (ADR-010)"

    for table in catalog.tables.values():
        for column in table.columns.values():
            where = f"{table.name}.{column.name}"
            if column.name.endswith("_bp") and column.data_type not in ("integer", "jsonb"):
                yield f"{where}: a _bp column must be an integer, not {column.data_type} (ADR-010)"
            if column.name.endswith("_kg") and column.data_type == "numeric":
                precision, scale = column.numeric_precision or 0, column.numeric_scale or 0
                wanted = (10, 6) if column.name in INCREMENT_COLUMNS else (9, 4)
                if precision < wanted[0] or scale < wanted[1]:
                    yield (
                        f"{where}: numeric({precision},{scale}) is narrower than "
                        f"numeric({wanted[0]},{wanted[1]}) (INV-02)"
                    )


def _check_device_parity(
    catalog: Catalog, device: DeviceSchema, classification: Mapping[str, Classified]
) -> Iterable[str]:
    for name, entry in sorted(classification.items()):
        if entry.placement is not BOTH or name not in catalog.tables or name not in device.tables:
            continue
        server = set(catalog.tables[name].columns) - SERVER_ONLY_COLUMNS.get(name, frozenset())
        on_device = set(device.tables[name]) - DEVICE_ONLY_COLUMNS.get(name, frozenset())
        for column in sorted(server - on_device):
            yield f"{name}.{column}: in Postgres but not in the device schema (03 §8)"
        for column in sorted(on_device - server):
            yield f"{name}.{column}: in the device schema but not in Postgres (03 §8)"


def introspect(connection: Connection) -> Catalog:
    columns: dict[str, dict[str, Column]] = {}
    for row in connection.execute(
        text(
            """
            SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name <> 'alembic_version'
            """
        )
    ):
        columns.setdefault(row.table_name, {})[row.column_name] = Column(
            row.column_name, row.data_type, row.numeric_precision, row.numeric_scale
        )

    policies: dict[str, list[Policy]] = {}
    for row in connection.execute(
        text(
            "SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies "
            "WHERE schemaname = 'public'"
        )
    ):
        policies.setdefault(row.tablename, []).append(
            Policy(row.policyname, row.cmd, row.qual, row.with_check)
        )

    leading: dict[str, set[str]] = {}
    for row in connection.execute(
        text(
            """
            SELECT t.relname AS table_name, a.attname AS column_name
            FROM pg_index i
            JOIN pg_class t ON t.oid = i.indrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = i.indkey[0]
            WHERE n.nspname = 'public'
            """
        )
    ):
        leading.setdefault(row.table_name, set()).add(row.column_name)

    tables: dict[str, Table] = {}
    for row in connection.execute(
        text(
            """
            SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
                   has_table_privilege(:role, c.oid, 'INSERT')
                   OR has_table_privilege(:role, c.oid, 'UPDATE')
                   OR has_table_privilege(:role, c.oid, 'DELETE') AS app_writable
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
              AND c.relname <> 'alembic_version'
            """
        ),
        {"role": APP_ROLE},
    ):
        tables[row.relname] = Table(
            name=row.relname,
            columns=columns.get(row.relname, {}),
            rls_enabled=row.relrowsecurity,
            rls_forced=row.relforcerowsecurity,
            policies=tuple(sorted(policies.get(row.relname, []), key=lambda p: p.name)),
            index_leading_columns=frozenset(leading.get(row.relname, set())),
            app_writable=row.app_writable,
        )

    functions: dict[str, Function] = {}
    for row in connection.execute(
        text(
            """
            SELECT p.proname,
                   EXISTS (
                       SELECT 1 FROM unnest(coalesce(p.proconfig, '{}')) setting
                       WHERE setting LIKE 'search_path=%'
                   ) AS search_path_pinned,
                   EXISTS (
                       SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
                       WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
                   ) AS public_can_execute,
                   has_function_privilege(:role, p.oid, 'EXECUTE') AS app_can_execute
            FROM pg_proc p
            JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE p.prosecdef AND n.nspname NOT IN ('pg_catalog', 'information_schema')
            """
        ),
        {"role": APP_ROLE},
    ):
        functions[row.proname] = Function(
            row.proname, row.search_path_pinned, row.public_can_execute, row.app_can_execute
        )

    return Catalog(tables=tables, security_definer_functions=functions)


def read_device_schema(migrations: Path = DEVICE_MIGRATIONS) -> DeviceSchema:
    """The latest Drizzle snapshot. CI regenerates it and fails if the committed copy is stale."""
    journal = json.loads((migrations / "meta" / "_journal.json").read_text(encoding="utf-8"))
    latest = max(entry["idx"] for entry in journal["entries"])
    snapshot = json.loads(
        (migrations / "meta" / f"{latest:04d}_snapshot.json").read_text(encoding="utf-8")
    )
    return DeviceSchema(
        tables={name: frozenset(table["columns"]) for name, table in snapshot["tables"].items()}
    )


def main() -> int:
    engine = create_engine(MigrationSettings().migration_database_url.get_secret_value())
    try:
        with engine.connect() as connection:
            catalog = introspect(connection)
    finally:
        engine.dispose()
    problems = check(catalog, read_device_schema())
    for problem in problems:
        print(problem, file=sys.stderr)
    if problems:
        print(f"schema check failed: {len(problems)} problem(s)", file=sys.stderr)
        return 1
    print(f"schema check passed: {len(catalog.tables)} tables, {len(CLASSIFICATION)} classified")
    return 0


if __name__ == "__main__":
    sys.exit(main())
