"""The daily command (task 019, 06 §5): the account-deletion sweep and the retention purges, safe to
repeat."""

import pytest

from app.jobs.daily import DailyReport, run_daily
from app.services.auth.deletion import GRACE_PERIOD
from tests.integration.api_support import FakeClock
from tests.integration.builders import account_exists

pytestmark = pytest.mark.integration


async def test_the_daily_command_deletes_what_is_due_and_finds_nothing_the_second_time(
    api_factory, migrator_engine
):
    api = await api_factory()
    email, phone, registered = await api.register()
    assert (await api.request_deletion(phone)).status_code == 200
    a_week_later = FakeClock()
    a_week_later.now = api.clock.now + GRACE_PERIOD

    first = await run_daily(sender=api.mail, clock=a_week_later)
    second = await run_daily(sender=api.mail, clock=a_week_later)

    with migrator_engine.connect() as connection:
        assert not account_exists(connection, registered["account"]["id"])
    assert first.accounts_deleted >= 1
    assert len(api.mail_to(email, "account_deleted")) == 1
    assert second == DailyReport(
        accounts_deleted=0, revoked_refresh_tokens_purged=0, rate_limit_windows_purged=0
    )
