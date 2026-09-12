"""03 §6 and §7 — sport profiles, activities, and the cardio planner."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import ForeignKey, Integer, Numeric, SmallInteger, UniqueConstraint
from sqlalchemy.dialects.postgresql import BYTEA, DOUBLE_PRECISION
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (
    ACTIVITY_SOURCE,
    CARDIO_GOAL,
    CYCLE_STATUS,
    DELOAD_MODE,
    MESO_STATUS,
    PACE_UNIT,
    PRIMARY_METRIC,
    RECORDING_MODE,
    SEGMENT_KIND,
    SET_ORIGIN,
    SPLIT_BASIS,
    SPORT,
    STREAM_ENCODING,
    STREAM_KIND,
    TRACK,
    VISIBILITY,
    WRITE_KIND,
    Base,
    OwnedByUser,
    SyncColumns,
)
from app.models.strength import owned_reference


class SportProfile(Base):
    """Seeded reference data: cardio screens and aggregates read this, never the enum (INV-19)."""

    __tablename__ = "sport_profiles"

    sport: Mapped[str] = mapped_column(SPORT, primary_key=True)
    name_key: Mapped[str] = mapped_column(unique=True)
    recording_mode: Mapped[str] = mapped_column(RECORDING_MODE)
    primary_metric: Mapped[str] = mapped_column(PRIMARY_METRIC)
    pace_unit_metric: Mapped[str] = mapped_column(PACE_UNIT)
    pace_unit_imperial: Mapped[str] = mapped_column(PACE_UNIT)
    split_unit_m_metric: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    split_unit_m_imperial: Mapped[Decimal | None] = mapped_column(Numeric(10, 3))
    has_route: Mapped[bool]
    has_elevation: Mapped[bool]
    autopause_threshold_mps: Mapped[Decimal | None] = mapped_column(Numeric(4, 2))
    live_fields: Mapped[list[Any]]
    detail_sections: Mapped[list[Any]]
    session_types: Mapped[list[Any]]
    metrics_schema: Mapped[dict[str, Any]]
    xp_track: Mapped[str] = mapped_column(
        TRACK, ForeignKey("gamification_tracks.track", ondelete="RESTRICT")
    )


class CardioActivity(OwnedByUser, SyncColumns, Base):
    __tablename__ = "cardio_activities"
    __table_args__ = (
        UniqueConstraint("id", "user_id"),
        owned_reference(
            "planned_cardio_session_id", "planned_cardio_sessions", ondelete="SET NULL"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    planned_cardio_session_id: Mapped[uuid.UUID | None]
    sport: Mapped[str] = mapped_column(
        SPORT, ForeignKey("sport_profiles.sport", ondelete="RESTRICT")
    )
    title: Mapped[str]
    started_at: Mapped[datetime]
    local_date: Mapped[date]
    tz: Mapped[str]
    elapsed_s: Mapped[int] = mapped_column(Integer)
    moving_s: Mapped[int] = mapped_column(Integer)
    distance_m: Mapped[int] = mapped_column(Integer, server_default="0")
    elevation_gain_m: Mapped[int] = mapped_column(Integer, server_default="0")
    elevation_loss_m: Mapped[int] = mapped_column(Integer, server_default="0")
    avg_speed_mps: Mapped[Decimal | None] = mapped_column(Numeric(6, 3))
    best_speed_mps: Mapped[Decimal | None] = mapped_column(Numeric(6, 3))
    avg_hr: Mapped[int | None] = mapped_column(SmallInteger)
    max_hr: Mapped[int | None] = mapped_column(SmallInteger)
    avg_cadence: Mapped[int | None] = mapped_column(SmallInteger)
    calories: Mapped[int | None] = mapped_column(Integer)
    perceived_effort: Mapped[int | None] = mapped_column(SmallInteger)
    sport_metrics: Mapped[dict[str, Any]] = mapped_column(server_default="{}")
    source: Mapped[str] = mapped_column(ACTIVITY_SOURCE)
    device: Mapped[str | None]
    pipeline_version: Mapped[int] = mapped_column(SmallInteger)
    visibility: Mapped[str] = mapped_column(VISIBILITY, server_default="private")
    has_track: Mapped[bool] = mapped_column(server_default="false")
    polyline: Mapped[str | None]
    start_lat: Mapped[float | None] = mapped_column(DOUBLE_PRECISION)
    start_lng: Mapped[float | None] = mapped_column(DOUBLE_PRECISION)
    notes: Mapped[str | None]


class ActivityStream(OwnedByUser, Base):
    """Dependent of its activity; uploaded to its own endpoint (ADR-003)."""

    __tablename__ = "activity_streams"
    __table_args__ = (owned_reference("activity_id", "cardio_activities", ondelete="CASCADE"),)

    activity_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(STREAM_KIND, primary_key=True)
    encoding: Mapped[str] = mapped_column(STREAM_ENCODING)
    sample_count: Mapped[int] = mapped_column(Integer)
    data: Mapped[bytes] = mapped_column(BYTEA)


class ActivitySegment(OwnedByUser, SyncColumns, Base):
    __tablename__ = "activity_segments"
    __table_args__ = (
        UniqueConstraint("activity_id", "split_basis", "segment_index"),
        owned_reference("activity_id", "cardio_activities", ondelete="CASCADE"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    activity_id: Mapped[uuid.UUID]
    segment_index: Mapped[int] = mapped_column(SmallInteger)
    kind: Mapped[str] = mapped_column(SEGMENT_KIND)
    split_basis: Mapped[str] = mapped_column(SPLIT_BASIS, server_default="none")
    distance_m: Mapped[int | None] = mapped_column(Integer)
    moving_s: Mapped[int] = mapped_column(Integer)
    elapsed_s: Mapped[int] = mapped_column(Integer)
    rest_s: Mapped[int | None] = mapped_column(Integer)
    elevation_gain_m: Mapped[int | None] = mapped_column(Integer)
    avg_speed_mps: Mapped[Decimal | None] = mapped_column(Numeric(6, 3))
    avg_hr: Mapped[int | None] = mapped_column(SmallInteger)
    segment_metrics: Mapped[dict[str, Any]] = mapped_column(server_default="{}")


class CardioPlan(OwnedByUser, SyncColumns, Base):
    __tablename__ = "cardio_plans"
    __table_args__ = (UniqueConstraint("id", "user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    name: Mapped[str]
    goal: Mapped[str] = mapped_column(CARDIO_GOAL)
    start_date: Mapped[date]
    num_microcycles: Mapped[int] = mapped_column(SmallInteger)
    default_microcycle_days: Mapped[int] = mapped_column(SmallInteger, server_default="7")
    volume_step_bp: Mapped[int] = mapped_column(Integer)
    rail_overridden_at: Mapped[datetime | None]
    deload_mode: Mapped[str] = mapped_column(DELOAD_MODE, server_default="none")
    deload_every_n_microcycles: Mapped[int | None] = mapped_column(SmallInteger)
    deload_volume_bp: Mapped[int] = mapped_column(Integer, server_default="6000")
    status: Mapped[str] = mapped_column(MESO_STATUS, server_default="draft")


class CardioPlanMicrocycle(OwnedByUser, SyncColumns, Base):
    __tablename__ = "cardio_plan_microcycles"
    __table_args__ = (
        UniqueConstraint("id", "user_id"),
        UniqueConstraint("cardio_plan_id", "cycle_number"),
        owned_reference("cardio_plan_id", "cardio_plans", ondelete="CASCADE"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    cardio_plan_id: Mapped[uuid.UUID]
    cycle_number: Mapped[int] = mapped_column(SmallInteger)
    length_days: Mapped[int] = mapped_column(SmallInteger)
    starts_on: Mapped[date]
    is_deload: Mapped[bool] = mapped_column(server_default="false")
    target_duration_s: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(CYCLE_STATUS, server_default="projected")
    engine_version: Mapped[int] = mapped_column(Integer)
    last_write_kind: Mapped[str] = mapped_column(WRITE_KIND, server_default="engine")


class CardioPlanCycleTarget(OwnedByUser, Base):
    """Dependent of its microcycle: resolved with it, never on its own (03 §11)."""

    __tablename__ = "cardio_plan_cycle_targets"
    __table_args__ = (
        owned_reference("cardio_plan_microcycle_id", "cardio_plan_microcycles", ondelete="CASCADE"),
    )

    cardio_plan_microcycle_id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    sport: Mapped[str] = mapped_column(
        SPORT, ForeignKey("sport_profiles.sport", ondelete="RESTRICT"), primary_key=True
    )
    target_distance_m: Mapped[int | None] = mapped_column(Integer)
    target_duration_s: Mapped[int | None] = mapped_column(Integer)


class PlannedCardioSession(OwnedByUser, SyncColumns, Base):
    __tablename__ = "planned_cardio_sessions"
    __table_args__ = (
        UniqueConstraint("id", "user_id"),
        owned_reference("cardio_plan_microcycle_id", "cardio_plan_microcycles", ondelete="CASCADE"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    cardio_plan_microcycle_id: Mapped[uuid.UUID]
    day_index: Mapped[int] = mapped_column(SmallInteger)
    sport: Mapped[str] = mapped_column(
        SPORT, ForeignKey("sport_profiles.sport", ondelete="RESTRICT")
    )
    session_type: Mapped[str]
    target_distance_m: Mapped[int | None] = mapped_column(Integer)
    target_duration_s: Mapped[int | None] = mapped_column(Integer)
    target_zone: Mapped[int | None] = mapped_column(SmallInteger)
    target_speed_min_mps: Mapped[Decimal | None] = mapped_column(Numeric(6, 3))
    target_speed_max_mps: Mapped[Decimal | None] = mapped_column(Numeric(6, 3))
    structure: Mapped[list[Any] | None]
    origin: Mapped[str] = mapped_column(SET_ORIGIN, server_default="generated")
    is_pinned: Mapped[bool] = mapped_column(server_default="false")
    notes: Mapped[str | None]
