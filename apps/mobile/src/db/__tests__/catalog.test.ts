/**
 * The catalog's decisions, in the half Jest can reach — task 004 stage 4.
 *
 * `expo-sqlite` cannot open under Node, so the writes in `src/db/catalog.ts` are settled on a device. What is tested
 * here is everything the writes are *made of*: the rows, the fork's draft, and the name rule that decides whether a
 * save is allowed at all.
 */
import {
  archivePatch,
  exerciseDraftPatch,
  forkDraft,
  userExerciseRow,
  validateExerciseName,
  type CatalogExercise,
  type ExerciseDraft,
} from '../catalog';

// `./client` opens `expo-sqlite` at module load, which Node cannot do — the same stub the stage-3 suite uses.
jest.mock('../client', () => ({ db: {}, sqlite: {} }));

const GLOBAL_BENCH: CatalogExercise = {
  id: 'e-bench',
  nameKey: 'exercise.barbell_bench_press',
  name: null,
  ownerUserId: null,
  forkedFromId: null,
  modality: 'barbell',
  primaryMuscleId: 3,
  tracking: 'weight_reps',
  isUnilateral: false,
  usesBodyweight: false,
  // A global always carries null, so one seeded row is liftable for a metric and an imperial user alike (INV-02).
  loadIncrementKg: null,
  notes: 'keep the shoulder blades back',
  archivedAt: null,
};

const DRAFT: ExerciseDraft = {
  name: '  Supino do João  ',
  modality: 'dumbbell',
  primaryMuscleId: 7,
  tracking: 'reps_only',
  isUnilateral: true,
  usesBodyweight: true,
  loadIncrementKg: 1.25,
  notes: null,
};

describe('a name the user typed', () => {
  it('is refused when it is blank, or only spaces', () => {
    expect(validateExerciseName('', [])).toBe('empty');
    expect(validateExerciseName('   ', [])).toBe('empty');
  });

  /**
   * The index is `UNIQUE (owner_user_id, lower(name)) WHERE deleted_at IS NULL`, so the check has to fold case the
   * same way or the form would accept a name the database then rejects.
   */
  it('is refused when the user already has it, whatever the case or the spaces', () => {
    expect(validateExerciseName('Supino inclinado', ['supino INCLINADO'])).toBe('taken');
    expect(validateExerciseName('  Supino inclinado ', ['Supino inclinado'])).toBe('taken');
  });

  it('is allowed when it is merely similar', () => {
    expect(validateExerciseName('Supino inclinado', ['Supino reto'])).toBeNull();
  });

  /**
   * Accents are **not** folded here, unlike in search. `lower()` in SQLite is ASCII-only, so *Supino* and *Supinó*
   * are two different names to the index — and the check must agree with the index, not with the searcher.
   */
  it('treats an accented name as its own name, because the unique index does', () => {
    expect(validateExerciseName('Supinó', ['Supino'])).toBeNull();
  });
});

describe('a row the user owns', () => {
  it('stores the name trimmed, with no key, so it is never translated (INV-27)', () => {
    const row = userExerciseRow({ ...DRAFT, id: 'x', userId: 'u1', now: 10, forkedFromId: null });

    expect(row.name).toBe('Supino do João');
    expect(row.nameKey).toBeNull();
    expect(row.ownerUserId).toBe('u1');
  });

  it('is born live, and carries every property the form collected', () => {
    const row = userExerciseRow({ ...DRAFT, id: 'x', userId: 'u1', now: 10, forkedFromId: null });

    expect(row.deletedAt).toBeNull();
    expect(row.modality).toBe('dumbbell');
    expect(row.tracking).toBe('reps_only');
    expect(row.isUnilateral).toBe(true);
    expect(row.usesBodyweight).toBe(true);
    expect(row.loadIncrementKg).toBe(1.25);
  });

  it('remembers the global it was forked from, so a second fork is never made', () => {
    const row = userExerciseRow({ ...DRAFT, id: 'x', userId: 'u1', now: 10, forkedFromId: 'e-bench' });

    expect(row.forkedFromId).toBe('e-bench');
  });
});

describe('forking a global', () => {
  /**
   * ADR-008 says the translated name is copied into the fork; the task file settles *which* translation — the one in
   * the UI language at the moment of forking, which is what the user was looking at when they chose to edit.
   */
  it('takes the name it was shown under, and nothing from the key', () => {
    expect(forkDraft(GLOBAL_BENCH, 'Supino reto com barra').name).toBe('Supino reto com barra');
    expect(forkDraft(GLOBAL_BENCH, 'Barbell bench press').name).toBe('Barbell bench press');
  });

  it('copies every other property, so the copy behaves exactly like the original', () => {
    const draft = forkDraft(GLOBAL_BENCH, 'Supino reto com barra');

    expect(draft.modality).toBe('barbell');
    expect(draft.primaryMuscleId).toBe(3);
    expect(draft.tracking).toBe('weight_reps');
    expect(draft.notes).toBe('keep the shoulder blades back');
  });

  /**
   * The increment is the one property worth its own test: inheriting the global's `null` is what keeps the fork
   * liftable in both unit systems, where copying a resolved kilogram figure would freeze one of them in (INV-02).
   */
  it('inherits the global’s null increment rather than resolving one', () => {
    expect(forkDraft(GLOBAL_BENCH, 'Supino reto com barra').loadIncrementKg).toBeNull();
  });
});

describe('editing and archiving', () => {
  it('writes the trimmed name and stamps the edit', () => {
    const patch = exerciseDraftPatch(DRAFT, 99);

    expect(patch.name).toBe('Supino do João');
    expect(patch.updatedAt).toBe(99);
  });

  /** INV-11: archiving is `deleted_at`, never a `DELETE`, so every set ever logged against it keeps resolving. */
  it('archives by timestamp and restores by clearing it', () => {
    expect(archivePatch(true, 99)).toEqual({ deletedAt: 99, updatedAt: 99 });
    expect(archivePatch(false, 99)).toEqual({ deletedAt: null, updatedAt: 99 });
  });
});
