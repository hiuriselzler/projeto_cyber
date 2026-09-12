CREATE TABLE `achievements` (
	`code` text PRIMARY KEY NOT NULL,
	`name_key` text NOT NULL,
	`description_key` text NOT NULL,
	`track` text,
	`tier` integer DEFAULT 1 NOT NULL,
	`unit_system` text,
	FOREIGN KEY (`track`) REFERENCES `gamification_tracks`(`track`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "achievements_track_check" CHECK("track" IN ('run', 'ride', 'walk', 'swim_pool', 'treadmill', 'indoor_bike', 'trail_run', 'hike', 'open_water_swim', 'row_indoor', 'other', 'strength', 'consistency', 'recovery', 'precision', 'progression')),
	CONSTRAINT "achievements_unit_system_check" CHECK("unit_system" IN ('metric', 'imperial'))
);
--> statement-breakpoint
CREATE TABLE `activity_segments` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`segment_index` integer NOT NULL,
	`kind` text NOT NULL,
	`split_basis` text DEFAULT 'none' NOT NULL,
	`distance_m` integer,
	`moving_s` integer NOT NULL,
	`elapsed_s` integer NOT NULL,
	`rest_s` integer,
	`elevation_gain_m` integer,
	`avg_speed_mps` real,
	`avg_hr` integer,
	`segment_metrics` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `cardio_activities`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "activity_segments_kind_check" CHECK("kind" IN ('auto_split', 'manual_lap', 'swim_set', 'interval', 'rest', 'warmup', 'cooldown')),
	CONSTRAINT "activity_segments_split_basis_check" CHECK("split_basis" IN ('none', 'km', 'mi')),
	CONSTRAINT "activity_segments_split_basis" CHECK(("activity_segments"."kind" = 'auto_split') = ("activity_segments"."split_basis" <> 'none'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_segments_position` ON `activity_segments` (`activity_id`,`split_basis`,`segment_index`);--> statement-breakpoint
CREATE TABLE `activity_streams` (
	`user_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`kind` text NOT NULL,
	`encoding` text NOT NULL,
	`sample_count` integer NOT NULL,
	`data` blob NOT NULL,
	PRIMARY KEY(`activity_id`, `kind`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`activity_id`) REFERENCES `cardio_activities`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "activity_streams_kind_check" CHECK("kind" IN ('latlng', 'altitude', 'time', 'heartrate', 'cadence', 'velocity', 'moving')),
	CONSTRAINT "activity_streams_encoding_check" CHECK("encoding" IN ('f32_le', 'i16_le', 'polyline', 'varint_zigzag'))
);
--> statement-breakpoint
CREATE TABLE `adherence_streaks` (
	`user_id` text PRIMARY KEY NOT NULL,
	`current_cycles` integer DEFAULT 0 NOT NULL,
	`longest_cycles` integer DEFAULT 0 NOT NULL,
	`last_kept_cycle_id` text,
	`grace_used_in_quarter` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `body_weight_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`measured_on` text NOT NULL,
	`weight_kg` real NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `body_weight_log_user_measured_on_key` ON `body_weight_log` (`user_id`,`measured_on`);--> statement-breakpoint
CREATE TABLE `cardio_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`planned_cardio_session_id` text,
	`sport` text NOT NULL,
	`title` text NOT NULL,
	`started_at` integer NOT NULL,
	`local_date` text NOT NULL,
	`tz` text NOT NULL,
	`elapsed_s` integer NOT NULL,
	`moving_s` integer NOT NULL,
	`distance_m` integer DEFAULT 0 NOT NULL,
	`elevation_gain_m` integer DEFAULT 0 NOT NULL,
	`elevation_loss_m` integer DEFAULT 0 NOT NULL,
	`avg_speed_mps` real,
	`best_speed_mps` real,
	`avg_hr` integer,
	`max_hr` integer,
	`avg_cadence` integer,
	`calories` integer,
	`perceived_effort` integer,
	`sport_metrics` text DEFAULT '{}' NOT NULL,
	`source` text NOT NULL,
	`device` text,
	`pipeline_version` integer NOT NULL,
	`visibility` text DEFAULT 'private' NOT NULL,
	`has_track` integer DEFAULT false NOT NULL,
	`polyline` text,
	`start_lat` real,
	`start_lng` real,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`planned_cardio_session_id`) REFERENCES `planned_cardio_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`sport`) REFERENCES `sport_profiles`(`sport`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cardio_activities_perceived_effort_check" CHECK("perceived_effort" BETWEEN 1 AND 10),
	CONSTRAINT "cardio_activities_sport_check" CHECK("sport" IN ('run', 'ride', 'walk', 'swim_pool', 'treadmill', 'indoor_bike', 'trail_run', 'hike', 'open_water_swim', 'row_indoor', 'other')),
	CONSTRAINT "cardio_activities_source_check" CHECK("source" IN ('recorded', 'manual', 'imported')),
	CONSTRAINT "cardio_activities_visibility_check" CHECK("visibility" IN ('private', 'followers', 'public'))
);
--> statement-breakpoint
CREATE INDEX `cardio_activities_user_started_at_idx` ON `cardio_activities` (`user_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `cardio_activities_user_sport_started_at_idx` ON `cardio_activities` (`user_id`,`sport`,`started_at`);--> statement-breakpoint
CREATE TABLE `cardio_plan_cycle_targets` (
	`user_id` text NOT NULL,
	`cardio_plan_microcycle_id` text NOT NULL,
	`sport` text NOT NULL,
	`target_distance_m` integer,
	`target_duration_s` integer,
	PRIMARY KEY(`cardio_plan_microcycle_id`, `sport`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cardio_plan_microcycle_id`) REFERENCES `cardio_plan_microcycles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sport`) REFERENCES `sport_profiles`(`sport`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "cardio_plan_cycle_targets_sport_check" CHECK("sport" IN ('run', 'ride', 'walk', 'swim_pool', 'treadmill', 'indoor_bike', 'trail_run', 'hike', 'open_water_swim', 'row_indoor', 'other'))
);
--> statement-breakpoint
CREATE TABLE `cardio_plan_microcycles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`cardio_plan_id` text NOT NULL,
	`cycle_number` integer NOT NULL,
	`length_days` integer NOT NULL,
	`starts_on` text NOT NULL,
	`is_deload` integer DEFAULT false NOT NULL,
	`target_duration_s` integer,
	`status` text DEFAULT 'projected' NOT NULL,
	`engine_version` integer NOT NULL,
	`last_write_kind` text DEFAULT 'engine' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cardio_plan_id`) REFERENCES `cardio_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "cardio_plan_microcycles_length_days_check" CHECK("length_days" BETWEEN 1 AND 28),
	CONSTRAINT "cardio_plan_microcycles_status_check" CHECK("status" IN ('projected', 'locked', 'in_progress', 'completed', 'skipped')),
	CONSTRAINT "cardio_plan_microcycles_last_write_kind_check" CHECK("last_write_kind" IN ('engine', 'user'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cardio_plan_microcycles_plan_cycle_number_key` ON `cardio_plan_microcycles` (`cardio_plan_id`,`cycle_number`);--> statement-breakpoint
CREATE TABLE `cardio_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`goal` text NOT NULL,
	`start_date` text NOT NULL,
	`num_microcycles` integer NOT NULL,
	`default_microcycle_days` integer DEFAULT 7 NOT NULL,
	`volume_step_bp` integer NOT NULL,
	`rail_overridden_at` integer,
	`deload_mode` text DEFAULT 'none' NOT NULL,
	`deload_every_n_microcycles` integer,
	`deload_volume_bp` integer DEFAULT 6000 NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "cardio_plans_goal_check" CHECK("goal" IN ('base', '5k', '10k', 'half', 'marathon', 'swim', 'triathlon', 'custom')),
	CONSTRAINT "cardio_plans_deload_mode_check" CHECK("deload_mode" IN ('none', 'every_n_microcycles', 'manual')),
	CONSTRAINT "cardio_plans_status_check" CHECK("status" IN ('draft', 'active', 'completed', 'abandoned')),
	CONSTRAINT "cardio_plans_num_microcycles_check" CHECK("num_microcycles" BETWEEN 2 AND 52),
	CONSTRAINT "cardio_plans_default_microcycle_days_check" CHECK("default_microcycle_days" BETWEEN 1 AND 28),
	CONSTRAINT "cardio_plans_deload_every_n" CHECK(("cardio_plans"."deload_mode" = 'every_n_microcycles') = ("cardio_plans"."deload_every_n_microcycles" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `exercise_secondary_muscles` (
	`exercise_id` text NOT NULL,
	`muscle_group_id` integer NOT NULL,
	PRIMARY KEY(`exercise_id`, `muscle_group_id`),
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`muscle_group_id`) REFERENCES `muscle_groups`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_user_id` text,
	`forked_from_id` text,
	`name_key` text,
	`name` text,
	`modality` text NOT NULL,
	`primary_muscle_id` integer NOT NULL,
	`is_unilateral` integer DEFAULT false NOT NULL,
	`tracking` text DEFAULT 'weight_reps' NOT NULL,
	`load_increment_kg` real,
	`uses_bodyweight` integer DEFAULT false NOT NULL,
	`default_min_reps` integer,
	`default_max_reps` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`forked_from_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`primary_muscle_id`) REFERENCES `muscle_groups`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "exercises_modality_check" CHECK("modality" IN ('barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'other')),
	CONSTRAINT "exercises_tracking_check" CHECK("tracking" IN ('weight_reps', 'reps_only', 'duration', 'distance_duration')),
	CONSTRAINT "exercises_name_or_key" CHECK(("exercises"."name_key" IS NULL) <> ("exercises"."name" IS NULL)),
	CONSTRAINT "exercises_key_iff_global" CHECK(("exercises"."owner_user_id" IS NULL) = ("exercises"."name_key" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exercises_owner_name_key` ON `exercises` (`owner_user_id`,lower("name")) WHERE "exercises"."deleted_at" IS NULL AND "exercises"."name" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `exercises_name_key_key` ON `exercises` (`name_key`) WHERE "exercises"."name_key" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `gamification_tracks` (
	`track` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`hue_token` text NOT NULL,
	`level_scale_bp` integer DEFAULT 10000 NOT NULL,
	CONSTRAINT "gamification_tracks_track_check" CHECK("track" IN ('run', 'ride', 'walk', 'swim_pool', 'treadmill', 'indoor_bike', 'trail_run', 'hike', 'open_water_swim', 'row_indoor', 'other', 'strength', 'consistency', 'recovery', 'precision', 'progression')),
	CONSTRAINT "gamification_tracks_kind_check" CHECK("kind" IN ('discipline', 'quality')),
	CONSTRAINT "gamification_tracks_level_scale_bp_check" CHECK("level_scale_bp" BETWEEN 1 AND 10000)
);
--> statement-breakpoint
CREATE TABLE `hr_zone_overrides` (
	`user_id` text NOT NULL,
	`zone` integer NOT NULL,
	`min_bpm` integer NOT NULL,
	`max_bpm` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`user_id`, `zone`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "hr_zone_overrides_zone_check" CHECK("zone" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE `mesocycles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`goal` text NOT NULL,
	`start_date` text NOT NULL,
	`num_microcycles` integer NOT NULL,
	`default_microcycle_days` integer DEFAULT 7 NOT NULL,
	`deload_mode` text DEFAULT 'none' NOT NULL,
	`deload_every_n_microcycles` integer,
	`deload_final_cycle` integer DEFAULT false NOT NULL,
	`deload_set_bp` integer DEFAULT 5000 NOT NULL,
	`deload_load_bp` integer DEFAULT 6000 NOT NULL,
	`deload_rir_bump` integer DEFAULT 2 NOT NULL,
	`default_rule_id` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`default_rule_id`) REFERENCES `progression_rules`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "mesocycles_goal_check" CHECK("goal" IN ('hypertrophy', 'strength', 'peaking', 'maintenance')),
	CONSTRAINT "mesocycles_deload_mode_check" CHECK("deload_mode" IN ('none', 'every_n_microcycles', 'manual')),
	CONSTRAINT "mesocycles_status_check" CHECK("status" IN ('draft', 'active', 'completed', 'abandoned')),
	CONSTRAINT "mesocycles_num_microcycles_check" CHECK("num_microcycles" BETWEEN 2 AND 52),
	CONSTRAINT "mesocycles_default_microcycle_days_check" CHECK("default_microcycle_days" BETWEEN 1 AND 28),
	CONSTRAINT "mesocycles_deload_every_n" CHECK(("mesocycles"."deload_mode" = 'every_n_microcycles') = ("mesocycles"."deload_every_n_microcycles" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `microcycles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mesocycle_id` text NOT NULL,
	`cycle_number` integer NOT NULL,
	`length_days` integer NOT NULL,
	`starts_on` text NOT NULL,
	`is_deload` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'projected' NOT NULL,
	`engine_version` integer NOT NULL,
	`last_write_kind` text DEFAULT 'engine' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`mesocycle_id`) REFERENCES `mesocycles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "microcycles_length_days_check" CHECK("length_days" BETWEEN 1 AND 28),
	CONSTRAINT "microcycles_status_check" CHECK("status" IN ('projected', 'locked', 'in_progress', 'completed', 'skipped')),
	CONSTRAINT "microcycles_last_write_kind_check" CHECK("last_write_kind" IN ('engine', 'user'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `microcycles_mesocycle_cycle_number_key` ON `microcycles` (`mesocycle_id`,`cycle_number`);--> statement-breakpoint
CREATE TABLE `modality_increments` (
	`modality` text NOT NULL,
	`unit_system` text NOT NULL,
	`increment_kg` real NOT NULL,
	PRIMARY KEY(`modality`, `unit_system`),
	CONSTRAINT "modality_increments_modality_check" CHECK("modality" IN ('barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'other')),
	CONSTRAINT "modality_increments_unit_system_check" CHECK("unit_system" IN ('metric', 'imperial'))
);
--> statement-breakpoint
CREATE TABLE `muscle_groups` (
	`id` integer PRIMARY KEY NOT NULL,
	`name_key` text NOT NULL,
	`region` text NOT NULL,
	CONSTRAINT "muscle_groups_region_check" CHECK("region" IN ('upper_push', 'upper_pull', 'legs', 'core', 'arms', 'other'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `muscle_groups_name_key_unique` ON `muscle_groups` (`name_key`);--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`op` text NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text,
	`next_attempt_at` integer,
	CONSTRAINT "outbox_op_check" CHECK("op" IN ('upsert', 'delete'))
);
--> statement-breakpoint
CREATE TABLE `planned_cardio_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`cardio_plan_microcycle_id` text NOT NULL,
	`day_index` integer NOT NULL,
	`sport` text NOT NULL,
	`session_type` text NOT NULL,
	`target_distance_m` integer,
	`target_duration_s` integer,
	`target_zone` integer,
	`target_speed_min_mps` real,
	`target_speed_max_mps` real,
	`structure` text,
	`origin` text DEFAULT 'generated' NOT NULL,
	`is_pinned` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cardio_plan_microcycle_id`) REFERENCES `cardio_plan_microcycles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sport`) REFERENCES `sport_profiles`(`sport`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "planned_cardio_sessions_day_index_check" CHECK("planned_cardio_sessions"."day_index" >= 1),
	CONSTRAINT "planned_cardio_sessions_sport_check" CHECK("sport" IN ('run', 'ride', 'walk', 'swim_pool', 'treadmill', 'indoor_bike', 'trail_run', 'hike', 'open_water_swim', 'row_indoor', 'other')),
	CONSTRAINT "planned_cardio_sessions_origin_check" CHECK("origin" IN ('generated', 'user_edited')),
	CONSTRAINT "planned_cardio_sessions_target_zone_check" CHECK("target_zone" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE INDEX `planned_cardio_sessions_cycle_day_idx` ON `planned_cardio_sessions` (`cardio_plan_microcycle_id`,`day_index`);--> statement-breakpoint
CREATE TABLE `planned_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`planned_session_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`progression_rule_id` text,
	`order_index` integer NOT NULL,
	`superset_group` integer,
	`rest_seconds` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`planned_session_id`) REFERENCES `planned_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`progression_rule_id`) REFERENCES `progression_rules`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `planned_exercises_session_order_idx` ON `planned_exercises` (`planned_session_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `planned_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`microcycle_id` text NOT NULL,
	`day_index` integer NOT NULL,
	`name` text NOT NULL,
	`order_index` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`microcycle_id`) REFERENCES `microcycles`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "planned_sessions_day_index_check" CHECK("planned_sessions"."day_index" >= 1)
);
--> statement-breakpoint
CREATE INDEX `planned_sessions_microcycle_day_idx` ON `planned_sessions` (`microcycle_id`,`day_index`);--> statement-breakpoint
CREATE TABLE `planned_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`planned_exercise_id` text NOT NULL,
	`set_index` integer NOT NULL,
	`set_type` text DEFAULT 'working' NOT NULL,
	`target_weight_kg` real,
	`target_reps` integer,
	`target_min_reps` integer,
	`target_max_reps` integer,
	`target_rir` integer,
	`was_clamped` integer DEFAULT false NOT NULL,
	`origin` text DEFAULT 'generated' NOT NULL,
	`is_pinned` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`planned_exercise_id`) REFERENCES `planned_exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "planned_sets_set_type_check" CHECK("set_type" IN ('warmup', 'working', 'drop', 'backoff', 'amrap')),
	CONSTRAINT "planned_sets_origin_check" CHECK("origin" IN ('generated', 'user_edited')),
	CONSTRAINT "planned_sets_target_rir_check" CHECK("target_rir" BETWEEN 0 AND 10)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `planned_sets_position` ON `planned_sets` (`planned_exercise_id`,`set_index`);--> statement-breakpoint
CREATE TABLE `privacy_zones` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`label` text NOT NULL,
	`center_lat` real NOT NULL,
	`center_lng` real NOT NULL,
	`radius_m` real NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `privacy_zones_user_id_idx` ON `privacy_zones` (`user_id`);--> statement-breakpoint
CREATE TABLE `progression_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text,
	`strategy` text NOT NULL,
	`load_step_kg` real,
	`load_step_bp` integer,
	`rep_step` integer DEFAULT 1,
	`min_reps` integer NOT NULL,
	`max_reps` integer NOT NULL,
	`min_rir` integer DEFAULT 0 NOT NULL,
	`max_rir` integer DEFAULT 4 NOT NULL,
	`rir_mode` text DEFAULT 'per_exercise' NOT NULL,
	`rir_offsets` text,
	`rir_start` integer,
	`rir_end` integer,
	`percent_wave_bp` text,
	`baseline_e1rm_kg` real,
	`cycle_pattern` text,
	`failure_policy` text DEFAULT 'hold' NOT NULL,
	`failure_load_bp` integer DEFAULT 9000,
	`rounding` text DEFAULT 'nearest' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "progression_rules_strategy_check" CHECK("strategy" IN ('linear_load', 'double_progression', 'percent_1rm', 'rir_autoregulated', 'fixed', 'cycle_pattern')),
	CONSTRAINT "progression_rules_rir_mode_check" CHECK("rir_mode" IN ('per_exercise', 'per_set')),
	CONSTRAINT "progression_rules_failure_policy_check" CHECK("failure_policy" IN ('hold', 'repeat_cycle', 'reduce_load')),
	CONSTRAINT "progression_rules_rounding_check" CHECK("rounding" IN ('nearest', 'down', 'up')),
	CONSTRAINT "progression_rules_load_step_bp_check" CHECK("progression_rules"."load_step_bp" > 0),
	CONSTRAINT "progression_rules_reps_ordered" CHECK("progression_rules"."max_reps" >= "progression_rules"."min_reps"),
	CONSTRAINT "progression_rules_min_rir_check" CHECK("min_rir" BETWEEN 0 AND 10),
	CONSTRAINT "progression_rules_max_rir_check" CHECK("max_rir" BETWEEN 0 AND 10),
	CONSTRAINT "progression_rules_rir_ordered" CHECK("progression_rules"."max_rir" >= "progression_rules"."min_rir"),
	CONSTRAINT "progression_rules_rir_start_check" CHECK("rir_start" BETWEEN 0 AND 10),
	CONSTRAINT "progression_rules_rir_end_check" CHECK("rir_end" BETWEEN 0 AND 10),
	CONSTRAINT "progression_rules_failure_load_bp_check" CHECK("failure_load_bp" BETWEEN 1 AND 10000),
	CONSTRAINT "progression_rules_percent_1rm_baseline" CHECK("progression_rules"."strategy" <> 'percent_1rm' OR "progression_rules"."baseline_e1rm_kg" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE `raw_gps_points` (
	`activity_id` text NOT NULL,
	`seq` integer NOT NULL,
	`recorded_at` integer NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`altitude_m` real,
	`accuracy_m` real,
	`speed_mps` real,
	`hr` integer,
	PRIMARY KEY(`activity_id`, `seq`)
);
--> statement-breakpoint
CREATE TABLE `routine_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`routine_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`superset_group` integer,
	`target_sets` integer,
	`target_min_reps` integer,
	`target_max_reps` integer,
	`target_rir` integer,
	`rest_seconds` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "routine_exercises_target_rir_check" CHECK("target_rir" BETWEEN 0 AND 10)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `routine_exercises_order` ON `routine_exercises` (`routine_id`,`order_index`);--> statement-breakpoint
CREATE TABLE `routines` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`notes` text,
	`folder` text,
	`order_index` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `routines_user_id_idx` ON `routines` (`user_id`);--> statement-breakpoint
CREATE TABLE `set_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workout_exercise_id` text NOT NULL,
	`set_index` integer NOT NULL,
	`set_type` text DEFAULT 'working' NOT NULL,
	`weight_kg` real,
	`reps` integer,
	`rir` integer,
	`distance_m` integer,
	`duration_s` integer,
	`is_completed` integer DEFAULT false NOT NULL,
	`completed_at` integer,
	`planned_set_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workout_exercise_id`) REFERENCES `workout_exercises`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`planned_set_id`) REFERENCES `planned_sets`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "set_logs_set_type_check" CHECK("set_type" IN ('warmup', 'working', 'drop', 'backoff', 'amrap')),
	CONSTRAINT "set_logs_weight_kg_check" CHECK("set_logs"."weight_kg" >= 0),
	CONSTRAINT "set_logs_reps_check" CHECK("reps" BETWEEN 0 AND 1000),
	CONSTRAINT "set_logs_rir_check" CHECK("rir" BETWEEN 0 AND 10)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `set_logs_position` ON `set_logs` (`workout_exercise_id`,`set_index`);--> statement-breakpoint
CREATE INDEX `set_logs_planned_set_id_idx` ON `set_logs` (`planned_set_id`) WHERE "set_logs"."planned_set_id" IS NOT NULL;--> statement-breakpoint
CREATE TABLE `sport_profiles` (
	`sport` text PRIMARY KEY NOT NULL,
	`name_key` text NOT NULL,
	`recording_mode` text NOT NULL,
	`primary_metric` text NOT NULL,
	`pace_unit_metric` text NOT NULL,
	`pace_unit_imperial` text NOT NULL,
	`split_unit_m_metric` real,
	`split_unit_m_imperial` real,
	`has_route` integer NOT NULL,
	`has_elevation` integer NOT NULL,
	`autopause_threshold_mps` real,
	`live_fields` text NOT NULL,
	`detail_sections` text NOT NULL,
	`session_types` text NOT NULL,
	`metrics_schema` text NOT NULL,
	`xp_track` text NOT NULL,
	FOREIGN KEY (`xp_track`) REFERENCES `gamification_tracks`(`track`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sport_profiles_sport_check" CHECK("sport" IN ('run', 'ride', 'walk', 'swim_pool', 'treadmill', 'indoor_bike', 'trail_run', 'hike', 'open_water_swim', 'row_indoor', 'other')),
	CONSTRAINT "sport_profiles_recording_mode_check" CHECK("recording_mode" IN ('gps', 'lap', 'manual')),
	CONSTRAINT "sport_profiles_primary_metric_check" CHECK("primary_metric" IN ('distance', 'duration', 'elevation')),
	CONSTRAINT "sport_profiles_pace_unit_metric_check" CHECK("pace_unit_metric" IN ('min_per_km', 'min_per_mi', 'km_per_h', 'mph', 'min_per_100m', 'min_per_100yd', 'per_500m')),
	CONSTRAINT "sport_profiles_pace_unit_imperial_check" CHECK("pace_unit_imperial" IN ('min_per_km', 'min_per_mi', 'km_per_h', 'mph', 'min_per_100m', 'min_per_100yd', 'per_500m'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sport_profiles_name_key_unique` ON `sport_profiles` (`name_key`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`tier` text DEFAULT 'trial' NOT NULL,
	`trial_started_at` integer NOT NULL,
	`trial_ends_at` integer NOT NULL,
	`store` text,
	`store_product_id` text,
	`current_period_end` integer,
	`cancelled_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "subscriptions_tier_check" CHECK("tier" IN ('trial', 'free', 'pro', 'coach')),
	CONSTRAINT "subscriptions_store_check" CHECK("store" IN ('apple', 'google'))
);
--> statement-breakpoint
CREATE TABLE `sync_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
--> statement-breakpoint
CREATE TABLE `user_achievements` (
	`user_id` text NOT NULL,
	`achievement_code` text NOT NULL,
	`achieved_at` integer NOT NULL,
	`source_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`user_id`, `achievement_code`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`achievement_code`) REFERENCES `achievements`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`unit_system` text DEFAULT 'metric' NOT NULL,
	`locale` text DEFAULT 'en' NOT NULL,
	`body_weight_kg` real,
	`birth_date` text,
	`sex` text,
	`max_hr` integer,
	`resting_hr` integer,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`email_verified_at` integer,
	`gamification_enabled` integer DEFAULT true NOT NULL,
	`deletion_requested_at` integer,
	`wrapped_privacy_key` blob,
	`privacy_key_salt` blob,
	`privacy_key_kdf` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	CONSTRAINT "users_unit_system_check" CHECK("unit_system" IN ('metric', 'imperial')),
	CONSTRAINT "users_locale_check" CHECK("locale" IN ('en', 'pt-BR')),
	CONSTRAINT "users_sex_check" CHECK("sex" IN ('male', 'female', 'unspecified'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `workout_exercises` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`workout_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`superset_group` integer,
	`notes` text,
	`planned_exercise_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`workout_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exercise_id`) REFERENCES `exercises`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`planned_exercise_id`) REFERENCES `planned_exercises`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `workout_exercises_workout_order_idx` ON `workout_exercises` (`workout_id`,`order_index`);--> statement-breakpoint
CREATE INDEX `workout_exercises_exercise_workout_idx` ON `workout_exercises` (`exercise_id`,`workout_id`);--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`routine_id` text,
	`planned_session_id` text,
	`title` text NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`local_date` text NOT NULL,
	`tz` text NOT NULL,
	`notes` text,
	`perceived_fatigue` integer,
	`source` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`routine_id`) REFERENCES `routines`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`planned_session_id`) REFERENCES `planned_sessions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "workouts_perceived_fatigue_check" CHECK("perceived_fatigue" BETWEEN 1 AND 10),
	CONSTRAINT "workouts_source_check" CHECK("source" IN ('manual', 'plan', 'routine'))
);
--> statement-breakpoint
CREATE INDEX `workouts_user_started_at_idx` ON `workouts` (`user_id`,`started_at`);--> statement-breakpoint
CREATE INDEX `workouts_user_local_date_idx` ON `workouts` (`user_id`,`local_date`);--> statement-breakpoint
CREATE TABLE `xp_awards` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`track` text NOT NULL,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`source_kind` text NOT NULL,
	`source_id` text,
	`awarded_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	`sync_version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "xp_awards_track_check" CHECK("track" IN ('run', 'ride', 'walk', 'swim_pool', 'treadmill', 'indoor_bike', 'trail_run', 'hike', 'open_water_swim', 'row_indoor', 'other', 'strength', 'consistency', 'recovery', 'precision', 'progression')),
	CONSTRAINT "xp_awards_source_kind_check" CHECK("source_kind" IN ('workout', 'activity', 'plan_cycle', 'achievement', 'manual')),
	CONSTRAINT "xp_awards_amount_check" CHECK("xp_awards"."amount" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `xp_awards_once` ON `xp_awards` (`user_id`,`source_kind`,`source_id`,`reason`);--> statement-breakpoint
CREATE UNIQUE INDEX `xp_awards_once_without_source` ON `xp_awards` (`user_id`,`source_kind`,`reason`) WHERE "source_id" IS NULL;