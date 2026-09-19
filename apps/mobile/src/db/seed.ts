import reference from '@cyberathlete/shared/seeds/reference.json';
import { sql } from 'drizzle-orm';

import { db, sqlite } from './client';
import {
  achievements,
  exerciseSecondaryMuscles,
  exercises,
  gamificationTracks,
  modalityIncrements,
  muscleGroups,
  sportProfiles,
  syncState,
} from './schema';

/**
 * The reference data, seeded into the local database — task 004's first criterion.
 *
 * A new install must have a catalog **before it has ever synced** ([ADR-001](../../../../docs/decisions/ADR-001.md)):
 * the gym has no signal, and an app that cannot name an exercise until it reaches the server is an app that does not
 * work where it is used. `packages/shared/seeds/reference.json` is generated from the same data the server is seeded
 * from, and CI fails if the committed copy is stale.
 *
 * Reference rows carry a **key and no translated text** (INV-27): `exercise.barbell_bench_press`, not "Bench Press".
 * One seed therefore serves every locale, and a new language is a catalog file rather than a migration.
 */

/**
 * The SHA-256 of the bundled `reference.json`, which is what decides whether seeding has anything to do.
 *
 * Stored in `sync_state` after a successful seed and compared on every launch, so the work happens on the first
 * launch and on the first launch after an app update that ships a new catalog — and never otherwise. Comparing a
 * fingerprint rather than counting rows means a *corrected* exercise reaches existing installs, which counting never
 * would.
 *
 * **Bump it by pasting what the test prints.** `seed.test.ts` hashes the file and asserts this constant matches, so
 * changing the data and forgetting this line fails CI rather than shipping a catalog nobody receives.
 */
export const REFERENCE_SEED_VERSION = '4fc54839ac61729f44427b378ae8dbd1b41f2676828027271115615749e3e158';

const SEED_VERSION_KEY = 'seed.reference.version';

/**
 * The timestamp every seeded global row carries, rather than `Date.now()`.
 *
 * Two devices seeding the same bundled file must produce **identical rows**. A wall-clock reading would make them
 * differ by whenever each was installed, which is a difference sync would then have to have an opinion about
 * (task 006) — an opinion nobody needs to form about reference data that is byte-identical on both.
 *
 * The value is 2026-09-19, the date task 004 seeded a catalog for the first time. The server stamps its own copies
 * with `now()` at its seed time, so the two sides will not agree on these columns; that is
 * [task 006](../../../../docs/tasks/006-sync-layer.md)'s to settle, and it is noted there rather than papered over
 * with a guess here.
 */
export const REFERENCE_SEED_EPOCH_MS = Date.UTC(2026, 8, 19);

export interface SeedOutcome {
  /** Whether rows were written. False means the bundled data was already in place. */
  readonly seeded: boolean;
  readonly version: string;
  /** Rows offered to the database, for the diagnostics screen. Not rows changed. */
  readonly rows: number;
}

type MuscleGroupRow = typeof muscleGroups.$inferInsert;
type ModalityIncrementRow = typeof modalityIncrements.$inferInsert;
type TrackRow = typeof gamificationTracks.$inferInsert;
type SportProfileRow = typeof sportProfiles.$inferInsert;
type AchievementRow = typeof achievements.$inferInsert;
type ExerciseRow = typeof exercises.$inferInsert;
type SecondaryMuscleRow = typeof exerciseSecondaryMuscles.$inferInsert;

export interface ReferenceSeedRows {
  readonly muscleGroups: MuscleGroupRow[];
  readonly modalityIncrements: ModalityIncrementRow[];
  readonly gamificationTracks: TrackRow[];
  readonly sportProfiles: SportProfileRow[];
  readonly achievements: AchievementRow[];
  readonly exercises: ExerciseRow[];
  readonly exerciseSecondaryMuscles: SecondaryMuscleRow[];
}

/**
 * `numeric` columns cross the export as strings, so the precision Postgres holds is not silently rounded on its way
 * through JSON (INV-02 — an imperial increment is 2.267962 kg, and the sixth decimal is load-bearing).
 */
function numeric(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'number' ? value : Number(value);
}

/**
 * The bundled JSON as typed rows, in the order the foreign keys require: muscles and tracks before the rows that
 * point at them, exercises before their secondary muscles.
 *
 * Pure, and exported for that reason — it is the half worth testing without a database.
 */
export function referenceSeedRows(): ReferenceSeedRows {
  const stamped = {
    createdAt: REFERENCE_SEED_EPOCH_MS,
    updatedAt: REFERENCE_SEED_EPOCH_MS,
    syncVersion: 1,
  };

  return {
    muscleGroups: reference.muscle_groups.map((row) => ({
      id: row.id,
      nameKey: row.name_key,
      region: row.region as MuscleGroupRow['region'],
    })),
    modalityIncrements: reference.modality_increments.map((row) => ({
      modality: row.modality as ModalityIncrementRow['modality'],
      unitSystem: row.unit_system as ModalityIncrementRow['unitSystem'],
      // Non-null by the column's own constraint; the export never omits it.
      incrementKg: numeric(row.increment_kg) ?? 0,
    })),
    gamificationTracks: reference.gamification_tracks.map((row) => ({
      track: row.track as TrackRow['track'],
      kind: row.kind as TrackRow['kind'],
      hueToken: row.hue_token,
      levelScaleBp: row.level_scale_bp,
    })),
    sportProfiles: reference.sport_profiles.map((row) => ({
      sport: row.sport as SportProfileRow['sport'],
      nameKey: row.name_key,
      recordingMode: row.recording_mode as SportProfileRow['recordingMode'],
      primaryMetric: row.primary_metric as SportProfileRow['primaryMetric'],
      paceUnitMetric: row.pace_unit_metric as SportProfileRow['paceUnitMetric'],
      paceUnitImperial: row.pace_unit_imperial as SportProfileRow['paceUnitImperial'],
      splitUnitMMetric: numeric(row.split_unit_m_metric),
      splitUnitMImperial: numeric(row.split_unit_m_imperial),
      hasRoute: row.has_route,
      hasElevation: row.has_elevation,
      autopauseThresholdMps: numeric(row.autopause_threshold_mps),
      liveFields: row.live_fields,
      detailSections: row.detail_sections,
      sessionTypes: row.session_types,
      metricsSchema: row.metrics_schema,
      xpTrack: row.xp_track as SportProfileRow['xpTrack'],
    })),
    achievements: reference.achievements.map((row) => ({
      code: row.code,
      nameKey: row.name_key,
      descriptionKey: row.description_key,
      track: row.track as AchievementRow['track'],
      tier: row.tier,
      unitSystem: row.unit_system as AchievementRow['unitSystem'],
    })),
    exercises: reference.exercises.map((row) => ({
      id: row.id,
      // A global belongs to nobody, and `exercises_key_iff_global` holds the two facts together: no owner exactly
      // when there is a translation key (INV-27).
      ownerUserId: null,
      nameKey: row.name_key,
      name: null,
      modality: row.modality as ExerciseRow['modality'],
      primaryMuscleId: row.primary_muscle_id,
      isUnilateral: row.is_unilateral,
      tracking: row.tracking as ExerciseRow['tracking'],
      usesBodyweight: row.uses_bodyweight,
      defaultMinReps: row.default_min_reps,
      defaultMaxReps: row.default_max_reps,
      ...stamped,
    })),
    exerciseSecondaryMuscles: reference.exercises.flatMap((row) =>
      row.secondary_muscle_ids.map((muscleGroupId) => ({ exerciseId: row.id, muscleGroupId })),
    ),
  };
}

/**
 * The value this statement is trying to insert, for an upsert's `DO UPDATE` clause.
 *
 * Every row is offered in one statement, so the new value has to be read from SQLite's `excluded` pseudo-table
 * rather than bound per row. Column names are this module's own literals — never anything a user typed.
 */
function excluded(column: string) {
  return sql.raw(`excluded."${column}"`);
}

/** The stored fingerprint of the data last seeded, or null on a database that has never been seeded. */
export function readSeededVersion(): string | null {
  const row = sqlite.getFirstSync<{ value: string | null }>(
    'SELECT value FROM sync_state WHERE key = ?',
    SEED_VERSION_KEY,
  );
  return row?.value ?? null;
}

/**
 * Seed the reference data if the bundled copy is not already in place. Idempotent: called twice, the second call
 * writes nothing and reports `seeded: false`.
 *
 * Everything happens in **one transaction**, the marker included, so a seed interrupted half way leaves a database
 * that seeds again on the next launch rather than one holding half a catalog and claiming to hold all of it.
 *
 * Rows are **upserted**, not inserted: an app update that ships a corrected exercise must reach an install that
 * already has the old one. `deletedAt` is deliberately left out of every update — a global the user archived stays
 * archived, because re-seeding is not a reason to hand somebody back an exercise they put away (INV-11).
 */
export function seedReferenceData(): SeedOutcome {
  const rows = referenceSeedRows();
  const total =
    rows.muscleGroups.length +
    rows.modalityIncrements.length +
    rows.gamificationTracks.length +
    rows.sportProfiles.length +
    rows.achievements.length +
    rows.exercises.length +
    rows.exerciseSecondaryMuscles.length;

  if (readSeededVersion() === REFERENCE_SEED_VERSION) {
    return { seeded: false, version: REFERENCE_SEED_VERSION, rows: total };
  }

  db.transaction((tx) => {
    tx.insert(muscleGroups)
      .values(rows.muscleGroups)
      .onConflictDoUpdate({
        target: muscleGroups.id,
        set: { nameKey: excluded('name_key'), region: excluded('region') },
      })
      .run();

    tx.insert(modalityIncrements)
      .values(rows.modalityIncrements)
      .onConflictDoUpdate({
        target: [modalityIncrements.modality, modalityIncrements.unitSystem],
        set: { incrementKg: excluded('increment_kg') },
      })
      .run();

    tx.insert(gamificationTracks)
      .values(rows.gamificationTracks)
      .onConflictDoUpdate({
        target: gamificationTracks.track,
        set: {
          kind: excluded('kind'),
          hueToken: excluded('hue_token'),
          levelScaleBp: excluded('level_scale_bp'),
        },
      })
      .run();

    tx.insert(sportProfiles)
      .values(rows.sportProfiles)
      .onConflictDoUpdate({
        target: sportProfiles.sport,
        set: {
          nameKey: excluded('name_key'),
          recordingMode: excluded('recording_mode'),
          primaryMetric: excluded('primary_metric'),
          paceUnitMetric: excluded('pace_unit_metric'),
          paceUnitImperial: excluded('pace_unit_imperial'),
          splitUnitMMetric: excluded('split_unit_m_metric'),
          splitUnitMImperial: excluded('split_unit_m_imperial'),
          hasRoute: excluded('has_route'),
          hasElevation: excluded('has_elevation'),
          autopauseThresholdMps: excluded('autopause_threshold_mps'),
          liveFields: excluded('live_fields'),
          detailSections: excluded('detail_sections'),
          sessionTypes: excluded('session_types'),
          metricsSchema: excluded('metrics_schema'),
          xpTrack: excluded('xp_track'),
        },
      })
      .run();

    tx.insert(achievements)
      .values(rows.achievements)
      .onConflictDoUpdate({
        target: achievements.code,
        set: {
          nameKey: excluded('name_key'),
          descriptionKey: excluded('description_key'),
          track: excluded('track'),
          tier: excluded('tier'),
          unitSystem: excluded('unit_system'),
        },
      })
      .run();

    tx.insert(exercises)
      .values(rows.exercises)
      .onConflictDoUpdate({
        target: exercises.id,
        // `deleted_at` and `created_at` are absent on purpose: the first keeps a user's archiving decision, the
        // second keeps the row's original identity in time.
        set: {
          nameKey: excluded('name_key'),
          modality: excluded('modality'),
          primaryMuscleId: excluded('primary_muscle_id'),
          isUnilateral: excluded('is_unilateral'),
          tracking: excluded('tracking'),
          usesBodyweight: excluded('uses_bodyweight'),
          defaultMinReps: excluded('default_min_reps'),
          defaultMaxReps: excluded('default_max_reps'),
          updatedAt: excluded('updated_at'),
        },
      })
      .run();

    // The pair is the whole row, so there is nothing to update — only to leave alone.
    tx.insert(exerciseSecondaryMuscles).values(rows.exerciseSecondaryMuscles).onConflictDoNothing().run();

    tx.insert(syncState)
      .values({ key: SEED_VERSION_KEY, value: REFERENCE_SEED_VERSION })
      .onConflictDoUpdate({ target: syncState.key, set: { value: REFERENCE_SEED_VERSION } })
      .run();
  });

  return { seeded: true, version: REFERENCE_SEED_VERSION, rows: total };
}
