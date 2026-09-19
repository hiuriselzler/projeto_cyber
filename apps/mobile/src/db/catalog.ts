/**
 * Reads of the exercise catalog — the minimum stage 3 needs to put an exercise into a workout.
 *
 * Browse, filter by muscle and modality, custom exercises and fork-on-edit are stage 4's, with the screens that use
 * them. Stage 2 deferred the query modules deliberately, for the reason it recorded: designing a query API before its
 * only consumer exists is how it ends up shaped for nothing. So this file holds one read and grows when a screen asks
 * it to.
 *
 * The bilingual search matcher already exists in `src/ui/i18n/search.ts` (stage 2) and is applied by the screen over
 * what this returns, not here: matching is a presentation concern — it folds accents and reads both catalogs — and
 * `src/db` has no business knowing which language the user is reading in.
 */
import { and, asc, eq, isNull, or } from 'drizzle-orm';

import { db } from './client';
import { exercises } from './schema';

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
  readonly usesBodyweight: boolean;
  readonly loadIncrementKg: number | null;
}

/**
 * Every exercise this user can log: the global catalog plus their own, archived ones excluded.
 *
 * Archived means `deleted_at`, never a delete (INV-11): an exercise the user put away stops being offered here while
 * every set it ever produced keeps resolving.
 */
export function listExercises(userId: string): CatalogExercise[] {
  return db
    .select({
      id: exercises.id,
      nameKey: exercises.nameKey,
      name: exercises.name,
      usesBodyweight: exercises.usesBodyweight,
      loadIncrementKg: exercises.loadIncrementKg,
    })
    .from(exercises)
    .where(
      and(
        // A global has no owner; a user exercise has theirs. Nobody sees anybody else's (INV-15).
        or(isNull(exercises.ownerUserId), eq(exercises.ownerUserId, userId)),
        isNull(exercises.deletedAt),
      ),
    )
    .orderBy(asc(exercises.nameKey), asc(exercises.name))
    .all();
}
