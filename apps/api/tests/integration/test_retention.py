"""Retention sweeps (04 §7): revoked refresh tokens after 90 days, rate-limit windows after one."""

import uuid

import pytest
from sqlalchemy import text

from app.core.db import get_session_factory
from app.services.maintenance.retention import RetentionService

pytestmark = pytest.mark.integration


async def test_old_revoked_tokens_and_old_rate_limit_windows_are_purged(
    api_factory, migrator_engine
):
    api = await api_factory()
    _, _, registered = await api.register()
    user_id = registered["account"]["id"]
    stale_key = f"login:ip:{uuid.uuid4().hex}"
    with migrator_engine.begin() as connection:
        connection.execute(
            text(
                "UPDATE refresh_tokens SET revoked_at = :now - interval '91 days' "
                "WHERE user_id = :user_id"
            ),
            {"now": api.clock.now, "user_id": user_id},
        )
        connection.execute(
            text(
                "INSERT INTO rate_limit_buckets (bucket_key, window_start, hits) "
                "VALUES (:key, :now - interval '2 days', 3)"
            ),
            {"key": stale_key, "now": api.clock.now},
        )

    retention = RetentionService(get_session_factory(), clock=api.clock)
    assert await retention.purge_revoked_refresh_tokens() >= 1
    assert await retention.purge_rate_limit_windows() >= 1

    with migrator_engine.connect() as connection:
        tokens = connection.execute(
            text("SELECT count(*) FROM refresh_tokens WHERE user_id = :user_id"),
            {"user_id": user_id},
        ).scalar_one()
        windows = connection.execute(
            text("SELECT count(*) FROM rate_limit_buckets WHERE bucket_key = :key"),
            {"key": stale_key},
        ).scalar_one()
    assert (tokens, windows) == (0, 0)
