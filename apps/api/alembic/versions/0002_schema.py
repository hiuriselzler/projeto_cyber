"""The whole schema in docs/03-database-schema.md, in one pass (task 002).

Tables in the task's order, then the triggers that enforce what a CHECK cannot reach (INV-06,
INV-25, FR-2.16, ADR-013), row-level security on every user-owned table (ADR-011), and the only
functions that read a row without a user scope. Hand-written and frozen: later changes are new
revisions, expand and contract (06 §4).

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-12
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# The sync columns — on every sync root, and nothing else (03 §11).
SYNC = """
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL,
    deleted_at timestamptz,
    sync_version bigint NOT NULL DEFAULT 1"""

# Every user-owned table, and every child of one (ADR-013).
OWNER = "user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE"

# The fail-closed scope: unset or empty means no user, which matches no row (ADR-011).
SCOPE = "NULLIF(current_setting('app.user_id', true), '')::uuid"


def _sql(statement: str) -> str:
    return statement.replace("__SYNC__", SYNC.strip()).replace("__OWNER__", OWNER)


ENUMS = """
CREATE TYPE unit_system_enum AS ENUM ('metric', 'imperial');
CREATE TYPE locale_enum AS ENUM ('en', 'pt-BR');
CREATE TYPE sex_enum AS ENUM ('male', 'female', 'unspecified');
CREATE TYPE tier_enum AS ENUM ('trial', 'free', 'pro', 'coach');
CREATE TYPE store_enum AS ENUM ('apple', 'google');
CREATE TYPE muscle_region_enum AS ENUM
    ('upper_push', 'upper_pull', 'legs', 'core', 'arms', 'other');
CREATE TYPE modality_enum AS ENUM
    ('barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'other');
CREATE TYPE tracking_enum AS ENUM ('weight_reps', 'reps_only', 'duration', 'distance_duration');
CREATE TYPE workout_source_enum AS ENUM ('manual', 'plan', 'routine');
CREATE TYPE set_type_enum AS ENUM ('warmup', 'working', 'drop', 'backoff', 'amrap');
CREATE TYPE pr_kind_enum AS ENUM
    ('max_weight', 'best_e1rm', 'max_reps_at_weight', 'best_session_volume');
CREATE TYPE progression_strategy_enum AS ENUM
    ('linear_load', 'double_progression', 'percent_1rm', 'rir_autoregulated', 'fixed',
     'cycle_pattern');
CREATE TYPE rir_mode_enum AS ENUM ('per_exercise', 'per_set');
CREATE TYPE failure_policy_enum AS ENUM ('hold', 'repeat_cycle', 'reduce_load');
CREATE TYPE rounding_enum AS ENUM ('nearest', 'down', 'up');
CREATE TYPE meso_goal_enum AS ENUM ('hypertrophy', 'strength', 'peaking', 'maintenance');
CREATE TYPE deload_mode_enum AS ENUM ('none', 'every_n_microcycles', 'manual');
CREATE TYPE meso_status_enum AS ENUM ('draft', 'active', 'completed', 'abandoned');
CREATE TYPE cycle_status_enum AS ENUM
    ('projected', 'locked', 'in_progress', 'completed', 'skipped');
CREATE TYPE write_kind_enum AS ENUM ('engine', 'user');
CREATE TYPE set_origin_enum AS ENUM ('generated', 'user_edited');
CREATE TYPE sport_enum AS ENUM
    ('run', 'ride', 'walk', 'swim_pool', 'treadmill', 'indoor_bike',
     'trail_run', 'hike', 'open_water_swim', 'row_indoor', 'other');
CREATE TYPE recording_mode_enum AS ENUM ('gps', 'lap', 'manual');
CREATE TYPE primary_metric_enum AS ENUM ('distance', 'duration', 'elevation');
CREATE TYPE pace_unit_enum AS ENUM
    ('min_per_km', 'min_per_mi', 'km_per_h', 'mph', 'min_per_100m', 'min_per_100yd', 'per_500m');
CREATE TYPE activity_source_enum AS ENUM ('recorded', 'manual', 'imported');
CREATE TYPE visibility_enum AS ENUM ('private', 'followers', 'public');
CREATE TYPE stream_kind_enum AS ENUM
    ('latlng', 'altitude', 'time', 'heartrate', 'cadence', 'velocity', 'moving');
CREATE TYPE stream_encoding_enum AS ENUM ('f32_le', 'i16_le', 'polyline', 'varint_zigzag');
CREATE TYPE segment_kind_enum AS ENUM
    ('auto_split', 'manual_lap', 'swim_set', 'interval', 'rest', 'warmup', 'cooldown');
CREATE TYPE split_basis_enum AS ENUM ('none', 'km', 'mi');
CREATE TYPE cardio_goal_enum AS ENUM
    ('base', '5k', '10k', 'half', 'marathon', 'swim', 'triathlon', 'custom');
CREATE TYPE track_enum AS ENUM
    ('strength', 'run', 'ride', 'walk', 'swim_pool', 'treadmill', 'indoor_bike',
     'trail_run', 'hike', 'open_water_swim', 'row_indoor', 'other',
     'consistency', 'recovery', 'precision', 'progression');
CREATE TYPE track_kind_enum AS ENUM ('discipline', 'quality');
CREATE TYPE xp_source_enum AS ENUM ('workout', 'activity', 'plan_cycle', 'achievement', 'manual');
"""

IDENTITY = """
CREATE TABLE users (
    id uuid PRIMARY KEY,
    email citext NOT NULL UNIQUE,
    password_hash text NOT NULL,
    display_name text NOT NULL,
    unit_system unit_system_enum NOT NULL DEFAULT 'metric',
    locale locale_enum NOT NULL DEFAULT 'en',
    body_weight_kg numeric(9,4),
    birth_date date,
    sex sex_enum,
    max_hr smallint,
    resting_hr smallint,
    timezone text NOT NULL DEFAULT 'UTC',
    email_verified_at timestamptz,
    gamification_enabled boolean NOT NULL DEFAULT true,
    deletion_requested_at timestamptz,
    wrapped_privacy_key bytea,
    privacy_key_salt bytea,
    privacy_key_kdf text,
    __SYNC__
);
CREATE INDEX users_deletion_requested_at_idx ON users (deletion_requested_at)
    WHERE deletion_requested_at IS NOT NULL;

CREATE TABLE password_reset_tokens (
    id uuid PRIMARY KEY,
    __OWNER__,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    requested_ip inet,
    created_at timestamptz NOT NULL
);
CREATE INDEX password_reset_tokens_user_id_idx ON password_reset_tokens (user_id)
    WHERE used_at IS NULL;

CREATE TABLE email_verification_tokens (
    id uuid PRIMARY KEY,
    __OWNER__,
    email citext NOT NULL,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    used_at timestamptz,
    created_at timestamptz NOT NULL
);
CREATE INDEX email_verification_tokens_user_id_idx ON email_verification_tokens (user_id);

CREATE TABLE refresh_tokens (
    id uuid PRIMARY KEY,
    __OWNER__,
    token_hash text NOT NULL UNIQUE,
    device_id text NOT NULL,
    device_name text,
    issued_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    replaced_by uuid,
    UNIQUE (id, user_id),
    FOREIGN KEY (replaced_by, user_id) REFERENCES refresh_tokens (id, user_id)
        ON DELETE SET NULL (replaced_by)
);
CREATE INDEX refresh_tokens_user_device_idx ON refresh_tokens (user_id, device_id)
    WHERE revoked_at IS NULL;

CREATE TABLE subscriptions (
    user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    tier tier_enum NOT NULL DEFAULT 'trial',
    trial_started_at timestamptz NOT NULL,
    trial_ends_at timestamptz NOT NULL,
    store store_enum,
    store_product_id text,
    current_period_end timestamptz,
    cancelled_at timestamptz,
    __SYNC__
);

CREATE TABLE body_weight_log (
    id uuid PRIMARY KEY,
    __OWNER__,
    measured_on date NOT NULL,
    weight_kg numeric(9,4) NOT NULL,
    __SYNC__,
    UNIQUE (user_id, measured_on)
);

CREATE TABLE hr_zone_overrides (
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    zone smallint NOT NULL CHECK (zone BETWEEN 1 AND 5),
    min_bpm smallint NOT NULL,
    max_bpm smallint NOT NULL,
    __SYNC__,
    PRIMARY KEY (user_id, zone)
);

CREATE TABLE privacy_zones (
    id uuid PRIMARY KEY,
    __OWNER__,
    ciphertext bytea NOT NULL,
    nonce bytea NOT NULL CHECK (octet_length(nonce) = 24),
    __SYNC__
);
CREATE INDEX privacy_zones_user_id_idx ON privacy_zones (user_id);
"""

CATALOG = """
CREATE TABLE muscle_groups (
    id smallint PRIMARY KEY,
    name_key text NOT NULL UNIQUE,
    region muscle_region_enum NOT NULL
);

CREATE TABLE exercises (
    id uuid PRIMARY KEY,
    owner_user_id uuid REFERENCES users (id) ON DELETE CASCADE,
    forked_from_id uuid REFERENCES exercises (id) ON DELETE SET NULL,
    name_key text,
    name text,
    modality modality_enum NOT NULL,
    primary_muscle_id smallint NOT NULL REFERENCES muscle_groups (id),
    is_unilateral boolean NOT NULL DEFAULT false,
    tracking tracking_enum NOT NULL DEFAULT 'weight_reps',
    load_increment_kg numeric(10,6) CHECK (load_increment_kg >= 0),
    uses_bodyweight boolean NOT NULL DEFAULT false,
    default_min_reps smallint,
    default_max_reps smallint,
    notes text,
    __SYNC__,
    CONSTRAINT exercises_name_or_key CHECK ((name_key IS NULL) <> (name IS NULL)),
    CONSTRAINT exercises_key_iff_global CHECK ((owner_user_id IS NULL) = (name_key IS NOT NULL)),
    CONSTRAINT exercises_global_increment_unset
        CHECK (owner_user_id IS NOT NULL OR load_increment_kg IS NULL),
    CONSTRAINT exercises_default_reps_ordered CHECK (default_max_reps >= default_min_reps)
);
CREATE UNIQUE INDEX exercises_owner_name_key ON exercises (owner_user_id, lower(name))
    WHERE deleted_at IS NULL AND name IS NOT NULL;
CREATE UNIQUE INDEX exercises_name_key_key ON exercises (name_key) WHERE name_key IS NOT NULL;
CREATE INDEX exercises_owner_user_id_idx ON exercises (owner_user_id) INCLUDE (name);

CREATE TABLE exercise_secondary_muscles (
    exercise_id uuid NOT NULL REFERENCES exercises (id) ON DELETE CASCADE,
    muscle_group_id smallint NOT NULL REFERENCES muscle_groups (id),
    PRIMARY KEY (exercise_id, muscle_group_id)
);

CREATE TABLE modality_increments (
    modality modality_enum NOT NULL,
    unit_system unit_system_enum NOT NULL,
    increment_kg numeric(10,6) NOT NULL CHECK (increment_kg >= 0),
    PRIMARY KEY (modality, unit_system)
);
"""

ROUTINES = """
CREATE TABLE routines (
    id uuid PRIMARY KEY,
    __OWNER__,
    name text NOT NULL,
    notes text,
    folder text,
    order_index integer NOT NULL DEFAULT 0,
    __SYNC__,
    UNIQUE (id, user_id)
);
CREATE INDEX routines_user_id_idx ON routines (user_id);

CREATE TABLE routine_exercises (
    id uuid PRIMARY KEY,
    __OWNER__,
    routine_id uuid NOT NULL,
    exercise_id uuid NOT NULL REFERENCES exercises (id),
    order_index integer NOT NULL,
    superset_group smallint,
    target_sets smallint,
    target_min_reps smallint,
    target_max_reps smallint,
    target_rir smallint CHECK (target_rir IS NULL OR target_rir BETWEEN 0 AND 10),
    rest_seconds smallint,
    notes text,
    __SYNC__,
    FOREIGN KEY (routine_id, user_id) REFERENCES routines (id, user_id) ON DELETE CASCADE,
    CONSTRAINT routine_exercises_order UNIQUE (routine_id, order_index) DEFERRABLE
);
CREATE INDEX routine_exercises_user_id_idx ON routine_exercises (user_id);
"""

WORKOUTS = """
CREATE TABLE workouts (
    id uuid PRIMARY KEY,
    __OWNER__,
    routine_id uuid,
    planned_session_id uuid,
    title text NOT NULL,
    started_at timestamptz NOT NULL,
    ended_at timestamptz,
    local_date date NOT NULL,
    tz text NOT NULL,
    notes text,
    perceived_fatigue smallint CHECK (perceived_fatigue BETWEEN 1 AND 10),
    source workout_source_enum NOT NULL,
    __SYNC__,
    UNIQUE (id, user_id),
    FOREIGN KEY (routine_id, user_id) REFERENCES routines (id, user_id)
        ON DELETE SET NULL (routine_id)
);
CREATE INDEX workouts_user_started_at_idx ON workouts (user_id, started_at DESC);
CREATE INDEX workouts_user_local_date_idx ON workouts (user_id, local_date);
CREATE INDEX workouts_planned_session_id_idx ON workouts (planned_session_id)
    WHERE planned_session_id IS NOT NULL;

CREATE TABLE workout_exercises (
    id uuid PRIMARY KEY,
    __OWNER__,
    workout_id uuid NOT NULL,
    exercise_id uuid NOT NULL REFERENCES exercises (id),
    order_index integer NOT NULL,
    superset_group smallint,
    notes text,
    planned_exercise_id uuid,
    __SYNC__,
    UNIQUE (id, user_id),
    FOREIGN KEY (workout_id, user_id) REFERENCES workouts (id, user_id) ON DELETE CASCADE
);
CREATE INDEX workout_exercises_user_id_idx ON workout_exercises (user_id);
CREATE INDEX workout_exercises_workout_order_idx ON workout_exercises (workout_id, order_index);
CREATE INDEX workout_exercises_exercise_workout_idx ON workout_exercises (exercise_id, workout_id);
CREATE INDEX workout_exercises_planned_exercise_id_idx ON workout_exercises (planned_exercise_id)
    WHERE planned_exercise_id IS NOT NULL;

CREATE TABLE set_logs (
    id uuid PRIMARY KEY,
    __OWNER__,
    workout_exercise_id uuid NOT NULL,
    set_index smallint NOT NULL,
    set_type set_type_enum NOT NULL DEFAULT 'working',
    weight_kg numeric(9,4) CHECK (weight_kg IS NULL OR weight_kg >= 0),
    reps smallint CHECK (reps IS NULL OR reps BETWEEN 0 AND 1000),
    rir smallint CHECK (rir IS NULL OR rir BETWEEN 0 AND 10),
    distance_m integer,
    duration_s integer,
    is_completed boolean NOT NULL DEFAULT false,
    completed_at timestamptz,
    planned_set_id uuid,
    __SYNC__,
    UNIQUE (id, user_id),
    FOREIGN KEY (workout_exercise_id, user_id) REFERENCES workout_exercises (id, user_id)
        ON DELETE CASCADE,
    CONSTRAINT set_logs_position UNIQUE (workout_exercise_id, set_index) DEFERRABLE
);
CREATE INDEX set_logs_user_id_idx ON set_logs (user_id);
CREATE INDEX set_logs_planned_set_id_idx ON set_logs (planned_set_id)
    WHERE planned_set_id IS NOT NULL;

CREATE TABLE personal_records (
    id uuid PRIMARY KEY,
    __OWNER__,
    exercise_id uuid NOT NULL REFERENCES exercises (id),
    kind pr_kind_enum NOT NULL,
    value numeric(12,4) NOT NULL,
    weight_kg numeric(9,4),
    reps smallint,
    rir smallint CHECK (rir IS NULL OR rir BETWEEN 0 AND 10),
    set_log_id uuid,
    workout_id uuid,
    achieved_at timestamptz NOT NULL,
    computed_at timestamptz NOT NULL,
    UNIQUE (user_id, exercise_id, kind),
    FOREIGN KEY (set_log_id, user_id) REFERENCES set_logs (id, user_id) ON DELETE CASCADE,
    FOREIGN KEY (workout_id, user_id) REFERENCES workouts (id, user_id) ON DELETE CASCADE
);
"""

PLANNER = """
CREATE TABLE progression_rules (
    id uuid PRIMARY KEY,
    __OWNER__,
    name text,
    strategy progression_strategy_enum NOT NULL,
    load_step_kg numeric(10,6),
    load_step_bp integer CHECK (load_step_bp > 0),
    rep_step smallint DEFAULT 1,
    min_reps smallint NOT NULL,
    max_reps smallint NOT NULL,
    min_rir smallint NOT NULL DEFAULT 0 CHECK (min_rir BETWEEN 0 AND 10),
    max_rir smallint NOT NULL DEFAULT 4 CHECK (max_rir BETWEEN 0 AND 10),
    rir_mode rir_mode_enum NOT NULL DEFAULT 'per_exercise',
    rir_offsets jsonb,
    rir_start smallint CHECK (rir_start BETWEEN 0 AND 10),
    rir_end smallint CHECK (rir_end BETWEEN 0 AND 10),
    percent_wave_bp jsonb,
    baseline_e1rm_kg numeric(9,4),
    cycle_pattern jsonb,
    failure_policy failure_policy_enum NOT NULL DEFAULT 'hold',
    failure_load_bp integer DEFAULT 9000 CHECK (failure_load_bp BETWEEN 1 AND 10000),
    rounding rounding_enum NOT NULL DEFAULT 'nearest',
    __SYNC__,
    UNIQUE (id, user_id),
    CONSTRAINT progression_rules_reps_ordered CHECK (max_reps >= min_reps),
    CONSTRAINT progression_rules_rir_ordered CHECK (max_rir >= min_rir),
    CONSTRAINT progression_rules_percent_1rm_baseline
        CHECK (strategy <> 'percent_1rm' OR baseline_e1rm_kg IS NOT NULL)
);
CREATE INDEX progression_rules_user_id_idx ON progression_rules (user_id);

CREATE TABLE mesocycles (
    id uuid PRIMARY KEY,
    __OWNER__,
    name text NOT NULL,
    goal meso_goal_enum NOT NULL,
    start_date date NOT NULL,
    num_microcycles smallint NOT NULL CHECK (num_microcycles BETWEEN 2 AND 52),
    default_microcycle_days smallint NOT NULL DEFAULT 7
        CHECK (default_microcycle_days BETWEEN 1 AND 28),
    deload_mode deload_mode_enum NOT NULL DEFAULT 'none',
    deload_every_n_microcycles smallint CHECK (deload_every_n_microcycles >= 1),
    deload_final_cycle boolean NOT NULL DEFAULT false,
    deload_set_bp integer NOT NULL DEFAULT 5000,
    deload_load_bp integer NOT NULL DEFAULT 6000,
    deload_rir_bump smallint NOT NULL DEFAULT 2,
    default_rule_id uuid,
    status meso_status_enum NOT NULL DEFAULT 'draft',
    __SYNC__,
    UNIQUE (id, user_id),
    FOREIGN KEY (default_rule_id, user_id) REFERENCES progression_rules (id, user_id)
        ON DELETE SET NULL (default_rule_id),
    CONSTRAINT mesocycles_deload_every_n
        CHECK ((deload_mode = 'every_n_microcycles') = (deload_every_n_microcycles IS NOT NULL))
);
CREATE INDEX mesocycles_user_id_idx ON mesocycles (user_id);

CREATE TABLE microcycles (
    id uuid PRIMARY KEY,
    __OWNER__,
    mesocycle_id uuid NOT NULL,
    cycle_number smallint NOT NULL,
    length_days smallint NOT NULL CHECK (length_days BETWEEN 1 AND 28),
    starts_on date NOT NULL,
    is_deload boolean NOT NULL DEFAULT false,
    status cycle_status_enum NOT NULL DEFAULT 'projected',
    engine_version integer NOT NULL,
    last_write_kind write_kind_enum NOT NULL DEFAULT 'engine',
    __SYNC__,
    UNIQUE (id, user_id),
    UNIQUE (mesocycle_id, cycle_number),
    FOREIGN KEY (mesocycle_id, user_id) REFERENCES mesocycles (id, user_id) ON DELETE CASCADE
);
CREATE INDEX microcycles_user_id_idx ON microcycles (user_id);

CREATE TABLE planned_sessions (
    id uuid PRIMARY KEY,
    __OWNER__,
    microcycle_id uuid NOT NULL,
    day_index smallint NOT NULL CHECK (day_index >= 1),
    name text NOT NULL,
    order_index integer NOT NULL DEFAULT 0,
    __SYNC__,
    UNIQUE (id, user_id),
    FOREIGN KEY (microcycle_id, user_id) REFERENCES microcycles (id, user_id) ON DELETE CASCADE
);
CREATE INDEX planned_sessions_user_id_idx ON planned_sessions (user_id);
CREATE INDEX planned_sessions_microcycle_day_idx ON planned_sessions (microcycle_id, day_index);

CREATE TABLE planned_exercises (
    id uuid PRIMARY KEY,
    __OWNER__,
    planned_session_id uuid NOT NULL,
    exercise_id uuid NOT NULL REFERENCES exercises (id),
    progression_rule_id uuid,
    order_index integer NOT NULL,
    superset_group smallint,
    rest_seconds smallint,
    notes text,
    __SYNC__,
    UNIQUE (id, user_id),
    FOREIGN KEY (planned_session_id, user_id) REFERENCES planned_sessions (id, user_id)
        ON DELETE CASCADE,
    FOREIGN KEY (progression_rule_id, user_id) REFERENCES progression_rules (id, user_id)
        ON DELETE SET NULL (progression_rule_id)
);
CREATE INDEX planned_exercises_user_id_idx ON planned_exercises (user_id);
CREATE INDEX planned_exercises_session_order_idx
    ON planned_exercises (planned_session_id, order_index);

CREATE TABLE planned_sets (
    id uuid PRIMARY KEY,
    __OWNER__,
    planned_exercise_id uuid NOT NULL,
    set_index smallint NOT NULL,
    set_type set_type_enum NOT NULL DEFAULT 'working',
    target_weight_kg numeric(9,4),
    target_reps smallint,
    target_min_reps smallint,
    target_max_reps smallint,
    target_rir smallint CHECK (target_rir BETWEEN 0 AND 10),
    was_clamped boolean NOT NULL DEFAULT false,
    origin set_origin_enum NOT NULL DEFAULT 'generated',
    is_pinned boolean NOT NULL DEFAULT false,
    __SYNC__,
    UNIQUE (id, user_id),
    FOREIGN KEY (planned_exercise_id, user_id) REFERENCES planned_exercises (id, user_id)
        ON DELETE CASCADE,
    CONSTRAINT planned_sets_position UNIQUE (planned_exercise_id, set_index) DEFERRABLE
);
CREATE INDEX planned_sets_user_id_idx ON planned_sets (user_id);

-- The log → plan links, now that the plan tables exist. A deleted plan leaves its logs (INV-18).
ALTER TABLE workouts ADD FOREIGN KEY (planned_session_id, user_id)
    REFERENCES planned_sessions (id, user_id) ON DELETE SET NULL (planned_session_id);
ALTER TABLE workout_exercises ADD FOREIGN KEY (planned_exercise_id, user_id)
    REFERENCES planned_exercises (id, user_id) ON DELETE SET NULL (planned_exercise_id);
ALTER TABLE set_logs ADD FOREIGN KEY (planned_set_id, user_id)
    REFERENCES planned_sets (id, user_id) ON DELETE SET NULL (planned_set_id);
"""

SPORTS = """
CREATE TABLE gamification_tracks (
    track track_enum PRIMARY KEY,
    kind track_kind_enum NOT NULL,
    hue_token text NOT NULL,
    level_scale_bp integer NOT NULL DEFAULT 10000 CHECK (level_scale_bp BETWEEN 1 AND 10000)
);

CREATE TABLE sport_profiles (
    sport sport_enum PRIMARY KEY,
    name_key text NOT NULL UNIQUE,
    recording_mode recording_mode_enum NOT NULL,
    primary_metric primary_metric_enum NOT NULL,
    pace_unit_metric pace_unit_enum NOT NULL,
    pace_unit_imperial pace_unit_enum NOT NULL,
    split_unit_m_metric numeric(10,3),
    split_unit_m_imperial numeric(10,3),
    has_route boolean NOT NULL,
    has_elevation boolean NOT NULL,
    autopause_threshold_mps numeric(4,2),
    live_fields jsonb NOT NULL,
    detail_sections jsonb NOT NULL,
    session_types jsonb NOT NULL,
    metrics_schema jsonb NOT NULL,
    xp_track track_enum NOT NULL REFERENCES gamification_tracks (track) ON DELETE RESTRICT
);
"""

CARDIO = """
CREATE TABLE cardio_activities (
    id uuid PRIMARY KEY,
    __OWNER__,
    planned_cardio_session_id uuid,
    sport sport_enum NOT NULL REFERENCES sport_profiles (sport) ON DELETE RESTRICT,
    title text NOT NULL,
    started_at timestamptz NOT NULL,
    local_date date NOT NULL,
    tz text NOT NULL,
    elapsed_s integer NOT NULL,
    moving_s integer NOT NULL,
    distance_m integer NOT NULL DEFAULT 0,
    elevation_gain_m integer NOT NULL DEFAULT 0,
    elevation_loss_m integer NOT NULL DEFAULT 0,
    avg_speed_mps numeric(6,3),
    best_speed_mps numeric(6,3),
    avg_hr smallint,
    max_hr smallint,
    avg_cadence smallint,
    calories integer,
    perceived_effort smallint CHECK (perceived_effort BETWEEN 1 AND 10),
    sport_metrics jsonb NOT NULL DEFAULT '{}',
    source activity_source_enum NOT NULL,
    device text,
    pipeline_version smallint NOT NULL,
    visibility visibility_enum NOT NULL DEFAULT 'private',
    has_track boolean NOT NULL DEFAULT false,
    polyline text,
    start_lat double precision,
    start_lng double precision,
    notes text,
    __SYNC__,
    UNIQUE (id, user_id)
);
CREATE INDEX cardio_activities_user_started_at_idx ON cardio_activities (user_id, started_at DESC);
CREATE INDEX cardio_activities_user_sport_started_at_idx
    ON cardio_activities (user_id, sport, started_at DESC);
CREATE INDEX cardio_activities_planned_cardio_session_id_idx
    ON cardio_activities (planned_cardio_session_id) WHERE planned_cardio_session_id IS NOT NULL;

CREATE TABLE activity_streams (
    __OWNER__,
    activity_id uuid NOT NULL,
    kind stream_kind_enum NOT NULL,
    encoding stream_encoding_enum NOT NULL,
    sample_count integer NOT NULL,
    data bytea NOT NULL,
    PRIMARY KEY (activity_id, kind),
    FOREIGN KEY (activity_id, user_id) REFERENCES cardio_activities (id, user_id) ON DELETE CASCADE
);
CREATE INDEX activity_streams_user_id_idx ON activity_streams (user_id);

CREATE TABLE activity_segments (
    id uuid PRIMARY KEY,
    __OWNER__,
    activity_id uuid NOT NULL,
    segment_index smallint NOT NULL,
    kind segment_kind_enum NOT NULL,
    split_basis split_basis_enum NOT NULL DEFAULT 'none',
    distance_m integer,
    moving_s integer NOT NULL,
    elapsed_s integer NOT NULL,
    rest_s integer,
    elevation_gain_m integer,
    avg_speed_mps numeric(6,3),
    avg_hr smallint,
    segment_metrics jsonb NOT NULL DEFAULT '{}',
    __SYNC__,
    UNIQUE (activity_id, split_basis, segment_index),
    FOREIGN KEY (activity_id, user_id) REFERENCES cardio_activities (id, user_id) ON DELETE CASCADE,
    CONSTRAINT activity_segments_split_basis CHECK ((kind = 'auto_split') = (split_basis <> 'none'))
);
CREATE INDEX activity_segments_user_id_idx ON activity_segments (user_id);
"""

CARDIO_PLANS = """
CREATE TABLE cardio_plans (
    id uuid PRIMARY KEY,
    __OWNER__,
    name text NOT NULL,
    goal cardio_goal_enum NOT NULL,
    start_date date NOT NULL,
    num_microcycles smallint NOT NULL CHECK (num_microcycles BETWEEN 2 AND 52),
    default_microcycle_days smallint NOT NULL DEFAULT 7
        CHECK (default_microcycle_days BETWEEN 1 AND 28),
    volume_step_bp integer NOT NULL,
    rail_overridden_at timestamptz,
    deload_mode deload_mode_enum NOT NULL DEFAULT 'none',
    deload_every_n_microcycles smallint CHECK (deload_every_n_microcycles >= 1),
    deload_volume_bp integer NOT NULL DEFAULT 6000,
    status meso_status_enum NOT NULL DEFAULT 'draft',
    __SYNC__,
    UNIQUE (id, user_id),
    CONSTRAINT cardio_plans_deload_every_n
        CHECK ((deload_mode = 'every_n_microcycles') = (deload_every_n_microcycles IS NOT NULL))
);
CREATE INDEX cardio_plans_user_id_idx ON cardio_plans (user_id);

CREATE TABLE cardio_plan_microcycles (
    id uuid PRIMARY KEY,
    __OWNER__,
    cardio_plan_id uuid NOT NULL,
    cycle_number smallint NOT NULL,
    length_days smallint NOT NULL CHECK (length_days BETWEEN 1 AND 28),
    starts_on date NOT NULL,
    is_deload boolean NOT NULL DEFAULT false,
    target_duration_s integer,
    status cycle_status_enum NOT NULL DEFAULT 'projected',
    engine_version integer NOT NULL,
    last_write_kind write_kind_enum NOT NULL DEFAULT 'engine',
    __SYNC__,
    UNIQUE (id, user_id),
    UNIQUE (cardio_plan_id, cycle_number),
    FOREIGN KEY (cardio_plan_id, user_id) REFERENCES cardio_plans (id, user_id) ON DELETE CASCADE
);
CREATE INDEX cardio_plan_microcycles_user_id_idx ON cardio_plan_microcycles (user_id);

CREATE TABLE cardio_plan_cycle_targets (
    __OWNER__,
    cardio_plan_microcycle_id uuid NOT NULL,
    sport sport_enum NOT NULL REFERENCES sport_profiles (sport) ON DELETE RESTRICT,
    target_distance_m integer,
    target_duration_s integer,
    PRIMARY KEY (cardio_plan_microcycle_id, sport),
    FOREIGN KEY (cardio_plan_microcycle_id, user_id)
        REFERENCES cardio_plan_microcycles (id, user_id) ON DELETE CASCADE
);
CREATE INDEX cardio_plan_cycle_targets_user_id_idx ON cardio_plan_cycle_targets (user_id);

CREATE TABLE planned_cardio_sessions (
    id uuid PRIMARY KEY,
    __OWNER__,
    cardio_plan_microcycle_id uuid NOT NULL,
    day_index smallint NOT NULL CHECK (day_index >= 1),
    sport sport_enum NOT NULL REFERENCES sport_profiles (sport) ON DELETE RESTRICT,
    session_type text NOT NULL,
    target_distance_m integer,
    target_duration_s integer,
    target_zone smallint CHECK (target_zone BETWEEN 1 AND 5),
    target_speed_min_mps numeric(6,3),
    target_speed_max_mps numeric(6,3),
    structure jsonb,
    origin set_origin_enum NOT NULL DEFAULT 'generated',
    is_pinned boolean NOT NULL DEFAULT false,
    notes text,
    __SYNC__,
    UNIQUE (id, user_id),
    FOREIGN KEY (cardio_plan_microcycle_id, user_id)
        REFERENCES cardio_plan_microcycles (id, user_id) ON DELETE CASCADE
);
CREATE INDEX planned_cardio_sessions_user_id_idx ON planned_cardio_sessions (user_id);
CREATE INDEX planned_cardio_sessions_cycle_day_idx
    ON planned_cardio_sessions (cardio_plan_microcycle_id, day_index);

ALTER TABLE cardio_activities ADD FOREIGN KEY (planned_cardio_session_id, user_id)
    REFERENCES planned_cardio_sessions (id, user_id) ON DELETE SET NULL (planned_cardio_session_id);
"""

GAMIFICATION = """
CREATE TABLE user_track_progress (
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    track track_enum NOT NULL REFERENCES gamification_tracks (track),
    xp bigint NOT NULL DEFAULT 0,
    level smallint NOT NULL DEFAULT 1,
    activated_at timestamptz NOT NULL,
    last_awarded_at timestamptz,
    computed_at timestamptz NOT NULL,
    PRIMARY KEY (user_id, track)
);

CREATE TABLE xp_awards (
    id uuid PRIMARY KEY,
    __OWNER__,
    track track_enum NOT NULL,
    amount integer NOT NULL CHECK (amount >= 0),
    reason text NOT NULL,
    source_kind xp_source_enum NOT NULL,
    source_id uuid,
    awarded_at timestamptz NOT NULL,
    __SYNC__,
    CONSTRAINT xp_awards_once UNIQUE NULLS NOT DISTINCT (user_id, source_kind, source_id, reason)
);

CREATE TABLE achievements (
    code text PRIMARY KEY,
    name_key text NOT NULL,
    description_key text NOT NULL,
    track track_enum REFERENCES gamification_tracks (track),
    tier smallint NOT NULL DEFAULT 1,
    unit_system unit_system_enum
);

CREATE TABLE user_achievements (
    user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    achievement_code text NOT NULL REFERENCES achievements (code),
    achieved_at timestamptz NOT NULL,
    source_id uuid,
    __SYNC__,
    PRIMARY KEY (user_id, achievement_code)
);

CREATE TABLE adherence_streaks (
    user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    current_cycles integer NOT NULL DEFAULT 0,
    longest_cycles integer NOT NULL DEFAULT 0,
    last_kept_cycle_id uuid,
    grace_used_in_quarter smallint NOT NULL DEFAULT 0,
    __SYNC__
);
"""

# Rules a CHECK cannot express, because they reach another row. Invoker's rights: under the app role
# they read through row-level security, so a row that is not the user's is simply not found.
TRIGGERS = """
-- ADR-013: an exercise reference must be to the global catalog or to the referencing user's own.
CREATE FUNCTION exercise_reference_is_visible() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM exercises e
        WHERE e.id = NEW.exercise_id
          AND (e.owner_user_id IS NULL OR e.owner_user_id = NEW.user_id)
    ) THEN
        RAISE EXCEPTION 'exercise % is neither global nor owned by the row''s user (ADR-013)',
            NEW.exercise_id USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER routine_exercises_exercise_is_visible
    BEFORE INSERT OR UPDATE OF exercise_id, user_id ON routine_exercises
    FOR EACH ROW EXECUTE FUNCTION exercise_reference_is_visible();
CREATE TRIGGER workout_exercises_exercise_is_visible
    BEFORE INSERT OR UPDATE OF exercise_id, user_id ON workout_exercises
    FOR EACH ROW EXECUTE FUNCTION exercise_reference_is_visible();
CREATE TRIGGER planned_exercises_exercise_is_visible
    BEFORE INSERT OR UPDATE OF exercise_id, user_id ON planned_exercises
    FOR EACH ROW EXECUTE FUNCTION exercise_reference_is_visible();
CREATE TRIGGER personal_records_exercise_is_visible
    BEFORE INSERT OR UPDATE OF exercise_id, user_id ON personal_records
    FOR EACH ROW EXECUTE FUNCTION exercise_reference_is_visible();

-- FR-2.16: a muscle listed as both primary and secondary would be credited 1.2 sets per set.
CREATE FUNCTION secondary_muscle_is_not_primary() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM exercises e
        WHERE e.id = NEW.exercise_id AND e.primary_muscle_id = NEW.muscle_group_id
    ) THEN
        RAISE EXCEPTION 'muscle group % is already the primary muscle of exercise % (FR-2.16)',
            NEW.muscle_group_id, NEW.exercise_id USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER exercise_secondary_muscles_not_primary
    BEFORE INSERT OR UPDATE ON exercise_secondary_muscles
    FOR EACH ROW EXECUTE FUNCTION secondary_muscle_is_not_primary();

CREATE FUNCTION primary_muscle_is_not_secondary() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM exercise_secondary_muscles s
        WHERE s.exercise_id = NEW.id AND s.muscle_group_id = NEW.primary_muscle_id
    ) THEN
        RAISE EXCEPTION 'muscle group % is already a secondary muscle of exercise % (FR-2.16)',
            NEW.primary_muscle_id, NEW.id USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER exercises_primary_muscle_not_secondary
    BEFORE UPDATE OF primary_muscle_id ON exercises
    FOR EACH ROW EXECUTE FUNCTION primary_muscle_is_not_secondary();

-- INV-25: a session sits on a day of its own cycle, and a cycle cannot shrink out from under one.
CREATE FUNCTION planned_session_day_fits_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    cycle_length smallint;
BEGIN
    SELECT m.length_days INTO cycle_length FROM microcycles m WHERE m.id = NEW.microcycle_id;
    IF NEW.day_index > cycle_length THEN
        RAISE EXCEPTION 'day_index % is outside a % day microcycle (INV-25)',
            NEW.day_index, cycle_length USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER planned_sessions_day_fits_cycle
    BEFORE INSERT OR UPDATE ON planned_sessions
    FOR EACH ROW EXECUTE FUNCTION planned_session_day_fits_cycle();

CREATE FUNCTION microcycle_length_holds_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM planned_sessions s
        WHERE s.microcycle_id = NEW.id AND s.deleted_at IS NULL AND s.day_index > NEW.length_days
    ) THEN
        RAISE EXCEPTION 'microcycle % holds a session beyond day % (INV-25)',
            NEW.id, NEW.length_days USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER microcycles_length_holds_sessions
    BEFORE UPDATE OF length_days ON microcycles
    FOR EACH ROW EXECUTE FUNCTION microcycle_length_holds_sessions();

CREATE FUNCTION planned_cardio_session_day_fits_cycle() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    cycle_length smallint;
BEGIN
    SELECT m.length_days INTO cycle_length
    FROM cardio_plan_microcycles m WHERE m.id = NEW.cardio_plan_microcycle_id;
    IF NEW.day_index > cycle_length THEN
        RAISE EXCEPTION 'day_index % is outside a % day microcycle (INV-25)',
            NEW.day_index, cycle_length USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER planned_cardio_sessions_day_fits_cycle
    BEFORE INSERT OR UPDATE ON planned_cardio_sessions
    FOR EACH ROW EXECUTE FUNCTION planned_cardio_session_day_fits_cycle();

CREATE FUNCTION cardio_microcycle_length_holds_sessions() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM planned_cardio_sessions s
        WHERE s.cardio_plan_microcycle_id = NEW.id
          AND s.deleted_at IS NULL AND s.day_index > NEW.length_days
    ) THEN
        RAISE EXCEPTION 'microcycle % holds a session beyond day % (INV-25)',
            NEW.id, NEW.length_days USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER cardio_plan_microcycles_length_holds_sessions
    BEFORE UPDATE OF length_days ON cardio_plan_microcycles
    FOR EACH ROW EXECUTE FUNCTION cardio_microcycle_length_holds_sessions();

-- FR-6.3a: a session type comes from its sport's profile.
CREATE FUNCTION planned_cardio_session_type_is_the_sports() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM sport_profiles p
        WHERE p.sport = NEW.sport AND p.session_types ? NEW.session_type
    ) THEN
        RAISE EXCEPTION 'session type % is not one of the % profile''s (FR-6.3a)',
            NEW.session_type, NEW.sport USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER planned_cardio_sessions_type_is_the_sports
    BEFORE INSERT OR UPDATE OF sport, session_type ON planned_cardio_sessions
    FOR EACH ROW EXECUTE FUNCTION planned_cardio_session_type_is_the_sports();

-- INV-06, ADR-013. The row carries the marker: a changed prescription in a cycle that is no longer
-- projected must be a user edit, and an engine write may neither touch a started cycle nor lower
-- its engine version. A row written back unchanged passes, so sync can resend whole rows.
CREATE FUNCTION planned_set_rewrite_is_allowed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    old_status cycle_status_enum;
    new_status cycle_status_enum;
BEGIN
    IF NEW.origin = 'user_edited'
       OR (NEW.planned_exercise_id, NEW.set_index, NEW.set_type, NEW.target_weight_kg,
           NEW.target_reps, NEW.target_min_reps, NEW.target_max_reps, NEW.target_rir,
           NEW.was_clamped, NEW.deleted_at)
          IS NOT DISTINCT FROM
          (OLD.planned_exercise_id, OLD.set_index, OLD.set_type, OLD.target_weight_kg,
           OLD.target_reps, OLD.target_min_reps, OLD.target_max_reps, OLD.target_rir,
           OLD.was_clamped, OLD.deleted_at)
    THEN
        RETURN NEW;
    END IF;
    SELECT m.status INTO old_status
    FROM planned_exercises pe
    JOIN planned_sessions ps ON ps.id = pe.planned_session_id
    JOIN microcycles m ON m.id = ps.microcycle_id
    WHERE pe.id = OLD.planned_exercise_id;
    SELECT m.status INTO new_status
    FROM planned_exercises pe
    JOIN planned_sessions ps ON ps.id = pe.planned_session_id
    JOIN microcycles m ON m.id = ps.microcycle_id
    WHERE pe.id = NEW.planned_exercise_id;
    IF old_status IS DISTINCT FROM 'projected' OR new_status IS DISTINCT FROM 'projected' THEN
        RAISE EXCEPTION
            'planned set % is in a % microcycle; only a user edit may change it (INV-06)',
            NEW.id, coalesce(old_status, new_status) USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER planned_sets_rewrite_is_allowed
    BEFORE UPDATE ON planned_sets
    FOR EACH ROW EXECUTE FUNCTION planned_set_rewrite_is_allowed();

CREATE FUNCTION planned_cardio_session_rewrite_is_allowed() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    old_status cycle_status_enum;
    new_status cycle_status_enum;
BEGIN
    IF NEW.origin = 'user_edited'
       OR (NEW.cardio_plan_microcycle_id, NEW.day_index, NEW.sport, NEW.session_type,
           NEW.target_distance_m, NEW.target_duration_s, NEW.target_zone,
           NEW.target_speed_min_mps, NEW.target_speed_max_mps, NEW.structure, NEW.deleted_at)
          IS NOT DISTINCT FROM
          (OLD.cardio_plan_microcycle_id, OLD.day_index, OLD.sport, OLD.session_type,
           OLD.target_distance_m, OLD.target_duration_s, OLD.target_zone,
           OLD.target_speed_min_mps, OLD.target_speed_max_mps, OLD.structure, OLD.deleted_at)
    THEN
        RETURN NEW;
    END IF;
    SELECT m.status INTO old_status
    FROM cardio_plan_microcycles m WHERE m.id = OLD.cardio_plan_microcycle_id;
    SELECT m.status INTO new_status
    FROM cardio_plan_microcycles m WHERE m.id = NEW.cardio_plan_microcycle_id;
    IF old_status IS DISTINCT FROM 'projected' OR new_status IS DISTINCT FROM 'projected' THEN
        RAISE EXCEPTION
            'planned session % is in a % microcycle; only a user edit may change it (INV-06)',
            NEW.id, coalesce(old_status, new_status) USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER planned_cardio_sessions_rewrite_is_allowed
    BEFORE UPDATE ON planned_cardio_sessions
    FOR EACH ROW EXECUTE FUNCTION planned_cardio_session_rewrite_is_allowed();

CREATE FUNCTION microcycle_engine_write_is_allowed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.last_write_kind <> 'engine' THEN
        RETURN NEW;
    END IF;
    IF NEW.engine_version < OLD.engine_version THEN
        RAISE EXCEPTION
            'engine version % may not overwrite microcycle % from engine version % (INV-06)',
            NEW.engine_version, NEW.id, OLD.engine_version USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status <> 'projected'
       AND (NEW.mesocycle_id, NEW.cycle_number, NEW.length_days, NEW.starts_on, NEW.is_deload,
            NEW.status, NEW.engine_version, NEW.deleted_at)
           IS DISTINCT FROM
           (OLD.mesocycle_id, OLD.cycle_number, OLD.length_days, OLD.starts_on, OLD.is_deload,
            OLD.status, OLD.engine_version, OLD.deleted_at)
    THEN
        RAISE EXCEPTION 'microcycle % is %; an engine write may not change it (INV-06)',
            NEW.id, OLD.status USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER microcycles_engine_write_is_allowed
    BEFORE UPDATE ON microcycles
    FOR EACH ROW EXECUTE FUNCTION microcycle_engine_write_is_allowed();

CREATE FUNCTION cardio_microcycle_engine_write_is_allowed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.last_write_kind <> 'engine' THEN
        RETURN NEW;
    END IF;
    IF NEW.engine_version < OLD.engine_version THEN
        RAISE EXCEPTION
            'engine version % may not overwrite microcycle % from engine version % (INV-06)',
            NEW.engine_version, NEW.id, OLD.engine_version USING ERRCODE = 'check_violation';
    END IF;
    IF OLD.status <> 'projected'
       AND (NEW.cardio_plan_id, NEW.cycle_number, NEW.length_days, NEW.starts_on, NEW.is_deload,
            NEW.target_duration_s, NEW.status, NEW.engine_version, NEW.deleted_at)
           IS DISTINCT FROM
           (OLD.cardio_plan_id, OLD.cycle_number, OLD.length_days, OLD.starts_on, OLD.is_deload,
            OLD.target_duration_s, OLD.status, OLD.engine_version, OLD.deleted_at)
    THEN
        RAISE EXCEPTION 'microcycle % is %; an engine write may not change it (INV-06)',
            NEW.id, OLD.status USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END
$$;
CREATE TRIGGER cardio_plan_microcycles_engine_write_is_allowed
    BEFORE UPDATE ON cardio_plan_microcycles
    FOR EACH ROW EXECUTE FUNCTION cardio_microcycle_engine_write_is_allowed();
"""

# Every table with an owner column, and the column (ADR-011, ADR-013). exercises and
# exercise_secondary_muscles have the catalog's mixed policies instead, below.
OWNED_TABLES: dict[str, str] = {
    "users": "id",
    "password_reset_tokens": "user_id",
    "email_verification_tokens": "user_id",
    "refresh_tokens": "user_id",
    "subscriptions": "user_id",
    "body_weight_log": "user_id",
    "hr_zone_overrides": "user_id",
    "privacy_zones": "user_id",
    "routines": "user_id",
    "routine_exercises": "user_id",
    "workouts": "user_id",
    "workout_exercises": "user_id",
    "set_logs": "user_id",
    "personal_records": "user_id",
    "progression_rules": "user_id",
    "mesocycles": "user_id",
    "microcycles": "user_id",
    "planned_sessions": "user_id",
    "planned_exercises": "user_id",
    "planned_sets": "user_id",
    "cardio_activities": "user_id",
    "activity_streams": "user_id",
    "activity_segments": "user_id",
    "cardio_plans": "user_id",
    "cardio_plan_microcycles": "user_id",
    "cardio_plan_cycle_targets": "user_id",
    "planned_cardio_sessions": "user_id",
    "user_track_progress": "user_id",
    "xp_awards": "user_id",
    "user_achievements": "user_id",
    "adherence_streaks": "user_id",
}

REFERENCE_TABLES = (
    "muscle_groups",
    "modality_increments",
    "gamification_tracks",
    "sport_profiles",
    "achievements",
)


def _row_level_security() -> str:
    statements = []
    for table, column in OWNED_TABLES.items():
        rule = f"{column} = {SCOPE}"
        statements.append(
            f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;\n"
            f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY;\n"
            f"CREATE POLICY {table}_owner ON {table} USING ({rule}) WITH CHECK ({rule});"
        )

    # The catalog: global rows readable by everyone and writable by nobody through the API; custom
    # rows follow the ordinary rule (ADR-011).
    owner = f"owner_user_id = {SCOPE}"
    statements.append(f"""
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises FORCE ROW LEVEL SECURITY;
CREATE POLICY exercises_read ON exercises FOR SELECT
    USING (owner_user_id IS NULL OR {owner});
CREATE POLICY exercises_insert ON exercises FOR INSERT WITH CHECK ({owner});
CREATE POLICY exercises_update ON exercises FOR UPDATE USING ({owner}) WITH CHECK ({owner});
CREATE POLICY exercises_delete ON exercises FOR DELETE USING ({owner});""")

    # A secondary muscle is visible when its exercise is, and writable when that exercise is the
    # user's. Built from constants, never from input.
    visible = "EXISTS (SELECT 1 FROM exercises e WHERE e.id = exercise_id)"
    owned = f"EXISTS (SELECT 1 FROM exercises e WHERE e.id = exercise_id AND e.{owner})"  # noqa: S608
    statements.append(f"""
ALTER TABLE exercise_secondary_muscles ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_secondary_muscles FORCE ROW LEVEL SECURITY;
CREATE POLICY exercise_secondary_muscles_read ON exercise_secondary_muscles FOR SELECT
    USING ({visible});
CREATE POLICY exercise_secondary_muscles_insert ON exercise_secondary_muscles FOR INSERT
    WITH CHECK ({owned});
CREATE POLICY exercise_secondary_muscles_update ON exercise_secondary_muscles FOR UPDATE
    USING ({owned}) WITH CHECK ({owned});
CREATE POLICY exercise_secondary_muscles_delete ON exercise_secondary_muscles FOR DELETE
    USING ({owned});""")

    # Reference data is seeded by the migrator and read by the API, never written by it.
    statements.append(
        f"REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON {', '.join(REFERENCE_TABLES)} "
        "FROM cyberathlete_app;"
    )
    return "\n".join(statements)


# ADR-011: the complete list of ways the API reads a row without a user scope. Each one pins
# search_path, returns only what its flow needs, and is executable by the app role alone.
# The schema check holds the same list; a SECURITY DEFINER function not on it fails CI.
UNSCOPED_FUNCTIONS = """
CREATE FUNCTION auth_find_user_by_email(p_email citext)
RETURNS TABLE (id uuid, password_hash text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
    SELECT u.id, u.password_hash FROM public.users u WHERE u.email = p_email
$$;

CREATE FUNCTION auth_find_refresh_token(p_token_hash text)
RETURNS TABLE (
    id uuid, user_id uuid, device_id text, issued_at timestamptz, expires_at timestamptz,
    revoked_at timestamptz, replaced_by uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
    SELECT t.id, t.user_id, t.device_id, t.issued_at, t.expires_at, t.revoked_at, t.replaced_by
    FROM public.refresh_tokens t WHERE t.token_hash = p_token_hash
$$;

CREATE FUNCTION auth_redeem_reset_token(p_token_hash text)
RETURNS TABLE (user_id uuid, expires_at timestamptz, used boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
    SELECT t.user_id, t.expires_at, t.used_at IS NOT NULL
    FROM public.password_reset_tokens t WHERE t.token_hash = p_token_hash
$$;

CREATE FUNCTION auth_redeem_verification_token(p_token_hash text)
RETURNS TABLE (user_id uuid, email citext, expires_at timestamptz, used boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
    SELECT t.user_id, t.email, t.expires_at, t.used_at IS NOT NULL
    FROM public.email_verification_tokens t WHERE t.token_hash = p_token_hash
$$;

CREATE FUNCTION maintenance_purge_revoked_tokens(p_before timestamptz)
RETURNS bigint
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
    WITH purged AS (
        DELETE FROM public.refresh_tokens t WHERE t.revoked_at < p_before RETURNING 1
    )
    SELECT count(*) FROM purged
$$;

CREATE FUNCTION maintenance_accounts_due_for_deletion(p_now timestamptz)
RETURNS TABLE (user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
    SELECT u.id FROM public.users u WHERE u.deletion_requested_at <= p_now - interval '7 days'
$$;

REVOKE ALL ON FUNCTION
    auth_find_user_by_email(citext),
    auth_find_refresh_token(text),
    auth_redeem_reset_token(text),
    auth_redeem_verification_token(text),
    maintenance_purge_revoked_tokens(timestamptz),
    maintenance_accounts_due_for_deletion(timestamptz)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
    auth_find_user_by_email(citext),
    auth_find_refresh_token(text),
    auth_redeem_reset_token(text),
    auth_redeem_verification_token(text),
    maintenance_purge_revoked_tokens(timestamptz),
    maintenance_accounts_due_for_deletion(timestamptz)
TO cyberathlete_app;
"""

ALL_TABLES = (
    "users",
    "password_reset_tokens",
    "email_verification_tokens",
    "refresh_tokens",
    "subscriptions",
    "body_weight_log",
    "hr_zone_overrides",
    "privacy_zones",
    "muscle_groups",
    "exercises",
    "exercise_secondary_muscles",
    "modality_increments",
    "routines",
    "routine_exercises",
    "workouts",
    "workout_exercises",
    "set_logs",
    "personal_records",
    "progression_rules",
    "mesocycles",
    "microcycles",
    "planned_sessions",
    "planned_exercises",
    "planned_sets",
    "gamification_tracks",
    "sport_profiles",
    "cardio_activities",
    "activity_streams",
    "activity_segments",
    "cardio_plans",
    "cardio_plan_microcycles",
    "cardio_plan_cycle_targets",
    "planned_cardio_sessions",
    "user_track_progress",
    "xp_awards",
    "achievements",
    "user_achievements",
    "adherence_streaks",
)

TRIGGER_FUNCTIONS = (
    "exercise_reference_is_visible",
    "secondary_muscle_is_not_primary",
    "primary_muscle_is_not_secondary",
    "planned_session_day_fits_cycle",
    "microcycle_length_holds_sessions",
    "planned_cardio_session_day_fits_cycle",
    "cardio_microcycle_length_holds_sessions",
    "planned_cardio_session_type_is_the_sports",
    "planned_set_rewrite_is_allowed",
    "planned_cardio_session_rewrite_is_allowed",
    "microcycle_engine_write_is_allowed",
    "cardio_microcycle_engine_write_is_allowed",
)

ENUM_TYPES = (
    "unit_system_enum",
    "locale_enum",
    "sex_enum",
    "tier_enum",
    "store_enum",
    "muscle_region_enum",
    "modality_enum",
    "tracking_enum",
    "workout_source_enum",
    "set_type_enum",
    "pr_kind_enum",
    "progression_strategy_enum",
    "rir_mode_enum",
    "failure_policy_enum",
    "rounding_enum",
    "meso_goal_enum",
    "deload_mode_enum",
    "meso_status_enum",
    "cycle_status_enum",
    "write_kind_enum",
    "set_origin_enum",
    "sport_enum",
    "recording_mode_enum",
    "primary_metric_enum",
    "pace_unit_enum",
    "activity_source_enum",
    "visibility_enum",
    "stream_kind_enum",
    "stream_encoding_enum",
    "segment_kind_enum",
    "split_basis_enum",
    "cardio_goal_enum",
    "track_enum",
    "track_kind_enum",
    "xp_source_enum",
)


def upgrade() -> None:
    # citext is a trusted extension; roles.sql grants the migrator CREATE on the database for it.
    op.execute("CREATE EXTENSION IF NOT EXISTS citext;")
    for block in (
        ENUMS,
        IDENTITY,
        CATALOG,
        ROUTINES,
        WORKOUTS,
        PLANNER,
        SPORTS,
        CARDIO,
        CARDIO_PLANS,
        GAMIFICATION,
        TRIGGERS,
    ):
        op.execute(_sql(block))
    op.execute(_row_level_security())
    op.execute(UNSCOPED_FUNCTIONS)


def downgrade() -> None:
    op.execute(
        """
        DROP FUNCTION auth_find_user_by_email(citext), auth_find_refresh_token(text),
            auth_redeem_reset_token(text), auth_redeem_verification_token(text),
            maintenance_purge_revoked_tokens(timestamptz),
            maintenance_accounts_due_for_deletion(timestamptz);
        """
    )
    # CASCADE takes the policies, triggers and cross-table foreign keys with the tables.
    op.execute(f"DROP TABLE {', '.join(reversed(ALL_TABLES))} CASCADE;")
    op.execute(f"DROP FUNCTION {', '.join(f'{name}()' for name in TRIGGER_FUNCTIONS)};")
    op.execute(f"DROP TYPE {', '.join(ENUM_TYPES)};")
    op.execute("DROP EXTENSION IF EXISTS citext;")
