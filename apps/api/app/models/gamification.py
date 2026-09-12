"""03 §7a, 08 §8 — tracks, the XP ledger, achievements and streaks."""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    ForeignKey,
    Integer,
    SmallInteger,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (
    TRACK,
    TRACK_KIND,
    UNIT_SYSTEM,
    XP_SOURCE,
    Base,
    OwnedByUser,
    SyncColumns,
)


class GamificationTrack(Base):
    __tablename__ = "gamification_tracks"

    track: Mapped[str] = mapped_column(TRACK, primary_key=True)
    kind: Mapped[str] = mapped_column(TRACK_KIND)
    hue_token: Mapped[str]
    level_scale_bp: Mapped[int] = mapped_column(Integer, server_default="10000")


class UserTrackProgress(Base):
    """Derived: a rebuildable fold over xp_awards, never synced (03 §11)."""

    __tablename__ = "user_track_progress"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    track: Mapped[str] = mapped_column(
        TRACK, ForeignKey("gamification_tracks.track"), primary_key=True
    )
    xp: Mapped[int] = mapped_column(BigInteger, server_default="0")
    level: Mapped[int] = mapped_column(SmallInteger, server_default="1")
    activated_at: Mapped[datetime]
    last_awarded_at: Mapped[datetime | None]
    computed_at: Mapped[datetime]


class XpAward(OwnedByUser, SyncColumns, Base):
    """The ledger and source of truth (INV-21). Its unique key treats NULLs as equal (ADR-013)."""

    __tablename__ = "xp_awards"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "source_kind",
            "source_id",
            "reason",
            name="xp_awards_once",
            postgresql_nulls_not_distinct=True,
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    track: Mapped[str] = mapped_column(TRACK)
    amount: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str]
    source_kind: Mapped[str] = mapped_column(XP_SOURCE)
    source_id: Mapped[uuid.UUID | None]
    awarded_at: Mapped[datetime]


class Achievement(Base):
    __tablename__ = "achievements"

    code: Mapped[str] = mapped_column(primary_key=True)
    name_key: Mapped[str]
    description_key: Mapped[str]
    track: Mapped[str | None] = mapped_column(TRACK, ForeignKey("gamification_tracks.track"))
    tier: Mapped[int] = mapped_column(SmallInteger, server_default="1")
    unit_system: Mapped[str | None] = mapped_column(UNIT_SYSTEM)


class UserAchievement(SyncColumns, Base):
    __tablename__ = "user_achievements"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    achievement_code: Mapped[str] = mapped_column(ForeignKey("achievements.code"), primary_key=True)
    achieved_at: Mapped[datetime]
    source_id: Mapped[uuid.UUID | None]


class AdherenceStreak(SyncColumns, Base):
    __tablename__ = "adherence_streaks"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    current_cycles: Mapped[int] = mapped_column(Integer, server_default="0")
    longest_cycles: Mapped[int] = mapped_column(Integer, server_default="0")
    last_kept_cycle_id: Mapped[uuid.UUID | None]
    grace_used_in_quarter: Mapped[int] = mapped_column(SmallInteger, server_default="0")
