"""ADR-011: the API connects only as a role that cannot skip row-level security."""

import secrets

import pytest
from psycopg import errors as pg_errors
from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError

from app.core.config import get_settings
from app.core.db import UnsafeDatabaseRoleError, assert_database_role_is_safe, create_engine
from app.core.migrations import migration_tree
from app.main import create_app, lifespan

pytestmark = pytest.mark.integration


async def check_role(url: str) -> None:
    engine = create_engine(url)
    try:
        await assert_database_role_is_safe(engine)
    finally:
        await engine.dispose()


async def test_the_app_role_is_accepted(migrated):
    await check_role(migrated.app)


async def test_the_postgres_superuser_is_refused(migrated):
    with pytest.raises(UnsafeDatabaseRoleError, match="superuser"):
        await check_role(migrated.admin)


async def test_the_migrator_is_refused(migrated):
    with pytest.raises(UnsafeDatabaseRoleError, match="BYPASSRLS"):
        await check_role(migrated.migrator)


async def test_any_role_with_bypassrls_is_refused(migrated, make_role):
    url = await make_role("BYPASSRLS")

    with pytest.raises(UnsafeDatabaseRoleError, match="BYPASSRLS"):
        await check_role(url)


async def test_membership_in_a_role_that_bypasses_rls_is_refused(migrated, make_role):
    url = await make_role(member_of="cyberathlete_migrator")

    with pytest.raises(UnsafeDatabaseRoleError, match="inherited through membership"):
        await check_role(url)


async def test_a_role_that_owns_a_table_is_refused(migrated, make_role):
    url = await make_role(can_create=True)
    engine = create_engine(url)
    try:
        async with engine.begin() as connection:
            await connection.execute(text("CREATE TABLE owned_by_test_role (id integer)"))
    finally:
        await engine.dispose()

    with pytest.raises(UnsafeDatabaseRoleError, match="owns tables"):
        await check_role(url)


async def test_the_app_role_cannot_run_ddl(migrated):
    engine = create_engine(migrated.app)
    try:
        async with engine.connect() as connection:
            with pytest.raises(ProgrammingError) as error:
                await connection.execute(text("CREATE TABLE ddl_probe (id integer)"))
    finally:
        await engine.dispose()

    assert isinstance(error.value.orig, pg_errors.InsufficientPrivilege)


async def test_the_app_role_reads_alembic_version_without_a_manual_grant(migrated):
    engine = create_engine(migrated.app)
    try:
        async with engine.connect() as connection:
            revision = await connection.execute(text("SELECT version_num FROM alembic_version"))
            assert revision.scalar_one() == migration_tree().head
    finally:
        await engine.dispose()


async def test_the_app_role_cannot_write_alembic_version(migrated):
    engine = create_engine(migrated.app)
    try:
        async with engine.connect() as connection:
            with pytest.raises(ProgrammingError) as error:
                await connection.execute(text("UPDATE alembic_version SET version_num = 'x'"))
    finally:
        await engine.dispose()

    assert isinstance(error.value.orig, pg_errors.InsufficientPrivilege)


@pytest.mark.parametrize("role", ["admin", "migrator"])
async def test_the_api_refuses_to_boot_as_an_unsafe_role(migrated, monkeypatch, role):
    monkeypatch.setenv("DATABASE_URL", getattr(migrated, role))
    monkeypatch.setenv("JWT_SECRET", secrets.token_urlsafe(48))
    monkeypatch.setenv("DATABASE_CONNECT_ATTEMPTS", "1")
    get_settings.cache_clear()
    try:
        app = create_app()
        with pytest.raises(UnsafeDatabaseRoleError):
            async with lifespan(app):
                pass
    finally:
        get_settings.cache_clear()
