"""Driving the API in-process against the real database, the way a device does (task 003)."""

import base64
import re
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from fastapi import FastAPI

from app.core.email import EmailMessage, MemoryEmailSender
from app.core.security import Argon2Parameters, PasswordHasher

# Cheap parameters, so a suite full of sign-ins takes seconds. The production parameters are tested
# on their own, and used where the cost is the point: the constant-time login test.
FAST_HASHER = PasswordHasher(Argon2Parameters(memory_kib=8, iterations=1, parallelism=1))

STRONG_PASSWORD = "plum-orbit-quarry-7412"
NEW_PASSWORD = "lantern-fjord-mosaic-3091"
WRAPPING_KDF = "argon2id$m=65536,t=3,p=1"

API = "/api/v1"


class FakeClock:
    def __init__(self) -> None:
        self.now = datetime.now(UTC)

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **delta: float) -> None:
        self.now += timedelta(**delta)


class NoRateLimits:
    """Most tests are not about rate limits, and a suite registers far more than 5 accounts an
    hour."""

    async def check(self, *_args: object, **_kwargs: object) -> None:
        return None


def privacy_key() -> dict[str, str]:
    """A wrap of the right shape. The server cannot tell it from a real one — which is the point."""
    return {
        "wrapped_key": base64.b64encode(secrets.token_bytes(72)).decode("ascii"),
        "salt": base64.b64encode(secrets.token_bytes(16)).decode("ascii"),
        "kdf": WRAPPING_KDF,
    }


def new_device_id() -> str:
    return uuid.uuid4().hex


def bearer(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}


def token_in(message: EmailMessage) -> str:
    match = re.search(r"token=([A-Za-z0-9_-]+)", message.body)
    assert match is not None, message.body
    return match.group(1)


@dataclass(frozen=True)
class Device:
    device_id: str
    access_token: str
    refresh_token: str

    def rotated(self, response: httpx.Response) -> "Device":
        assert response.status_code == 200, response.text
        body = response.json()
        return Device(self.device_id, body["access_token"], body["refresh_token"])


@dataclass
class Api:
    app: FastAPI
    client: httpx.AsyncClient
    clock: FakeClock
    mail: MemoryEmailSender

    def registration_body(self, **overrides: Any) -> dict[str, Any]:
        body: dict[str, Any] = {
            "id": str(uuid.uuid4()),
            "email": f"user-{uuid.uuid4().hex[:12]}@example.com",
            "password": STRONG_PASSWORD,
            "display_name": "Ana",
            "locale": "en",
            "unit_system": "metric",
            "timezone": "America/Sao_Paulo",
            "device_id": new_device_id(),
            "privacy_key": privacy_key(),
        }
        body.update(overrides)
        return body

    async def register(self, **overrides: Any) -> tuple[str, Device, dict[str, Any]]:
        body = self.registration_body(**overrides)
        response = await self.client.post(f"{API}/auth/register", json=body)
        assert response.status_code == 201, response.text
        data = response.json()
        device = Device(body["device_id"], data["access_token"], data["refresh_token"])
        return body["email"], device, data

    async def login(
        self,
        email: str,
        password: str = STRONG_PASSWORD,
        *,
        device_id: str | None = None,
        device_name: str | None = None,
    ) -> httpx.Response:
        body: dict[str, Any] = {
            "email": email,
            "password": password,
            "device_id": device_id or new_device_id(),
        }
        if device_name is not None:
            body["device_name"] = device_name
        return await self.client.post(f"{API}/auth/login", json=body)

    async def sign_in(
        self,
        email: str,
        password: str = STRONG_PASSWORD,
        *,
        device_id: str | None = None,
        device_name: str | None = None,
    ) -> Device:
        device_id = device_id or new_device_id()
        response = await self.login(email, password, device_id=device_id, device_name=device_name)
        assert response.status_code == 200, response.text
        body = response.json()
        return Device(device_id, body["access_token"], body["refresh_token"])

    async def refresh(self, refresh_token: str) -> httpx.Response:
        return await self.client.post(f"{API}/auth/refresh", json={"refresh_token": refresh_token})

    async def log_workout(self, device: Device, workout_id: str | None = None) -> httpx.Response:
        return await self.client.post(
            f"{API}/workouts",
            headers=bearer(device.access_token),
            json={
                "id": workout_id or str(uuid.uuid4()),
                "title": "Push A",
                "started_at": self.clock.now.isoformat(),
                "local_date": self.clock.now.date().isoformat(),
                "tz": "America/Sao_Paulo",
            },
        )

    def mail_to(self, address: str, kind: str | None = None) -> list[EmailMessage]:
        return [
            message
            for message in self.mail.sent
            if message.to.casefold() == address.casefold() and kind in (None, message.kind)
        ]

    async def me(self, device: Device) -> dict[str, Any]:
        response = await self.client.get(f"{API}/auth/me", headers=bearer(device.access_token))
        assert response.status_code == 200, response.text
        body: dict[str, Any] = response.json()
        return body

    async def request_deletion(
        self, device: Device, password: str = STRONG_PASSWORD
    ) -> httpx.Response:
        return await self.client.post(
            f"{API}/auth/deletion",
            headers=bearer(device.access_token),
            json={"password": password},
        )
