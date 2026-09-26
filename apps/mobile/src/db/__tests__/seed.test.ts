import reference from '@cyberathlete/shared/seeds/reference.json';

import { REFERENCE_SEED_EPOCH_MS, referenceSeedRows } from '../seed';

// The seed module reaches expo-sqlite through `./client`, which cannot open a database under Node. Only the pure
// half is under test here; that the rows actually land is a device check, like every other claim about SQLite.
jest.mock('../client', () => ({ db: {}, sqlite: {} }));

// The fingerprint gate — that REFERENCE_SEED_VERSION still matches the file — is `pnpm check:seed-version`,
// beside the catalog and lint-fixture checks. It needs to hash a file on disk, and this app has no Node types.

describe('the bundled reference data', () => {
  it('carries the catalog 01 §2 promises', () => {
    expect(reference.exercises).toHaveLength(201);
    expect(reference.muscle_groups.length).toBeGreaterThan(0);
    expect(reference.sport_profiles).toHaveLength(11);
  });
});

describe('the rows the seed builds', () => {
  const rows = referenceSeedRows();

  it('names every global by key and never by translated text (INV-27)', () => {
    for (const exercise of rows.exercises) {
      expect(exercise.nameKey).toMatch(/^exercise\./);
      expect(exercise.name).toBeNull();
      // `exercises_key_iff_global`: no owner exactly when there is a key.
      expect(exercise.ownerUserId).toBeNull();
    }
  });

  it('stamps every global with one fixed time, so two devices seed identical rows', () => {
    // Not Date.now(): a wall-clock reading would make two installs differ by when each was installed, which is a
    // disagreement sync would then have to resolve about data that is byte-identical on both.
    for (const exercise of rows.exercises) {
      expect(exercise.createdAt).toBe(REFERENCE_SEED_EPOCH_MS);
      expect(exercise.updatedAt).toBe(REFERENCE_SEED_EPOCH_MS);
    }
    expect(new Set(rows.exercises.map((one) => one.createdAt)).size).toBe(1);
  });

  it('keeps an imperial increment to the precision INV-02 needs', () => {
    // 2.267962 kg is 5 lb. Rounded to two decimals it is not, and INV-02's own worked example is that 52 of 52
    // prescriptions then fall off the plate grid.
    const imperialBarbell = rows.modalityIncrements.find(
      (row) => row.modality === 'barbell' && row.unitSystem === 'imperial',
    );

    expect(imperialBarbell?.incrementKg).toBeCloseTo(2.267962, 6);
  });

  it('reads every numeric column as a number rather than the string it crosses JSON as', () => {
    for (const row of rows.modalityIncrements) {
      expect(typeof row.incrementKg).toBe('number');
      expect(Number.isFinite(row.incrementKg)).toBe(true);
    }
    for (const profile of rows.sportProfiles) {
      for (const value of [profile.splitUnitMMetric, profile.splitUnitMImperial, profile.autopauseThresholdMps]) {
        if (value !== null) expect(typeof value).toBe('number');
      }
    }
  });

  it('never lists a muscle as both primary and secondary for one exercise (FR-2.16)', () => {
    // The local trigger `exercise_secondary_muscles_not_primary_insert` rejects this, so seed data that broke it
    // would fail on a device and pass everywhere else. A set would otherwise credit 1.2 sets to one muscle.
    const primaryById = new Map(rows.exercises.map((one) => [one.id, one.primaryMuscleId]));

    for (const link of rows.exerciseSecondaryMuscles) {
      expect(link.muscleGroupId).not.toBe(primaryById.get(link.exerciseId));
    }
  });

  it('references only rows it also seeds, in an order the foreign keys accept', () => {
    const muscleIds = new Set(rows.muscleGroups.map((one) => one.id));
    const trackNames = new Set(rows.gamificationTracks.map((one) => one.track));
    const exerciseIds = new Set(rows.exercises.map((one) => one.id));

    for (const exercise of rows.exercises) expect(muscleIds).toContain(exercise.primaryMuscleId);
    for (const link of rows.exerciseSecondaryMuscles) {
      expect(exerciseIds).toContain(link.exerciseId);
      expect(muscleIds).toContain(link.muscleGroupId);
    }
    for (const profile of rows.sportProfiles) expect(trackNames).toContain(profile.xpTrack);
    for (const achievement of rows.achievements) {
      if (achievement.track !== null && achievement.track !== undefined) {
        expect(trackNames).toContain(achievement.track);
      }
    }
  });

  it('builds the same rows every time it is asked — INV-10’s habit, applied to a seed', () => {
    expect(referenceSeedRows()).toEqual(rows);
  });
});
