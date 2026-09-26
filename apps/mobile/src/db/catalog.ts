/**
 * The exercise catalog, in the local database — task 004 stages 3 and 4.
 *
 * Stage 3 needed one read: every exercise, so a workout could have one. Stage 4 is the screen that owns the catalog,
 * so this file grew the rest of FR-2.1–2.4 — filters' reference data, custom exercises, **fork-on-edit** of a global,
 * and archiving that never orphans history (INV-11).
 *
 * The module splits in two, as every module here does (responsibility map, `src/db/`): **the rows, built purely** —
 * everything above `── writes ──`, which is where the decisions live and the half Jest can reach — and **the writes
 * that land them**, which `expo-sqlite` can only run on a device.
 *
 * Two things this file deliberately does not know:
 *
 * - **Which language the user is reading in.** The bilingual matcher lives in `src/ui/i18n/search.ts` and is applied
 *   by the screen over what this returns. Matching folds accents and reads both catalogs; that is presentation, and
 *   `src/db` has no business holding an opinion about it (stage 2's reasoning, unchanged).
 * - **What a fork should be called.** ADR-008 says the fork copies the translated name, and
 *   [task 004 § Scope](../../../../docs/tasks/004-exercise-catalog-and-logging.md) settles *which* translation: the
 *   one the user was looking at. That is a fact about the UI, so the caller resolves it and passes a string in.
 */
import { and, asc, eq, isNull, ne, or, sql } from 'drizzle-orm';

import { uuidV7 } from '@/crypto/identifiers';

import { db } from './client';
import { exercises, muscleGroups, MODALITIES, TRACKING, type Modality, type Tracking } from './schema';

/** Re-exported so a screen filtering the catalog names its enums through the catalog, not through the raw schema. */
export { MODALITIES, TRACKING, type Modality, type Tracking };

export interface CatalogExercise {
  readonly id: string;
  /**
   * A global's translation key, `exercise.barbell_bench_press`. Null for one the user wrote.
   *
   * Exactly one of `nameKey` and `name` is set — `exercises_key_iff_global` in the schema — and which one it is
   * decides whether the name is translated or shown exactly as typed (INV-27).
   */
  readonly nameKey: string | null;
  readonly name: string | null;
  /** Null for a seeded global; the owner's id for one the user made or forked. */
  readonly ownerUserId: string | null;
  /** The global this was forked from, if it was. What stops a second fork ever being made. */
  readonly forkedFromId: string | null;
  readonly modality: Modality;
  readonly primaryMuscleId: number;
  readonly tracking: Tracking;
  readonly isUnilateral: boolean;
  readonly usesBodyweight: boolean;
  /** Kilograms (INV-01), and always null on a global so one row is liftable in both unit systems (INV-02). */
  readonly loadIncrementKg: number | null;
  readonly notes: string | null;
  /** Set when archived. Archiving is never a delete (INV-11). */
  readonly archivedAt: number | null;
}

export interface MuscleGroup {
  readonly id: number;
  /** `muscle.quadriceps` — reference rows carry a key and no translated text (INV-27). */
  readonly nameKey: string;
}

/** What the create-and-edit form collects. The unit of `loadIncrementKg` is kilograms; the form converts (INV-01). */
export interface ExerciseDraft {
  readonly name: string;
  readonly modality: Modality;
  readonly primaryMuscleId: number;
  readonly tracking: Tracking;
  readonly isUnilateral: boolean;
  readonly usesBodyweight: boolean;
  readonly loadIncrementKg: number | null;
  readonly notes: string | null;
}

// ── rows, built purely ───────────────────────────────────────────────────────────────────────────

/**
 * Why a name cannot be used, or `null` if it can.
 *
 * `taken` is the `exercises_owner_name_key` unique index, which is on `lower(name)` and ignores archived rows. The
 * task file is explicit that a collision is **a validation error on the field the user is already editing, never an
 * auto-suffix**: `(2)` is a name nobody typed, and a user who meant to edit their existing "Supino inclinado" would
 * silently acquire a second one.
 */
export type NameProblem = 'empty' | 'taken';

export function validateExerciseName(name: string, takenNames: readonly string[]): NameProblem | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'empty';
  // Folded the way the index folds it. `lower()` is SQLite's, which is ASCII-only, so this matches what the database
  // will actually enforce rather than what a locale-aware comparison would.
  const folded = trimmed.toLowerCase();
  return takenNames.some((taken) => taken.trim().toLowerCase() === folded) ? 'taken' : null;
}

export interface NewUserExercise extends ExerciseDraft {
  readonly id: string;
  readonly userId: string;
  readonly now: number;
  /** Set when this row is a fork of a global, so the catalog can find it again instead of forking twice. */
  readonly forkedFromId: string | null;
}

/**
 * A user's own exercise row — written by hand, or forked from a global.
 *
 * `nameKey` is null and `name` is the text, which is what makes this user content: shown exactly as typed and never
 * translated, in any language (INV-27). A fork is not a special kind of row; it is an ordinary user exercise that
 * remembers where it came from.
 */
export function userExerciseRow(input: NewUserExercise) {
  return {
    id: input.id,
    ownerUserId: input.userId,
    forkedFromId: input.forkedFromId,
    nameKey: null,
    name: input.name.trim(),
    modality: input.modality,
    primaryMuscleId: input.primaryMuscleId,
    isUnilateral: input.isUnilateral,
    tracking: input.tracking,
    loadIncrementKg: input.loadIncrementKg,
    usesBodyweight: input.usesBodyweight,
    defaultMinReps: null,
    defaultMaxReps: null,
    notes: input.notes,
    createdAt: input.now,
    updatedAt: input.now,
    deletedAt: null,
    syncVersion: 1,
  };
}

/** What editing a user's own exercise changes. The name is theirs, so it is stored trimmed and never re-cased. */
export function exerciseDraftPatch(draft: ExerciseDraft, now: number) {
  return {
    name: draft.name.trim(),
    modality: draft.modality,
    primaryMuscleId: draft.primaryMuscleId,
    tracking: draft.tracking,
    isUnilateral: draft.isUnilateral,
    usesBodyweight: draft.usesBodyweight,
    loadIncrementKg: draft.loadIncrementKg,
    notes: draft.notes,
    updatedAt: now,
  };
}

/**
 * The draft a fork starts from: the global's own properties, under the name the user was looking at.
 *
 * Everything but the name is copied so the fork behaves identically from the first moment — a forked bench press is
 * still a barbell movement for the chest. `loadIncrementKg` is the exception worth naming: a global always carries
 * null, so one seeded row is liftable for a metric and an imperial user alike (INV-02), and the fork inherits that
 * null rather than freezing one unit system's increment into a copy.
 */
export function forkDraft(global: CatalogExercise, nameInUiLanguage: string): ExerciseDraft {
  return {
    name: nameInUiLanguage,
    modality: global.modality,
    primaryMuscleId: global.primaryMuscleId,
    tracking: global.tracking,
    isUnilateral: global.isUnilateral,
    usesBodyweight: global.usesBodyweight,
    loadIncrementKg: global.loadIncrementKg,
    notes: global.notes,
  };
}

/** Archiving sets `deleted_at`; restoring clears it. Neither is ever a `DELETE` (INV-11). */
export function archivePatch(archived: boolean, now: number) {
  return { deletedAt: archived ? now : null, updatedAt: now };
}

// ── writes ───────────────────────────────────────────────────────────────────────────────────────

const columns = {
  id: exercises.id,
  nameKey: exercises.nameKey,
  name: exercises.name,
  ownerUserId: exercises.ownerUserId,
  forkedFromId: exercises.forkedFromId,
  modality: exercises.modality,
  primaryMuscleId: exercises.primaryMuscleId,
  tracking: exercises.tracking,
  isUnilateral: exercises.isUnilateral,
  usesBodyweight: exercises.usesBodyweight,
  loadIncrementKg: exercises.loadIncrementKg,
  notes: exercises.notes,
  archivedAt: exercises.deletedAt,
} as const;

/** A global has no owner; a user exercise has theirs. Nobody ever sees anybody else's (INV-15). */
function ownedBy(userId: string) {
  return or(isNull(exercises.ownerUserId), eq(exercises.ownerUserId, userId));
}

/**
 * Every exercise this user can log, archived ones excluded.
 *
 * Ordered by id rather than by name, because **the name this sorts on does not exist yet**: a global carries a key
 * and the screen turns it into text in the user's language, so ordering here would sort `exercise.barbell_bench_press`
 * and not "Supino reto com barra". The catalog screen sorts after translating, which is the only place that can.
 */
export function listExercises(userId: string): CatalogExercise[] {
  return db
    .select(columns)
    .from(exercises)
    .where(and(ownedBy(userId), isNull(exercises.deletedAt)))
    .orderBy(asc(exercises.id))
    .all();
}

/** The archived ones, for the screen that offers them back. Separate so no ordinary read can forget to exclude them. */
export function listArchivedExercises(userId: string): CatalogExercise[] {
  return db
    .select(columns)
    .from(exercises)
    .where(and(eq(exercises.ownerUserId, userId), sql`${exercises.deletedAt} IS NOT NULL`))
    .orderBy(asc(exercises.id))
    .all();
}

/** One exercise, scoped: a global, or this user's own. Null covers both "gone" and "somebody else's" (INV-15). */
export function readExercise(userId: string, exerciseId: string): CatalogExercise | null {
  return db.select(columns).from(exercises).where(and(eq(exercises.id, exerciseId), ownedBy(userId))).get() ?? null;
}

/** The muscle groups, for the filter. Reference rows, identical on every device, carrying keys (INV-27). */
export function listMuscleGroups(): MuscleGroup[] {
  return db
    .select({ id: muscleGroups.id, nameKey: muscleGroups.nameKey })
    .from(muscleGroups)
    .orderBy(asc(muscleGroups.id))
    .all();
}

/**
 * The names this user already has, so the form can refuse a duplicate before the index does.
 *
 * Archived names are **not** returned: the partial index ignores them, so they are genuinely free to reuse. `exceptId`
 * lets the edit form leave its own name alone — renaming "Supino A" to "Supino A" is not a collision with itself.
 */
export function listUserExerciseNames(userId: string, exceptId?: string): string[] {
  const rows = db
    .select({ name: exercises.name })
    .from(exercises)
    .where(
      and(
        eq(exercises.ownerUserId, userId),
        isNull(exercises.deletedAt),
        exceptId === undefined ? undefined : ne(exercises.id, exceptId),
      ),
    )
    .all();
  return rows.flatMap((row) => (row.name === null ? [] : [row.name]));
}

/** Create one of the user's own exercises and return its id. */
export async function createUserExercise(input: {
  readonly userId: string;
  readonly draft: ExerciseDraft;
  readonly now: number;
}): Promise<string> {
  const id = await uuidV7(input.now);
  db.insert(exercises)
    .values(userExerciseRow({ ...input.draft, id, userId: input.userId, now: input.now, forkedFromId: null }))
    .run();
  return id;
}

/** Edit one of the user's own exercises. Scoped to the owner, so a global can never be reached by this path. */
export function updateUserExercise(input: {
  readonly userId: string;
  readonly exerciseId: string;
  readonly draft: ExerciseDraft;
  readonly now: number;
}): void {
  db.update(exercises)
    .set(exerciseDraftPatch(input.draft, input.now))
    .where(and(eq(exercises.id, input.exerciseId), eq(exercises.ownerUserId, input.userId)))
    .run();
}

/**
 * The fork this user already has of a global, archived or not — `null` if they have never forked it.
 *
 * Archived ones count deliberately. *(Decided 2026-09-21, recorded in PROJECT-STATUS and the task file.)* The task
 * file says a second fork is never made; refusing to reuse an archived one would collide with
 * `exercises_owner_name_key` against a row the user cannot see, which is an error message about something invisible.
 * Reuse is also the honest reading of INV-11 — the row was put away, not destroyed, and editing the global it came
 * from is the user asking for it back.
 */
export function findFork(userId: string, globalId: string): CatalogExercise | null {
  return (
    db
      .select(columns)
      .from(exercises)
      .where(and(eq(exercises.ownerUserId, userId), eq(exercises.forkedFromId, globalId)))
      .orderBy(asc(exercises.id))
      .get() ?? null
  );
}

/**
 * Fork a global into a user copy, or hand back the fork that already exists.
 *
 * **The global row is never touched** — that is the whole point of FR-2.2, and the reason `forked_from_id` exists
 * rather than a mutable global. An existing fork is returned as-is and un-archived if it was archived, so the user
 * gets their own edits back instead of a fresh copy of the seeded row.
 */
export async function forkGlobal(input: {
  readonly userId: string;
  readonly globalId: string;
  readonly draft: ExerciseDraft;
  readonly now: number;
}): Promise<string> {
  const existing = findFork(input.userId, input.globalId);
  if (existing !== null) {
    db.update(exercises)
      .set({ ...archivePatch(false, input.now), updatedAt: input.now })
      .where(eq(exercises.id, existing.id))
      .run();
    return existing.id;
  }

  const id = await uuidV7(input.now);
  db.insert(exercises)
    .values(
      userExerciseRow({
        ...input.draft,
        id,
        userId: input.userId,
        now: input.now,
        forkedFromId: input.globalId,
      }),
    )
    .run();
  return id;
}

/**
 * Archive an exercise, or bring it back. **Never a delete** (INV-11): every set ever logged against it keeps
 * resolving, and the history screen keeps showing its name.
 *
 * A **global** can be archived too, and that write stays on this device. `deleted_at` on a row whose `owner_user_id`
 * is NULL is a column on a row every user shares, so replicating it would be one person putting an exercise away for
 * everybody — which is why the screen says *hide* rather than *delete* for a global, and why how a per-user opinion
 * about a shared row travels is an input to [task 006](../../../../docs/tasks/006-sync-layer.md) rather than a guess
 * made here. *(Decided 2026-09-21.)*
 */
export function setExerciseArchived(input: {
  readonly userId: string;
  readonly exerciseId: string;
  readonly archived: boolean;
  readonly now: number;
}): void {
  db.update(exercises)
    .set(archivePatch(input.archived, input.now))
    .where(and(eq(exercises.id, input.exerciseId), ownedBy(input.userId)))
    .run();
}
