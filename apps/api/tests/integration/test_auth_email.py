"""Email verification, email change and the account's own settings (04 §2a, ADR-008, task 003)."""

import pytest

from app.api.deps import VerifiedUser
from tests.integration.api_support import API, STRONG_PASSWORD, bearer, token_in

pytestmark = pytest.mark.integration

# The data export has no task yet (FR-1.4, open question 11); this stands where it will, behind the
# same gate.
EXPORT_STAND_IN = f"{API}/test-only/export"


def mount_export_stand_in(api) -> None:
    async def export(_principal: VerifiedUser) -> dict[str, str]:
        return {"status": "accepted"}

    api.app.add_api_route(EXPORT_STAND_IN, export, methods=["POST"])


async def verify(api, message) -> int:
    response = await api.client.post(f"{API}/auth/email/verify", json={"token": token_in(message)})
    status: int = response.status_code
    return status


async def test_an_unverified_user_trains_but_cannot_export_or_change_their_email(api_factory):
    api = await api_factory()
    mount_export_stand_in(api)
    email, phone, registered = await api.register()
    assert registered["account"]["email_verified"] is False

    assert (await api.log_workout(phone)).status_code == 201
    export = await api.client.post(EXPORT_STAND_IN, headers=bearer(phone.access_token))
    change = await api.client.post(
        f"{API}/auth/email/change",
        headers=bearer(phone.access_token),
        json={"current_password": STRONG_PASSWORD, "new_email": "new@example.com"},
    )
    assert (export.status_code, export.json()) == (403, {"error": "email_unverified"})
    assert (change.status_code, change.json()) == (403, {"error": "email_unverified"})

    assert await verify(api, api.mail_to(email, "verify_email")[0]) == 204
    me = await api.client.get(f"{API}/auth/me", headers=bearer(phone.access_token))
    assert me.json()["email_verified"] is True
    after = await api.client.post(EXPORT_STAND_IN, headers=bearer(phone.access_token))
    assert after.status_code == 200


async def test_an_email_change_waits_for_the_new_address_and_tells_the_old_one(api_factory):
    api = await api_factory()
    email, phone, _ = await api.register()
    assert await verify(api, api.mail_to(email, "verify_email")[0]) == 204
    new_email = f"moved-{email}"

    requested = await api.client.post(
        f"{API}/auth/email/change",
        headers=bearer(phone.access_token),
        json={"current_password": STRONG_PASSWORD, "new_email": new_email},
    )
    assert requested.status_code == 202
    unchanged = await api.client.get(f"{API}/auth/me", headers=bearer(phone.access_token))
    assert unchanged.json()["email"] == email

    assert await verify(api, api.mail_to(new_email, "verify_email")[0]) == 204
    moved = await api.client.get(f"{API}/auth/me", headers=bearer(phone.access_token))
    assert moved.json()["email"] == new_email
    told = api.mail_to(email, "email_changed")
    assert len(told) == 1
    assert new_email in told[0].body
    assert (await api.login(new_email)).status_code == 200
    assert (await api.login(email)).status_code == 401


async def test_an_email_change_needs_the_current_password(api_factory):
    api = await api_factory()
    email, phone, _ = await api.register()
    assert await verify(api, api.mail_to(email, "verify_email")[0]) == 204

    response = await api.client.post(
        f"{API}/auth/email/change",
        headers=bearer(phone.access_token),
        json={"current_password": "not the password at all", "new_email": "x@example.com"},
    )

    assert (response.status_code, response.json()) == (403, {"error": "password_incorrect"})


async def test_a_verification_link_works_once_and_not_after_a_day(api_factory):
    api = await api_factory()
    email, _, _ = await api.register()
    first = api.mail_to(email, "verify_email")[0]
    assert await verify(api, first) == 204
    assert await verify(api, first) == 400

    other_email, _, _ = await api.register()
    api.clock.advance(hours=25)
    assert await verify(api, api.mail_to(other_email, "verify_email")[0]) == 400


async def test_a_verification_link_can_be_sent_again_until_the_address_is_verified(api_factory):
    api = await api_factory()
    email, phone, _ = await api.register()

    again = await api.client.post(
        f"{API}/auth/email/verification", headers=bearer(phone.access_token)
    )
    assert again.status_code == 202
    assert len(api.mail_to(email, "verify_email")) == 2

    assert await verify(api, api.mail_to(email, "verify_email")[-1]) == 204
    await api.client.post(f"{API}/auth/email/verification", headers=bearer(phone.access_token))
    assert len(api.mail_to(email, "verify_email")) == 2


async def test_a_portuguese_account_gets_its_email_in_portuguese(api_factory):
    api = await api_factory()
    email, _, _ = await api.register(locale="pt-BR", display_name="João")

    message = api.mail_to(email, "verify_email")[0]

    assert "Confirme" in message.subject
    assert message.body.startswith("Olá, João.")


async def test_the_account_settings_are_editable_and_nothing_else_is(api_factory):
    api = await api_factory()
    _, phone, _ = await api.register()
    headers = bearer(phone.access_token)

    changed = await api.client.patch(
        f"{API}/auth/me", headers=headers, json={"locale": "pt-BR", "unit_system": "imperial"}
    )
    assert changed.status_code == 200
    assert (changed.json()["locale"], changed.json()["unit_system"]) == ("pt-BR", "imperial")

    cleared = await api.client.patch(f"{API}/auth/me", headers=headers, json={"display_name": None})
    smuggled = await api.client.patch(
        f"{API}/auth/me", headers=headers, json={"email_verified_at": "2026-01-01T00:00:00Z"}
    )
    assert cleared.status_code == 422
    assert smuggled.status_code == 422
