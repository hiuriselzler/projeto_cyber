import type { CatalogExercise } from '@/db/catalog';

/** Both catalogs ship in the bundle (ADR-008), and a global is searchable by its name in each of them. */
export const SEARCHABLE_LOCALES = ['en', 'pt-BR'] as const;

/** `t`, narrowed to what this file needs: a key, and optionally the language to read it in. */
export type Translate = (key: string, options?: { readonly lng?: string }) => string;

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

/**
 * Every name a row can be found by — the list `matchesSearch` matches against.
 *
 * **A global is known by its name in both languages**, which is the whole of ADR-008's search rule and one of this
 * task's acceptance criteria: Brazilian gym vocabulary mixes the two freely, so a pt-BR user must find the bench
 * press by typing *supino* **or** *bench*. A user's own exercise is known by the one name its owner typed, and by no
 * translation of it — translating somebody's own words is exactly what INV-27 forbids, and it would also make
 * "Supino do João" findable by typing "bench", which is not a promise anyone made.
 */
export function exerciseSearchNames(exercise: CatalogExercise, translate: Translate): string[] {
  if (exercise.nameKey === null) {
    return exercise.name === null ? [] : [exercise.name];
  }
  const key = exercise.nameKey;
  return SEARCHABLE_LOCALES.map((lng) => translate(key, { lng }));
}
