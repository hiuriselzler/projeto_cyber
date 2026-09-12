import httpx
import pytest

from app.core.db import dispose_database, init_database
from app.main import create_app
from app.repositories.errors import DatabaseUnavailableError
from app.services.health import HealthService, Readiness

KNOWN = frozenset({"0001", "0002"})


class FakeSchemaVersions:
    def __init__(self, revision: str | None = None, *, unavailable: bool = False) -> None:
        self._revision = revision
        self._unavailable = unavailable

    async def current_revision(self) -> str | None:
        if self._unavailable:
            raise DatabaseUnavailableError
        return self._revision


async def readiness_for(reader: FakeSchemaVersions) -> Readiness:
    return await HealthService(reader, head="0002", known_revisions=KNOWN).readiness()


async def test_ready_at_head():
    assert await readiness_for(FakeSchemaVersions("0002")) == Readiness(ready=True)


async def test_not_ready_behind_head():
    expected = Readiness(ready=False, reason="migrations_pending")
    assert await readiness_for(FakeSchemaVersions("0001")) == expected


async def test_not_ready_when_alembic_has_never_run():
    expected = Readiness(ready=False, reason="migrations_pending")
    assert await readiness_for(FakeSchemaVersions(None)) == expected


async def test_ready_at_a_newer_revision_so_a_rollback_can_serve_traffic():
    assert await readiness_for(FakeSchemaVersions("0003")) == Readiness(ready=True)


async def test_not_ready_when_the_database_is_unreachable():
    expected = Readiness(ready=False, reason="database_unreachable")
    assert await readiness_for(FakeSchemaVersions(unavailable=True)) == expected


@pytest.fixture
async def unreachable_database():
    # Nothing listens on port 1, so the connection is refused at once.
    init_database("postgresql+psycopg://nobody:nothing@127.0.0.1:1/cyberathlete")
    yield
    await dispose_database()


async def test_the_ready_endpoint_answers_503_when_postgres_is_down(unreachable_database):
    transport = httpx.ASGITransport(app=create_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health/ready")

    assert response.status_code == 503
    assert response.json() == {"status": "not_ready", "reason": "database_unreachable"}


async def test_the_liveness_endpoint_never_touches_the_database(unreachable_database):
    transport = httpx.ASGITransport(app=create_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
