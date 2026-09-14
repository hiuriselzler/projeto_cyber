"""The Resend adapter (05 §5): the request it makes, and failures that name no address or key."""

import json

import httpx
import pytest

from app.core.email import RESEND_ENDPOINT, EmailDeliveryError, EmailMessage, ResendEmailSender

KEY = "re_test_0123456789abcdef"
SENDER = "CyberAthlete <onboarding@resend.dev>"
MESSAGE = EmailMessage("password_changed", "ana@example.com", "The subject", "The body")


async def test_a_message_goes_to_resend_as_plain_text():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"id": "4ef9a417"})

    await ResendEmailSender(KEY, SENDER, transport=httpx.MockTransport(handler)).send(MESSAGE)

    assert len(seen) == 1
    assert str(seen[0].url) == RESEND_ENDPOINT
    assert seen[0].headers["Authorization"] == f"Bearer {KEY}"
    assert json.loads(seen[0].content) == {
        "from": SENDER,
        "to": ["ana@example.com"],
        "subject": "The subject",
        "text": "The body",
    }


async def test_a_refused_message_is_an_error_that_names_no_address_or_key():
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(422, json={"message": "ana@example.com is not allowed"})

    sender = ResendEmailSender(KEY, SENDER, transport=httpx.MockTransport(handler))

    with pytest.raises(EmailDeliveryError) as error:
        await sender.send(MESSAGE)

    assert "422" in str(error.value)
    assert "ana@example.com" not in str(error.value)
    assert KEY not in str(error.value)


async def test_an_unreachable_provider_is_an_error_too():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("no route", request=request)

    sender = ResendEmailSender(KEY, SENDER, transport=httpx.MockTransport(handler))

    with pytest.raises(EmailDeliveryError, match="could not be reached"):
        await sender.send(MESSAGE)
