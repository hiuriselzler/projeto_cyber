"""The database engine, and the boot-time proof that the API's role cannot skip RLS (ADR-011)."""

import asyncio

from sqlalchemy import text
from sqlalchemy.exc import InterfaceError, OperationalError
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

CONNECT_TIMEOUT_S = 5


class UnsafeDatabaseRoleError(RuntimeError):
    """The API's role could skip row-level security. The API refuses to start."""


class DatabaseUnreachableError(RuntimeError):
    """Postgres could not be reached at boot, so the role could not be checked."""


# Every role the connecting role is, or inherits through membership. Membership counts because it
# lets a role SET ROLE into the other one.
_ROLE_QUERY = text(
    r"""
    WITH RECURSIVE granted(oid) AS (
        SELECT oid FROM pg_roles WHERE rolname = current_user
        UNION
        SELECT m.roleid FROM pg_auth_members m JOIN granted g ON m.member = g.oid
    )
    SELECT
        r.rolname,
        r.rolname = current_user AS is_self,
        r.rolsuper,
        r.rolbypassrls,
        EXISTS (
            SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relowner = r.oid
              AND n.nspname <> 'information_schema'
              AND n.nspname NOT LIKE 'pg\_%'
        ) AS owns_relations,
        EXISTS (
            SELECT 1 FROM pg_database d
            WHERE d.datname = current_database() AND d.datdba = r.oid
        ) AS owns_database
    FROM pg_roles r
    JOIN granted g ON g.oid = r.oid
    """
)


def create_engine(database_url: str) -> AsyncEngine:
    # Server-side prepared statements are off, so a transaction-mode pooler can sit in front of
    # Postgres (ADR-011, NFR-12).
    return create_async_engine(
        database_url,
        pool_pre_ping=True,
        connect_args={"prepare_threshold": None, "connect_timeout": CONNECT_TIMEOUT_S},
    )


async def assert_database_role_is_safe(engine: AsyncEngine) -> None:
    async with engine.connect() as connection:
        rows = (await connection.execute(_ROLE_QUERY)).mappings().all()

    problems: list[str] = []
    for row in rows:
        via = "" if row["is_self"] else " (inherited through membership)"
        if row["rolsuper"]:
            problems.append(f"{row['rolname']} is a superuser{via}")
        if row["rolbypassrls"]:
            problems.append(f"{row['rolname']} has BYPASSRLS{via}")
        if row["owns_relations"]:
            problems.append(f"{row['rolname']} owns tables or other relations{via}")
        if row["owns_database"]:
            # The database owner owns the public schema through pg_database_owner, so it could
            # create tables and then own them.
            problems.append(f"{row['rolname']} owns the database{via}")

    if problems:
        raise UnsafeDatabaseRoleError(
            "refusing to start: the API's database role could skip row-level security — "
            + "; ".join(problems)
            + " (ADR-011)"
        )


async def verify_database_role(
    engine: AsyncEngine, *, attempts: int, retry_delay_s: float = 1.0
) -> None:
    for attempt in range(1, attempts + 1):
        try:
            await assert_database_role_is_safe(engine)
            return
        except (OperationalError, InterfaceError) as exc:
            if attempt == attempts:
                raise DatabaseUnreachableError(
                    f"refusing to start: Postgres unreachable after {attempts} attempt(s)"
                ) from exc
            await asyncio.sleep(retry_delay_s)


_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def init_database(database_url: str) -> AsyncEngine:
    global _engine, _session_factory
    _engine = create_engine(database_url)
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


async def dispose_database() -> None:
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    if _session_factory is None:
        raise RuntimeError("the database is not initialised; the app lifespan has not run")
    return _session_factory
