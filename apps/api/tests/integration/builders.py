"""Test data: one user with a row in every user-owned table, written as the migrator (ADR-011).

The migrator bypasses row-level security, so the graph exists whatever the policies say — which is
what lets a test then prove the app role cannot see it.
"""

import uuid
from dataclasses import dataclass, fields

from sqlalchemy import Connection, text


@dataclass(frozen=True)
class UserGraph:
    user_id: uuid.UUID
    email: str
    exercise_id: uuid.UUID
    routine_id: uuid.UUID
    rule_id: uuid.UUID
    mesocycle_id: uuid.UUID
    microcycle_id: uuid.UUID
    planned_session_id: uuid.UUID
    planned_exercise_id: uuid.UUID
    planned_set_id: uuid.UUID
    workout_id: uuid.UUID
    workout_exercise_id: uuid.UUID
    set_log_id: uuid.UUID
    cardio_plan_id: uuid.UUID
    cardio_microcycle_id: uuid.UUID
    planned_cardio_session_id: uuid.UUID
    activity_id: uuid.UUID


GRAPH = [
    """INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at)
       VALUES (:user_id, :email, 'argon2id$not-a-real-hash', 'Test', now(), now())""",
    """INSERT INTO subscriptions (user_id, trial_started_at, trial_ends_at, created_at, updated_at)
       VALUES (:user_id, now(), now() + interval '3 months', now(), now())""",
    """INSERT INTO body_weight_log (id, user_id, measured_on, weight_kg, created_at, updated_at)
       VALUES (gen_random_uuid(), :user_id, current_date, 80, now(), now())""",
    """INSERT INTO hr_zone_overrides (user_id, zone, min_bpm, max_bpm, created_at, updated_at)
       VALUES (:user_id, 2, 120, 140, now(), now())""",
    """INSERT INTO privacy_zones (id, user_id, ciphertext, nonce, created_at, updated_at)
       VALUES (gen_random_uuid(), :user_id, decode('00', 'hex'), decode(repeat('00', 24), 'hex'),
               now(), now())""",
    """INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
       VALUES (gen_random_uuid(), :user_id, :reset_hash, now() + interval '30 minutes', now())""",
    """INSERT INTO email_verification_tokens (id, user_id, email, token_hash, expires_at,
                                              created_at)
       VALUES (gen_random_uuid(), :user_id, :email, :verification_hash, now() + interval '1 day',
               now())""",
    """INSERT INTO refresh_tokens (id, user_id, token_hash, device_id, issued_at, expires_at)
       VALUES (gen_random_uuid(), :user_id, :refresh_hash, 'device-1', now(),
               now() + interval '60 days')""",
    """INSERT INTO exercises (id, owner_user_id, name, modality, primary_muscle_id, created_at,
                              updated_at)
       VALUES (:exercise_id, :user_id, 'My press', 'machine', 1, now(), now())""",
    """INSERT INTO exercise_secondary_muscles (exercise_id, muscle_group_id)
       VALUES (:exercise_id, 9)""",
    """INSERT INTO routines (id, user_id, name, created_at, updated_at)
       VALUES (:routine_id, :user_id, 'Push', now(), now())""",
    """INSERT INTO routine_exercises (id, user_id, routine_id, exercise_id, order_index, created_at,
                                      updated_at)
       VALUES (gen_random_uuid(), :user_id, :routine_id, :exercise_id, 0, now(), now())""",
    """INSERT INTO progression_rules (id, user_id, strategy, min_reps, max_reps, created_at,
                                      updated_at)
       VALUES (:rule_id, :user_id, 'linear_load', 6, 8, now(), now())""",
    """INSERT INTO mesocycles (id, user_id, name, goal, start_date, num_microcycles,
                               default_rule_id, created_at, updated_at)
       VALUES (:mesocycle_id, :user_id, 'Block', 'strength', current_date, 12, :rule_id, now(),
               now())""",
    """INSERT INTO microcycles (id, user_id, mesocycle_id, cycle_number, length_days, starts_on,
                                engine_version, created_at, updated_at)
       VALUES (:microcycle_id, :user_id, :mesocycle_id, 1, 9, current_date, 3, now(), now())""",
    """INSERT INTO planned_sessions (id, user_id, microcycle_id, day_index, name, created_at,
                                     updated_at)
       VALUES (:planned_session_id, :user_id, :microcycle_id, 9, 'Push A', now(), now())""",
    """INSERT INTO planned_exercises (id, user_id, planned_session_id, exercise_id,
                                      progression_rule_id, order_index, created_at, updated_at)
       VALUES (:planned_exercise_id, :user_id, :planned_session_id, :exercise_id, :rule_id, 0,
               now(), now())""",
    """INSERT INTO planned_sets (id, user_id, planned_exercise_id, set_index, target_weight_kg,
                                 target_reps, target_rir, created_at, updated_at)
       VALUES (:planned_set_id, :user_id, :planned_exercise_id, 1, 40, 6, 2, now(), now())""",
    """INSERT INTO workouts (id, user_id, routine_id, planned_session_id, title, started_at,
                             local_date, tz, source, created_at, updated_at)
       VALUES (:workout_id, :user_id, :routine_id, :planned_session_id, 'Push A', now(),
               current_date, 'America/Sao_Paulo', 'plan', now(), now())""",
    """INSERT INTO workout_exercises (id, user_id, workout_id, exercise_id, order_index,
                                      planned_exercise_id, created_at, updated_at)
       VALUES (:workout_exercise_id, :user_id, :workout_id, :exercise_id, 0, :planned_exercise_id,
               now(), now())""",
    """INSERT INTO set_logs (id, user_id, workout_exercise_id, set_index, weight_kg, reps, rir,
                             is_completed, planned_set_id, created_at, updated_at)
       VALUES (:set_log_id, :user_id, :workout_exercise_id, 1, 40, 6, 2, true, :planned_set_id,
               now(), now())""",
    """INSERT INTO personal_records (id, user_id, exercise_id, kind, value, set_log_id, workout_id,
                                     achieved_at, computed_at)
       VALUES (gen_random_uuid(), :user_id, :exercise_id, 'max_weight', 40, :set_log_id,
               :workout_id, now(), now())""",
    """INSERT INTO cardio_plans (id, user_id, name, goal, start_date, num_microcycles,
                                 volume_step_bp, created_at, updated_at)
       VALUES (:cardio_plan_id, :user_id, 'Base', 'base', current_date, 8, 1303, now(), now())""",
    """INSERT INTO cardio_plan_microcycles (id, user_id, cardio_plan_id, cycle_number, length_days,
                                            starts_on, engine_version, created_at, updated_at)
       VALUES (:cardio_microcycle_id, :user_id, :cardio_plan_id, 1, 9, current_date, 3, now(),
               now())""",
    """INSERT INTO cardio_plan_cycle_targets (user_id, cardio_plan_microcycle_id, sport,
                                              target_distance_m)
       VALUES (:user_id, :cardio_microcycle_id, 'run', 20000)""",
    """INSERT INTO planned_cardio_sessions (id, user_id, cardio_plan_microcycle_id, day_index,
                                            sport, session_type, target_distance_m, created_at,
                                            updated_at)
       VALUES (:planned_cardio_session_id, :user_id, :cardio_microcycle_id, 9, 'run', 'easy',
               6000, now(), now())""",
    """INSERT INTO cardio_activities (id, user_id, planned_cardio_session_id, sport, title,
                                      started_at, local_date, tz, elapsed_s, moving_s, source,
                                      pipeline_version, created_at, updated_at)
       VALUES (:activity_id, :user_id, :planned_cardio_session_id, 'run', 'Easy run', now(),
               current_date, 'America/Sao_Paulo', 1900, 1800, 'recorded', 1, now(), now())""",
    """INSERT INTO activity_streams (user_id, activity_id, kind, encoding, sample_count, data)
       VALUES (:user_id, :activity_id, 'time', 'varint_zigzag', 0, decode('', 'hex'))""",
    """INSERT INTO activity_segments (id, user_id, activity_id, segment_index, kind, split_basis,
                                      distance_m, moving_s, elapsed_s, created_at, updated_at)
       VALUES (gen_random_uuid(), :user_id, :activity_id, 1, 'auto_split', 'km', 1000, 300, 310,
               now(), now())""",
    """INSERT INTO user_track_progress (user_id, track, activated_at, computed_at)
       VALUES (:user_id, 'strength', now(), now())""",
    """INSERT INTO xp_awards (id, user_id, track, amount, reason, source_kind, source_id,
                              awarded_at, created_at, updated_at)
       VALUES (gen_random_uuid(), :user_id, 'strength', 100, 'session_completed', 'workout',
               :workout_id, now(), now(), now())""",
    """INSERT INTO user_achievements (user_id, achievement_code, achieved_at, created_at,
                                      updated_at)
       VALUES (:user_id, 'first_block', now(), now(), now())""",
    """INSERT INTO adherence_streaks (user_id, created_at, updated_at)
       VALUES (:user_id, now(), now())""",
]


def create_user_graph(connection: Connection) -> UserGraph:
    """Needs the reference data seeded: muscle groups, sport profiles, tracks and achievements."""
    ids = {field.name: uuid.uuid4() for field in fields(UserGraph) if field.name != "email"}
    graph = UserGraph(email=f"user-{ids['user_id'].hex[:12]}@example.com", **ids)
    params = {
        **{name: str(value) for name, value in ids.items()},
        "email": graph.email,
        "reset_hash": f"reset-{uuid.uuid4().hex}",
        "verification_hash": f"verify-{uuid.uuid4().hex}",
        "refresh_hash": f"refresh-{uuid.uuid4().hex}",
    }
    for statement in GRAPH:
        connection.execute(text(statement), params)
    return graph
