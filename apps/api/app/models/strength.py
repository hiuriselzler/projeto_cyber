"""03 §2 to §5 — the exercise catalog, routines, performed workouts and the strength planner."""

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    SmallInteger,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import (
    CYCLE_STATUS,
    DELOAD_MODE,
    FAILURE_POLICY,
    MESO_GOAL,
    MESO_STATUS,
    MODALITY,
    MUSCLE_REGION,
    PR_KIND,
    PROGRESSION_STRATEGY,
    RIR_MODE,
    ROUNDING,
    SET_ORIGIN,
    SET_TYPE,
    TRACKING,
    UNIT_SYSTEM,
    WORKOUT_SOURCE,
    WRITE_KIND,
    Base,
    OwnedByUser,
    SyncColumns,
)


def owned_reference(column: str, parent: str, *, ondelete: str) -> ForeignKeyConstraint:
    """A child's reference to its parent, carrying the owner so it cannot cross users (ADR-013).

    The migration writes a nullable link's action as `SET NULL (column)`, clearing the link and
    keeping the owner; the model only records that the link is cleared.
    """
    return ForeignKeyConstraint(
        [column, "user_id"], [f"{parent}.id", f"{parent}.user_id"], ondelete=ondelete
    )


class MuscleGroup(Base):
    __tablename__ = "muscle_groups"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True)
    name_key: Mapped[str] = mapped_column(unique=True)
    region: Mapped[str] = mapped_column(MUSCLE_REGION)


class Exercise(SyncColumns, Base):
    __tablename__ = "exercises"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    forked_from_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("exercises.id", ondelete="SET NULL")
    )
    name_key: Mapped[str | None]
    name: Mapped[str | None]
    modality: Mapped[str] = mapped_column(MODALITY)
    primary_muscle_id: Mapped[int] = mapped_column(SmallInteger, ForeignKey("muscle_groups.id"))
    is_unilateral: Mapped[bool] = mapped_column(server_default="false")
    tracking: Mapped[str] = mapped_column(TRACKING, server_default="weight_reps")
    load_increment_kg: Mapped[Decimal | None] = mapped_column(Numeric(10, 6))
    uses_bodyweight: Mapped[bool] = mapped_column(server_default="false")
    default_min_reps: Mapped[int | None] = mapped_column(SmallInteger)
    default_max_reps: Mapped[int | None] = mapped_column(SmallInteger)
    notes: Mapped[str | None]


class ExerciseSecondaryMuscle(Base):
    __tablename__ = "exercise_secondary_muscles"

    exercise_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("exercises.id", ondelete="CASCADE"), primary_key=True
    )
    muscle_group_id: Mapped[int] = mapped_column(
        SmallInteger, ForeignKey("muscle_groups.id"), primary_key=True
    )


class ModalityIncrement(Base):
    __tablename__ = "modality_increments"

    modality: Mapped[str] = mapped_column(MODALITY, primary_key=True)
    unit_system: Mapped[str] = mapped_column(UNIT_SYSTEM, primary_key=True)
    increment_kg: Mapped[Decimal] = mapped_column(Numeric(10, 6))


class Routine(OwnedByUser, SyncColumns, Base):
    __tablename__ = "routines"
    __table_args__ = (UniqueConstraint("id", "user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    name: Mapped[str]
    notes: Mapped[str | None]
    folder: Mapped[str | None]
    order_index: Mapped[int] = mapped_column(Integer, server_default="0")


class RoutineExercise(OwnedByUser, SyncColumns, Base):
    __tablename__ = "routine_exercises"
    __table_args__ = (owned_reference("routine_id", "routines", ondelete="CASCADE"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    routine_id: Mapped[uuid.UUID]
    exercise_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exercises.id"))
    order_index: Mapped[int] = mapped_column(Integer)
    superset_group: Mapped[int | None] = mapped_column(SmallInteger)
    target_sets: Mapped[int | None] = mapped_column(SmallInteger)
    target_min_reps: Mapped[int | None] = mapped_column(SmallInteger)
    target_max_reps: Mapped[int | None] = mapped_column(SmallInteger)
    target_rir: Mapped[int | None] = mapped_column(SmallInteger)
    rest_seconds: Mapped[int | None] = mapped_column(SmallInteger)
    notes: Mapped[str | None]


class Workout(OwnedByUser, SyncColumns, Base):
    __tablename__ = "workouts"
    __table_args__ = (
        UniqueConstraint("id", "user_id"),
        owned_reference("routine_id", "routines", ondelete="SET NULL"),
        owned_reference("planned_session_id", "planned_sessions", ondelete="SET NULL"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    routine_id: Mapped[uuid.UUID | None]
    planned_session_id: Mapped[uuid.UUID | None]
    title: Mapped[str]
    started_at: Mapped[datetime]
    ended_at: Mapped[datetime | None]
    local_date: Mapped[date]
    tz: Mapped[str]
    notes: Mapped[str | None]
    perceived_fatigue: Mapped[int | None] = mapped_column(SmallInteger)
    source: Mapped[str] = mapped_column(WORKOUT_SOURCE)


class WorkoutExercise(OwnedByUser, SyncColumns, Base):
    __tablename__ = "workout_exercises"
    __table_args__ = (
        UniqueConstraint("id", "user_id"),
        owned_reference("workout_id", "workouts", ondelete="CASCADE"),
        owned_reference("planned_exercise_id", "planned_exercises", ondelete="SET NULL"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    workout_id: Mapped[uuid.UUID]
    exercise_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exercises.id"))
    order_index: Mapped[int] = mapped_column(Integer)
    superset_group: Mapped[int | None] = mapped_column(SmallInteger)
    notes: Mapped[str | None]
    planned_exercise_id: Mapped[uuid.UUID | None]
    # Copied from the routine at start, editable during the session (task 004 stage 5, 03 §4).
    rest_seconds: Mapped[int | None] = mapped_column(SmallInteger)
    target_min_reps: Mapped[int | None] = mapped_column(SmallInteger)
    target_max_reps: Mapped[int | None] = mapped_column(SmallInteger)
    target_rir: Mapped[int | None] = mapped_column(SmallInteger)


class SetLog(OwnedByUser, SyncColumns, Base):
    __tablename__ = "set_logs"
    __table_args__ = (
        UniqueConstraint("id", "user_id"),
        owned_reference("workout_exercise_id", "workout_exercises", ondelete="CASCADE"),
        owned_reference("planned_set_id", "planned_sets", ondelete="SET NULL"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    workout_exercise_id: Mapped[uuid.UUID]
    set_index: Mapped[int] = mapped_column(SmallInteger)
    set_type: Mapped[str] = mapped_column(SET_TYPE, server_default="working")
    weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(9, 4))
    reps: Mapped[int | None] = mapped_column(SmallInteger)
    rir: Mapped[int | None] = mapped_column(SmallInteger)
    # Decimals, so a distance typed in feet reads back as typed (task 004 stage 5c, 03 §4).
    distance_m: Mapped[Decimal | None] = mapped_column(Numeric(9, 3))
    duration_s: Mapped[int | None] = mapped_column(Integer)
    is_completed: Mapped[bool] = mapped_column(server_default="false")
    completed_at: Mapped[datetime | None]
    planned_set_id: Mapped[uuid.UUID | None]


class PersonalRecord(OwnedByUser, Base):
    """Derived: a rebuildable fold over set_logs, never synced (03 §11)."""

    __tablename__ = "personal_records"
    __table_args__ = (
        UniqueConstraint("user_id", "exercise_id", "kind"),
        owned_reference("set_log_id", "set_logs", ondelete="CASCADE"),
        owned_reference("workout_id", "workouts", ondelete="CASCADE"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    exercise_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exercises.id"))
    kind: Mapped[str] = mapped_column(PR_KIND)
    value: Mapped[Decimal] = mapped_column(Numeric(12, 4))
    weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(9, 4))
    reps: Mapped[int | None] = mapped_column(SmallInteger)
    rir: Mapped[int | None] = mapped_column(SmallInteger)
    set_log_id: Mapped[uuid.UUID | None]
    workout_id: Mapped[uuid.UUID | None]
    achieved_at: Mapped[datetime]
    computed_at: Mapped[datetime]


class ProgressionRule(OwnedByUser, SyncColumns, Base):
    __tablename__ = "progression_rules"
    __table_args__ = (UniqueConstraint("id", "user_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    name: Mapped[str | None]
    strategy: Mapped[str] = mapped_column(PROGRESSION_STRATEGY)
    load_step_kg: Mapped[Decimal | None] = mapped_column(Numeric(10, 6))
    load_step_bp: Mapped[int | None] = mapped_column(Integer)
    rep_step: Mapped[int | None] = mapped_column(SmallInteger, server_default="1")
    min_reps: Mapped[int] = mapped_column(SmallInteger)
    max_reps: Mapped[int] = mapped_column(SmallInteger)
    min_rir: Mapped[int] = mapped_column(SmallInteger, server_default="0")
    max_rir: Mapped[int] = mapped_column(SmallInteger, server_default="4")
    rir_mode: Mapped[str] = mapped_column(RIR_MODE, server_default="per_exercise")
    rir_offsets: Mapped[list[Any] | None]
    rir_start: Mapped[int | None] = mapped_column(SmallInteger)
    rir_end: Mapped[int | None] = mapped_column(SmallInteger)
    percent_wave_bp: Mapped[list[Any] | None]
    baseline_e1rm_kg: Mapped[Decimal | None] = mapped_column(Numeric(9, 4))
    cycle_pattern: Mapped[list[Any] | None]
    failure_policy: Mapped[str] = mapped_column(FAILURE_POLICY, server_default="hold")
    failure_load_bp: Mapped[int | None] = mapped_column(Integer, server_default="9000")
    rounding: Mapped[str] = mapped_column(ROUNDING, server_default="nearest")


class Mesocycle(OwnedByUser, SyncColumns, Base):
    __tablename__ = "mesocycles"
    __table_args__ = (
        UniqueConstraint("id", "user_id"),
        owned_reference("default_rule_id", "progression_rules", ondelete="SET NULL"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    name: Mapped[str]
    goal: Mapped[str] = mapped_column(MESO_GOAL)
    start_date: Mapped[date]
    num_microcycles: Mapped[int] = mapped_column(SmallInteger)
    default_microcycle_days: Mapped[int] = mapped_column(SmallInteger, server_default="7")
    deload_mode: Mapped[str] = mapped_column(DELOAD_MODE, server_default="none")
    deload_every_n_microcycles: Mapped[int | None] = mapped_column(SmallInteger)
    deload_final_cycle: Mapped[bool] = mapped_column(server_default="false")
    deload_set_bp: Mapped[int] = mapped_column(Integer, server_default="5000")
    deload_load_bp: Mapped[int] = mapped_column(Integer, server_default="6000")
    deload_rir_bump: Mapped[int] = mapped_column(SmallInteger, server_default="2")
    default_rule_id: Mapped[uuid.UUID | None]
    status: Mapped[str] = mapped_column(MESO_STATUS, server_default="draft")


class Microcycle(OwnedByUser, SyncColumns, Base):
    __tablename__ = "microcycles"
    __table_args__ = (
        UniqueConstraint("id", "user_id"),
        UniqueConstraint("mesocycle_id", "cycle_number"),
        owned_reference("mesocycle_id", "mesocycles", ondelete="CASCADE"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    mesocycle_id: Mapped[uuid.UUID]
    cycle_number: Mapped[int] = mapped_column(SmallInteger)
    length_days: Mapped[int] = mapped_column(SmallInteger)
    starts_on: Mapped[date]
    is_deload: Mapped[bool] = mapped_column(server_default="false")
    status: Mapped[str] = mapped_column(CYCLE_STATUS, server_default="projected")
    engine_version: Mapped[int] = mapped_column(Integer)
    last_write_kind: Mapped[str] = mapped_column(WRITE_KIND, server_default="engine")


class PlannedSession(OwnedByUser, SyncColumns, Base):
    __tablename__ = "planned_sessions"
    __table_args__ = (
        UniqueConstraint("id", "user_id"),
        owned_reference("microcycle_id", "microcycles", ondelete="CASCADE"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    microcycle_id: Mapped[uuid.UUID]
    day_index: Mapped[int] = mapped_column(SmallInteger)
    name: Mapped[str]
    order_index: Mapped[int] = mapped_column(Integer, server_default="0")


class PlannedExercise(OwnedByUser, SyncColumns, Base):
    __tablename__ = "planned_exercises"
    __table_args__ = (
        UniqueConstraint("id", "user_id"),
        owned_reference("planned_session_id", "planned_sessions", ondelete="CASCADE"),
        owned_reference("progression_rule_id", "progression_rules", ondelete="SET NULL"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    planned_session_id: Mapped[uuid.UUID]
    exercise_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("exercises.id"))
    progression_rule_id: Mapped[uuid.UUID | None]
    order_index: Mapped[int] = mapped_column(Integer)
    superset_group: Mapped[int | None] = mapped_column(SmallInteger)
    rest_seconds: Mapped[int | None] = mapped_column(SmallInteger)
    notes: Mapped[str | None]


class PlannedSet(OwnedByUser, SyncColumns, Base):
    __tablename__ = "planned_sets"
    __table_args__ = (
        UniqueConstraint("id", "user_id"),
        owned_reference("planned_exercise_id", "planned_exercises", ondelete="CASCADE"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True)
    planned_exercise_id: Mapped[uuid.UUID]
    set_index: Mapped[int] = mapped_column(SmallInteger)
    set_type: Mapped[str] = mapped_column(SET_TYPE, server_default="working")
    target_weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(9, 4))
    target_reps: Mapped[int | None] = mapped_column(SmallInteger)
    target_min_reps: Mapped[int | None] = mapped_column(SmallInteger)
    target_max_reps: Mapped[int | None] = mapped_column(SmallInteger)
    target_rir: Mapped[int | None] = mapped_column(SmallInteger)
    was_clamped: Mapped[bool] = mapped_column(server_default="false")
    origin: Mapped[str] = mapped_column(SET_ORIGIN, server_default="generated")
    is_pinned: Mapped[bool] = mapped_column(server_default="false")
