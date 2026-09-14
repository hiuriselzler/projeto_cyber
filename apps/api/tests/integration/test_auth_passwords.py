"""Password reset and password change, with the privacy key (04 §2a, ADR-007, task 003)."""

import uuid

import httpx
import pytest
from sqlalchemy import text

from tests.integration.api_support import (
    API,
    NEW_PASSWORD,
    STRONG_PASSWORD,
    bearer,
    privacy_key,
    token_in,
)

pytestmark = pytest.mark.integration


def add_privacy_zone(migrator_engine, user_id: str) -> None:
    with migrator_engine.begin() as connection:
        connection.execute(
            text(
                "INSERT INTO privacy_zones "
                "(id, user_id, ciphertext, nonce, created_at, updated_at) "
                "VALUES (gen_random_uuid(), :user_id, decode('00', 'hex'), "
                "decode(repeat('00', 24), 'hex'), now(), now())"
            ),
            {"user_id": user_id},
        )


async def request_reset(api, email: str) -> str:
    response = await api.client.post(f"{API}/auth/password-reset/request", json={"email": email})
    assert response.status_code == 202
    return token_in(api.mail_to(email, "password_reset")[-1])


async def test_a_reset_signs_every_device_out_and_discards_the_privacy_zones(
    api_factory, migrator_engine
):
    api = await api_factory()
    email, phone, registered = await api.register()
    tablet = await api.sign_in(email)
    user_id = registered["account"]["id"]
    add_privacy_zone(migrator_engine, user_id)
    token = await request_reset(api, email)
    new_key = privacy_key()

    confirmed = await api.client.post(
        f"{API}/auth/password-reset/confirm",
        json={"token": token, "new_password": NEW_PASSWORD, "privacy_key": new_key},
    )

    assert confirmed.status_code == 204
    assert (await api.refresh(phone.refresh_token)).status_code == 401
    assert (await api.refresh(tablet.refresh_token)).status_code == 401
    assert (await api.login(email, STRONG_PASSWORD)).status_code == 401
    signed_in = await api.login(email, NEW_PASSWORD)
    assert signed_in.status_code == 200
    assert signed_in.json()["account"]["privacy_key"]["wrapped_key"] == new_key["wrapped_key"]
    with migrator_engine.connect() as connection:
        deleted_at = connection.execute(
            text("SELECT deleted_at FROM privacy_zones WHERE user_id = :user_id"),
            {"user_id": user_id},
        ).scalar_one()
    assert deleted_at is not None
    assert len(api.mail_to(email, "password_changed")) == 1


async def test_a_used_reset_token_is_rejected(api_factory):
    api = await api_factory()
    email, _, _ = await api.register()
    token = await request_reset(api, email)
    body = {"token": token, "new_password": NEW_PASSWORD, "privacy_key": privacy_key()}

    assert (
        await api.client.post(f"{API}/auth/password-reset/confirm", json=body)
    ).status_code == 204
    again = await api.client.post(f"{API}/auth/password-reset/confirm", json=body)

    assert (again.status_code, again.json()) == (400, {"error": "invalid_token"})


async def test_an_expired_reset_token_is_rejected(api_factory):
    api = await api_factory()
    email, _, _ = await api.register()
    token = await request_reset(api, email)

    api.clock.advance(minutes=31)
    response = await api.client.post(
        f"{API}/auth/password-reset/confirm",
        json={"token": token, "new_password": NEW_PASSWORD, "privacy_key": privacy_key()},
    )

    assert (response.status_code, response.json()) == (400, {"error": "invalid_token"})
    assert (await api.login(email, STRONG_PASSWORD)).status_code == 200


async def test_the_reset_request_answers_identically_for_a_registered_and_an_unregistered_email(
    api_factory,
):
    api = await api_factory()
    email, _, _ = await api.register()

    registered = await api.client.post(f"{API}/auth/password-reset/request", json={"email": email})
    unregistered = await api.client.post(
        f"{API}/auth/password-reset/request",
        json={"email": f"nobody-{uuid.uuid4().hex}@example.com"},
    )

    def comparable(response: httpx.Response) -> tuple[int, bytes, dict[str, str]]:
        headers = {k: v for k, v in response.headers.items() if k.lower() != "x-request-id"}
        return response.status_code, response.content, headers

    assert comparable(registered) == comparable(unregistered)
    assert registered.status_code == 202
    assert len(api.mail_to(email, "password_reset")) == 1


async def test_a_reset_refuses_a_breached_password(api_factory):
    api = await api_factory()
    email, _, _ = await api.register()
    token = await request_reset(api, email)

    response = await api.client.post(
        f"{API}/auth/password-reset/confirm",
        json={"token": token, "new_password": "1234567890", "privacy_key": privacy_key()},
    )

    assert (response.status_code, response.json()) == (422, {"error": "password_breached"})


async def test_a_password_change_keeps_other_devices_signed_in_and_replaces_the_wrap(api_factory):
    api = await api_factory()
    email, phone, _ = await api.register()
    tablet = await api.sign_in(email)
    outstanding_reset = await request_reset(api, email)
    new_key = privacy_key()

    changed = await api.client.post(
        f"{API}/auth/password/change",
        headers=bearer(phone.access_token),
        json={
            "current_password": STRONG_PASSWORD,
            "new_password": NEW_PASSWORD,
            "privacy_key": new_key,
        },
    )

    assert changed.status_code == 204
    assert (await api.refresh(tablet.refresh_token)).status_code == 200
    assert (await api.login(email, STRONG_PASSWORD)).status_code == 401
    signed_in = await api.login(email, NEW_PASSWORD)
    assert signed_in.json()["account"]["privacy_key"]["wrapped_key"] == new_key["wrapped_key"]
    assert len(api.mail_to(email, "password_changed")) == 1
    # Any password change ends every outstanding reset link (04 §2a).
    late = await api.client.post(
        f"{API}/auth/password-reset/confirm",
        json={
            "token": outstanding_reset,
            "new_password": STRONG_PASSWORD,
            "privacy_key": privacy_key(),
        },
    )
    assert late.status_code == 400


async def test_a_password_change_with_the_wrong_current_password_is_refused_without_a_401(
    api_factory,
):
    """403, not 401: a client refreshes its session on 401, and a typo is not a lost session."""
    api = await api_factory()
    _, phone, _ = await api.register()

    response = await api.client.post(
        f"{API}/auth/password/change",
        headers=bearer(phone.access_token),
        json={
            "current_password": "not the password at all",
            "new_password": NEW_PASSWORD,
            "privacy_key": privacy_key(),
        },
    )

    assert (response.status_code, response.json()) == (403, {"error": "password_incorrect"})


async def test_a_password_change_refuses_a_breached_password(api_factory):
    api = await api_factory()
    _, phone, _ = await api.register()

    response = await api.client.post(
        f"{API}/auth/password/change",
        headers=bearer(phone.access_token),
        json={
            "current_password": STRONG_PASSWORD,
            "new_password": "qwertyuiop",
            "privacy_key": privacy_key(),
        },
    )

    assert (response.status_code, response.json()) == (422, {"error": "password_breached"})
