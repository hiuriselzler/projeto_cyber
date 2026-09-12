"""06 §5: ready means Postgres is reachable and its schema is not behind this build."""

import httpx
import pytest
from alembic import command

from app.core.db import dispose_database, init_database
from app.main import create_app
from tests.integration.conftest import alembic_config

pytestmark = pytest.mark.integration


async def get_ready(app_url: str) -> httpx.Response:
    init_database(app_url)
    try:
        transport = httpx.ASGITransport(app=create_app())
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            return await client.get("/health/ready")
    finally:
        await dispose_database()


async def test_ready_when_the_schema_is_at_head(migrated):
    response = await get_ready(migrated.app)

    assert response.status_code == 200
    assert response.json() == {"status": "ready", "reason": None}


async def test_not_ready_when_the_schema_is_behind_the_latest_revision(migrated):
    config = alembic_config(migrated.migrator)
    command.downgrade(config, "base")
    try:
        response = await get_ready(migrated.app)
    finally:
        command.upgrade(config, "head")

    assert response.status_code == 503
    assert response.json() == {"status": "not_ready", "reason": "migrations_pending"}
