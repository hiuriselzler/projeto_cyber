"""Account deletion in the app, and the sweep that carries it out (task 019; 04 §2a, §7)."""

import uuid
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import Engine, text

from app.core.db import get_session_factory, transaction
from app.core.email import EmailMessage, MemoryEmailSender
from app.core.scope import UserId
from app.repositories.users import UserRepository
from app.services.auth.deletion import GRACE_PERIOD
from app.services.maintenance.deletion import AccountDeletionSweep
from scripts.check_schema import CLASSIFICATION
from tests.integration.api_support import API, Api, FakeClock, bearer
from tests.integration.builders import account_exists, create_user_graph

pytestmark = pytest.mark.integration

WRONG_PASSWORD = "not the password at all"

OWNED_TABLES = sorted(
    name for name, entry in CLASSIFICATION.items() if entry.owner and entry.placement != "device"
)


def sweep(
    api: Api, *, after: timedelta, sender: MemoryEmailSender | None = None
) -> AccountDeletionSweep:
    """The sweep on a clock of its own, `after` ahead of the API's — so the API's access tokens are
    still valid when it has run."""
    clock = FakeClock()
    clock.now = api.clock.now + after
    return AccountDeletionSweep(get_session_factory(), sender=sender or api.mail, clock=clock)


def exists(migrator_engine: Engine, user_id: uuid.UUID | str) -> bool:
    with migrator_engine.connect() as connection:
        return account_exists(connection, user_id)


async def test_deletion_needs_the_current_password_and_an_unverified_account_may_ask(api_factory):
    api = await api_factory()
    _, phone, registered = await api.register()
    assert registered["account"]["email_verified"] is False

    refused = await api.request_deletion(phone, WRONG_PASSWORD)
    assert (refused.status_code, refused.json()) == (403, {"error": "password_incorrect"})
    assert (await api.me(phone))["deletion_requested_at"] is None

    accepted = await api.request_deletion(phone)
    assert accepted.status_code == 200, accepted.text
    body = accepted.json()
    assert datetime.fromisoformat(body["deletion_requested_at"]) == api.clock.now
    assert datetime.fromisoformat(body["deleted_from"]) == api.clock.now + timedelta(days=7)
    pending = (await api.me(phone))["deletion_requested_at"]
    assert datetime.fromisoformat(pending) == api.clock.now


async def test_a_wrong_password_counts_against_the_login_limit(api_factory):
    api = await api_factory(rate_limits=True)
    _, phone, _ = await api.register()

    for _attempt in range(10):
        assert (await api.request_deletion(phone, WRONG_PASSWORD)).status_code == 403
    limited = await api.request_deletion(phone)

    assert (limited.status_code, limited.json()) == (429, {"error": "rate_limited"})


@pytest.mark.parametrize(
    ("locale", "subject", "date_format"),
    [("en", "will be deleted", "%Y-%m-%d"), ("pt-BR", "será excluída", "%d/%m/%Y")],
)
async def test_the_request_is_emailed_in_the_users_language_with_the_date_where_they_live(
    api_factory, locale, subject, date_format
):
    api = await api_factory()
    # Fourteen hours ahead of UTC, so a date taken in UTC would usually be a different day.
    email, phone, _ = await api.register(locale=locale, timezone="Pacific/Kiritimati")

    assert (await api.request_deletion(phone)).status_code == 200

    [message] = api.mail_to(email, "deletion_requested")
    day = (api.clock.now + GRACE_PERIOD).astimezone(ZoneInfo("Pacific/Kiritimati")).date()
    assert subject in message.subject
    assert day.strftime(date_format) in message.body


async def test_other_devices_stay_signed_in_and_any_of_them_can_cancel(api_factory):
    api = await api_factory()
    email, phone, _ = await api.register()
    tablet = await api.sign_in(email)
    before = await api.me(tablet)

    assert (await api.request_deletion(phone)).status_code == 200
    tablet = tablet.rotated(await api.refresh(tablet.refresh_token))
    cancelled = await api.client.delete(f"{API}/auth/deletion", headers=bearer(tablet.access_token))

    assert cancelled.status_code == 204
    assert await api.me(phone) == before
    assert len(api.mail_to(email, "deletion_cancelled")) == 1


async def test_cancelling_with_nothing_pending_changes_nothing(api_factory):
    api = await api_factory()
    email, phone, _ = await api.register()

    response = await api.client.delete(f"{API}/auth/deletion", headers=bearer(phone.access_token))

    assert response.status_code == 204
    assert api.mail_to(email, "deletion_cancelled") == []


async def test_asking_again_keeps_the_first_date_and_says_nothing_more(api_factory):
    api = await api_factory()
    email, phone, _ = await api.register()
    first = await api.request_deletion(phone)

    api.clock.advance(minutes=5)
    second = await api.request_deletion(phone)

    assert second.json() == first.json()
    assert len(api.mail_to(email, "deletion_requested")) == 1


async def test_the_sweep_deletes_an_account_seven_days_after_its_request_and_not_before(
    api_factory, migrator_engine
):
    api = await api_factory()
    _, phone, registered = await api.register()
    user_id = registered["account"]["id"]
    assert (await api.request_deletion(phone)).status_code == 200

    await sweep(api, after=GRACE_PERIOD - timedelta(seconds=1)).run()
    assert exists(migrator_engine, user_id)

    await sweep(api, after=GRACE_PERIOD).run()
    assert not exists(migrator_engine, user_id)


async def test_after_the_sweep_no_table_holds_a_row_of_the_account(
    api_factory, seeded, migrator_engine
):
    """Over 03 §11's classification, so a table added later is covered without editing this test."""
    api = await api_factory()
    with migrator_engine.begin() as connection:
        doomed = create_user_graph(connection)
        kept = create_user_graph(connection)
        connection.execute(
            text("UPDATE users SET deletion_requested_at = :at WHERE id = :id"),
            {"at": api.clock.now - GRACE_PERIOD, "id": doomed.user_id},
        )

    await sweep(api, after=timedelta(0)).run()

    with migrator_engine.connect() as connection:

        def rows_of(user_id: uuid.UUID) -> dict[str, int]:
            return {
                table: connection.execute(
                    text(f"SELECT count(*) FROM {table} WHERE {CLASSIFICATION[table].owner} = :id"),
                    {"id": user_id},
                ).scalar_one()
                for table in OWNED_TABLES
            }

        doomed_rows, kept_rows = rows_of(doomed.user_id), rows_of(kept.user_id)

    assert set(doomed_rows.values()) == {0}, doomed_rows
    assert 0 not in kept_rows.values(), kept_rows
    assert len(api.mail_to(doomed.email, "account_deleted")) == 1


async def test_without_the_accounts_own_scope_the_delete_removes_nothing(
    api_factory, migrator_engine
):
    """Row-level security is the second line: the sweep's delete, run with no user scope, finds no
    row to delete (ADR-011)."""
    api = await api_factory()
    _, phone, registered = await api.register()
    assert (await api.request_deletion(phone)).status_code == 200
    user_id = UserId(uuid.UUID(registered["account"]["id"]))

    async with transaction(get_session_factory()) as session:
        deleted = await UserRepository(session).delete_if_requested_before(user_id, api.clock.now)

    assert deleted is None
    assert exists(migrator_engine, user_id)


async def test_the_account_deleted_email_goes_out_only_once_the_account_is_gone(
    api_factory, migrator_engine
):
    api = await api_factory()
    email, phone, registered = await api.register()
    user_id = registered["account"]["id"]
    assert (await api.request_deletion(phone)).status_code == 200
    present_when_sent: list[bool] = []

    class Witness(MemoryEmailSender):
        async def send(self, message: EmailMessage) -> None:
            if message.to == email:
                present_when_sent.append(exists(migrator_engine, user_id))
            await super().send(message)

    witness = Witness()
    await sweep(api, after=GRACE_PERIOD, sender=witness).run()

    assert [message.kind for message in witness.sent if message.to == email] == ["account_deleted"]
    assert present_when_sent == [False]


async def test_a_deleted_account_is_signed_out_and_its_address_can_register_again(api_factory):
    api = await api_factory()
    email, phone, _ = await api.register()
    assert (await api.request_deletion(phone)).status_code == 200

    await sweep(api, after=GRACE_PERIOD).run()

    assert (await api.refresh(phone.refresh_token)).status_code == 401
    # The access token is a stateless JWT with minutes left to run (04 §8); it reaches nothing.
    me = await api.client.get(f"{API}/auth/me", headers=bearer(phone.access_token))
    logged = await api.log_workout(phone)
    assert (me.status_code, me.json()) == (401, {"error": "unauthenticated"})
    assert (logged.status_code, logged.json()) == (401, {"error": "unauthenticated"})

    again = await api.client.post(f"{API}/auth/register", json=api.registration_body(email=email))
    assert again.status_code == 201
