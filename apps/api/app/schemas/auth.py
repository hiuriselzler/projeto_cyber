"""Request and response bodies for /api/v1/auth (04 §2-§5, ADR-007)."""

import re
import uuid
from datetime import date, datetime
from typing import Annotated, Literal, Self

from pydantic import (
    AfterValidator,
    Base64Bytes,
    BaseModel,
    Field,
    StringConstraints,
    model_validator,
)

from app.schemas.common import StrictModel, TimeZone

_EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")


def _email_address(value: str) -> str:
    value = value.strip()
    if len(value) > 254 or not _EMAIL.fullmatch(value):
        raise ValueError("not an email address")
    return value


Email = Annotated[str, Field(max_length=320), AfterValidator(_email_address)]
# The policy — length, the breach list — is the service's; this only bounds the body.
Password = Annotated[str, Field(min_length=1, max_length=4096)]
DeviceId = Annotated[str, Field(pattern=r"^[A-Za-z0-9_-]{16,128}$")]
DeviceName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
DisplayName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
OpaqueToken = Annotated[str, Field(min_length=16, max_length=128)]
Locale = Literal["en", "pt-BR"]
UnitSystem = Literal["metric", "imperial"]
Sex = Literal["male", "female", "unspecified"]
HeartRate = Annotated[int, Field(ge=1, le=300)]


class PrivacyKeyIn(StrictModel):
    """The privacy key wrapped on the device — base64 — and the KDF it was wrapped under
    (ADR-007)."""

    wrapped_key: Base64Bytes
    salt: Base64Bytes
    kdf: Annotated[str, Field(max_length=64)]


class PrivacyKeyOut(BaseModel):
    wrapped_key: str
    salt: str
    kdf: str


class RegisterRequest(StrictModel):
    id: uuid.UUID
    email: Email
    password: Password
    display_name: DisplayName
    locale: Locale
    unit_system: UnitSystem
    timezone: TimeZone
    device_id: DeviceId
    device_name: DeviceName | None = None
    privacy_key: PrivacyKeyIn


class LoginRequest(StrictModel):
    email: Email
    password: Password
    device_id: DeviceId
    device_name: DeviceName | None = None


class RefreshRequest(StrictModel):
    refresh_token: OpaqueToken


class AccountResponse(BaseModel):
    id: uuid.UUID
    email: str
    email_verified: bool
    display_name: str
    unit_system: UnitSystem
    locale: Locale
    timezone: str
    birth_date: date | None
    sex: Sex | None
    max_hr: int | None
    resting_hr: int | None
    gamification_enabled: bool
    privacy_key: PrivacyKeyOut | None
    # Set while a deletion is pending, so any signed-in device can show it and cancel (task 019).
    deletion_requested_at: datetime | None


class DeletionRequest(StrictModel):
    password: Password


class DeletionResponse(BaseModel):
    """When the deletion was asked for, and the moment from which the account is deleted."""

    deletion_requested_at: datetime
    deleted_from: datetime


class TokensResponse(BaseModel):
    token_type: Literal["bearer"] = "bearer"  # noqa: S105 — the OAuth token type, not a secret
    access_token: str
    access_expires_at: datetime
    refresh_token: str
    refresh_expires_at: datetime


class SignedInResponse(TokensResponse):
    account: AccountResponse


_REQUIRED_ACCOUNT_FIELDS = (
    "display_name",
    "unit_system",
    "locale",
    "timezone",
    "gamification_enabled",
)


class AccountUpdate(StrictModel):
    """Only what a user edits by hand. Omitted fields stay as they are; the optional ones may be
    cleared."""

    display_name: DisplayName | None = None
    unit_system: UnitSystem | None = None
    locale: Locale | None = None
    timezone: TimeZone | None = None
    birth_date: date | None = None
    sex: Sex | None = None
    max_hr: HeartRate | None = None
    resting_hr: HeartRate | None = None
    gamification_enabled: bool | None = None

    @model_validator(mode="after")
    def _required_fields_are_not_cleared(self) -> Self:
        for name in _REQUIRED_ACCOUNT_FIELDS:
            if name in self.model_fields_set and getattr(self, name) is None:
                raise ValueError(f"{name} cannot be cleared")
        return self


class PasswordChangeRequest(StrictModel):
    current_password: Password
    new_password: Password
    privacy_key: PrivacyKeyIn


class PasswordResetRequest(StrictModel):
    email: Email


class PasswordResetConfirmRequest(StrictModel):
    token: OpaqueToken
    new_password: Password
    privacy_key: PrivacyKeyIn


class EmailVerifyRequest(StrictModel):
    token: OpaqueToken


class EmailChangeRequest(StrictModel):
    current_password: Password
    new_email: Email


class AcceptedResponse(BaseModel):
    """The same body whatever happened behind it — the reset request must not say whether an account
    exists."""

    status: Literal["accepted"] = "accepted"


class SessionResponse(BaseModel):
    id: uuid.UUID
    device_id: str
    device_name: str | None
    last_active_at: datetime
    current: bool
