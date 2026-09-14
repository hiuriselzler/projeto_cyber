"""Integration tests run against a real Postgres: docker compose locally, a service container in CI.

They need the app role's URL, the migrator's, and the admin user of that throwaway container. The
admin URL only creates and drops test roles, and never points at a managed database (ADR-011).
Without the URLs the tests skip, unless CYBERATHLETE_REQUIRE_INTEGRATION=1 (as CI sets) turns a
skip into a failure.
"""

import os
import secrets
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass

import httpx
import pytest
from alembic import command
from alembic.config import Config
from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import Connection, Engine, create_engine, make_url, text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool

from app.api.deps import get_clock, get_email_sender, get_password_hasher, get_rate_limiter
from app.core.config import ENV_FILE, get_settings
from app.core.db import dispose_database, init_database
from app.core.email import MemoryEmailSender
from app.core.migrations import API_ROOT
from app.core.security import PasswordHasher
from app.main import create_app
from seeds.reference import seed
from tests.integration.api_support import FAST_HASHER, Api, FakeClock, NoRateLimits


class _IntegrationEnvironment(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    database_url: SecretStr | None = None
    migration_database_url: SecretStr | None = None
    test_admin_database_url: SecretStr | None = None


@dataclass(frozen=True)
class DatabaseUrls:
    app: str
    migrator: str
    admin: str


def alembic_config(migrator_url: str) -> Config:
    config = Config(str(API_ROOT / "alembic.ini"))
    config.attributes["database_url"] = migrator_url
    return config


@pytest.fixture(scope="session")
def database_urls() -> DatabaseUrls:
    environment = _IntegrationEnvironment()
    urls = {
        "DATABASE_URL": environment.database_url,
        "MIGRATION_DATABASE_URL": environment.migration_database_url,
        "TEST_ADMIN_DATABASE_URL": environment.test_admin_database_url,
    }
    missing = sorted(name for name, value in urls.items() if value is None)
    if missing:
        message = "integration tests need " + ", ".join(missing)
        if os.environ.get("CYBERATHLETE_REQUIRE_INTEGRATION") == "1":
            pytest.fail(message)
        pytest.skip(message)
    return DatabaseUrls(
        app=environment.database_url.get_secret_value(),  # type: ignore[union-attr]
        migrator=environment.migration_database_url.get_secret_value(),  # type: ignore[union-attr]
        admin=environment.test_admin_database_url.get_secret_value(),  # type: ignore[union-attr]
    )


@pytest.fixture(scope="session")
def migrated(database_urls: DatabaseUrls) -> DatabaseUrls:
    command.upgrade(alembic_config(database_urls.migrator), "head")
    return database_urls


@pytest.fixture(scope="module")
def migrator_engine(migrated: DatabaseUrls) -> Iterator[Engine]:
    engine = create_engine(migrated.migrator, poolclass=NullPool)
    yield engine
    engine.dispose()


@pytest.fixture(scope="module")
def app_engine(migrated: DatabaseUrls) -> Iterator[Engine]:
    engine = create_engine(migrated.app, poolclass=NullPool)
    yield engine
    engine.dispose()


@pytest.fixture(scope="module")
def seeded(migrated: DatabaseUrls, migrator_engine: Engine) -> DatabaseUrls:
    """Reference data present. Per module, because the readiness test migrates down and back up."""
    command.upgrade(alembic_config(migrated.migrator), "head")
    with migrator_engine.begin() as connection:
        seed(connection)
    return migrated


@contextmanager
def scoped(engine: Engine, user_id: uuid.UUID | None) -> Iterator[Connection]:
    """A transaction as the app sees it: `SET LOCAL app.user_id`, or no scope at all (ADR-011)."""
    with engine.begin() as connection:
        if user_id is not None:
            connection.execute(
                text("SELECT set_config('app.user_id', :user_id, true)"),
                {"user_id": str(user_id)},
            )
        yield connection


MakeRole = Callable[..., Awaitable[str]]


@pytest.fixture
async def make_role(database_urls: DatabaseUrls) -> AsyncIterator[MakeRole]:
    """Creates throwaway login roles as the admin user, and returns a URL that connects as each."""
    admin = create_async_engine(database_urls.admin, isolation_level="AUTOCOMMIT")
    database = make_url(database_urls.app).database
    created: list[str] = []

    async def _make_role(
        attributes: str = "", *, member_of: str | None = None, can_create: bool = False
    ) -> str:
        name = f"test_role_{uuid.uuid4().hex[:12]}"
        password = uuid.uuid4().hex
        async with admin.connect() as connection:
            await connection.execute(
                text(f"CREATE ROLE {name} LOGIN PASSWORD '{password}' {attributes}")
            )
            await connection.execute(text(f'GRANT CONNECT ON DATABASE "{database}" TO {name}'))
            if member_of is not None:
                await connection.execute(text(f"GRANT {member_of} TO {name}"))
            if can_create:
                await connection.execute(text(f"GRANT CREATE ON SCHEMA public TO {name}"))
        created.append(name)
        return (
            make_url(database_urls.app)
            .set(username=name, password=password)
            .render_as_string(hide_password=False)
        )

    yield _make_role

    async with admin.connect() as connection:
        for name in created:
            await connection.execute(text(f"DROP OWNED BY {name}"))
            await connection.execute(text(f"DROP ROLE IF EXISTS {name}"))
    await admin.dispose()


ApiFactory = Callable[..., Awaitable[Api]]


@pytest.fixture
async def api_factory(
    migrated: DatabaseUrls, monkeypatch: pytest.MonkeyPatch
) -> AsyncIterator[ApiFactory]:
    """In-process API instances over the real database, as `cyberathlete_app` (ADR-011).

    Each instance has its own clock, its own outbox and its own client address. Rate limits are off
    unless a test asks for them, and passwords are hashed cheaply unless a test passes the
    production hasher.
    """
    monkeypatch.setenv("DATABASE_URL", migrated.app)
    monkeypatch.setenv("JWT_SECRET", secrets.token_urlsafe(48))
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("EMAIL_TRANSPORT", "memory")
    get_settings.cache_clear()
    init_database(migrated.app)
    clients: list[httpx.AsyncClient] = []

    async def make(
        *,
        hasher: PasswordHasher = FAST_HASHER,
        rate_limits: bool = False,
        client_ip: str | None = None,
        clock: FakeClock | None = None,
    ) -> Api:
        clock = clock or FakeClock()
        mail = MemoryEmailSender()
        app = create_app()
        app.dependency_overrides[get_clock] = lambda: clock
        app.dependency_overrides[get_password_hasher] = lambda: hasher
        app.dependency_overrides[get_email_sender] = lambda: mail
        if not rate_limits:
            app.dependency_overrides[get_rate_limiter] = NoRateLimits
        address = (
            client_ip
            or f"10.{secrets.randbelow(250)}.{secrets.randbelow(250)}.{secrets.randbelow(250)}"
        )
        transport = httpx.ASGITransport(app=app, client=(address, 50_000))
        client = httpx.AsyncClient(transport=transport, base_url="http://test")
        clients.append(client)
        return Api(app, client, clock, mail)

    yield make

    for client in clients:
        await client.aclose()
    await dispose_database()
    get_settings.cache_clear()
