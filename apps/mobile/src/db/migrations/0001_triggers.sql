-- Rules a CHECK cannot reach, because they read another row — the same rules Postgres enforces in
-- apps/api/alembic/versions/0002_schema.py (03 § The INV-06 backstop, ADR-013). Hand-written: Drizzle
-- does not generate triggers. The exercise-owner trigger and row-level security are server-only.

-- INV-25: a session sits on a day of its own cycle, and a cycle cannot shrink out from under one.
CREATE TRIGGER planned_sessions_day_fits_cycle_insert
BEFORE INSERT ON planned_sessions
WHEN NEW.day_index > (SELECT m.length_days FROM microcycles m WHERE m.id = NEW.microcycle_id)
BEGIN
  SELECT RAISE(ABORT, 'day_index is outside its microcycle (INV-25)');
END;
--> statement-breakpoint
CREATE TRIGGER planned_sessions_day_fits_cycle_update
BEFORE UPDATE ON planned_sessions
WHEN NEW.day_index > (SELECT m.length_days FROM microcycles m WHERE m.id = NEW.microcycle_id)
BEGIN
  SELECT RAISE(ABORT, 'day_index is outside its microcycle (INV-25)');
END;
--> statement-breakpoint
CREATE TRIGGER microcycles_length_holds_sessions
BEFORE UPDATE OF length_days ON microcycles
WHEN EXISTS (
  SELECT 1 FROM planned_sessions s
  WHERE s.microcycle_id = NEW.id AND s.deleted_at IS NULL AND s.day_index > NEW.length_days
)
BEGIN
  SELECT RAISE(ABORT, 'the microcycle holds a session beyond its new length (INV-25)');
END;
--> statement-breakpoint
CREATE TRIGGER planned_cardio_sessions_day_fits_cycle_insert
BEFORE INSERT ON planned_cardio_sessions
WHEN NEW.day_index > (
  SELECT m.length_days FROM cardio_plan_microcycles m WHERE m.id = NEW.cardio_plan_microcycle_id
)
BEGIN
  SELECT RAISE(ABORT, 'day_index is outside its microcycle (INV-25)');
END;
--> statement-breakpoint
CREATE TRIGGER planned_cardio_sessions_day_fits_cycle_update
BEFORE UPDATE ON planned_cardio_sessions
WHEN NEW.day_index > (
  SELECT m.length_days FROM cardio_plan_microcycles m WHERE m.id = NEW.cardio_plan_microcycle_id
)
BEGIN
  SELECT RAISE(ABORT, 'day_index is outside its microcycle (INV-25)');
END;
--> statement-breakpoint
CREATE TRIGGER cardio_plan_microcycles_length_holds_sessions
BEFORE UPDATE OF length_days ON cardio_plan_microcycles
WHEN EXISTS (
  SELECT 1 FROM planned_cardio_sessions s
  WHERE s.cardio_plan_microcycle_id = NEW.id AND s.deleted_at IS NULL
    AND s.day_index > NEW.length_days
)
BEGIN
  SELECT RAISE(ABORT, 'the microcycle holds a session beyond its new length (INV-25)');
END;
--> statement-breakpoint

-- FR-2.16: a muscle listed as both primary and secondary would be credited 1.2 sets per set.
CREATE TRIGGER exercise_secondary_muscles_not_primary_insert
BEFORE INSERT ON exercise_secondary_muscles
WHEN EXISTS (
  SELECT 1 FROM exercises e
  WHERE e.id = NEW.exercise_id AND e.primary_muscle_id = NEW.muscle_group_id
)
BEGIN
  SELECT RAISE(ABORT, 'a secondary muscle may not be the primary muscle (FR-2.16)');
END;
--> statement-breakpoint
CREATE TRIGGER exercise_secondary_muscles_not_primary_update
BEFORE UPDATE ON exercise_secondary_muscles
WHEN EXISTS (
  SELECT 1 FROM exercises e
  WHERE e.id = NEW.exercise_id AND e.primary_muscle_id = NEW.muscle_group_id
)
BEGIN
  SELECT RAISE(ABORT, 'a secondary muscle may not be the primary muscle (FR-2.16)');
END;
--> statement-breakpoint
CREATE TRIGGER exercises_primary_muscle_not_secondary
BEFORE UPDATE OF primary_muscle_id ON exercises
WHEN EXISTS (
  SELECT 1 FROM exercise_secondary_muscles s
  WHERE s.exercise_id = NEW.id AND s.muscle_group_id = NEW.primary_muscle_id
)
BEGIN
  SELECT RAISE(ABORT, 'the primary muscle is already a secondary muscle (FR-2.16)');
END;
--> statement-breakpoint

-- INV-06: a changed prescription in a cycle that is no longer projected must be a user edit, and an
-- engine write may neither touch a started cycle nor lower its engine version. A row written back
-- unchanged passes, so sync can resend whole rows. An offline device on an older engine is exactly
-- where these earn their keep.
CREATE TRIGGER planned_sets_rewrite_is_allowed
BEFORE UPDATE ON planned_sets
WHEN NEW.origin <> 'user_edited'
  AND (
    NEW.planned_exercise_id IS NOT OLD.planned_exercise_id
    OR NEW.set_index IS NOT OLD.set_index
    OR NEW.set_type IS NOT OLD.set_type
    OR NEW.target_weight_kg IS NOT OLD.target_weight_kg
    OR NEW.target_reps IS NOT OLD.target_reps
    OR NEW.target_min_reps IS NOT OLD.target_min_reps
    OR NEW.target_max_reps IS NOT OLD.target_max_reps
    OR NEW.target_rir IS NOT OLD.target_rir
    OR NEW.was_clamped IS NOT OLD.was_clamped
    OR NEW.deleted_at IS NOT OLD.deleted_at
  )
  AND (
    coalesce((
      SELECT m.status FROM planned_exercises pe
      JOIN planned_sessions ps ON ps.id = pe.planned_session_id
      JOIN microcycles m ON m.id = ps.microcycle_id
      WHERE pe.id = OLD.planned_exercise_id
    ), '') <> 'projected'
    OR coalesce((
      SELECT m.status FROM planned_exercises pe
      JOIN planned_sessions ps ON ps.id = pe.planned_session_id
      JOIN microcycles m ON m.id = ps.microcycle_id
      WHERE pe.id = NEW.planned_exercise_id
    ), '') <> 'projected'
  )
BEGIN
  SELECT RAISE(ABORT, 'a planned set in a microcycle that is not projected changes only by a user edit (INV-06)');
END;
--> statement-breakpoint
CREATE TRIGGER planned_cardio_sessions_rewrite_is_allowed
BEFORE UPDATE ON planned_cardio_sessions
WHEN NEW.origin <> 'user_edited'
  AND (
    NEW.cardio_plan_microcycle_id IS NOT OLD.cardio_plan_microcycle_id
    OR NEW.day_index IS NOT OLD.day_index
    OR NEW.sport IS NOT OLD.sport
    OR NEW.session_type IS NOT OLD.session_type
    OR NEW.target_distance_m IS NOT OLD.target_distance_m
    OR NEW.target_duration_s IS NOT OLD.target_duration_s
    OR NEW.target_zone IS NOT OLD.target_zone
    OR NEW.target_speed_min_mps IS NOT OLD.target_speed_min_mps
    OR NEW.target_speed_max_mps IS NOT OLD.target_speed_max_mps
    OR NEW.structure IS NOT OLD.structure
    OR NEW.deleted_at IS NOT OLD.deleted_at
  )
  AND (
    coalesce((
      SELECT m.status FROM cardio_plan_microcycles m WHERE m.id = OLD.cardio_plan_microcycle_id
    ), '') <> 'projected'
    OR coalesce((
      SELECT m.status FROM cardio_plan_microcycles m WHERE m.id = NEW.cardio_plan_microcycle_id
    ), '') <> 'projected'
  )
BEGIN
  SELECT RAISE(ABORT, 'a planned session in a microcycle that is not projected changes only by a user edit (INV-06)');
END;
--> statement-breakpoint
CREATE TRIGGER microcycles_engine_version_never_lowered
BEFORE UPDATE ON microcycles
WHEN NEW.last_write_kind = 'engine' AND NEW.engine_version < OLD.engine_version
BEGIN
  SELECT RAISE(ABORT, 'an older engine may not overwrite a newer projection (INV-06)');
END;
--> statement-breakpoint
CREATE TRIGGER microcycles_engine_leaves_started_cycles
BEFORE UPDATE ON microcycles
WHEN NEW.last_write_kind = 'engine' AND OLD.status <> 'projected'
  AND (
    NEW.mesocycle_id IS NOT OLD.mesocycle_id
    OR NEW.cycle_number IS NOT OLD.cycle_number
    OR NEW.length_days IS NOT OLD.length_days
    OR NEW.starts_on IS NOT OLD.starts_on
    OR NEW.is_deload IS NOT OLD.is_deload
    OR NEW.status IS NOT OLD.status
    OR NEW.engine_version IS NOT OLD.engine_version
    OR NEW.deleted_at IS NOT OLD.deleted_at
  )
BEGIN
  SELECT RAISE(ABORT, 'an engine write may not change a microcycle that is not projected (INV-06)');
END;
--> statement-breakpoint
CREATE TRIGGER cardio_plan_microcycles_engine_version_never_lowered
BEFORE UPDATE ON cardio_plan_microcycles
WHEN NEW.last_write_kind = 'engine' AND NEW.engine_version < OLD.engine_version
BEGIN
  SELECT RAISE(ABORT, 'an older engine may not overwrite a newer projection (INV-06)');
END;
--> statement-breakpoint
CREATE TRIGGER cardio_plan_microcycles_engine_leaves_started_cycles
BEFORE UPDATE ON cardio_plan_microcycles
WHEN NEW.last_write_kind = 'engine' AND OLD.status <> 'projected'
  AND (
    NEW.cardio_plan_id IS NOT OLD.cardio_plan_id
    OR NEW.cycle_number IS NOT OLD.cycle_number
    OR NEW.length_days IS NOT OLD.length_days
    OR NEW.starts_on IS NOT OLD.starts_on
    OR NEW.is_deload IS NOT OLD.is_deload
    OR NEW.target_duration_s IS NOT OLD.target_duration_s
    OR NEW.status IS NOT OLD.status
    OR NEW.engine_version IS NOT OLD.engine_version
    OR NEW.deleted_at IS NOT OLD.deleted_at
  )
BEGIN
  SELECT RAISE(ABORT, 'an engine write may not change a microcycle that is not projected (INV-06)');
END;
