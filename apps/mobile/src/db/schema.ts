import { sql } from 'drizzle-orm';
import {
  blob,
  check,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

/**
 * The on-device schema: 03-database-schema.md, mirrored per 03 §8.
 *
 * Same tables and column names as Postgres, with 03 §8's differences — the three server-only auth tables
 * and both derived caches omitted, `users.password_hash` omitted, privacy zones stored decrypted, and
 * `raw_gps_points`, `outbox` and `sync_state` added. Types map uuid → text, timestamptz → integer epoch
 * milliseconds, date → ISO text, numeric → real, boolean → integer, jsonb → text, and every enum → text
 * with a CHECK. Row-level security and the composite ownership keys are server-only (ADR-013); the
 * INV-06, day_index and secondary-muscle triggers live in a hand-written migration beside this file.
 *
 * The API's schema check compares this file's generated snapshot with Postgres, name for name.
 */

const UNIT_SYSTEMS = ['metric', 'imperial'] as const;
const LOCALES = ['en', 'pt-BR'] as const;
const SEXES = ['male', 'female', 'unspecified'] as const;
const TIERS = ['trial', 'free', 'pro', 'coach'] as const;
const STORES = ['apple', 'google'] as const;
const MUSCLE_REGIONS = ['upper_push', 'upper_pull', 'legs', 'core', 'arms', 'other'] as const;
const MODALITIES = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'band', 'other'] as const;
const TRACKING = ['weight_reps', 'reps_only', 'duration', 'distance_duration'] as const;
const WORKOUT_SOURCES = ['manual', 'plan', 'routine'] as const;
const SET_TYPES = ['warmup', 'working', 'drop', 'backoff', 'amrap'] as const;
const PROGRESSION_STRATEGIES = [
  'linear_load',
  'double_progression',
  'percent_1rm',
  'rir_autoregulated',
  'fixed',
  'cycle_pattern',
] as const;
const RIR_MODES = ['per_exercise', 'per_set'] as const;
const FAILURE_POLICIES = ['hold', 'repeat_cycle', 'reduce_load'] as const;
const ROUNDING = ['nearest', 'down', 'up'] as const;
const MESO_GOALS = ['hypertrophy', 'strength', 'peaking', 'maintenance'] as const;
const DELOAD_MODES = ['none', 'every_n_microcycles', 'manual'] as const;
const MESO_STATUSES = ['draft', 'active', 'completed', 'abandoned'] as const;
const CYCLE_STATUSES = ['projected', 'locked', 'in_progress', 'completed', 'skipped'] as const;
const WRITE_KINDS = ['engine', 'user'] as const;
const SET_ORIGINS = ['generated', 'user_edited'] as const;
const SPORTS = [
  'run',
  'ride',
  'walk',
  'swim_pool',
  'treadmill',
  'indoor_bike',
  'trail_run',
  'hike',
  'open_water_swim',
  'row_indoor',
  'other',
] as const;
const RECORDING_MODES = ['gps', 'lap', 'manual'] as const;
const PRIMARY_METRICS = ['distance', 'duration', 'elevation'] as const;
const PACE_UNITS = [
  'min_per_km',
  'min_per_mi',
  'km_per_h',
  'mph',
  'min_per_100m',
  'min_per_100yd',
  'per_500m',
] as const;
const ACTIVITY_SOURCES = ['recorded', 'manual', 'imported'] as const;
const VISIBILITIES = ['private', 'followers', 'public'] as const;
const STREAM_KINDS = ['latlng', 'altitude', 'time', 'heartrate', 'cadence', 'velocity', 'moving'] as const;
const STREAM_ENCODINGS = ['f32_le', 'i16_le', 'polyline', 'varint_zigzag'] as const;
const SEGMENT_KINDS = [
  'auto_split',
  'manual_lap',
  'swim_set',
  'interval',
  'rest',
  'warmup',
  'cooldown',
] as const;
const SPLIT_BASES = ['none', 'km', 'mi'] as const;
const CARDIO_GOALS = ['base', '5k', '10k', 'half', 'marathon', 'swim', 'triathlon', 'custom'] as const;
const TRACKS = [...SPORTS, 'strength', 'consistency', 'recovery', 'precision', 'progression'] as const;
const TRACK_KINDS = ['discipline', 'quality'] as const;
const XP_SOURCES = ['workout', 'activity', 'plan_cycle', 'achievement', 'manual'] as const;
const OUTBOX_OPS = ['upsert', 'delete'] as const;

/** An enum as text: the column may only hold one of `values` (03 §8). A NULL passes, as in Postgres. */
function oneOf(table: string, column: string, values: readonly string[]) {
  const list = values.map((value) => `'${value}'`).join(', ');
  return check(`${table}_${column}_check`, sql.raw(`"${column}" IN (${list})`));
}

function between(table: string, column: string, low: number, high: number) {
  return check(`${table}_${column}_check`, sql.raw(`"${column}" BETWEEN ${low} AND ${high}`));
}

/** ‹sync› — every sync root, and nothing else (03 §11). Timestamps are epoch milliseconds. */
function syncColumns() {
  return {
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
    syncVersion: integer('sync_version').notNull().default(1),
  };
}

/** The owner of every user-owned row and every child of one (INV-15, ADR-013). */
function ownerColumn() {
  return text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });
}

// ── 03 §1 Identity ────────────────────────────────────────────────────────────────────────────────

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull().unique(),
    displayName: text('display_name').notNull(),
    unitSystem: text('unit_system', { enum: UNIT_SYSTEMS }).notNull().default('metric'),
    locale: text('locale', { enum: LOCALES }).notNull().default('en'),
    bodyWeightKg: real('body_weight_kg'),
    birthDate: text('birth_date'),
    sex: text('sex', { enum: SEXES }),
    maxHr: integer('max_hr'),
    restingHr: integer('resting_hr'),
    timezone: text('timezone').notNull().default('UTC'),
    emailVerifiedAt: integer('email_verified_at'),
    gamificationEnabled: integer('gamification_enabled', { mode: 'boolean' }).notNull().default(true),
    deletionRequestedAt: integer('deletion_requested_at'),
    wrappedPrivacyKey: blob('wrapped_privacy_key', { mode: 'buffer' }),
    privacyKeySalt: blob('privacy_key_salt', { mode: 'buffer' }),
    privacyKeyKdf: text('privacy_key_kdf'),
    ...syncColumns(),
  },
  () => [
    oneOf('users', 'unit_system', UNIT_SYSTEMS),
    oneOf('users', 'locale', LOCALES),
    oneOf('users', 'sex', SEXES),
  ],
);

export const subscriptions = sqliteTable(
  'subscriptions',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    tier: text('tier', { enum: TIERS }).notNull().default('trial'),
    trialStartedAt: integer('trial_started_at').notNull(),
    trialEndsAt: integer('trial_ends_at').notNull(),
    store: text('store', { enum: STORES }),
    storeProductId: text('store_product_id'),
    currentPeriodEnd: integer('current_period_end'),
    cancelledAt: integer('cancelled_at'),
    ...syncColumns(),
  },
  () => [oneOf('subscriptions', 'tier', TIERS), oneOf('subscriptions', 'store', STORES)],
);

export const bodyWeightLog = sqliteTable(
  'body_weight_log',
  {
    id: text('id').primaryKey(),
    userId: ownerColumn(),
    measuredOn: text('measured_on').notNull(),
    weightKg: real('weight_kg').notNull(),
    ...syncColumns(),
  },
  (t) => [uniqueIndex('body_weight_log_user_measured_on_key').on(t.userId, t.measuredOn)],
);

export const hrZoneOverrides = sqliteTable(
  'hr_zone_overrides',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    zone: integer('zone').notNull(),
    minBpm: integer('min_bpm').notNull(),
    maxBpm: integer('max_bpm').notNull(),
    ...syncColumns(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.zone] }), between('hr_zone_overrides', 'zone', 1, 5)],
);

/** Decrypted on the device, beside the raw points it trims (03 §8, ADR-007). */
export const privacyZones = sqliteTable(
  'privacy_zones',
  {
    id: text('id').primaryKey(),
    userId: ownerColumn(),
    label: text('label').notNull(),
    centerLat: real('center_lat').notNull(),
    centerLng: real('center_lng').notNull(),
    radiusM: real('radius_m').notNull(),
    ...syncColumns(),
  },
  (t) => [index('privacy_zones_user_id_idx').on(t.userId)],
);

// ── 03 §2 Exercise catalog ────────────────────────────────────────────────────────────────────────

export const muscleGroups = sqliteTable(
  'muscle_groups',
  {
    id: integer('id').primaryKey(),
    nameKey: text('name_key').notNull().unique(),
    region: text('region', { enum: MUSCLE_REGIONS }).notNull(),
  },
  () => [oneOf('muscle_groups', 'region', MUSCLE_REGIONS)],
);

export const exercises = sqliteTable(
  'exercises',
  {
    id: text('id').primaryKey(),
    ownerUserId: text('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
    forkedFromId: text('forked_from_id').references((): ReturnType<typeof text> => exercises.id, {
      onDelete: 'set null',
    }),
    nameKey: text('name_key'),
    name: text('name'),
    modality: text('modality', { enum: MODALITIES }).notNull(),
    primaryMuscleId: integer('primary_muscle_id')
      .notNull()
      .references(() => muscleGroups.id),
    isUnilateral: integer('is_unilateral', { mode: 'boolean' }).notNull().default(false),
    tracking: text('tracking', { enum: TRACKING }).notNull().default('weight_reps'),
    loadIncrementKg: real('load_increment_kg'),
    usesBodyweight: integer('uses_bodyweight', { mode: 'boolean' }).notNull().default(false),
    defaultMinReps: integer('default_min_reps'),
    defaultMaxReps: integer('default_max_reps'),
    notes: text('notes'),
    ...syncColumns(),
  },
  (t) => [
    oneOf('exercises', 'modality', MODALITIES),
    oneOf('exercises', 'tracking', TRACKING),
    check('exercises_name_or_key', sql`(${t.nameKey} IS NULL) <> (${t.name} IS NULL)`),
    check('exercises_key_iff_global', sql`(${t.ownerUserId} IS NULL) = (${t.nameKey} IS NOT NULL)`),
    uniqueIndex('exercises_owner_name_key')
      .on(t.ownerUserId, sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} IS NULL AND ${t.name} IS NOT NULL`),
    uniqueIndex('exercises_name_key_key').on(t.nameKey).where(sql`${t.nameKey} IS NOT NULL`),
  ],
);

export const exerciseSecondaryMuscles = sqliteTable(
  'exercise_secondary_muscles',
  {
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id, { onDelete: 'cascade' }),
    muscleGroupId: integer('muscle_group_id')
      .notNull()
      .references(() => muscleGroups.id),
  },
  (t) => [primaryKey({ columns: [t.exerciseId, t.muscleGroupId] })],
);

export const modalityIncrements = sqliteTable(
  'modality_increments',
  {
    modality: text('modality', { enum: MODALITIES }).notNull(),
    unitSystem: text('unit_system', { enum: UNIT_SYSTEMS }).notNull(),
    incrementKg: real('increment_kg').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.modality, t.unitSystem] }),
    oneOf('modality_increments', 'modality', MODALITIES),
    oneOf('modality_increments', 'unit_system', UNIT_SYSTEMS),
  ],
);

// ── 03 §3 Routines ────────────────────────────────────────────────────────────────────────────────

export const routines = sqliteTable(
  'routines',
  {
    id: text('id').primaryKey(),
    userId: ownerColumn(),
    name: text('name').notNull(),
    notes: text('notes'),
    folder: text('folder'),
    orderIndex: integer('order_index').notNull().default(0),
    ...syncColumns(),
  },
  (t) => [index('routines_user_id_idx').on(t.userId)],
);

export const routineExercises = sqliteTable(
  'routine_exercises',
  {
    id: text('id').primaryKey(),
    userId: ownerColumn(),
    routineId: text('routine_id')
      .notNull()
      .references(() => routines.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    orderIndex: integer('order_index').notNull(),
    supersetGroup: integer('superset_group'),
    targetSets: integer('target_sets'),
    targetMinReps: integer('target_min_reps'),
    targetMaxReps: integer('target_max_reps'),
    targetRir: integer('target_rir'),
    restSeconds: integer('rest_seconds'),
    notes: text('notes'),
    ...syncColumns(),
  },
  (t) => [
    between('routine_exercises', 'target_rir', 0, 10),
    uniqueIndex('routine_exercises_order').on(t.routineId, t.orderIndex),
  ],
);

// ── 03 §4 Performed workouts ──────────────────────────────────────────────────────────────────────

export const workouts = sqliteTable(
  'workouts',
  {
    id: text('id').primaryKey(),
    userId: ownerColumn(),
    routineId: text('routine_id').references(() => routines.id, { onDelete: 'set null' }),
    plannedSessionId: text('planned_session_id').references(() => plannedSessions.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    startedAt: integer('started_at').notNull(),
    endedAt: integer('ended_at'),
    localDate: text('local_date').notNull(),
    tz: text('tz').notNull(),
    notes: text('notes'),
    perceivedFatigue: integer('perceived_fatigue'),
    source: text('source', { enum: WORKOUT_SOURCES }).notNull(),
    ...syncColumns(),
  },
  (t) => [
    between('workouts', 'perceived_fatigue', 1, 10),
    oneOf('workouts', 'source', WORKOUT_SOURCES),
    index('workouts_user_started_at_idx').on(t.userId, t.startedAt),
    index('workouts_user_local_date_idx').on(t.userId, t.localDate),
  ],
);

export const workoutExercises = sqliteTable(
  'workout_exercises',
  {
    id: text('id').primaryKey(),
    userId: ownerColumn(),
    workoutId: text('workout_id')
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    orderIndex: integer('order_index').notNull(),
    supersetGroup: integer('superset_group'),
    notes: text('notes'),
    plannedExerciseId: text('planned_exercise_id').references(() => plannedExercises.id, {
      onDelete: 'set null',
    }),
    ...syncColumns(),
  },
  (t) => [
    index('workout_exercises_workout_order_idx').on(t.workoutId, t.orderIndex),
    index('workout_exercises_exercise_workout_idx').on(t.exerciseId, t.workoutId),
  ],
);

export const setLogs = sqliteTable(
  'set_logs',
  {
    id: text('id').primaryKey(),
    userId: ownerColumn(),
    workoutExerciseId: text('workout_exercise_id')
      .notNull()
      .references(() => workoutExercises.id, { onDelete: 'cascade' }),
    setIndex: integer('set_index').notNull(),
    setType: text('set_type', { enum: SET_TYPES }).notNull().default('working'),
    weightKg: real('weight_kg'),
    reps: integer('reps'),
    rir: integer('rir'),
    distanceM: integer('distance_m'),
    durationS: integer('duration_s'),
    isCompleted: integer('is_completed', { mode: 'boolean' }).notNull().default(false),
    completedAt: integer('completed_at'),
    plannedSetId: text('planned_set_id').references(() => plannedSets.id, { onDelete: 'set null' }),
    ...syncColumns(),
  },
  (t) => [
    oneOf('set_logs', 'set_type', SET_TYPES),
    check('set_logs_weight_kg_check', sql`${t.weightKg} >= 0`),
    between('set_logs', 'reps', 0, 1000),
    between('set_logs', 'rir', 0, 10),
    uniqueIndex('set_logs_position').on(t.workoutExerciseId, t.setIndex),
    index('set_logs_planned_set_id_idx').on(t.plannedSetId).where(sql`${t.plannedSetId} IS NOT NULL`),
  ],
);

// ── 03 §5 The strength planner ────────────────────────────────────────────────────────────────────

export const progressionRules = sqliteTable(
  'progression_rules',
  {
    id: text('id').primaryKey(),
    userId: ownerColumn(),
    name: text('name'),
    strategy: text('strategy', { enum: PROGRESSION_STRATEGIES }).notNull(),
    loadStepKg: real('load_step_kg'),
    loadStepBp: integer('load_step_bp'),
    repStep: integer('rep_step').default(1),
    minReps: integer('min_reps').notNull(),
    maxReps: integer('max_reps').notNull(),
    minRir: integer('min_rir').notNull().default(0),
    maxRir: integer('max_rir').notNull().default(4),
    rirMode: text('rir_mode', { enum: RIR_MODES }).notNull().default('per_exercise'),
    rirOffsets: text('rir_offsets', { mode: 'json' }).$type<number[]>(),
    rirStart: integer('rir_start'),
    rirEnd: integer('rir_end'),
    percentWaveBp: text('percent_wave_bp', { mode: 'json' }).$type<number[]>(),
    baselineE1rmKg: real('baseline_e1rm_kg'),
    cyclePattern: text('cycle_pattern', { mode: 'json' }).$type<unknown[]>(),
    failurePolicy: text('failure_policy', { enum: FAILURE_POLICIES }).notNull().default('hold'),
    failureLoadBp: integer('failure_load_bp').default(9000),
    rounding: text('rounding', { enum: ROUNDING }).notNull().default('nearest'),
    ...syncColumns(),
  },
  (t) => [
    oneOf('progression_rules', 'strategy', PROGRESSION_STRATEGIES),
    oneOf('progression_rules', 'rir_mode', RIR_MODES),
    oneOf('progression_rules', 'failure_policy', FAILURE_POLICIES),
    oneOf('progression_rules', 'rounding', ROUNDING),
    check('progression_rules_load_step_bp_check', sql`${t.loadStepBp} > 0`),
    check('progression_rules_reps_ordered', sql`${t.maxReps} >= ${t.minReps}`),
    between('progression_rules', 'min_rir', 0, 10),
    between('progression_rules', 'max_rir', 0, 10),
    check('progression_rules_rir_ordered', sql`${t.maxRir} >= ${t.minRir}`),
    between('progression_rules', 'rir_start', 0, 10),
    between('progression_rules', 'rir_end', 0, 10),
    between('progression_rules', 'failure_load_bp', 1, 10000),
    check(
      'progression_rules_percent_1rm_baseline',
      sql`${t.strategy} <> 'percent_1rm' OR ${t.baselineE1rmKg} IS NOT NULL`,
    ),
  ],
);

export const mesocycles = sqliteTable(
  'mesocycles',
  {
    id: text('id').primaryKey(),
    userId: ownerColumn(),
    name: text('name').notNull(),
    goal: text('goal', { enum: MESO_GOALS }).notNull(),
    startDate: text('start_date').notNull(),
    numMicrocycles: integer('num_microcycles').notNull(),
    // A default, never an assumption (INV-25).
    defaultMicrocycleDays: integer('default_microcycle_days').notNull().default(7),
    deloadMode: text('deload_mode', { enum: DELOAD_MODES }).notNull().default('none'),
    deloadEveryNMicrocycles: integer('deload_every_n_microcycles'),
    deloadFinalCycle: integer('deload_final_cycle', { mode: 'boolean' }).notNull().default(false),
    deloadSetBp: integer('deload_set_bp').notNull().default(5000),
    deloadLoadBp: integer('deload_load_bp').notNull().default(6000),
    deloadRirBump: integer('deload_rir_bump').notNull().default(2),
    defaultRuleId: text('default_rule_id').references(() => progressionRules.id, {
      onDelete: 'set null',
    }),
    status: text('status', { enum: MESO_STATUSES }).notNull().default('draft'),
    ...syncColumns(),
  },
  (t) => [
    oneOf('mesocycles', 'goal', MESO_GOALS),
    oneOf('mesocycles', 'deload_mode', DELOAD_MODES),
    oneOf('mesocycles', 'status', MESO_STATUSES),
    between('mesocycles', 'num_microcycles', 2, 52),
    between('mesocycles', 'default_microcycle_days', 1, 28),
    check(
      'mesocycles_deload_every_n',
      sql`(${t.deloadMode} = 'every_n_microcycles') = (${t.deloadEveryNMicrocycles} IS NOT NULL)`,
    ),
  ],
);

export const microcycles = sqliteTable(
  'microcycles',
  {
    id: text('id').primaryKey(),
    userId: ownerColumn(),
    mesocycleId: text('mesocycle_id')
      .notNull()
      .references(() => mesocycles.id, { onDelete: 'cascade' }),
    cycleNumber: integer('cycle_number').notNull(),
    lengthDays: integer('length_days').notNull(),
    startsOn: text('starts_on').notNull(),
    isDeload: integer('is_deload', { mode: 'boolean' }).notNull().default(false),
    status: text('status', { enum: CYCLE_STATUSES }).notNull().default('projected'),
    engineVersion: integer('engine_version').notNull(),
    lastWriteKind: text('last_write_kind', { enum: WRITE_KINDS }).notNull().default('engine'),
    ...syncColumns(),
  },
  (t) => [
    between('microcycles', 'length_days', 1, 28),
    oneOf('microcycles', 'status', CYCLE_STATUSES),
    oneOf('microcycles', 'last_write_kind', WRITE_KINDS),
    uniqueIndex('microcycles_mesocycle_cycle_number_key').on(t.mesocycleId, t.cycleNumber),
  ],
);

export const plannedSessions = sqliteTable(
  'planned_sessions',
  {
    id: text('id').primaryKey(),
    userId: ownerColumn(),
    microcycleId: text('microcycle_id')
      .notNull()
      .references(() => microcycles.id, { onDelete: 'cascade' }),
    // Position within the cycle, never a weekday (INV-25); the upper bound is a trigger.
    dayIndex: integer('day_index').notNull(),
    name: text('name').notNull(),
    orderIndex: integer('order_index').notNull().default(0),
    ...syncColumns(),
  },
  (t) => [
    check('planned_sessions_day_index_check', sql`${t.dayIndex} >= 1`),
    index('planned_sessions_microcycle_day_idx').on(t.microcycleId, t.dayIndex),
  ],
);

export const plannedExercises = sqliteTable(
  'planned_exercises',
  {
    id: text('id').primaryKey(),
    userId: ownerColumn(),
    plannedSessionId: text('planned_session_id')
      .notNull()
      .references(() => plannedSessions.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    progressionRuleId: text('progression_rule_id').references(() => progressionRules.id, {
      onDelete: 'set null',
    }),
    orderIndex: integer('order_index').notNull(),
    supersetGroup: integer('superset_group'),
    restSeconds: integer('rest_seconds'),
    notes: text('notes'),
    ...syncColumns(),
  },
  (t) => [index('planned_exercises_session_order_idx').on(t.plannedSessionId, t.orderIndex)],
);

export const plannedSets = sqliteTable(
  'planned_sets',
  {
    id: text('id').primaryKey(),
    userId: ownerColumn(),
    plannedExerciseId: text('planned_exercise_id')
      .notNull()
      .references(() => plannedExercises.id, { onDelete: 'cascade' }),
    setIndex: integer('set_index').notNull(),
    setType: text('set_type', { enum: SET_TYPES }).notNull().default('working'),
    targetWeightKg: real('target_weight_kg'),
    targetReps: integer('target_reps'),
    targetMinReps: integer('target_min_reps'),
    targetMaxReps: integer('target_max_reps'),
    targetRir: integer('target_rir'),
    wasClamped: integer('was_clamped', { mode: 'boolean' }).notNull().default(false),
    origin: text('origin', { enum: SET_ORIGINS }).notNull().default('generated'),
    isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
    ...syncColumns(),
  },
  (t) => [
    oneOf('planned_sets', 'set_type', SET_TYPES),
    oneOf('planned_sets', 'origin', SET_ORIGINS),
    between('planned_sets', 'target_rir', 0, 10),
    uniqueIndex('planned_sets_position').on(t.plannedExerciseId, t.setIndex),
  ],
);

// ── 03 §6 Cardio ──────────────────────────────────────────────────────────────────────────────────

export const gamificationTracks = sqliteTable(
  'gamification_tracks',
  {
    track: text('track', { enum: TRACKS }).primaryKey(),
    kind: text('kind', { enum: TRACK_KINDS }).notNull(),
    hueToken: text('hue_token').notNull(),
    levelScaleBp: integer('level_scale_bp').notNull().default(10000),
  },
  () => [
    oneOf('gamification_tracks', 'track', TRACKS),
    oneOf('gamification_tracks', 'kind', TRACK_KINDS),
    between('gamification_tracks', 'level_scale_bp', 1, 10000),
  ],
);

export const sportProfiles = sqliteTable(
  'sport_profiles',
  {
    sport: text('sport', { enum: SPORTS }).primaryKey(),
    nameKey: text('name_key').notNull().unique(),
    recordingMode: text('recording_mode', { enum: RECORDING_MODES }).notNull(),
    primaryMetric: text('primary_metric', { enum: PRIMARY_METRICS }).notNull(),
    paceUnitMetric: text('pace_unit_metric', { enum: PACE_UNITS }).notNull(),
    paceUnitImperial: text('pace_unit_imperial', { enum: PACE_UNITS }).notNull(),
    splitUnitMMetric: real('split_unit_m_metric'),
    splitUnitMImperial: real('split_unit_m_imperial'),
    hasRoute: integer('has_route', { mode: 'boolean' }).notNull(),
    hasElevation: integer('has_elevation', { mode: 'boolean' }).notNull(),
    autopauseThresholdMps: real('autopause_threshold_mps'),
    liveFields: text('live_fields', { mode: 'json' }).$type<string[]>().notNull(),
    detailSections: text('detail_sections', { mode: 'json' }).$type<string[]>().notNull(),
    sessionTypes: text('session_types', { mode: 'json' }).$type<string[]>().notNull(),
    metricsSchema: text('metrics_schema', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    xpTrack: text('xp_track', { enum: TRACKS })
      .notNull()
      .references(() => gamificationTracks.track),
  },
  () => [
    oneOf('sport_profiles', 'sport', SPORTS),
    oneOf('sport_profiles', 'recording_mode', RECORDING_MODES),
    oneOf('sport_profiles', 'primary_metric', PRIMARY_METRICS),
    oneOf('sport_profiles', 'pace_unit_metric', PACE_UNITS),
    oneOf('sport_profiles', 'pace_unit_imperial', PACE_UNITS),
  ],
);

export const cardioActivities = sqliteTable(
  'cardio_activities',
  {
    id: text('id').primaryKey(),
    userId: ownerColumn(),
    plannedCardioSessionId: text('planned_cardio_session_id').references(
      () => plannedCardioSessions.id,
      { onDelete: 'set null' },
    ),
    sport: text('sport', { enum: SPORTS })
      .notNull()
      .references(() => sportProfiles.sport),
    title: text('title').notNull(),
    startedAt: integer('started_at').notNull(),
    localDate: text('local_date').notNull(),
    tz: text('tz').notNull(),
    elapsedS: integer('elapsed_s').notNull(),
    movingS: integer('moving_s').notNull(),
    distanceM: integer('distance_m').notNull().default(0),
    elevationGainM: integer('elevation_gain_m').notNull().default(0),
    elevationLossM: integer('elevation_loss_m').notNull().default(0),
    avgSpeedMps: real('avg_speed_mps'),
    bestSpeedMps: real('best_speed_mps'),
    avgHr: integer('avg_hr'),
    maxHr: integer('max_hr'),
    avgCadence: integer('avg_cadence'),
    calories: integer('calories'),
    perceivedEffort: integer('perceived_effort'),
    sportMetrics: text('sport_metrics', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    source: text('source', { enum: ACTIVITY_SOURCES }).notNull(),
    device: text('device'),
    pipelineVersion: integer('pipeline_version').notNull(),
    visibility: text('visibility', { enum: VISIBILITIES }).notNull().default('private'),
    hasTrack: integer('has_track', { mode: 'boolean' }).notNull().default(false),
    polyline: text('polyline'),
    startLat: real('start_lat'),
    startLng: real('start_lng'),
    notes: text('notes'),
    ...syncColumns(),
  },
  (t) => [
    between('cardio_activities', 'perceived_effort', 1, 10),
    oneOf('cardio_activities', 'sport', SPORTS),
    oneOf('cardio_activities', 'source', ACTIVITY_SOURCES),
    oneOf('cardio_activities', 'visibility', VISIBILITIES),
    index('cardio_activities_user_started_at_idx').on(t.userId, t.startedAt),
    index('cardio_activities_user_sport_started_at_idx').on(t.userId, t.sport, t.startedAt),
  ],
);

export const activityStreams = sqliteTable(
  'activity_streams',
  {
    userId: ownerColumn(),
    activityId: text('activity_id')
      .notNull()
      .references(() => cardioActivities.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: STREAM_KINDS }).notNull(),
    encoding: text('encoding', { enum: STREAM_ENCODINGS }).notNull(),
    sampleCount: integer('sample_count').notNull(),
    data: blob('data', { mode: 'buffer' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.activityId, t.kind] }),
    oneOf('activity_streams', 'kind', STREAM_KINDS),
    oneOf('activity_streams', 'encoding', STREAM_ENCODINGS),
  ],
);

export const activitySegments = sqliteTable(
  'activity_segments',
  {
    id: text('id').primaryKey(),
    userId: ownerColumn(),
    activityId: text('activity_id')
      .notNull()
      .references(() => cardioActivities.id, { onDelete: 'cascade' }),
    segmentIndex: integer('segment_index').notNull(),
    kind: text('kind', { enum: SEGMENT_KINDS }).notNull(),
    splitBasis: text('split_basis', { enum: SPLIT_BASES }).notNull().default('none'),
    distanceM: integer('distance_m'),
    movingS: integer('moving_s').notNull(),
    elapsedS: integer('elapsed_s').notNull(),
    restS: integer('rest_s'),
    elevationGainM: integer('elevation_gain_m'),
    avgSpeedMps: real('avg_speed_mps'),
    avgHr: integer('avg_hr'),
    segmentMetrics: text('segment_metrics', { mode: 'json' })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    ...syncColumns(),
  },
  (t) => [
    oneOf('activity_segments', 'kind', SEGMENT_KINDS),
    oneOf('activity_segments', 'split_basis', SPLIT_BASES),
    check(
      'activity_segments_split_basis',
      sql`(${t.kind} = 'auto_split') = (${t.splitBasis} <> 'none')`,
    ),
    uniqueIndex('activity_segments_position').on(t.activityId, t.splitBasis, t.segmentIndex),
  ],
);

/** Local-only, never synced; trimmed once the activity's streams are uploaded (03 §6). */
export const rawGpsPoints = sqliteTable(
  'raw_gps_points',
  {
    activityId: text('activity_id').notNull(),
    seq: integer('seq').notNull(),
    recordedAt: integer('recorded_at').notNull(),
    lat: real('lat').notNull(),
    lng: real('lng').notNull(),
    altitudeM: real('altitude_m'),
    accuracyM: real('accuracy_m'),
    speedMps: real('speed_mps'),
    hr: integer('hr'),
  },
  (t) => [primaryKey({ columns: [t.activityId, t.seq] })],
);

// ── 03 §7 The cardio planner ──────────────────────────────────────────────────────────────────────

export const cardioPlans = sqliteTable(
  'cardio_plans',
  {
    id: text('id').primaryKey(),
    userId: ownerColumn(),
    name: text('name').notNull(),
    goal: text('goal', { enum: CARDIO_GOALS }).notNull(),
    startDate: text('start_date').notNull(),
    numMicrocycles: integer('num_microcycles').notNull(),
    // A default, never an assumption (INV-25).
    defaultMicrocycleDays: integer('default_microcycle_days').notNull().default(7),
    volumeStepBp: integer('volume_step_bp').notNull(),
    railOverriddenAt: integer('rail_overridden_at'),
    deloadMode: text('deload_mode', { enum: DELOAD_MODES }).notNull().default('none'),
    deloadEveryNMicrocycles: integer('deload_every_n_microcycles'),
    deloadVolumeBp: integer('deload_volume_bp').notNull().default(6000),
    status: text('status', { enum: MESO_STATUSES }).notNull().default('draft'),
    ...syncColumns(),
  },
  (t) => [
    oneOf('cardio_plans', 'goal', CARDIO_GOALS),
    oneOf('cardio_plans', 'deload_mode', DELOAD_MODES),
    oneOf('cardio_plans', 'status', MESO_STATUSES),
    between('cardio_plans', 'num_microcycles', 2, 52),
    between('cardio_plans', 'default_microcycle_days', 1, 28),
    check(
      'cardio_plans_deload_every_n',
      sql`(${t.deloadMode} = 'every_n_microcycles') = (${t.deloadEveryNMicrocycles} IS NOT NULL)`,
    ),
  ],
);

export const cardioPlanMicrocycles = sqliteTable(
  'cardio_plan_microcycles',
  {
    id: text('id').primaryKey(),
    userId: ownerColumn(),
    cardioPlanId: text('cardio_plan_id')
      .notNull()
      .references(() => cardioPlans.id, { onDelete: 'cascade' }),
    cycleNumber: integer('cycle_number').notNull(),
    lengthDays: integer('length_days').notNull(),
    startsOn: text('starts_on').notNull(),
    isDeload: integer('is_deload', { mode: 'boolean' }).notNull().default(false),
    targetDurationS: integer('target_duration_s'),
    status: text('status', { enum: CYCLE_STATUSES }).notNull().default('projected'),
    engineVersion: integer('engine_version').notNull(),
    lastWriteKind: text('last_write_kind', { enum: WRITE_KINDS }).notNull().default('engine'),
    ...syncColumns(),
  },
  (t) => [
    between('cardio_plan_microcycles', 'length_days', 1, 28),
    oneOf('cardio_plan_microcycles', 'status', CYCLE_STATUSES),
    oneOf('cardio_plan_microcycles', 'last_write_kind', WRITE_KINDS),
    uniqueIndex('cardio_plan_microcycles_plan_cycle_number_key').on(t.cardioPlanId, t.cycleNumber),
  ],
);

/** Per sport, never summed across sports (INV-20). A dependent: no ‹sync› (03 §11). */
export const cardioPlanCycleTargets = sqliteTable(
  'cardio_plan_cycle_targets',
  {
    userId: ownerColumn(),
    cardioPlanMicrocycleId: text('cardio_plan_microcycle_id')
      .notNull()
      .references(() => cardioPlanMicrocycles.id, { onDelete: 'cascade' }),
    sport: text('sport', { enum: SPORTS })
      .notNull()
      .references(() => sportProfiles.sport),
    targetDistanceM: integer('target_distance_m'),
    targetDurationS: integer('target_duration_s'),
  },
  (t) => [
    primaryKey({ columns: [t.cardioPlanMicrocycleId, t.sport] }),
    oneOf('cardio_plan_cycle_targets', 'sport', SPORTS),
  ],
);

export const plannedCardioSessions = sqliteTable(
  'planned_cardio_sessions',
  {
    id: text('id').primaryKey(),
    userId: ownerColumn(),
    cardioPlanMicrocycleId: text('cardio_plan_microcycle_id')
      .notNull()
      .references(() => cardioPlanMicrocycles.id, { onDelete: 'cascade' }),
    dayIndex: integer('day_index').notNull(),
    sport: text('sport', { enum: SPORTS })
      .notNull()
      .references(() => sportProfiles.sport),
    sessionType: text('session_type').notNull(),
    targetDistanceM: integer('target_distance_m'),
    targetDurationS: integer('target_duration_s'),
    targetZone: integer('target_zone'),
    targetSpeedMinMps: real('target_speed_min_mps'),
    targetSpeedMaxMps: real('target_speed_max_mps'),
    structure: text('structure', { mode: 'json' }).$type<unknown[]>(),
    origin: text('origin', { enum: SET_ORIGINS }).notNull().default('generated'),
    isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
    notes: text('notes'),
    ...syncColumns(),
  },
  (t) => [
    check('planned_cardio_sessions_day_index_check', sql`${t.dayIndex} >= 1`),
    oneOf('planned_cardio_sessions', 'sport', SPORTS),
    oneOf('planned_cardio_sessions', 'origin', SET_ORIGINS),
    between('planned_cardio_sessions', 'target_zone', 1, 5),
    index('planned_cardio_sessions_cycle_day_idx').on(t.cardioPlanMicrocycleId, t.dayIndex),
  ],
);

// ── 03 §7a Gamification ───────────────────────────────────────────────────────────────────────────

/** The ledger. Its fold, user_track_progress, is not on the device: it is rebuilt from here (03 §8). */
export const xpAwards = sqliteTable(
  'xp_awards',
  {
    id: text('id').primaryKey(),
    userId: ownerColumn(),
    track: text('track', { enum: TRACKS }).notNull(),
    amount: integer('amount').notNull(),
    reason: text('reason').notNull(),
    sourceKind: text('source_kind', { enum: XP_SOURCES }).notNull(),
    sourceId: text('source_id'),
    awardedAt: integer('awarded_at').notNull(),
    ...syncColumns(),
  },
  (t) => [
    oneOf('xp_awards', 'track', TRACKS),
    oneOf('xp_awards', 'source_kind', XP_SOURCES),
    check('xp_awards_amount_check', sql`${t.amount} >= 0`),
    // INV-21. SQLite has no NULLS NOT DISTINCT, so awards with no source get a unique index of their own.
    uniqueIndex('xp_awards_once').on(t.userId, t.sourceKind, t.sourceId, t.reason),
    uniqueIndex('xp_awards_once_without_source')
      .on(t.userId, t.sourceKind, t.reason)
      .where(sql.raw('"source_id" IS NULL')),
  ],
);

export const achievements = sqliteTable(
  'achievements',
  {
    code: text('code').primaryKey(),
    nameKey: text('name_key').notNull(),
    descriptionKey: text('description_key').notNull(),
    track: text('track', { enum: TRACKS }).references(() => gamificationTracks.track),
    tier: integer('tier').notNull().default(1),
    unitSystem: text('unit_system', { enum: UNIT_SYSTEMS }),
  },
  () => [oneOf('achievements', 'track', TRACKS), oneOf('achievements', 'unit_system', UNIT_SYSTEMS)],
);

export const userAchievements = sqliteTable(
  'user_achievements',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    achievementCode: text('achievement_code')
      .notNull()
      .references(() => achievements.code),
    achievedAt: integer('achieved_at').notNull(),
    sourceId: text('source_id'),
    ...syncColumns(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.achievementCode] })],
);

export const adherenceStreaks = sqliteTable('adherence_streaks', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  currentCycles: integer('current_cycles').notNull().default(0),
  longestCycles: integer('longest_cycles').notNull().default(0),
  lastKeptCycleId: text('last_kept_cycle_id'),
  graceUsedInQuarter: integer('grace_used_in_quarter').notNull().default(0),
  ...syncColumns(),
});

// ── 03 §8 Local-only sync state ───────────────────────────────────────────────────────────────────

export const outbox = sqliteTable(
  'outbox',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    entity: text('entity').notNull(),
    entityId: text('entity_id').notNull(),
    op: text('op', { enum: OUTBOX_OPS }).notNull(),
    payload: text('payload').notNull(),
    createdAt: integer('created_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    nextAttemptAt: integer('next_attempt_at'),
  },
  () => [oneOf('outbox', 'op', OUTBOX_OPS)],
);

export const syncState = sqliteTable('sync_state', {
  key: text('key').primaryKey(),
  value: text('value'),
});
