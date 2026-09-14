"""Transactional email (04 §2a, 05 §5), in the recipient's language.

One interface, `EmailSender`. The provider is an adapter and is not chosen yet (open question 10):
tests use `MemoryEmailSender`, local development `FolderEmailSender`, and a deployed API refuses to
boot with neither a provider nor a key. Never log an address (04 §9).
"""

import asyncio
import json
import uuid
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Literal, Protocol

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


@dataclass(frozen=True)
class EmailMessage:
    kind: EmailKind
    to: str
    subject: str
    body: str


class EmailSender(Protocol):
    async def send(self, message: EmailMessage) -> None: ...


def compose(kind: EmailKind, *, locale: Locale, to: str, **arguments: str) -> EmailMessage:
    return EmailMessage(
        kind=kind,
        to=to,
        subject=format_message(locale, f"email.{kind}.subject", arguments),
        body=format_message(locale, f"email.{kind}.body", arguments),
    )


class MemoryEmailSender:
    """Tests: keeps every message, in order."""

    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []

    async def send(self, message: EmailMessage) -> None:
        self.sent.append(message)


class FolderEmailSender:
    """Local development: one JSON file per message, in a git-ignored folder, until a provider
    exists."""

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
