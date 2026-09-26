/**
 * Turning 201 exercises into the handful the user is looking for — search, muscle, modality — and putting them in an
 * order that means something in the language they are reading.
 *
 * Pure, and separate from the screen for the reason the rest of this task keeps rediscovering: the decisions are
 * worth testing and a React tree is an expensive way to reach them.
 */
import type { CatalogExercise, Modality } from '@/db/catalog';
import { matchesSearch } from '@/ui';

import { exerciseLabel, exerciseSearchNames, type Translate } from './exerciseName';

export interface CatalogFilter {
  readonly query: string;
  /** Null means every muscle, not "no muscle". */
  readonly muscleId: number | null;
  readonly modality: Modality | null;
  /** Whether to show only the user's own exercises — globals are the bulk, and their own are what they made. */
  readonly mineOnly: boolean;
}

export const NO_FILTER: CatalogFilter = { query: '', muscleId: null, modality: null, mineOnly: false };

/** Whether any narrowing is applied — what tells an empty result from an empty catalog. */
export function isFiltered(filter: CatalogFilter): boolean {
  return filter.query.trim() !== '' || filter.muscleId !== null || filter.modality !== null || filter.mineOnly;
}

/**
 * The rows to show, filtered and **then** sorted by the name actually on screen.
 *
 * Sorting after translating is not a detail. `src/db` orders by id and says why: a global carries
 * `exercise.barbell_bench_press` and not "Supino reto com barra", so sorting in SQL would order the catalog by
 * English-ish identifiers in every language. `localeCompare` with the reading locale then puts accented names where a
 * Brazilian reader expects them — *Agachamento* before *Abdominal* is wrong in any locale, and only the locale knows
 * that *Ó* sorts with *O*.
 */
export function filterCatalog(
  all: readonly CatalogExercise[],
  filter: CatalogFilter,
  translate: Translate,
  locale: string,
): CatalogExercise[] {
  const matching = all.filter((exercise) => {
    if (filter.mineOnly && exercise.ownerUserId === null) return false;
    if (filter.muscleId !== null && exercise.primaryMuscleId !== filter.muscleId) return false;
    if (filter.modality !== null && exercise.modality !== filter.modality) return false;
    return matchesSearch(exerciseSearchNames(exercise, translate), filter.query);
  });

  return sortForDisplay(matching, translate, locale);
}

/**
 * The same reading order `filterCatalog` ends on, for a list that needs no filtering — the hidden-exercises view,
 * which is small enough that search and muscle/modality filters would be more control than the list ever needs.
 */
export function sortForDisplay(
  list: readonly CatalogExercise[],
  translate: Translate,
  locale: string,
): CatalogExercise[] {
  return [...list].sort((left, right) =>
    exerciseLabel(left, translate).localeCompare(exerciseLabel(right, translate), locale),
  );
}
