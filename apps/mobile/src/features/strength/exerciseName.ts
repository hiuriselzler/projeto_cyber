import type { CatalogExercise } from '@/db/catalog';

/**
 * What an exercise is called on screen — INV-27's two halves, in one place.
 *
 * A **global** carries a translation key and no text, so it reads in the user's language. A **user's own** carries the
 * name they typed and is shown exactly as stored, never translated: "Treino A" stays "Treino A" in an English UI, and
 * putting somebody's own words through a translator would be both wrong and faintly insulting.
 *
 * The schema guarantees exactly one of the two is set (`exercises_key_iff_global`), so the fallback below is
 * unreachable rather than a default — it exists so a violated constraint shows up as an empty label instead of a
 * crash mid-workout.
 */
export function exerciseLabel(exercise: CatalogExercise, translate: (key: string) => string): string {
  if (exercise.nameKey !== null) return translate(exercise.nameKey);
  return exercise.name ?? '';
}
