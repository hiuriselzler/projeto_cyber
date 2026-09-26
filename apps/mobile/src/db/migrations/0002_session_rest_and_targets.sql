-- Task 004 stage 5 (03 §4): the live session carries its own rest and targets, copied from the routine at start.
--
-- Hand-written, and deliberately NOT the table rebuild `drizzle-kit generate` produced. That rebuild was wrong twice:
-- its INSERT ... SELECT read the four new columns from the old table, which does not have them, and — the serious one —
-- Drizzle's migrator runs every pending migration inside one BEGIN ... COMMIT, where `PRAGMA foreign_keys=OFF` is a
-- no-op. With foreign keys on (src/db/client.ts), `DROP TABLE workout_exercises` is an implicit DELETE, and
-- `set_logs.workout_exercise_id ... ON DELETE CASCADE` would have taken every logged set with it.
--
-- `ADD COLUMN` touches no existing row, and SQLite allows a CHECK on an added column. The committed snapshot still
-- describes the result — the same columns and the same named check — so the next `db:generate` sees no drift.
ALTER TABLE `workout_exercises` ADD `rest_seconds` integer;--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `target_min_reps` integer;--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `target_max_reps` integer;--> statement-breakpoint
ALTER TABLE `workout_exercises` ADD `target_rir` integer CONSTRAINT "workout_exercises_target_rir_check" CHECK("target_rir" BETWEEN 0 AND 10);
