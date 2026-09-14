"""Two devices, rotation, reuse detection and the session list (04 §3, ADR-015 §2, task 003)."""

import asyncio

import pytest

from tests.integration.api_support import API, bearer

pytestmark = pytest.mark.integration


async def test_two_devices_register_sign_in_refresh_and_reach_a_protected_route_at_once(
    api_factory,
):
    api = await api_factory()
    email, phone, _ = await api.register()
    tablet = await api.sign_in(email)

    refreshed = await asyncio.gather(
        api.refresh(phone.refresh_token), api.refresh(tablet.refresh_token)
    )
    assert [response.status_code for response in refreshed] == [200, 200]
    accounts = await asyncio.gather(
        *(
            api.client.get(f"{API}/auth/me", headers=bearer(response.json()["access_token"]))
            for response in refreshed
        )
    )

    assert [response.status_code for response in accounts] == [200, 200]
    assert {response.json()["email"] for response in accounts} == {email}


async def test_a_protected_route_refuses_a_request_with_no_token_or_a_forged_one(api_factory):
    api = await api_factory()

    missing = await api.client.get(f"{API}/auth/me")
    forged = await api.client.get(f"{API}/auth/me", headers=bearer("not.a.token"))

    assert (missing.status_code, missing.json()) == (401, {"error": "unauthenticated"})
    assert missing.headers["WWW-Authenticate"] == "Bearer"
    assert forged.status_code == 401


async def test_a_replayed_refresh_token_revokes_that_devices_whole_chain_and_nothing_else(
    api_factory,
):
    api = await api_factory()
    email, phone, _ = await api.register()
    tablet = await api.sign_in(email)
    phone_now = phone.rotated(await api.refresh(phone.refresh_token))

    api.clock.advance(seconds=61)
    replay = await api.refresh(phone.refresh_token)

    assert (replay.status_code, replay.json()) == (401, {"error": "refresh_rejected"})
    assert (await api.refresh(phone_now.refresh_token)).status_code == 401
    assert (await api.refresh(tablet.refresh_token)).status_code == 200
    assert len(api.mail_to(email, "refresh_reuse")) == 1


async def test_a_lost_rotation_response_is_forgiven_within_sixty_seconds_and_theft_still_caught(
    api_factory,
):
    api = await api_factory()
    email, phone, _ = await api.register()
    lost = await api.refresh(phone.refresh_token)  # the response that never reached the phone
    assert lost.status_code == 200

    api.clock.advance(seconds=30)
    retried = phone.rotated(await api.refresh(phone.refresh_token))
    carried_on = retried.rotated(await api.refresh(retried.refresh_token))
    assert api.mail_to(email, "refresh_reuse") == []

    # The chain has moved on, so the original token is theft again — and the chain goes with it.
    assert (await api.refresh(phone.refresh_token)).status_code == 401
    assert (await api.refresh(carried_on.refresh_token)).status_code == 401
    assert len(api.mail_to(email, "refresh_reuse")) == 1


async def test_logout_signs_out_one_device_and_logout_all_signs_out_both(api_factory):
    api = await api_factory()
    email, phone, _ = await api.register()
    tablet = await api.sign_in(email)

    logout = await api.client.post(f"{API}/auth/logout", headers=bearer(phone.access_token))
    assert logout.status_code == 204
    assert (await api.refresh(phone.refresh_token)).status_code == 401
    tablet = tablet.rotated(await api.refresh(tablet.refresh_token))

    phone = await api.sign_in(email, device_id=phone.device_id)
    everywhere = await api.client.post(
        f"{API}/auth/logout-all", headers=bearer(tablet.access_token)
    )
    assert everywhere.status_code == 204
    assert (await api.refresh(phone.refresh_token)).status_code == 401
    assert (await api.refresh(tablet.refresh_token)).status_code == 401
    # A token a logout revoked is not a stolen one.
    assert api.mail_to(email, "refresh_reuse") == []


async def test_the_session_list_shows_both_devices_and_revoking_one_signs_only_it_out(
    api_factory,
):
    api = await api_factory()
    email, phone, _ = await api.register(device_name="Phone")
    tablet = await api.sign_in(email, device_name="Tablet")

    listed = await api.client.get(f"{API}/auth/sessions", headers=bearer(phone.access_token))
    assert listed.status_code == 200
    sessions = {session["device_id"]: session for session in listed.json()}
    assert set(sessions) == {phone.device_id, tablet.device_id}
    assert sessions[phone.device_id]["current"] is True
    assert sessions[tablet.device_id]["current"] is False
    assert sessions[tablet.device_id]["device_name"] == "Tablet"

    tablet_session = sessions[tablet.device_id]["id"]
    revoked = await api.client.delete(
        f"{API}/auth/sessions/{tablet_session}", headers=bearer(phone.access_token)
    )
    assert revoked.status_code == 204
    assert (await api.refresh(tablet.refresh_token)).status_code == 401
    assert (await api.refresh(phone.refresh_token)).status_code == 200

    again = await api.client.delete(
        f"{API}/auth/sessions/{tablet_session}", headers=bearer(phone.access_token)
    )
    assert again.status_code == 404


async def test_another_users_session_is_not_found(api_factory):
    api = await api_factory()
    _, phone, _ = await api.register()
    _, stranger, _ = await api.register()
    listed = await api.client.get(f"{API}/auth/sessions", headers=bearer(phone.access_token))
    phone_session = listed.json()[0]["id"]

    attempt = await api.client.delete(
        f"{API}/auth/sessions/{phone_session}", headers=bearer(stranger.access_token)
    )

    assert attempt.status_code == 404
    assert (await api.refresh(phone.refresh_token)).status_code == 200


async def test_an_unknown_refresh_token_is_rejected(api_factory):
    api = await api_factory()

    response = await api.refresh("x" * 43)

    assert (response.status_code, response.json()) == (401, {"error": "refresh_rejected"})
