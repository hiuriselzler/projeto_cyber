"""03 §1 — identity, auth state, and the per-user settings that sync."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import ForeignKey, ForeignKeyConstraint, Numeric, SmallInteger, UniqueConstraint
from sqlalchemy.dialects.postgresql import BYTEA, CITEXT, INET
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import LOCALE, SEX, STORE, TIER, UNIT_SYSTEM, Base, OwnedByUser, SyncColumns


class User(SyncColumns, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(CITEXT, unique=True)
    password_hash: Mapped[str]
    display_name: Mapped[str]
    unit_system: Mapped[str] = mapped_column(UNIT_SYSTEM, server_default="metric")
    locale: Mapped[str] = mapped_column(LOCALE, server_default="en")
    body_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(9, 4))
    birth_date: Mapped[date | None]
    sex: Mapped[str | None] = mapped_column(SEX)
    max_hr: Mapped[int | None] = mapped_column(SmallInteger)
    resting_hr: Mapped[int | None] = mapped_column(SmallInteger)
    timezone: Mapped[str] = mapped_column(server_default="UTC")
    email_verified_at: Mapped[datetime | None]
    gamification_enabled: Mapped[bool] = mapped_column(server_default="true")
    deletion_requested_at: Mapped[datetime | None]
    wrapped_privacy_key: Mapped[bytes | None] = mapped_column(BYTEA)
    privacy_key_salt: Mapped[bytes | None] = mapped_column(BYTEA)
    privacy_key_kdf: Mapped[str | None]


class PasswordResetToken(OwnedByUser, Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(unique=True)
    expires_at: Mapped[datetime]
    used_at: Mapped[datetime | None]
    requested_ip: Mapped[str | None] = mapped_column(INET)
    created_at: Mapped[datetime]


class EmailVerificationToken(OwnedByUser, Base):
    __tablename__ = "email_verification_tokens"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(CITEXT)
    token_hash: Mapped[str] = mapped_column(unique=True)
    expires_at: Mapped[datetime]
    used_at: Mapped[datetime | None]
    created_at: Mapped[datetime]


class RefreshToken(OwnedByUser, Base):
    __tablename__ = "refresh_tokens"
    __table_args__ = (
        UniqueConstraint("id", "user_id"),
        ForeignKeyConstraint(
            ["replaced_by", "user_id"],
            ["refresh_tokens.id", "refresh_tokens.user_id"],
            ondelete="SET NULL",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(unique=True)
    device_id: Mapped[str]
    device_name: Mapped[str | None]
    issued_at: Mapped[datetime]
    expires_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]
    replaced_by: Mapped[uuid.UUID | None]


class RateLimitBucket(Base):
    """One rate-limit window (ADR-015). Nobody's data: an HMAC of the subject, the window, the
    count."""

    __tablename__ = "rate_limit_buckets"

    bucket_key: Mapped[str] = mapped_column(primary_key=True)
    window_start: Mapped[datetime] = mapped_column(primary_key=True)
    hits: Mapped[int]


class Subscription(SyncColumns, Base):
    __tablename__ = "subscriptions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    tier: Mapped[str] = mapped_column(TIER, server_default="trial")
    trial_started_at: Mapped[datetime]
    trial_ends_at: Mapped[datetime]
    store: Mapped[str | None] = mapped_column(STORE)
    store_product_id: Mapped[str | None]
    current_period_end: Mapped[datetime | None]
    cancelled_at: Mapped[datetime | None]


class BodyWeightLog(OwnedByUser, SyncColumns, Base):
    __tablename__ = "body_weight_log"
    __table_args__ = (UniqueConstraint("user_id", "measured_on"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    measured_on: Mapped[date]
    weight_kg: Mapped[Decimal] = mapped_column(Numeric(9, 4))


class HrZoneOverride(SyncColumns, Base):
    __tablename__ = "hr_zone_overrides"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    zone: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    min_bpm: Mapped[int] = mapped_column(SmallInteger)
    max_bpm: Mapped[int] = mapped_column(SmallInteger)


class PrivacyZone(OwnedByUser, SyncColumns, Base):
    """Ciphertext only: nothing here is or implies a coordinate, a radius or a label (ADR-007)."""

    __tablename__ = "privacy_zones"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    ciphertext: Mapped[bytes] = mapped_column(BYTEA)
    nonce: Mapped[bytes] = mapped_column(BYTEA)
