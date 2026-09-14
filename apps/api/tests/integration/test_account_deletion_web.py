"""The account-deletion web page Google Play links to (task 019; 04 §2a)."""

import html
import uuid
from urllib.parse import urlencode
from zoneinfo import ZoneInfo

import httpx
import pytest

from app.core.i18n import message
from app.services.auth.deletion import GRACE_PERIOD
from tests.integration.api_support import Api, token_in

pytestmark = pytest.mark.integration

PAGE = "/account-deletion"
CONFIRM = "/account-deletion/confirm"
FORM = {"Content-Type": "application/x-www-form-urlencoded"}


async def submit(api: Api, path: str, fields: list[tuple[str, str]]) -> httpx.Response:
    return await api.client.post(path, content=urlencode(fields), headers=FORM)


async def ask_for_link(api: Api, email: str) -> str:
    assert (await submit(api, PAGE, [("email", email)])).status_code == 200
    return token_in(api.mail_to(email, "deletion_link")[-1])


def words(locale: str, key: str) -> str:
    return html.escape(
        message("pt-BR" if locale == "pt-BR" else "en", f"web.account_deletion.{key}")
    )


async def test_the_page_asks_for_an_address_in_the_browsers_language(api_factory):
    api = await api_factory()

    english = await api.client.get(PAGE)
    portuguese = await api.client.get(PAGE, headers={"Accept-Language": "pt-BR,pt;q=0.9,en;q=0.5"})
    chosen = await api.client.get(PAGE, params={"lang": "pt-BR"}, headers={"Accept-Language": "en"})

    assert english.status_code == portuguese.status_code == chosen.status_code == 200
    assert '<html lang="en">' in english.text
    assert words("en", "title") in english.text
    for page in (portuguese, chosen):
        assert '<html lang="pt-BR">' in page.text
        assert words("pt-BR", "title") in page.text


async def test_the_page_cannot_be_framed_cached_or_leak_its_link(api_factory):
    api = await api_factory()

    for response in (
        await api.client.get(PAGE),
        await api.client.get(CONFIRM, params={"token": "t" * 43}),
    ):
        assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
        assert response.headers["x-frame-options"] == "DENY"
        assert response.headers["referrer-policy"] == "no-referrer"
        assert response.headers["cache-control"] == "no-store"
        assert "set-cookie" not in response.headers


async def test_the_answer_is_the_same_for_a_registered_and_an_unregistered_address(api_factory):
    api = await api_factory()
    email, _, _ = await api.register()

    registered = await submit(api, PAGE, [("email", email), ("lang", "en")])
    unregistered = await submit(
        api, PAGE, [("email", f"nobody-{uuid.uuid4().hex}@example.com"), ("lang", "en")]
    )

    assert registered.status_code == 200
    assert (registered.status_code, registered.text) == (
        unregistered.status_code,
        unregistered.text,
    )
    assert len(api.mail_to(email, "deletion_link")) == 1


async def test_opening_the_link_schedules_nothing_and_only_its_button_does(api_factory):
    api = await api_factory()
    email, phone, _ = await api.register(locale="pt-BR")
    token = await ask_for_link(api, email)

    opened = await api.client.get(CONFIRM, params={"token": token})
    assert opened.status_code == 200
    assert f'value="{token}"' in opened.text
    assert (await api.me(phone))["deletion_requested_at"] is None
    assert api.mail_to(email, "deletion_requested") == []

    confirmed = await submit(api, CONFIRM, [("token", token), ("lang", "en")])
    assert confirmed.status_code == 200
    day = (api.clock.now + GRACE_PERIOD).astimezone(ZoneInfo("America/Sao_Paulo")).date()
    assert day.isoformat() in confirmed.text
    assert (await api.me(phone))["deletion_requested_at"] is not None
    [told] = api.mail_to(email, "deletion_requested")
    assert day.strftime("%d/%m/%Y") in told.body
    # Every device stays signed in, so the deletion can still be cancelled from the app.
    assert (await api.refresh(phone.refresh_token)).status_code == 200


async def test_a_used_or_an_expired_link_is_refused(api_factory):
    api = await api_factory()
    email, _, _ = await api.register()
    token = await ask_for_link(api, email)
    assert (await submit(api, CONFIRM, [("token", token)])).status_code == 200
    reused = await submit(api, CONFIRM, [("token", token)])
    assert reused.status_code == 400

    other_email, _, _ = await api.register()
    late = await ask_for_link(api, other_email)
    api.clock.advance(minutes=31)
    expired = await submit(api, CONFIRM, [("token", late), ("lang", "en")])

    assert expired.status_code == 400
    assert words("en", "invalid_link") in expired.text


async def test_anything_but_the_form_is_refused(api_factory):
    api = await api_factory()
    address = f"nobody-{uuid.uuid4().hex}@example.com"

    refused = [
        await api.client.post(PAGE, json={"email": address}),
        await submit(api, PAGE, [("email", address), ("role", "admin")]),
        await submit(api, PAGE, [("email", address), ("email", address)]),
        await submit(api, PAGE, [("email", "not an address")]),
        await submit(api, CONFIRM, [("token", "short")]),
    ]

    assert [response.status_code for response in refused] == [400] * len(refused)
    assert api.mail.sent == []


async def test_the_page_shares_the_email_sending_limit(api_factory):
    api = await api_factory(rate_limits=True)
    address = f"nobody-{uuid.uuid4().hex}@example.com"

    for _attempt in range(10):
        assert (await submit(api, PAGE, [("email", address)])).status_code == 200
    limited = await submit(api, PAGE, [("email", address)])

    assert limited.status_code == 429
    assert int(limited.headers["Retry-After"]) > 0
