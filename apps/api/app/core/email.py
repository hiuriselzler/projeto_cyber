"""Transactional email (04 §2a, 05 §5), in the recipient's language.

One interface, `EmailSender`. The provider is Resend, chosen for the prototype's free tier
(2026-09-14), and it is one adapter behind the interface, so another provider replaces it without
touching a flow. Tests use `MemoryEmailSender`, local development `FolderEmailSender`, and a
deployed API boots only with Resend configured. Never log an address or a key (04 §9).
"""

import asyncio
import json
import uuid
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal, Protocol

import httpx

from app.core.i18n import Locale, format_message

EmailKind = Literal[
    "verify_email",
    "password_reset",
    "password_changed",
    "email_changed",
    "new_device",
    "refresh_reuse",
]
EMAIL_KINDS: tuple[EmailKind, ...] = (
    "verify_email",
    "password_reset",
    "password_changed",
    "email_changed",
    "new_device",
    "refresh_reuse",
)

RESEND_ENDPOINT = "https://api.resend.com/emails"
PROVIDER_TIMEOUT_S = 10.0


@dataclass(frozen=True)
class EmailMessage:
    kind: EmailKind
    to: str
    subject: str
    body: str


class EmailSender(Protocol):
    async def send(self, message: EmailMessage) -> None: ...


class EmailDeliveryError(RuntimeError):
    """The provider refused the message or could not be reached. Names neither address nor key."""


def compose(kind: EmailKind, *, locale: Locale, to: str, **arguments: str) -> EmailMessage:
    return EmailMessage(
        kind=kind,
        to=to,
        subject=format_message(locale, f"email.{kind}.subject", arguments),
        body=format_message(locale, f"email.{kind}.body", arguments),
    )


class ResendEmailSender:
    """Resend's HTTP API: one POST per message, plain text only."""

    def __init__(
        self,
        api_key: str,
        sender: str,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._api_key = api_key
        self._sender = sender
        self._transport = transport

    async def send(self, message: EmailMessage) -> None:
        payload = {
            "from": self._sender,
            "to": [message.to],
            "subject": message.subject,
            "text": message.body,
        }
        async with httpx.AsyncClient(
            transport=self._transport, timeout=PROVIDER_TIMEOUT_S
        ) as client:
            try:
                response = await client.post(
                    RESEND_ENDPOINT,
                    headers={"Authorization": f"Bearer {self._api_key}"},
                    json=payload,
                )
            except httpx.HTTPError as error:
                raise EmailDeliveryError(
                    f"Resend could not be reached ({type(error).__name__})"
                ) from None
        if response.status_code >= 300:
            raise EmailDeliveryError(f"Resend refused the message (HTTP {response.status_code})")


class MemoryEmailSender:
    """Tests: keeps every message, in order."""

    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []

    async def send(self, message: EmailMessage) -> None:
        self.sent.append(message)


class FolderEmailSender:
    """Local development: one JSON file per message, in a git-ignored folder."""

    def __init__(self, folder: Path) -> None:
        self._folder = folder

    async def send(self, message: EmailMessage) -> None:
        await asyncio.to_thread(self._write, message)

    def _write(self, message: EmailMessage) -> None:
        self._folder.mkdir(parents=True, exist_ok=True)
        name = f"{datetime.now(UTC):%Y%m%dT%H%M%S}-{message.kind}-{uuid.uuid4().hex[:8]}.json"
        (self._folder / name).write_text(
            json.dumps(asdict(message), ensure_ascii=False, indent=2), encoding="utf-8"
        )
