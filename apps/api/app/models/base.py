"""The declarative base, the two column sets every table is built from, and the enum types.

Models are shapes: columns, keys and references. CHECKs, partial indexes, triggers and row-level
security live in the migrations, and the schema check (`scripts/check_schema.py`) asserts them
against the live database. A test compares these models with the migrated schema, so the two
cannot drift.
"""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any, ClassVar

from sqlalchemy import BigInteger, Boolean, Date, ForeignKey, Numeric, Text, text
from sqlalchemy.dialects.postgresql import ENUM, JSONB, TIMESTAMP, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    type_annotation_map: ClassVar[dict[Any, Any]] = {
        uuid.UUID: UUID(as_uuid=True),
        datetime: TIMESTAMP(timezone=True),
        date: Date,
        str: Text,
        bool: Boolean,
        Decimal: Numeric,
        dict[str, Any]: JSONB,
        list[Any]: JSONB,
    }


class SyncColumns:
    """The sync columns — on every sync root and on nothing else (03 §11)."""

    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]
    deleted_at: Mapped[datetime | None]
    sync_version: Mapped[int] = mapped_column(BigInteger, server_default=text("1"))


class OwnedByUser:
    """The owner column of every user-owned table and every child of one (INV-15, ADR-013)."""

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))


def enum(name: str, *values: str) -> ENUM:
    # The migration creates the type; the model only names it.
    return ENUM(*values, name=name, create_type=False)


UNIT_SYSTEM = enum("unit_system_enum", "metric", "imperial")
LOCALE = enum("locale_enum", "en", "pt-BR")
SEX = enum("sex_enum", "male", "female", "unspecified")
TIER = enum("tier_enum", "trial", "free", "pro", "coach")
STORE = enum("store_enum", "apple", "google")
MUSCLE_REGION = enum(
    "muscle_region_enum", "upper_push", "upper_pull", "legs", "core", "arms", "other"
)
MODALITY = enum(
    "modality_enum", "barbell", "dumbbell", "machine", "cable", "bodyweight", "band", "other"
)
TRACKING = enum("tracking_enum", "weight_reps", "reps_only", "duration", "distance_duration")
WORKOUT_SOURCE = enum("workout_source_enum", "manual", "plan", "routine")
SET_TYPE = enum("set_type_enum", "warmup", "working", "drop", "backoff", "amrap")
PR_KIND = enum(
    "pr_kind_enum", "max_weight", "best_e1rm", "max_reps_at_weight", "best_session_volume"
)
PROGRESSION_STRATEGY = enum(
    "progression_strategy_enum",
    "linear_load",
    "double_progression",
    "percent_1rm",
    "rir_autoregulated",
    "fixed",
    "cycle_pattern",
)
RIR_MODE = enum("rir_mode_enum", "per_exercise", "per_set")
FAILURE_POLICY = enum("failure_policy_enum", "hold", "repeat_cycle", "reduce_load")
ROUNDING = enum("rounding_enum", "nearest", "down", "up")
MESO_GOAL = enum("meso_goal_enum", "hypertrophy", "strength", "peaking", "maintenance")
DELOAD_MODE = enum("deload_mode_enum", "none", "every_n_microcycles", "manual")
MESO_STATUS = enum("meso_status_enum", "draft", "active", "completed", "abandoned")
CYCLE_STATUS = enum(
    "cycle_status_enum", "projected", "locked", "in_progress", "completed", "skipped"
)
WRITE_KIND = enum("write_kind_enum", "engine", "user")
SET_ORIGIN = enum("set_origin_enum", "generated", "user_edited")
SPORT = enum(
    "sport_enum",
    "run",
    "ride",
    "walk",
    "swim_pool",
    "treadmill",
    "indoor_bike",
    "trail_run",
    "hike",
    "open_water_swim",
    "row_indoor",
    "other",
)
RECORDING_MODE = enum("recording_mode_enum", "gps", "lap", "manual")
PRIMARY_METRIC = enum("primary_metric_enum", "distance", "duration", "elevation")
PACE_UNIT = enum(
    "pace_unit_enum",
    "min_per_km",
    "min_per_mi",
    "km_per_h",
    "mph",
    "min_per_100m",
    "min_per_100yd",
    "per_500m",
)
ACTIVITY_SOURCE = enum("activity_source_enum", "recorded", "manual", "imported")
VISIBILITY = enum("visibility_enum", "private", "followers", "public")
STREAM_KIND = enum(
    "stream_kind_enum", "latlng", "altitude", "time", "heartrate", "cadence", "velocity", "moving"
)
STREAM_ENCODING = enum("stream_encoding_enum", "f32_le", "i16_le", "polyline", "varint_zigzag")
SEGMENT_KIND = enum(
    "segment_kind_enum",
    "auto_split",
    "manual_lap",
    "swim_set",
    "interval",
    "rest",
    "warmup",
    "cooldown",
)
SPLIT_BASIS = enum("split_basis_enum", "none", "km", "mi")
CARDIO_GOAL = enum(
    "cardio_goal_enum", "base", "5k", "10k", "half", "marathon", "swim", "triathlon", "custom"
)
TRACK = enum(
    "track_enum",
    "strength",
    "run",
    "ride",
    "walk",
    "swim_pool",
    "treadmill",
    "indoor_bike",
    "trail_run",
    "hike",
    "open_water_swim",
    "row_indoor",
    "other",
    "consistency",
    "recovery",
    "precision",
    "progression",
)
TRACK_KIND = enum("track_kind_enum", "discipline", "quality")
XP_SOURCE = enum("xp_source_enum", "workout", "activity", "plan_cycle", "achievement", "manual")
